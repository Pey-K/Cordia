/**
 * Native audio capture integration using MediaStreamTrackGenerator or RTCAudioSource
 * Receives PCM frames from Rust via Tauri events and injects them into WebRTC
 */

import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/tauri';

// Type declarations for WebCodecs API (may not be in all TypeScript versions)
declare global {
  interface MediaStreamTrackGenerator extends MediaStreamTrack {
    writable: WritableStream<AudioData>;
  }
  
  var MediaStreamTrackGenerator: {
    new (init: { kind: 'audio' | 'video' }): MediaStreamTrackGenerator;
  } | undefined;
}

export interface NativeAudioDevice {
  device_id: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

/**
 * Native audio capture using MediaStreamTrackGenerator or RTCAudioSource
 * This replaces getUserMedia with native system-level capture
 */
export class NativeAudioCapture {
  private trackGenerator: MediaStreamTrackGenerator | null = null;
  private trackWriter: WritableStreamDefaultWriter<AudioData> | null = null;
  private audioSource: any | null = null; // RTCAudioSource if available
  private track: MediaStreamTrack | null = null;
  private stream: MediaStream | null = null;
  private frameListener: (() => void) | null = null;
  private levelListener: (() => void) | null = null;
  private onLevelUpdate: ((level: number) => void) | null = null;
  private isRunning: boolean = false;
  private useTrackGenerator: boolean = false;

  /**
   * Start native audio capture
   * @param deviceId Optional device ID (from enumerate_audio_devices_native)
   * @param onLevelUpdate Callback for level updates (0-1)
   * @returns MediaStream for WebRTC
   */
  async start(
    deviceId: string | null,
    onLevelUpdate: (level: number) => void
  ): Promise<MediaStream> {
    if (this.isRunning) {
      throw new Error('Native audio capture already started');
    }

    this.onLevelUpdate = onLevelUpdate;

    // Try MediaStreamTrackGenerator first (newer, more widely supported)
    if (typeof (window as any).MediaStreamTrackGenerator !== 'undefined') {
      try {
        console.log('[NativeAudio] Using MediaStreamTrackGenerator');
        this.useTrackGenerator = true;
        const GeneratorClass = (window as any).MediaStreamTrackGenerator;
        this.trackGenerator = new GeneratorClass({ kind: 'audio' });
        this.track = this.trackGenerator;
        if (!this.track || !this.trackGenerator) {
          throw new Error('Failed to create track from MediaStreamTrackGenerator');
        }
        this.stream = new MediaStream([this.track]);
        
        // Get the writable stream writer
        this.trackWriter = this.trackGenerator.writable.getWriter();
      } catch (error) {
        console.error('[NativeAudio] Failed to create MediaStreamTrackGenerator:', error);
        throw error;
      }
    }
    // Fallback to RTCAudioSource if available
    else if (typeof (window as any).RTCAudioSource !== 'undefined') {
      try {
        console.log('[NativeAudio] Using RTCAudioSource (fallback)');
        const RTCAudioSource = (window as any).RTCAudioSource;
        this.audioSource = new RTCAudioSource();
        this.track = this.audioSource.createTrack();
        if (!this.track) {
          throw new Error('Failed to create track from RTCAudioSource');
        }
        this.stream = new MediaStream([this.track]);
        this.useTrackGenerator = false;
      } catch (error) {
        console.error('[NativeAudio] Failed to create RTCAudioSource:', error);
        throw new Error('Neither MediaStreamTrackGenerator nor RTCAudioSource is available');
      }
    } else {
      // Neither API is available - log diagnostic info
      console.error('[NativeAudio] Diagnostic info:', {
        hasMediaStreamTrackGenerator: typeof (window as any).MediaStreamTrackGenerator !== 'undefined',
        hasRTCAudioSource: typeof (window as any).RTCAudioSource !== 'undefined',
        userAgent: navigator.userAgent,
      });
      
      // For now, we'll still start Rust capture for level metering
      // Even if we can't inject into WebRTC, we can at least show levels
      console.warn('[NativeAudio] No audio injection API available, but continuing for level metering');
      // Create a dummy stream so the code doesn't crash
      // The level updates will still work
      this.stream = new MediaStream(); // Empty stream - levels will still update
    }

    // Start Rust-side capture (always do this, even if track creation failed)
    console.log('[NativeAudio] Starting Rust-side capture...');
    try {
      await invoke('start_audio_capture', { deviceId });
      console.log('[NativeAudio] Rust-side capture started successfully');
    } catch (error) {
      console.error('[NativeAudio] Failed to start Rust-side capture:', error);
      throw error;
    }

    // Listen for audio frames (only if we have a track to write to)
    if (this.track) {
      console.log('[NativeAudio] Setting up frame listener...');
      this.frameListener = await listen<string>('cordia:audio-frame', (event) => {
        // Only log occasionally to avoid spam
        if (Math.random() < 0.01) {
          console.log('[NativeAudio] Received audio frame, length:', event.payload.length);
        }
        this.handleAudioFrame(event.payload);
      });
      console.log('[NativeAudio] Frame listener set up');
    } else {
      console.warn('[NativeAudio] No track available, skipping frame listener (level updates will still work)');
    }

    // Listen for level updates (always set this up - it's needed for the UI meter)
    console.log('[NativeAudio] Setting up level listener...');
    this.levelListener = await listen<number>('cordia:audio-level', (event) => {
      // Log first few to verify it's working
      if (!this.isRunning || Math.random() < 0.1) {
        console.log('[NativeAudio] Level update:', event.payload.toFixed(3));
      }
      if (this.onLevelUpdate) {
        this.onLevelUpdate(event.payload);
      }
    });
    console.log('[NativeAudio] Level listener set up');

    this.isRunning = true;
    return this.stream;
  }

  /** 10 ms at 48 kHz mono. Rust may send 1–3 frames per event (batched). */
  private static readonly SAMPLES_PER_FRAME = 480;

  /**
   * Handle incoming audio frame(s) from Rust.
   * Payload may be 1–3 frames concatenated (batch); we inject each 480-sample chunk.
   */
  private async handleAudioFrame(frameB64: string) {
    try {
      const binaryString = atob(frameB64);
      const frameBytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        frameBytes[i] = binaryString.charCodeAt(i);
      }

      const dataView = new DataView(frameBytes.buffer);
      const totalSamples = frameBytes.length / 4;
      const samples = new Float32Array(totalSamples);
      for (let i = 0; i < totalSamples; i++) {
        samples[i] = dataView.getFloat32(i * 4, true);
      }

      if (this.useTrackGenerator && this.trackWriter && this.trackGenerator) {
        // Use MediaStreamTrackGenerator (WebCodecs API)
        // Create AudioData from samples
        const AudioDataClass = (window as any).AudioData || (globalThis as any).AudioData;
        if (!AudioDataClass) {
          return;
        }
        // Inject each 10 ms frame (Rust may send 2–3 concatenated to reduce IPC jitter).
        const { SAMPLES_PER_FRAME } = NativeAudioCapture;
        for (let offset = 0; offset + SAMPLES_PER_FRAME <= samples.length; offset += SAMPLES_PER_FRAME) {
          const chunk = samples.subarray(offset, offset + SAMPLES_PER_FRAME);
          const buf = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
          try {
            const audioDataInit: any = {
              format: 'f32-planar',
              sampleRate: 48000,
              numberOfFrames: chunk.length,
              numberOfChannels: 1,
              timestamp: performance.now() * 1000,
              data: buf,
            };
            const audioData = new AudioDataClass(audioDataInit);
            await this.trackWriter.write(audioData);
          } catch (error) {
            // Drop frame on error (audio loss > latency)
          }
        }
      } else if (this.audioSource) {
        // Use RTCAudioSource (fallback)
        if ('processFrame' in this.audioSource) {
          (this.audioSource as any).processFrame({
            samples: samples,
            sampleRate: 48000,
            numberOfChannels: 1,
          });
        } else if ('onFrame' in this.audioSource) {
          (this.audioSource as any).onFrame({
            samples: samples,
            sampleRate: 48000,
            numberOfChannels: 1,
          });
        } else {
          console.warn('[NativeAudio] RTCAudioSource API not recognized, frame dropped');
        }
      }
    } catch (error) {
      console.error('[NativeAudio] Failed to process frame:', error);
    }
  }

  /**
   * Stop native audio capture
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    // Stop Rust-side capture
    await invoke('stop_audio_capture');

    // Remove listeners
    if (this.frameListener) {
      this.frameListener();
      this.frameListener = null;
    }
    if (this.levelListener) {
      this.levelListener();
      this.levelListener = null;
    }

    // Close track writer if using MediaStreamTrackGenerator
    if (this.trackWriter) {
      try {
        await this.trackWriter.close();
      } catch (error) {
        console.warn('[NativeAudio] Error closing track writer:', error);
      }
      this.trackWriter = null;
    }

    // Stop track
    if (this.track) {
      this.track.stop();
      this.track = null;
    }

    this.trackGenerator = null;
    this.audioSource = null;
    this.stream = null;
    this.onLevelUpdate = null;
    this.isRunning = false;
  }

  /**
   * Get the MediaStream (for WebRTC)
   */
  getStream(): MediaStream | null {
    return this.stream;
  }
}

/**
 * Enumerate audio devices using native Rust enumeration
 * No browser permissions required!
 */
export async function enumerateAudioDevicesNative(): Promise<{
  inputDevices: NativeAudioDevice[];
  outputDevices: NativeAudioDevice[];
}> {
  const devices = await invoke<NativeAudioDevice[]>('enumerate_audio_devices_native');
  
  return {
    inputDevices: devices.filter((d) => d.kind === 'audioinput'),
    outputDevices: devices.filter((d) => d.kind === 'audiooutput'),
  };
}
