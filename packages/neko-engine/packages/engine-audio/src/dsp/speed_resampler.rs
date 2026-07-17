//! Linear-interpolation resampler for speed change (no pitch preservation).

pub struct SpeedResampler {
    channels: usize,
}

impl SpeedResampler {
    pub fn new(channels: usize) -> Self {
        Self { channels }
    }

    /// Resample interleaved f32 audio from `input_frames` to exactly `output_frames`.
    ///
    /// At speed 2x the caller supplies 2N source frames and requests N output frames;
    /// at 0.5x the caller supplies N/2 source frames and requests N output frames.
    /// Each output sample is linearly interpolated between two adjacent input samples.
    pub fn resample(&self, input: &[f32], output_frames: usize) -> Vec<f32> {
        let ch = self.channels;
        let input_frames = input.len() / ch;
        if input_frames == 0 || output_frames == 0 {
            return vec![0.0f32; output_frames * ch];
        }
        if input_frames == output_frames {
            return input.to_vec();
        }

        let ratio = input_frames as f64 / output_frames as f64;
        let mut output = Vec::with_capacity(output_frames * ch);
        let last = input_frames - 1;

        for i in 0..output_frames {
            let src_pos = i as f64 * ratio;
            let idx = src_pos as usize;
            let frac = (src_pos - idx as f64) as f32;
            let i0 = idx.min(last);
            let i1 = (idx + 1).min(last);
            for c in 0..ch {
                let s0 = input[i0 * ch + c];
                let s1 = input[i1 * ch + c];
                output.push(s0 + (s1 - s0) * frac);
            }
        }

        output
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_at_1x() {
        let resampler = SpeedResampler::new(1);
        let input: Vec<f32> = (0..10).map(|i| i as f32).collect();
        let output = resampler.resample(&input, 10);
        assert_eq!(output.len(), 10);
        for (a, b) in output.iter().zip(input.iter()) {
            assert!((a - b).abs() < 1e-6);
        }
    }

    #[test]
    fn downsample_2x_mono() {
        let resampler = SpeedResampler::new(1);
        let input: Vec<f32> = (0..8).map(|i| i as f32).collect();
        let output = resampler.resample(&input, 4);
        assert_eq!(output.len(), 4);
        assert!((output[0] - 0.0).abs() < 1e-6);
        assert!((output[1] - 2.0).abs() < 1e-6);
        assert!((output[2] - 4.0).abs() < 1e-6);
        assert!((output[3] - 6.0).abs() < 1e-6);
    }

    #[test]
    fn upsample_half_speed_mono() {
        let resampler = SpeedResampler::new(1);
        // 4 input frames upsampled to 8 output frames (0.5x speed reads half as much source)
        let input: Vec<f32> = vec![0.0, 2.0, 4.0, 6.0];
        let output = resampler.resample(&input, 8);
        assert_eq!(output.len(), 8);
        // ratio = 4/8 = 0.5, positions: 0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.0(clamped)
        assert!((output[0] - 0.0).abs() < 1e-6);
        assert!((output[1] - 1.0).abs() < 1e-6);
        assert!((output[2] - 2.0).abs() < 1e-6);
        assert!((output[3] - 3.0).abs() < 1e-6);
        assert!((output[4] - 4.0).abs() < 1e-6);
        assert!((output[5] - 5.0).abs() < 1e-6);
        assert!((output[6] - 6.0).abs() < 1e-6);
        assert!((output[7] - 6.0).abs() < 1e-6); // clamped to last
    }

    #[test]
    fn stereo_resample() {
        let resampler = SpeedResampler::new(2);
        // 4 stereo frames: (0,10), (1,11), (2,12), (3,13)
        let input = vec![0.0, 10.0, 1.0, 11.0, 2.0, 12.0, 3.0, 13.0];
        let output = resampler.resample(&input, 2);
        assert_eq!(output.len(), 4);
        // Frame 0: pos=0.0 -> (0, 10)
        assert!((output[0] - 0.0).abs() < 1e-6);
        assert!((output[1] - 10.0).abs() < 1e-6);
        // Frame 1: pos=2.0 -> (2, 12)
        assert!((output[2] - 2.0).abs() < 1e-6);
        assert!((output[3] - 12.0).abs() < 1e-6);
    }

    #[test]
    fn empty_input() {
        let resampler = SpeedResampler::new(2);
        let output = resampler.resample(&[], 4);
        assert_eq!(output.len(), 8);
        assert!(output.iter().all(|&s| s == 0.0));
    }
}
