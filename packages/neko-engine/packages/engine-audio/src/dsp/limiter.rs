//! Configurable limiter effect wrapping the existing SoftLimiter.

use super::traits::AudioEffect;
use crate::SoftLimiter;

pub struct LimiterEffect {
    limiter: SoftLimiter,
    ceiling: f32,
    configured_sample_rate: u32,
    threshold: f32,
    release_ms: f32,
}

impl LimiterEffect {
    pub fn new(threshold: f32, ceiling: f32, release_ms: f32) -> Self {
        Self {
            limiter: SoftLimiter::new(threshold, release_ms, 48000),
            ceiling,
            configured_sample_rate: 0,
            threshold,
            release_ms,
        }
    }

    fn ensure_rate(&mut self, sample_rate: u32) {
        if self.configured_sample_rate != sample_rate {
            self.configured_sample_rate = sample_rate;
            self.limiter = SoftLimiter::new(self.threshold, self.release_ms, sample_rate);
        }
    }
}

impl AudioEffect for LimiterEffect {
    fn process(&mut self, buffer: &mut [f32], _channels: u16, sample_rate: u32) {
        self.ensure_rate(sample_rate);
        self.limiter.process_buffer(buffer);
        if (self.ceiling - 1.0).abs() > f32::EPSILON {
            for sample in buffer.iter_mut() {
                *sample *= self.ceiling;
            }
        }
    }

    fn reset(&mut self) {
        self.configured_sample_rate = 0;
    }
}
