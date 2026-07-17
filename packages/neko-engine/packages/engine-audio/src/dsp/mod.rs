//! Audio DSP effects library.
//!
//! Provides composable audio effects that implement the `AudioEffect` trait.
//! Effects can be chained via `EffectChain` and constructed from JSON via
//! the `effect_factory` module.

pub mod biquad;
pub mod chorus;
pub mod compressor;
pub mod delay;
pub mod distortion;
pub mod effect_chain;
pub mod effect_factory;
pub mod gain;
pub mod limiter;
pub mod noise_gate;
pub mod parametric_eq;
pub mod reverb;
pub mod speed_resampler;
pub mod traits;

pub use effect_chain::EffectChain;
pub use effect_factory::{
    build_effect_chain, create_effect, AudioEffectConfig, AudioEffectFactory,
};
pub use traits::AudioEffect;
