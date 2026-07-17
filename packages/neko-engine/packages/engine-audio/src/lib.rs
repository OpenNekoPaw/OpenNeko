//! Audio infrastructure for neko-engine.
//!
//! This crate owns FFmpeg-backed audio decoding/encoding, DSP processors,
//! and limiter primitives. Shared DTO contracts remain in
//! `neko-engine-types`; service orchestration remains in `engine-kernel`.

pub mod decoder;
pub mod dsp;
pub mod encoder;
pub mod error;
pub mod soft_limiter;
pub mod traits;

#[cfg(test)]
mod architecture_tests;

pub use decoder::{CorruptTailPolicy, FfmpegAudioDecoder};
pub use encoder::FfmpegAudioEncoder;
pub use error::{AudioError, AudioResult, Error, Result};
pub use soft_limiter::SoftLimiter;
pub use traits::{
    AudioCodec, AudioDecoder, AudioEncoder, AudioEncoderConfig, AudioInfo, DecodedAudioFrame,
    EncodedAudioPacket, SampleFormat,
};
