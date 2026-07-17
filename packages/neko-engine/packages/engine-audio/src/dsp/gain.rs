//! Simple gain adjustment effect.

use super::traits::AudioEffect;

pub struct Gain {
    linear_gain: f32,
}

impl Gain {
    pub fn new(db: f32) -> Self {
        Self {
            linear_gain: db_to_linear(db),
        }
    }

    pub fn set_gain_db(&mut self, db: f32) {
        self.linear_gain = db_to_linear(db);
    }
}

impl AudioEffect for Gain {
    fn process(&mut self, buffer: &mut [f32], _channels: u16, _sample_rate: u32) {
        if (self.linear_gain - 1.0).abs() < f32::EPSILON {
            return;
        }
        for sample in buffer.iter_mut() {
            *sample *= self.linear_gain;
        }
    }

    fn reset(&mut self) {}
}

/// Convert decibels to linear gain.
pub fn db_to_linear(db: f32) -> f32 {
    10.0f32.powf(db / 20.0)
}

/// Convert linear gain to decibels.
pub fn linear_to_db(linear: f32) -> f32 {
    if linear <= 0.0 {
        -f32::INFINITY
    } else {
        20.0 * linear.log10()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_unity_gain_is_noop() {
        let mut g = Gain::new(0.0);
        let mut buf = vec![0.5, -0.3, 1.0];
        let orig = buf.clone();
        g.process(&mut buf, 1, 44100);
        assert_eq!(buf, orig);
    }

    #[test]
    fn test_6db_doubles() {
        let mut g = Gain::new(6.0);
        let mut buf = vec![0.25];
        g.process(&mut buf, 1, 44100);
        assert!((buf[0] - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_db_roundtrip() {
        let db = -12.0f32;
        let linear = db_to_linear(db);
        let back = linear_to_db(linear);
        assert!((db - back).abs() < 0.001);
    }
}
