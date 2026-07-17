//! Noise gate with threshold, attack, hold, and release.

use super::traits::AudioEffect;

pub struct NoiseGateConfig {
    pub threshold_db: f32,
    pub attack_ms: f32,
    pub hold_ms: f32,
    pub release_ms: f32,
}

pub struct NoiseGateEffect {
    config: NoiseGateConfig,
    threshold_linear: f32,
    attack_coeff: f32,
    release_coeff: f32,
    hold_samples: usize,
    envelope: Vec<f32>,
    hold_counter: Vec<usize>,
    gate_gain: Vec<f32>,
    sample_rate: u32,
}

impl NoiseGateEffect {
    pub fn new(config: NoiseGateConfig) -> Self {
        Self {
            threshold_linear: 10.0f32.powf(config.threshold_db / 20.0),
            attack_coeff: 0.0,
            release_coeff: 0.0,
            hold_samples: 0,
            envelope: Vec::new(),
            hold_counter: Vec::new(),
            gate_gain: Vec::new(),
            sample_rate: 0,
            config,
        }
    }

    fn ensure_state(&mut self, channels: u16, sample_rate: u32) {
        if self.sample_rate != sample_rate {
            self.sample_rate = sample_rate;
            let sr = sample_rate as f32;
            self.attack_coeff = (-2.2 / (sr * 0.001 * self.config.attack_ms.max(0.1))).exp();
            self.release_coeff = (-2.2 / (sr * 0.001 * self.config.release_ms.max(1.0))).exp();
            self.hold_samples = (sr * 0.001 * self.config.hold_ms) as usize;
        }
        let ch = channels as usize;
        if self.envelope.len() != ch {
            self.envelope.resize(ch, 0.0);
            self.hold_counter.resize(ch, 0);
            self.gate_gain.resize(ch, 0.0);
        }
    }
}

impl AudioEffect for NoiseGateEffect {
    fn process(&mut self, buffer: &mut [f32], channels: u16, sample_rate: u32) {
        self.ensure_state(channels, sample_rate);
        let ch = channels as usize;
        if ch == 0 {
            return;
        }

        for frame_start in (0..buffer.len()).step_by(ch) {
            for ch_idx in 0..ch {
                let idx = frame_start + ch_idx;
                if idx >= buffer.len() {
                    break;
                }

                let abs_sample = buffer[idx].abs();
                let env = &mut self.envelope[ch_idx];
                *env = if abs_sample > *env {
                    abs_sample
                } else {
                    self.release_coeff * *env + (1.0 - self.release_coeff) * abs_sample
                };

                let target = if *env >= self.threshold_linear {
                    self.hold_counter[ch_idx] = self.hold_samples;
                    1.0
                } else if self.hold_counter[ch_idx] > 0 {
                    self.hold_counter[ch_idx] -= 1;
                    1.0
                } else {
                    0.0
                };

                let gain = &mut self.gate_gain[ch_idx];
                let coeff = if target > *gain {
                    self.attack_coeff
                } else {
                    self.release_coeff
                };
                *gain = coeff * *gain + (1.0 - coeff) * target;

                buffer[idx] *= *gain;
            }
        }
    }

    fn reset(&mut self) {
        self.envelope.fill(0.0);
        self.hold_counter.fill(0);
        self.gate_gain.fill(0.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gate_silences_quiet_signal() {
        let config = NoiseGateConfig {
            threshold_db: -20.0,
            attack_ms: 0.1,
            hold_ms: 0.0,
            release_ms: 5.0,
        };
        let mut gate = NoiseGateEffect::new(config);
        let mut buf = vec![0.001; 4410];
        gate.process(&mut buf, 1, 44100);
        let rms: f32 = (buf.iter().map(|s| s * s).sum::<f32>() / buf.len() as f32).sqrt();
        assert!(rms < 0.0005, "Quiet signal should be gated to near-silence");
    }
}
