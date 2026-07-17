//! Soft limiter to prevent clipping with smooth gain reduction.
//! Shared between AudioMixer (video export) and AudioMixdown (audio-only).

/// Minimum envelope value to avoid extreme gain when dividing by envelope.
const MIN_ENVELOPE: f32 = 0.01;

/// Soft limiter with peak envelope follower and soft-knee compression.
pub struct SoftLimiter {
    threshold: f32,
    knee_width: f32,
    release_coeff: f32,
    envelope: f32,
}

impl SoftLimiter {
    pub fn new(threshold: f32, release_ms: f32, sample_rate: u32) -> Self {
        let release_samples = release_ms * 0.001 * sample_rate as f32;
        let release_coeff = if release_samples > 0.0 {
            (-2.2 / release_samples).exp()
        } else {
            0.0
        };
        Self {
            threshold,
            knee_width: 0.1,
            release_coeff,
            envelope: MIN_ENVELOPE,
        }
    }

    pub fn process(&mut self, sample: f32) -> f32 {
        if !sample.is_finite() {
            return 0.0;
        }

        let abs_sample = sample.abs();

        if abs_sample > self.envelope {
            self.envelope = abs_sample;
        } else {
            self.envelope = (self.release_coeff * self.envelope
                + (1.0 - self.release_coeff) * abs_sample)
                .max(MIN_ENVELOPE);
        }

        let over = self.envelope - self.threshold;
        let out = if over <= -self.knee_width {
            sample
        } else if over >= self.knee_width {
            sample * (self.threshold / self.envelope)
        } else {
            let knee_factor = (over + self.knee_width) / (2.0 * self.knee_width);
            let gain = 1.0 - knee_factor * (1.0 - self.threshold / self.envelope);
            sample * gain
        };

        out.clamp(-1.0, 1.0)
    }

    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process(*sample);
        }
    }
}
