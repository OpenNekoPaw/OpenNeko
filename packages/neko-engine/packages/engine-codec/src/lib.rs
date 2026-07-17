//! Codec infrastructure for neko-engine.
//!
//! This crate owns FFmpeg-backed encoder/decoder/muxer implementations and
//! codec pools. Shared DTO contracts remain in `neko-engine-types`; mixed GPU
//! export orchestration remains in `engine-kernel`.

use std::sync::Once;

use ffmpeg_next as ffmpeg;

pub mod decoder;
pub mod encoder;
pub mod error;

#[cfg(test)]
mod architecture_tests;

pub use error::{CodecError, CodecResult, Error, Result};

static FFMPEG_INIT: Once = Once::new();

/// Initialize FFmpeg once for all codec modules.
pub fn init_ffmpeg() {
    FFMPEG_INIT.call_once(|| {
        ffmpeg::init().expect("Failed to initialize FFmpeg");
    });
}
