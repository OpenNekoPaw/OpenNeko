//! Freeverb-style algorithmic reverb.
//!
//! 8 parallel comb filters → 4 series allpass filters.
//! Stereo-capable via slightly detuned left/right delay lengths.

use super::traits::AudioEffect;

const NUM_COMBS: usize = 8;
const NUM_ALLPASSES: usize = 4;

const COMB_LENGTHS: [usize; NUM_COMBS] = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_LENGTHS: [usize; NUM_ALLPASSES] = [556, 441, 341, 225];
const STEREO_SPREAD: usize = 23;
const TUNED_SAMPLE_RATE: u32 = 44_100;
const DEFAULT_SAMPLE_RATE: u32 = 48_000;

struct CombFilter {
    buffer: Vec<f32>,
    pos: usize,
    filter_store: f32,
}

impl CombFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size],
            pos: 0,
            filter_store: 0.0,
        }
    }

    fn process(&mut self, input: f32, feedback: f32, damp1: f32, damp2: f32) -> f32 {
        let output = self.buffer[self.pos];
        self.filter_store = output * damp2 + self.filter_store * damp1;
        self.buffer[self.pos] = input + self.filter_store * feedback;
        self.pos = (self.pos + 1) % self.buffer.len();
        output
    }

    fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.filter_store = 0.0;
        self.pos = 0;
    }
}

struct AllpassFilter {
    buffer: Vec<f32>,
    pos: usize,
}

impl AllpassFilter {
    fn new(size: usize) -> Self {
        Self {
            buffer: vec![0.0; size],
            pos: 0,
        }
    }

    fn process(&mut self, input: f32) -> f32 {
        let buffered = self.buffer[self.pos];
        let output = -input + buffered;
        self.buffer[self.pos] = input + buffered * 0.5;
        self.pos = (self.pos + 1) % self.buffer.len();
        output
    }

    fn reset(&mut self) {
        self.buffer.fill(0.0);
        self.pos = 0;
    }
}

pub struct Reverb {
    combs_l: Vec<CombFilter>,
    combs_r: Vec<CombFilter>,
    allpasses_l: Vec<AllpassFilter>,
    allpasses_r: Vec<AllpassFilter>,
    feedback: f32,
    damp1: f32,
    damp2: f32,
    wet: f32,
    dry: f32,
    width: f32,
    pre_delay_ms: f32,
    sample_rate: u32,
    pre_delay_samples: usize,
    pre_delay_buf_l: Vec<f32>,
    pre_delay_buf_r: Vec<f32>,
    pre_delay_pos: usize,
}

impl Reverb {
    pub fn new(room_size: f32, damping: f32, wet_dry: f32, width: f32, pre_delay_ms: f32) -> Self {
        let feedback = room_size.clamp(0.0, 1.0) * 0.28 + 0.7;
        let damp1 = damping.clamp(0.0, 1.0);
        let damp2 = 1.0 - damp1;
        let wet = wet_dry.clamp(0.0, 1.0);
        let dry = 1.0 - wet;
        let width = width.clamp(0.0, 1.0);
        let pre_delay_ms = pre_delay_ms.max(0.0);
        let sample_rate = DEFAULT_SAMPLE_RATE;
        let (combs_l, combs_r, allpasses_l, allpasses_r, pre_delay_samples) =
            Self::build_delay_lines(pre_delay_ms, sample_rate);
        let pd_size = pre_delay_samples.max(1);

        Self {
            combs_l,
            combs_r,
            allpasses_l,
            allpasses_r,
            feedback,
            damp1,
            damp2,
            wet,
            dry,
            width,
            pre_delay_ms,
            sample_rate,
            pre_delay_samples,
            pre_delay_buf_l: vec![0.0; pd_size],
            pre_delay_buf_r: vec![0.0; pd_size],
            pre_delay_pos: 0,
        }
    }

    fn build_delay_lines(
        pre_delay_ms: f32,
        sample_rate: u32,
    ) -> (
        Vec<CombFilter>,
        Vec<CombFilter>,
        Vec<AllpassFilter>,
        Vec<AllpassFilter>,
        usize,
    ) {
        let sr_scale = sample_rate as f32 / TUNED_SAMPLE_RATE as f32;
        let scaled = |len: usize| ((len as f32 * sr_scale).round() as usize).max(1);
        let combs_l = COMB_LENGTHS
            .iter()
            .map(|&len| CombFilter::new(scaled(len)))
            .collect();
        let combs_r = COMB_LENGTHS
            .iter()
            .map(|&len| CombFilter::new(scaled(len + STEREO_SPREAD)))
            .collect();
        let allpasses_l = ALLPASS_LENGTHS
            .iter()
            .map(|&len| AllpassFilter::new(scaled(len)))
            .collect();
        let allpasses_r = ALLPASS_LENGTHS
            .iter()
            .map(|&len| AllpassFilter::new(scaled(len + STEREO_SPREAD)))
            .collect();
        let pre_delay_samples = (pre_delay_ms * sample_rate as f32 / 1000.0).round() as usize;
        (
            combs_l,
            combs_r,
            allpasses_l,
            allpasses_r,
            pre_delay_samples,
        )
    }

    fn ensure_sample_rate(&mut self, sample_rate: u32) {
        if sample_rate == 0 || sample_rate == self.sample_rate {
            return;
        }
        let (combs_l, combs_r, allpasses_l, allpasses_r, pre_delay_samples) =
            Self::build_delay_lines(self.pre_delay_ms, sample_rate);
        self.combs_l = combs_l;
        self.combs_r = combs_r;
        self.allpasses_l = allpasses_l;
        self.allpasses_r = allpasses_r;
        self.pre_delay_samples = pre_delay_samples;
        let pd_size = pre_delay_samples.max(1);
        self.pre_delay_buf_l = vec![0.0; pd_size];
        self.pre_delay_buf_r = vec![0.0; pd_size];
        self.pre_delay_pos = 0;
        self.sample_rate = sample_rate;
    }

    fn process_sample(&mut self, input_l: f32, input_r: f32) -> (f32, f32) {
        // Pre-delay
        let delayed_l = if self.pre_delay_samples > 0 {
            let out = self.pre_delay_buf_l[self.pre_delay_pos];
            self.pre_delay_buf_l[self.pre_delay_pos] = input_l;
            out
        } else {
            input_l
        };
        let delayed_r = if self.pre_delay_samples > 0 {
            let out = self.pre_delay_buf_r[self.pre_delay_pos];
            self.pre_delay_buf_r[self.pre_delay_pos] = input_r;
            out
        } else {
            input_r
        };
        if self.pre_delay_samples > 0 {
            self.pre_delay_pos = (self.pre_delay_pos + 1) % self.pre_delay_buf_l.len();
        }

        let mono_in = (delayed_l + delayed_r) * 0.5;

        let mut out_l = 0.0;
        let mut out_r = 0.0;
        for comb in &mut self.combs_l {
            out_l += comb.process(mono_in, self.feedback, self.damp1, self.damp2);
        }
        for comb in &mut self.combs_r {
            out_r += comb.process(mono_in, self.feedback, self.damp1, self.damp2);
        }

        for ap in &mut self.allpasses_l {
            out_l = ap.process(out_l);
        }
        for ap in &mut self.allpasses_r {
            out_r = ap.process(out_r);
        }

        let wet1 = self.wet * (1.0 + self.width) / 2.0;
        let wet2 = self.wet * (1.0 - self.width) / 2.0;

        let final_l = out_l * wet1 + out_r * wet2 + input_l * self.dry;
        let final_r = out_r * wet1 + out_l * wet2 + input_r * self.dry;

        (final_l, final_r)
    }
}

impl AudioEffect for Reverb {
    fn process(&mut self, buffer: &mut [f32], channels: u16, sample_rate: u32) {
        let ch = channels as usize;
        if ch == 0 {
            return;
        }
        self.ensure_sample_rate(sample_rate);

        for frame_start in (0..buffer.len()).step_by(ch) {
            let in_l = buffer[frame_start];
            let in_r = if ch >= 2 && frame_start + 1 < buffer.len() {
                buffer[frame_start + 1]
            } else {
                in_l
            };

            let (out_l, out_r) = self.process_sample(in_l, in_r);
            buffer[frame_start] = out_l;
            if ch >= 2 && frame_start + 1 < buffer.len() {
                buffer[frame_start + 1] = out_r;
            }
        }
    }

    fn reset(&mut self) {
        for c in &mut self.combs_l {
            c.reset();
        }
        for c in &mut self.combs_r {
            c.reset();
        }
        for a in &mut self.allpasses_l {
            a.reset();
        }
        for a in &mut self.allpasses_r {
            a.reset();
        }
        self.pre_delay_buf_l.fill(0.0);
        self.pre_delay_buf_r.fill(0.0);
        self.pre_delay_pos = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_reverb_adds_tail() {
        let mut rev = Reverb::new(0.8, 0.5, 0.5, 1.0, 0.0);
        // 1 second stereo buffer with an impulse at the start.
        let mut buf = vec![0.0f32; 44100 * 2];
        buf[0] = 1.0;
        buf[1] = 1.0;
        rev.process(&mut buf, 2, 44100);

        // Check that reverb tail exists beyond the impulse
        let tail_energy: f32 = buf[4410..].iter().map(|s| s * s).sum();
        assert!(tail_energy > 0.01, "Reverb should produce a tail");
    }

    #[test]
    fn test_reverb_scales_pre_delay_to_sample_rate() {
        let mut rev = Reverb::new(0.8, 0.5, 0.5, 1.0, 10.0);
        let mut buf = vec![0.0f32; 512 * 2];
        buf[0] = 1.0;
        buf[1] = 1.0;
        rev.process(&mut buf, 2, 48_000);

        assert_eq!(rev.pre_delay_samples, 480);
    }
}
