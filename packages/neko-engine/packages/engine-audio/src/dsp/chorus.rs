//! Chorus effect — LFO-modulated delay line.

use super::traits::AudioEffect;

pub struct Chorus {
    buf_l: Vec<f32>,
    buf_r: Vec<f32>,
    write_pos: usize,
    phase: f64,
    rate_hz: f64,
    depth_ms: f32,
    delay_ms: f32,
    depth_samples: f64,
    base_delay_samples: f64,
    feedback: f32,
    wet: f32,
    dry: f32,
    sample_rate: u32,
}

impl Chorus {
    pub fn new(rate_hz: f32, depth_ms: f32, delay_ms: f32, feedback: f32, wet_dry: f32) -> Self {
        let max_samples = 48000; // ~1 second buffer
        Self {
            buf_l: vec![0.0; max_samples],
            buf_r: vec![0.0; max_samples],
            write_pos: 0,
            phase: 0.0,
            rate_hz: rate_hz as f64,
            depth_ms,
            delay_ms,
            depth_samples: 0.0,
            base_delay_samples: 0.0,
            feedback: feedback.clamp(0.0, 0.9),
            wet: wet_dry.clamp(0.0, 1.0),
            dry: 1.0 - wet_dry.clamp(0.0, 1.0),
            sample_rate: 0,
        }
    }

    fn ensure_rate(&mut self, sample_rate: u32, depth_ms: f32, delay_ms: f32) {
        if self.sample_rate != sample_rate {
            self.sample_rate = sample_rate;
            let sr = sample_rate as f64;
            self.depth_samples = depth_ms as f64 * sr / 1000.0;
            self.base_delay_samples = delay_ms as f64 * sr / 1000.0;
        }
    }

    fn read_interpolated(buf: &[f32], pos: f64) -> f32 {
        let len = buf.len();
        let idx = pos.rem_euclid(len as f64);
        let i0 = idx as usize % len;
        let i1 = (i0 + 1) % len;
        let frac = idx.fract() as f32;
        buf[i0] * (1.0 - frac) + buf[i1] * frac
    }
}

impl AudioEffect for Chorus {
    fn process(&mut self, buffer: &mut [f32], channels: u16, sample_rate: u32) {
        self.ensure_rate(sample_rate, self.depth_ms, self.delay_ms);
        let ch = channels as usize;
        if ch == 0 {
            return;
        }

        let phase_inc = self.rate_hz / sample_rate as f64;

        for frame_start in (0..buffer.len()).step_by(ch) {
            let lfo = self.phase.sin();
            let lfo_r = (self.phase + std::f64::consts::FRAC_PI_2).sin();
            self.phase += phase_inc * 2.0 * std::f64::consts::PI;
            if self.phase > 2.0 * std::f64::consts::PI {
                self.phase -= 2.0 * std::f64::consts::PI;
            }

            let delay_l = self.base_delay_samples + self.depth_samples * lfo;
            let delay_r = self.base_delay_samples + self.depth_samples * lfo_r;

            let read_l = self.write_pos as f64 - delay_l;
            let read_r = self.write_pos as f64 - delay_r;

            let delayed_l = Self::read_interpolated(&self.buf_l, read_l);
            let delayed_r = Self::read_interpolated(&self.buf_r, read_r);

            let in_l = buffer[frame_start];
            let in_r = if ch >= 2 && frame_start + 1 < buffer.len() {
                buffer[frame_start + 1]
            } else {
                in_l
            };

            self.buf_l[self.write_pos] = in_l + delayed_l * self.feedback;
            self.buf_r[self.write_pos] = in_r + delayed_r * self.feedback;

            buffer[frame_start] = in_l * self.dry + delayed_l * self.wet;
            if ch >= 2 && frame_start + 1 < buffer.len() {
                buffer[frame_start + 1] = in_r * self.dry + delayed_r * self.wet;
            }

            self.write_pos = (self.write_pos + 1) % self.buf_l.len();
        }
    }

    fn reset(&mut self) {
        self.buf_l.fill(0.0);
        self.buf_r.fill(0.0);
        self.write_pos = 0;
        self.phase = 0.0;
    }
}
