//! Distortion effect with multiple waveshaping algorithms.

use super::gain::db_to_linear;
use super::traits::AudioEffect;

#[derive(Debug, Clone, Copy)]
pub enum DistortionType {
    Soft,
    Hard,
    Tube,
    Fuzz,
}

pub struct Distortion {
    drive: f32,
    output_gain: f32,
    dist_type: DistortionType,
}

impl Distortion {
    pub fn new(drive_db: f32, output_gain_db: f32, dist_type: DistortionType) -> Self {
        Self {
            drive: db_to_linear(drive_db.clamp(0.0, 60.0)),
            output_gain: db_to_linear(output_gain_db.clamp(-60.0, 20.0)),
            dist_type,
        }
    }

    fn shape(&self, sample: f32) -> f32 {
        let driven = sample * self.drive;
        match self.dist_type {
            DistortionType::Soft => driven.tanh(),
            DistortionType::Hard => driven.clamp(-1.0, 1.0),
            DistortionType::Tube => {
                if driven >= 0.0 {
                    1.0 - (-driven).exp()
                } else {
                    -1.0 + driven.exp()
                }
            }
            DistortionType::Fuzz => driven.signum() * (1.0 - (-driven.abs() * 3.0).exp()),
        }
    }
}

impl AudioEffect for Distortion {
    fn process(&mut self, buffer: &mut [f32], _channels: u16, _sample_rate: u32) {
        for sample in buffer.iter_mut() {
            *sample = self.shape(*sample) * self.output_gain;
        }
    }

    fn reset(&mut self) {}
}

pub fn parse_distortion_type(s: &str) -> DistortionType {
    match s {
        "hard" => DistortionType::Hard,
        "tube" => DistortionType::Tube,
        "fuzz" => DistortionType::Fuzz,
        _ => DistortionType::Soft,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_soft_clip_is_bounded() {
        let mut dist = Distortion::new(30.0, 0.0, DistortionType::Soft);
        let mut buf = vec![1.0; 100];
        dist.process(&mut buf, 1, 44100);
        assert!(
            buf.iter().all(|s| s.abs() <= 1.0),
            "Soft clip should never exceed +-1"
        );
    }

    #[test]
    fn test_hard_clip_is_bounded() {
        let mut dist = Distortion::new(40.0, 0.0, DistortionType::Hard);
        let mut buf = vec![0.5, -0.5, 1.0, -1.0];
        dist.process(&mut buf, 1, 44100);
        assert!(buf.iter().all(|s| s.abs() <= 1.0));
    }
}
