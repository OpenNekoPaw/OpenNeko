//! Delay effect with feedback and ping-pong stereo mode.

use super::traits::AudioEffect;

pub struct Delay {
    buf_l: Vec<f32>,
    buf_r: Vec<f32>,
    write_pos: usize,
    delay_samples: usize,
    feedback: f32,
    wet: f32,
    dry: f32,
    ping_pong: bool,
    sample_rate: u32,
    delay_ms: f32,
}

impl Delay {
    pub fn new(delay_ms: f32, feedback: f32, wet_dry: f32, ping_pong: bool) -> Self {
        let max_samples = 48000 * 5; // 5 seconds max at 48kHz
        Self {
            buf_l: vec![0.0; max_samples],
            buf_r: vec![0.0; max_samples],
            write_pos: 0,
            delay_samples: 0,
            feedback: feedback.clamp(0.0, 0.95),
            wet: wet_dry.clamp(0.0, 1.0),
            dry: 1.0 - wet_dry.clamp(0.0, 1.0),
            ping_pong,
            sample_rate: 0,
            delay_ms,
        }
    }

    fn ensure_rate(&mut self, sample_rate: u32) {
        if self.sample_rate != sample_rate {
            self.sample_rate = sample_rate;
            self.delay_samples =
                ((self.delay_ms * sample_rate as f32 / 1000.0) as usize).min(self.buf_l.len() - 1);
        }
    }

    fn read_pos(&self) -> usize {
        if self.write_pos >= self.delay_samples {
            self.write_pos - self.delay_samples
        } else {
            self.buf_l.len() - (self.delay_samples - self.write_pos)
        }
    }
}

impl AudioEffect for Delay {
    fn process(&mut self, buffer: &mut [f32], channels: u16, sample_rate: u32) {
        self.ensure_rate(sample_rate);
        let ch = channels as usize;
        if ch == 0 || self.delay_samples == 0 {
            return;
        }

        for frame_start in (0..buffer.len()).step_by(ch) {
            let in_l = buffer[frame_start];
            let in_r = if ch >= 2 && frame_start + 1 < buffer.len() {
                buffer[frame_start + 1]
            } else {
                in_l
            };

            let rp = self.read_pos();
            let delayed_l = self.buf_l[rp];
            let delayed_r = self.buf_r[rp];

            if self.ping_pong {
                self.buf_l[self.write_pos] = in_l + delayed_r * self.feedback;
                self.buf_r[self.write_pos] = in_r + delayed_l * self.feedback;
            } else {
                self.buf_l[self.write_pos] = in_l + delayed_l * self.feedback;
                self.buf_r[self.write_pos] = in_r + delayed_r * self.feedback;
            }

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
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_delay_produces_echo() {
        let mut d = Delay::new(100.0, 0.5, 0.5, false);
        let sr = 44100u32;
        let mut buf = vec![0.0f32; sr as usize * 2]; // 1 second stereo
        buf[0] = 1.0;
        buf[1] = 1.0;
        d.process(&mut buf, 2, sr);

        let echo_pos = (100.0 * sr as f32 / 1000.0) as usize * 2;
        assert!(
            buf[echo_pos].abs() > 0.1,
            "Echo should appear at delay time"
        );
    }
}
