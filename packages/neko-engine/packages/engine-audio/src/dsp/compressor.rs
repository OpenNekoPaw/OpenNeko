//! Dynamic range compressor with envelope follower.

use super::gain::db_to_linear;
use super::traits::AudioEffect;

pub struct Compressor {
    threshold_db: f32,
    ratio: f32,
    attack_coeff: f32,
    release_coeff: f32,
    attack_ms: f32,
    release_ms: f32,
    knee_db: f32,
    makeup_gain: f32,
    envelope_db: Vec<f32>,
    sample_rate: u32,
}

impl Compressor {
    pub fn new(
        threshold_db: f32,
        ratio: f32,
        attack_ms: f32,
        release_ms: f32,
        knee_db: f32,
        makeup_gain_db: f32,
    ) -> Self {
        Self {
            threshold_db,
            ratio: ratio.max(1.0),
            attack_coeff: 0.0,
            release_coeff: 0.0,
            knee_db: knee_db.max(0.0),
            makeup_gain: db_to_linear(makeup_gain_db),
            envelope_db: Vec::new(),
            sample_rate: 0,
            attack_ms: attack_ms.max(0.1),
            release_ms: release_ms.max(1.0),
        }
    }

    fn update_coeffs(&mut self, sample_rate: u32) {
        if self.sample_rate == sample_rate {
            return;
        }
        self.sample_rate = sample_rate;
        let sr = sample_rate as f32;
        self.attack_coeff = (-2.2 / (sr * 0.001 * self.attack_ms)).exp();
        self.release_coeff = (-2.2 / (sr * 0.001 * self.release_ms)).exp();
    }

    fn compute_gain_db(&self, input_db: f32) -> f32 {
        let half_knee = self.knee_db / 2.0;
        let over = input_db - self.threshold_db;

        if over <= -half_knee {
            0.0
        } else if over >= half_knee {
            -(over * (1.0 - 1.0 / self.ratio))
        } else {
            let x = over + half_knee;
            -(x * x / (2.0 * self.knee_db.max(0.01))) * (1.0 - 1.0 / self.ratio)
        }
    }
}

impl AudioEffect for Compressor {
    fn process(&mut self, buffer: &mut [f32], channels: u16, sample_rate: u32) {
        self.update_coeffs(sample_rate);
        let ch = channels as usize;
        if ch == 0 {
            return;
        }
        if self.envelope_db.len() != ch {
            self.envelope_db.resize(ch, -96.0);
        }

        for frame_start in (0..buffer.len()).step_by(ch) {
            for ch_idx in 0..ch {
                let idx = frame_start + ch_idx;
                if idx >= buffer.len() {
                    break;
                }

                let sample = buffer[idx];
                let input_db = if sample.abs() > 1e-10 {
                    20.0 * sample.abs().log10()
                } else {
                    -96.0
                };

                let env = &mut self.envelope_db[ch_idx];
                let coeff = if input_db > *env {
                    self.attack_coeff
                } else {
                    self.release_coeff
                };
                *env = coeff * *env + (1.0 - coeff) * input_db;

                let env_val = *env;
                let gain_db = self.compute_gain_db(env_val);
                let gain = db_to_linear(gain_db) * self.makeup_gain;
                buffer[idx] = sample * gain;
            }
        }
    }

    fn reset(&mut self) {
        self.envelope_db.fill(-96.0);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_below_threshold_passes() {
        let mut comp = Compressor::new(-20.0, 4.0, 10.0, 100.0, 6.0, 0.0);
        let mut buf = vec![0.01; 1000];
        let orig = buf.clone();
        comp.process(&mut buf, 1, 44100);
        let diff: f32 = buf
            .iter()
            .zip(orig.iter())
            .map(|(a, b)| (a - b).abs())
            .sum::<f32>()
            / buf.len() as f32;
        assert!(diff < 0.01, "Quiet signals should pass nearly unchanged");
    }

    #[test]
    fn test_above_threshold_reduces() {
        let mut comp = Compressor::new(-6.0, 4.0, 0.1, 50.0, 0.0, 0.0);
        let mut buf: Vec<f32> = (0..4410)
            .map(|i| 0.9 * (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 44100.0).sin())
            .collect();
        let input_rms: f32 = (buf.iter().map(|s| s * s).sum::<f32>() / buf.len() as f32).sqrt();
        comp.process(&mut buf, 1, 44100);
        let output_rms: f32 = (buf.iter().map(|s| s * s).sum::<f32>() / buf.len() as f32).sqrt();
        assert!(output_rms < input_rms, "Loud signals should be compressed");
    }
}
