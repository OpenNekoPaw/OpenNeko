//! Multi-band parametric equalizer built from biquad filters.

use serde::Deserialize;

use super::biquad::{BiquadFilter, FilterType};
use super::traits::AudioEffect;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqBand {
    pub frequency: f64,
    pub gain_db: f64,
    #[serde(default = "default_q")]
    pub q: f64,
    #[serde(default = "default_band_type")]
    pub band_type: String,
}

fn default_q() -> f64 {
    1.0
}

fn default_band_type() -> String {
    "peaking".to_string()
}

fn parse_filter_type(s: &str) -> FilterType {
    match s {
        "low-pass" | "lowpass" => FilterType::LowPass,
        "high-pass" | "highpass" => FilterType::HighPass,
        "band-pass" | "bandpass" => FilterType::BandPass,
        "notch" => FilterType::Notch,
        "low-shelf" | "lowshelf" => FilterType::LowShelf,
        "high-shelf" | "highshelf" => FilterType::HighShelf,
        _ => FilterType::Peaking,
    }
}

pub struct ParametricEq {
    bands: Vec<BiquadFilter>,
}

impl ParametricEq {
    pub fn new(band_configs: &[EqBand]) -> Self {
        let bands = band_configs
            .iter()
            .map(|b| {
                let ft = parse_filter_type(&b.band_type);
                BiquadFilter::new(ft, b.frequency, b.q, b.gain_db)
            })
            .collect();
        Self { bands }
    }
}

impl AudioEffect for ParametricEq {
    fn process(&mut self, buffer: &mut [f32], channels: u16, sample_rate: u32) {
        for band in &mut self.bands {
            band.process(buffer, channels, sample_rate);
        }
    }

    fn reset(&mut self) {
        for band in &mut self.bands {
            band.reset();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_flat_eq_is_passthrough() {
        let bands = vec![EqBand {
            frequency: 1000.0,
            gain_db: 0.0,
            q: 1.0,
            band_type: "peaking".into(),
        }];
        let mut eq = ParametricEq::new(&bands);
        let mut buf: Vec<f32> = (0..1000)
            .map(|i| (2.0 * std::f32::consts::PI * 440.0 * i as f32 / 44100.0).sin())
            .collect();
        let orig = buf.clone();
        eq.process(&mut buf, 1, 44100);

        let diff_rms: f32 = buf
            .iter()
            .zip(orig.iter())
            .map(|(a, b)| (a - b).powi(2))
            .sum::<f32>()
            / buf.len() as f32;
        assert!(
            diff_rms.sqrt() < 0.01,
            "0dB peaking EQ should be near-passthrough"
        );
    }
}
