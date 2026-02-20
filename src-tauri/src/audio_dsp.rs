use std::sync::{Arc, Mutex};

/// Input mode for audio processing
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum InputMode {
    VoiceActivity,
    PushToTalk,
}

/// DSP pipeline for audio processing
/// Ports the InputLevelMeter logic from JavaScript
pub struct AudioDSP {
    // DSP parameters
    gain: f32,
    threshold: f32,
    input_mode: InputMode,
    ptt_pressed: bool,
    transmission_muted: bool,
    
    // Envelope tracking (for level meter)
    displayed_level: f32,
    current_gain: f32,  // Smoothed gain for gating
    
    // Constants (matching JS implementation)
    noise_floor: f32,
    max_level: f32,
    decay_factor: f32,
    attack_coeff: f32,
    release_coeff: f32,
}

impl AudioDSP {
    pub fn new() -> Self {
        Self {
            gain: 1.0,
            threshold: 0.2,
            input_mode: InputMode::VoiceActivity,
            ptt_pressed: false,
            transmission_muted: false,
            displayed_level: 0.0,
            current_gain: 0.0,
            noise_floor: 0.0002,
            max_level: 0.07,
            decay_factor: 0.88,
            attack_coeff: 0.3,
            release_coeff: 0.05,
        }
    }
    
    /// Process a frame of audio samples
    /// Returns (processed_samples, level_for_ui)
    pub fn process_frame(&mut self, input: &[f32]) -> (Vec<f32>, f32) {
        if input.is_empty() {
            return (vec![], 0.0);
        }
        
        // 1. Apply gain
        let mut samples: Vec<f32> = input.iter()
            .map(|&s| s * self.gain)
            .collect();
        
        // 2. Calculate peak (for level meter)
        let peak = samples.iter()
            .map(|&s| s.abs())
            .fold(0.0f32, |a, b| a.max(b));
        
        // 3. Envelope — fast attack (instant rise), slow decay
        self.displayed_level = peak.max(self.displayed_level * self.decay_factor);
        
        // 4. Mute-floor fix — clamp true silence to 0
        if self.displayed_level < self.noise_floor {
            self.displayed_level = 0.0;
        }
        
        // 5. Normalize level for UI (0-1 range)
        let normalized = if self.displayed_level < self.noise_floor {
            0.0
        } else {
            let min_level = self.noise_floor;
            let max_level = self.max_level;
            let n = (self.displayed_level - min_level) / (max_level - min_level);
            n.min(1.0).max(0.0)
        };
        
        // Perceptual boost for quiet sounds (sqrt for gentle curve)
        let level = normalized.sqrt();
        
        // 6. Apply threshold gating for transmission
        let transmission_gain = if self.transmission_muted {
            0.0
        } else if self.input_mode == InputMode::VoiceActivity {
            // Voice Activity mode: gate based on threshold
            let target_gain = if level >= self.threshold { 1.0 } else { 0.0 };
            
            // Smooth envelope with exponential attack/release
            if target_gain > self.current_gain {
                // Attack (opening gate) - faster
                self.current_gain = self.current_gain * (1.0 - self.attack_coeff) 
                    + target_gain * self.attack_coeff;
            } else {
                // Release (closing gate) - slower
                self.current_gain = self.current_gain * (1.0 - self.release_coeff) 
                    + target_gain * self.release_coeff;
            }
            
            // Clamp to avoid 0 (exponential ramp issue)
            self.current_gain.max(0.001)
        } else {
            // Push-to-Talk mode: transmit only when key is pressed
            if self.ptt_pressed { 1.0 } else { 0.0 }
        };
        
        // 7. Apply transmission gating to samples
        for sample in &mut samples {
            *sample *= transmission_gain;
        }
        
        // 8. Return processed samples and UI level
        (samples, level)
    }
    
    pub fn set_gain(&mut self, gain: f32) {
        self.gain = gain.max(0.0);
    }
    
    pub fn set_threshold(&mut self, threshold: f32) {
        self.threshold = threshold.clamp(0.0, 1.0);
    }
    
    pub fn set_input_mode(&mut self, mode: InputMode) {
        self.input_mode = mode;
        // Reset gain when switching modes
        self.current_gain = 0.0;
        if mode == InputMode::PushToTalk {
            self.ptt_pressed = false;
        }
    }
    
    pub fn set_ptt_pressed(&mut self, pressed: bool) {
        self.ptt_pressed = pressed;
    }
    
    pub fn set_transmission_muted(&mut self, muted: bool) {
        self.transmission_muted = muted;
        if muted {
            self.current_gain = 0.0;
        }
    }
    
    pub fn get_level(&self) -> f32 {
        // Return the normalized level for UI
        if self.displayed_level < self.noise_floor {
            return 0.0;
        }
        
        let min_level = self.noise_floor;
        let max_level = self.max_level;
        let normalized = (self.displayed_level - min_level) / (max_level - min_level);
        let clamped = normalized.min(1.0).max(0.0);
        clamped.sqrt()
    }
}

/// Global DSP instance
static DSP_STATE: Mutex<Option<Arc<Mutex<AudioDSP>>>> = Mutex::new(None);

/// Get or create the global DSP instance
pub fn get_dsp() -> Arc<Mutex<AudioDSP>> {
    let mut state = DSP_STATE.lock().unwrap();
    if state.is_none() {
        *state = Some(Arc::new(Mutex::new(AudioDSP::new())));
    }
    state.as_ref().unwrap().clone()
}
