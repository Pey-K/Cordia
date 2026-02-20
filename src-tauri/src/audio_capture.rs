//! Native audio capture with lock-free pipeline.
//!
//! Philosophy: **Audio loss > audio latency.** Never block the audio callback.
//! If JS falls behind, frames are dropped (never queued).

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, Stream, StreamConfig};
use rtrb::{Producer, RingBuffer};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::thread;

/// Drop counters for debugging. Expose via get_audio_drop_stats() / dev overlay.
static DROPPED_RAW: AtomicU64 = AtomicU64::new(0);
static DROPPED_PROCESSED: AtomicU64 = AtomicU64::new(0);

/// Fixed frame size: 10 ms at 48 kHz. No heap allocation in callback.
const FRAME_SAMPLES: usize = 480;
/// Raw ring capacity: ~80 ms. If consumer falls behind, drop (never block).
const RAW_RING_CAP: usize = 8;

/// Audio device information (matches frontend AudioDevice)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDevice {
    pub device_id: String,
    pub label: String,
    pub kind: AudioDeviceKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AudioDeviceKind {
    #[serde(rename = "audioinput")]
    Input,
    #[serde(rename = "audiooutput")]
    Output,
}

/// Global audio capture state.
/// Processed frames go via bounded channel (drop if full); stream is leaked to stay alive.
struct AudioCaptureState {
    processed_frame_sender: Option<mpsc::SyncSender<Vec<f32>>>,
    level_update_sender: Option<mpsc::Sender<f32>>,
    sample_rate: u32,
    processing_thread: Option<thread::JoinHandle<()>>,
    _stream_handle: Option<Arc<Mutex<()>>>,
}

static AUDIO_CAPTURE_STATE: Mutex<Option<AudioCaptureState>> = Mutex::new(None);

/// Enumerate all available audio devices
pub fn enumerate_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();
    
    let mut devices = Vec::new();
    
    // Enumerate input devices
    let input_devices = host.input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {}", e))?;
    
    for (idx, device) in input_devices.enumerate() {
        let name = device.name()
            .map_err(|e| format!("Failed to get device name: {}", e))?;
        let device_id = format!("input_{}", idx);
        
        devices.push(AudioDevice {
            device_id,
            label: clean_device_label(&name),
            kind: AudioDeviceKind::Input,
        });
    }
    
    // Enumerate output devices
    let output_devices = host.output_devices()
        .map_err(|e| format!("Failed to enumerate output devices: {}", e))?;
    
    for (idx, device) in output_devices.enumerate() {
        let name = device.name()
            .map_err(|e| format!("Failed to get device name: {}", e))?;
        let device_id = format!("output_{}", idx);
        
        devices.push(AudioDevice {
            device_id,
            label: clean_device_label(&name),
            kind: AudioDeviceKind::Output,
        });
    }
    
    Ok(devices)
}

/// Clean device label (remove Windows prefixes, etc.)
fn clean_device_label(label: &str) -> String {
    let mut clean = label
        .replace("Default - ", "")
        .replace("Communications - ", "")
        .replace("Multimedia - ", "");
    
    // Remove vendor IDs in parentheses (format: (XXXX:XXXX))
    while let Some(start) = clean.find("(0x") {
        if let Some(end) = clean[start..].find(')') {
            clean.replace_range(start..start + end + 1, "");
        } else {
            break;
        }
    }
    
    clean.trim().to_string()
}

/// Start audio capture from the specified device (or default)
/// Returns receiver for processed PCM frames and receiver for level updates
pub fn start_capture(
    device_id: Option<String>,
    processed_frame_sender: mpsc::SyncSender<Vec<f32>>,
    level_update_sender: mpsc::Sender<f32>,
) -> Result<(), String> {
    // Stop any existing capture
    stop_capture();
    
    let host = cpal::default_host();
    
    // Find the device
    let device: Device = if let Some(id) = device_id {
        // Parse device index from ID (format: "input_0", "input_1", etc.)
        if let Some(idx_str) = id.strip_prefix("input_") {
            let idx: usize = idx_str.parse()
                .map_err(|_| format!("Invalid device ID: {}", id))?;
            
            let input_devices: Vec<_> = host.input_devices()
                .map_err(|e| format!("Failed to enumerate devices: {}", e))?
                .collect();
            
            input_devices.get(idx)
                .ok_or_else(|| format!("Device index {} not found", idx))?
                .clone()
        } else {
            return Err(format!("Invalid device ID format: {}", id));
        }
    } else {
        // Use default input device
        host.default_input_device()
            .ok_or_else(|| "No default input device available".to_string())?
    };
    
    // Get default config
    let config = device.default_input_config()
        .map_err(|e| format!("Failed to get device config: {}", e))?;
    
    // We want 48kHz, mono, f32
    // Try to use f32 format, fall back to device's native format
    let sample_format = config.sample_format();
    let sample_rate = config.sample_rate();
    
    // Request 48kHz if supported, otherwise use device default
    let target_sample_rate = if sample_rate.0 == 48000 {
        sample_rate
    } else {
        // Try to find 48kHz in supported configs, or use default
        sample_rate
    };
    
    // Explicit buffer size: 10 ms at 48 kHz. Do not trust driver defaults.
    let stream_config = StreamConfig {
        channels: 1,
        sample_rate: target_sample_rate,
        buffer_size: cpal::BufferSize::Fixed(FRAME_SAMPLES as u32),
    };

    // Reset drop counters for this session (for dev overlay / debug log).
    DROPPED_RAW.store(0, Ordering::Relaxed);
    DROPPED_PROCESSED.store(0, Ordering::Relaxed);

    // Lock-free ring: audio callback pushes, processing thread drains. Drop if full.
    let (raw_producer, raw_consumer) = RingBuffer::<[f32; FRAME_SAMPLES]>::new(RAW_RING_CAP);

    // Build stream: callback must NOT allocate and NOT block; push to ring only.
    let stream = match sample_format {
        SampleFormat::F32 => build_stream::<f32>(&device, &stream_config, raw_producer)?,
        SampleFormat::I16 => build_stream::<i16>(&device, &stream_config, raw_producer)?,
        SampleFormat::U16 => build_stream::<u16>(&device, &stream_config, raw_producer)?,
        _ => return Err(format!("Unsupported sample format: {:?}", sample_format)),
    };

    stream.play().map_err(|e| format!("Failed to start stream: {}", e))?;

    // Single producer: one thread drains raw ring → DSP → bounded channel (drop if full).
    let processed_tx = processed_frame_sender.clone();
    let level_tx = level_update_sender.clone();
    let processing_thread = thread::spawn(move || {
        process_audio_frames(raw_consumer, processed_tx, level_tx);
    });
    
    // Store state (stream is kept alive by callback, we leak it to prevent drop)
    let mut state = AUDIO_CAPTURE_STATE.lock()
        .map_err(|_| "Failed to lock audio capture state".to_string())?;
    
    // Keep stream alive by boxing and leaking it
    // The stream will continue running until the callback stops receiving data
    let _stream_box = Box::new(stream);
    std::mem::forget(_stream_box);
    
    *state = Some(AudioCaptureState {
        processed_frame_sender: Some(processed_frame_sender),
        level_update_sender: Some(level_update_sender),
        sample_rate: target_sample_rate.0,
        processing_thread: Some(processing_thread),
        _stream_handle: Some(Arc::new(Mutex::new(()))),
    });
    
    Ok(())
}

/// Process audio frames: drain lock-free raw ring → DSP → push to bounded channel (drop if full).
/// Never block; if processed channel is full, drop frame (audio loss > latency).
fn process_audio_frames(
    mut raw_consumer: rtrb::Consumer<[f32; FRAME_SAMPLES]>,
    processed_sender: mpsc::SyncSender<Vec<f32>>,
    level_sender: mpsc::Sender<f32>,
) {
    use crate::audio_dsp::get_dsp;
    let dsp = get_dsp();

    loop {
        let frame = match raw_consumer.pop() {
            Ok(f) => f,
            Err(rtrb::PopError::Empty) => {
                if raw_consumer.is_abandoned() {
                    break;
                }
                std::thread::yield_now();
                continue;
            }
        };
        let raw_slice = &frame[..];

        let (processed, level) = {
            let mut dsp_guard = match dsp.lock() {
                Ok(g) => g,
                Err(_) => break,
            };
            dsp_guard.process_frame(raw_slice)
        };

        // Non-blocking: if emitter is behind (>30ms backlog), drop this frame.
        if processed_sender.try_send(processed).is_err() {
            DROPPED_PROCESSED.fetch_add(1, Ordering::Relaxed);
        }
        let _ = level_sender.send(level);
    }
}

/// Build a stream for the given sample type.
/// Callback must NOT allocate and NOT block: copy into fixed buffer, push to ring (drop if full).
fn build_stream<T>(
    device: &Device,
    config: &StreamConfig,
    mut raw_producer: Producer<[f32; FRAME_SAMPLES]>,
) -> Result<Stream, String>
where
    T: cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    let err_fn = |err| eprintln!("Audio stream error: {}", err);

    let stream = device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            // Stack-only: no heap allocation. Copy into fixed buffer.
            let mut frame = [0.0f32; FRAME_SAMPLES];
            let len = data.len().min(FRAME_SAMPLES);
            for (i, s) in data.iter().take(len).enumerate() {
                frame[i] = <f32 as cpal::FromSample<T>>::from_sample_(*s);
            }
            // Push to lock-free ring; if full (JS/emitter behind), drop. Never block.
            if raw_producer.push(frame).is_err() {
                DROPPED_RAW.fetch_add(1, Ordering::Relaxed);
            }
        },
        err_fn,
        None,
    )
    .map_err(|e| format!("Failed to build stream: {}", e))?;

    Ok(stream)
}

/// Stop audio capture
pub fn stop_capture() {
    let mut state_guard = match AUDIO_CAPTURE_STATE.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    
    if let Some(mut state) = state_guard.take() {
        // Close channels (this will cause processing thread to exit)
        // Dropping the senders will close the channels
        state.processed_frame_sender.take();
        state.level_update_sender.take();
        
        // Wait for processing thread to finish
        if let Some(thread) = state.processing_thread.take() {
            let _ = thread.join();
        }
        
        // Stream is managed by cpal and will be cleaned up when dropped
        // Since we leaked it, we can't directly stop it, but closing channels
        // will stop the processing loop
    }
}

// Note: Frame receivers are created in start_capture and passed to Tauri command
// They're managed via Tauri events, not returned directly

/// Drop/underrun stats for dev overlay, debug log, or optional stats panel.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AudioDropStats {
    pub dropped_raw: u64,
    pub dropped_processed: u64,
}

pub fn get_audio_drop_stats() -> AudioDropStats {
    AudioDropStats {
        dropped_raw: DROPPED_RAW.load(Ordering::Relaxed),
        dropped_processed: DROPPED_PROCESSED.load(Ordering::Relaxed),
    }
}

/// Get current sample rate
pub fn get_sample_rate() -> Result<u32, String> {
    let state = AUDIO_CAPTURE_STATE.lock()
        .map_err(|_| "Failed to lock audio capture state".to_string())?;
    
    state.as_ref()
        .map(|s| s.sample_rate)
        .ok_or_else(|| "Audio capture not started".to_string())
}
