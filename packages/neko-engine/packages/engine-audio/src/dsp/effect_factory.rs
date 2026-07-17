//! Factory for creating audio effects from JSON configuration.

use crate::error::{Error, Result};
pub use neko_engine_types::AudioEffectConfig;
use std::collections::HashMap;
use std::sync::LazyLock;

use super::biquad::{BiquadFilter, FilterType};
use super::chorus::Chorus;
use super::compressor::Compressor;
use super::delay::Delay;
use super::distortion::{parse_distortion_type, Distortion};
use super::effect_chain::EffectChain;
use super::gain::Gain;
use super::limiter::LimiterEffect;
use super::noise_gate::{NoiseGateConfig, NoiseGateEffect};
use super::parametric_eq::{EqBand, ParametricEq};
use super::reverb::Reverb;
use super::traits::AudioEffect;

type AudioEffectBuilder = fn(&serde_json::Value) -> Box<dyn AudioEffect>;

static BUILTIN_AUDIO_EFFECT_FACTORY: LazyLock<AudioEffectFactory> =
    LazyLock::new(AudioEffectFactory::with_builtins);

fn f(v: &serde_json::Value, key: &str, default: f32) -> f32 {
    v.get(key)
        .and_then(|v| v.as_f64())
        .map(|v| v as f32)
        .unwrap_or(default)
}

fn f64v(v: &serde_json::Value, key: &str, default: f64) -> f64 {
    v.get(key).and_then(|v| v.as_f64()).unwrap_or(default)
}

fn s<'a>(v: &'a serde_json::Value, key: &str, default: &'a str) -> &'a str {
    v.get(key).and_then(|v| v.as_str()).unwrap_or(default)
}

fn b(v: &serde_json::Value, key: &str, default: bool) -> bool {
    v.get(key).and_then(|v| v.as_bool()).unwrap_or(default)
}

/// Registration-based factory for audio DSP effects.
#[derive(Clone, Default)]
pub struct AudioEffectFactory {
    builders: HashMap<String, AudioEffectBuilder>,
}

impl AudioEffectFactory {
    /// Create an empty factory for tests or plugin-specific wiring.
    pub fn new() -> Self {
        Self {
            builders: HashMap::new(),
        }
    }

    /// Create a factory with all built-in DSP effects registered.
    pub fn with_builtins() -> Self {
        let mut factory = Self::new();
        factory.register_builtins();
        factory
    }

    /// Register one effect builder under its canonical effect type.
    pub fn register(&mut self, effect_type: impl Into<String>, builder: AudioEffectBuilder) {
        self.builders.insert(effect_type.into(), builder);
    }

    /// Register every built-in audio effect type.
    pub fn register_builtins(&mut self) {
        self.register("gain", build_gain);
        self.register("high-pass", build_high_pass);
        self.register("low-pass", build_low_pass);
        self.register("band-pass", build_band_pass);
        self.register("notch", build_notch);
        self.register("peaking", build_peaking);
        self.register("low-shelf", build_low_shelf);
        self.register("high-shelf", build_high_shelf);
        self.register("parametric-eq", build_parametric_eq);
        self.register("compressor", build_compressor);
        self.register("noise-gate", build_noise_gate);
        self.register("limiter", build_limiter);
        self.register("reverb", build_reverb);
        self.register("delay", build_delay);
        self.register("chorus", build_chorus);
        self.register("distortion", build_distortion);
    }

    /// Create a single audio effect from its configuration.
    pub fn create(&self, config: &AudioEffectConfig) -> Result<Box<dyn AudioEffect>> {
        let builder = self.builders.get(&config.effect_type).ok_or_else(|| {
            Error::InvalidParameter(format!(
                "Unsupported audio effect type: {}",
                config.effect_type
            ))
        })?;

        Ok(builder(&config.params))
    }

    /// Build an EffectChain from a list of configurations.
    pub fn build_chain(&self, configs: &[AudioEffectConfig]) -> Result<EffectChain> {
        let mut chain = EffectChain::new();
        for config in configs {
            let effect = self.create(config)?;
            chain.push(config.id.clone(), config.enabled, effect);
        }
        Ok(chain)
    }
}

/// Create a single audio effect from its configuration.
pub fn create_effect(config: &AudioEffectConfig) -> Result<Box<dyn AudioEffect>> {
    BUILTIN_AUDIO_EFFECT_FACTORY.create(config)
}

/// Build an EffectChain from a list of configurations.
pub fn build_effect_chain(configs: &[AudioEffectConfig]) -> Result<EffectChain> {
    BUILTIN_AUDIO_EFFECT_FACTORY.build_chain(configs)
}

fn build_gain(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(Gain::new(f(p, "gainDb", f(p, "gain", 0.0))))
}

fn build_high_pass(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(BiquadFilter::new(
        FilterType::HighPass,
        f64v(p, "frequency", 80.0),
        f64v(p, "q", f64v(p, "resonance", 0.707)),
        0.0,
    ))
}

fn build_low_pass(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(BiquadFilter::new(
        FilterType::LowPass,
        f64v(p, "frequency", 8000.0),
        f64v(p, "q", f64v(p, "resonance", 0.707)),
        0.0,
    ))
}

fn build_band_pass(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(BiquadFilter::new(
        FilterType::BandPass,
        f64v(p, "frequency", 1000.0),
        f64v(p, "q", f64v(p, "bandwidth", 1.0)),
        0.0,
    ))
}

fn build_notch(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(BiquadFilter::new(
        FilterType::Notch,
        f64v(p, "frequency", 1000.0),
        f64v(p, "q", 1.0),
        0.0,
    ))
}

fn build_peaking(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(BiquadFilter::new(
        FilterType::Peaking,
        f64v(p, "frequency", 1000.0),
        f64v(p, "q", 1.0),
        f64v(p, "gainDb", f64v(p, "gain", 0.0)),
    ))
}

fn build_low_shelf(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(BiquadFilter::new(
        FilterType::LowShelf,
        f64v(p, "frequency", 200.0),
        f64v(p, "q", 0.707),
        f64v(p, "gainDb", f64v(p, "gain", 0.0)),
    ))
}

fn build_high_shelf(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(BiquadFilter::new(
        FilterType::HighShelf,
        f64v(p, "frequency", 4000.0),
        f64v(p, "q", 0.707),
        f64v(p, "gainDb", f64v(p, "gain", 0.0)),
    ))
}

fn build_parametric_eq(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    let bands: Vec<EqBand> = p
        .get("bands")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();
    Box::new(ParametricEq::new(&bands))
}

fn build_compressor(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(Compressor::new(
        f(p, "threshold", -24.0),
        f(p, "ratio", 4.0),
        f(p, "attack", 10.0),
        f(p, "release", 100.0),
        f(p, "knee", 6.0),
        f(p, "makeupGain", 0.0),
    ))
}

fn build_noise_gate(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(NoiseGateEffect::new(NoiseGateConfig {
        threshold_db: f(p, "threshold", -40.0),
        attack_ms: f(p, "attack", 1.0),
        hold_ms: f(p, "hold", 50.0),
        release_ms: f(p, "release", 100.0),
    }))
}

fn build_limiter(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(LimiterEffect::new(
        f(p, "threshold", 0.95),
        f(p, "ceiling", 1.0),
        f(p, "release", 50.0),
    ))
}

fn build_reverb(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(Reverb::new(
        f(p, "roomSize", 0.5),
        f(p, "damping", 0.5),
        f(p, "wetDry", 0.3),
        f(p, "width", 1.0),
        f(p, "preDelay", 0.0),
    ))
}

fn build_delay(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(Delay::new(
        f(p, "delayMs", f(p, "delayTime", 250.0)),
        f(p, "feedback", 0.4),
        f(p, "wetDry", 0.3),
        b(p, "pingPong", false),
    ))
}

fn build_chorus(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    Box::new(Chorus::new(
        f(p, "rate", 1.5),
        f(p, "depth", 3.0),
        f(p, "delay", 7.0),
        f(p, "feedback", 0.2),
        f(p, "wetDry", 0.5),
    ))
}

fn build_distortion(p: &serde_json::Value) -> Box<dyn AudioEffect> {
    let dtype = parse_distortion_type(s(p, "type", "soft"));
    Box::new(Distortion::new(
        f(p, "drive", 12.0),
        f(p, "outputGain", -6.0),
        dtype,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use neko_engine_types::SUPPORTED_AUDIO_EFFECT_TYPES;

    #[test]
    fn test_create_all_builtin_effects() {
        let factory = AudioEffectFactory::with_builtins();
        for t in SUPPORTED_AUDIO_EFFECT_TYPES {
            let config = AudioEffectConfig {
                id: format!("test-{}", t),
                effect_type: t.to_string(),
                enabled: true,
                params: serde_json::json!({}),
            };
            let result = factory.create(&config);
            assert!(result.is_ok(), "Failed to create effect: {}", t);
        }
    }

    #[test]
    fn test_build_chain() {
        let configs = vec![
            AudioEffectConfig {
                id: "hp".into(),
                effect_type: "high-pass".into(),
                enabled: true,
                params: serde_json::json!({"frequency": 80}),
            },
            AudioEffectConfig {
                id: "comp".into(),
                effect_type: "compressor".into(),
                enabled: true,
                params: serde_json::json!({"threshold": -18, "ratio": 3}),
            },
            AudioEffectConfig {
                id: "lim".into(),
                effect_type: "limiter".into(),
                enabled: false,
                params: serde_json::json!({}),
            },
        ];
        let chain = build_effect_chain(&configs).unwrap();
        assert_eq!(chain.len(), 3);
    }

    #[test]
    fn test_unknown_effect_returns_error() {
        let factory = AudioEffectFactory::with_builtins();
        let config = AudioEffectConfig {
            id: "missing".into(),
            effect_type: "spectral-wizard".into(),
            enabled: true,
            params: serde_json::json!({}),
        };

        let message = match factory.create(&config) {
            Ok(_) => panic!("unknown effect should fail"),
            Err(err) => err.to_string(),
        };

        assert!(message.contains("Unsupported audio effect type"));
    }

    #[test]
    fn test_default_create_effect_uses_builtin_factory() {
        let config = AudioEffectConfig {
            id: "gain".into(),
            effect_type: "gain".into(),
            enabled: true,
            params: serde_json::json!({"gainDb": 3.0}),
        };

        assert!(create_effect(&config).is_ok());
    }
}
