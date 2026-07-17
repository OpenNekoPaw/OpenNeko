//! Biquad filter — Direct Form II Transposed.
//!
//! Supports low-pass, high-pass, band-pass, notch, peaking EQ,
//! low-shelf, and high-shelf filter types.

use std::f64::consts::PI;

use super::traits::AudioEffect;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum FilterType {
    LowPass,
    HighPass,
    BandPass,
    Notch,
    Peaking,
    LowShelf,
    HighShelf,
}

#[derive(Debug, Clone)]
pub struct BiquadCoeffs {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
}

impl BiquadCoeffs {
    pub fn compute(
        filter_type: FilterType,
        sample_rate: f64,
        freq: f64,
        q: f64,
        gain_db: f64,
    ) -> Self {
        let freq = freq.clamp(20.0, sample_rate * 0.499);
        let w0 = 2.0 * PI * freq / sample_rate;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q.max(0.01));
        let a = 10.0f64.powf(gain_db / 40.0);

        let (b0, b1, b2, a0, a1, a2) = match filter_type {
            FilterType::LowPass => {
                let b1 = 1.0 - cos_w0;
                let b0 = b1 / 2.0;
                let b2 = b0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::HighPass => {
                let b1 = -(1.0 + cos_w0);
                let b0 = (1.0 + cos_w0) / 2.0;
                let b2 = b0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::BandPass => {
                let b0 = alpha;
                let b1 = 0.0;
                let b2 = -alpha;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::Notch => {
                let b0 = 1.0;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::Peaking => {
                let b0 = 1.0 + alpha * a;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0 - alpha * a;
                let a0 = 1.0 + alpha / a;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha / a;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::LowShelf => {
                let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
                let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
                let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
                let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
                let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
                let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::HighShelf => {
                let two_sqrt_a_alpha = 2.0 * a.sqrt() * alpha;
                let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + two_sqrt_a_alpha);
                let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
                let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - two_sqrt_a_alpha);
                let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + two_sqrt_a_alpha;
                let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
                let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - two_sqrt_a_alpha;
                (b0, b1, b2, a0, a1, a2)
            }
        };

        let inv_a0 = 1.0 / a0;
        Self {
            b0: b0 * inv_a0,
            b1: b1 * inv_a0,
            b2: b2 * inv_a0,
            a1: a1 * inv_a0,
            a2: a2 * inv_a0,
        }
    }
}

/// Per-channel filter state for Direct Form II Transposed.
#[derive(Debug, Clone, Default)]
struct ChannelState {
    z1: f64,
    z2: f64,
}

pub struct BiquadFilter {
    coeffs: BiquadCoeffs,
    states: Vec<ChannelState>,
    filter_type: FilterType,
    frequency: f64,
    q: f64,
    gain_db: f64,
    last_sample_rate: f64,
}

impl BiquadFilter {
    pub fn new(filter_type: FilterType, frequency: f64, q: f64, gain_db: f64) -> Self {
        Self {
            coeffs: BiquadCoeffs {
                b0: 1.0,
                b1: 0.0,
                b2: 0.0,
                a1: 0.0,
                a2: 0.0,
            },
            states: Vec::new(),
            filter_type,
            frequency,
            q,
            gain_db,
            last_sample_rate: 0.0,
        }
    }

    fn ensure_channels(&mut self, channels: u16, sample_rate: u32) {
        let sr = sample_rate as f64;
        if self.states.len() != channels as usize || (sr - self.last_sample_rate).abs() > 1.0 {
            self.states
                .resize(channels as usize, ChannelState::default());
            self.coeffs =
                BiquadCoeffs::compute(self.filter_type, sr, self.frequency, self.q, self.gain_db);
            self.last_sample_rate = sr;
        }
    }
}

impl AudioEffect for BiquadFilter {
    fn process(&mut self, buffer: &mut [f32], channels: u16, sample_rate: u32) {
        self.ensure_channels(channels, sample_rate);
        let ch = channels as usize;
        if ch == 0 {
            return;
        }

        let c = &self.coeffs;
        for frame_start in (0..buffer.len()).step_by(ch) {
            for (ch_idx, state) in self.states.iter_mut().enumerate() {
                if frame_start + ch_idx >= buffer.len() {
                    break;
                }
                let x = buffer[frame_start + ch_idx] as f64;
                let y = c.b0 * x + state.z1;
                state.z1 = c.b1 * x - c.a1 * y + state.z2;
                state.z2 = c.b2 * x - c.a2 * y;
                buffer[frame_start + ch_idx] = y as f32;
            }
        }
    }

    fn reset(&mut self) {
        for state in &mut self.states {
            state.z1 = 0.0;
            state.z2 = 0.0;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lowpass_attenuates_high_freq() {
        let mut lpf = BiquadFilter::new(FilterType::LowPass, 200.0, 0.707, 0.0);
        let sr = 44100u32;
        let freq = 10000.0;
        let mut buf: Vec<f32> = (0..4410)
            .map(|i| (2.0 * std::f32::consts::PI * freq * i as f32 / sr as f32).sin())
            .collect();

        let input_rms: f32 = (buf.iter().map(|s| s * s).sum::<f32>() / buf.len() as f32).sqrt();
        lpf.process(&mut buf, 1, sr);
        let output_rms: f32 = (buf.iter().map(|s| s * s).sum::<f32>() / buf.len() as f32).sqrt();

        assert!(
            output_rms < input_rms * 0.1,
            "LPF should attenuate 10kHz significantly"
        );
    }

    #[test]
    fn test_reset_clears_state() {
        let mut f = BiquadFilter::new(FilterType::LowPass, 1000.0, 0.707, 0.0);
        let mut buf = vec![1.0; 100];
        f.process(&mut buf, 1, 44100);
        f.reset();
        assert!(f.states.iter().all(|s| s.z1 == 0.0 && s.z2 == 0.0));
    }
}
