//! Error types for audio infrastructure.

use thiserror::Error;

/// Result type alias for audio operations.
pub type AudioResult<T> = std::result::Result<T, AudioError>;

/// Backward-compatible local alias used by moved audio modules.
pub type Result<T> = AudioResult<T>;

/// Audio infrastructure failures.
#[derive(Error, Debug)]
pub enum AudioError {
    /// FFmpeg operation failed.
    #[error("FFmpeg error: {0}")]
    Ffmpeg(String),

    /// Decoder not initialized.
    #[error("Decoder not initialized")]
    DecoderNotInitialized,

    /// Encoder not initialized.
    #[error("Encoder not initialized")]
    EncoderNotInitialized,

    /// Invalid seek position.
    #[error("Invalid seek position: {0}")]
    InvalidSeek(f64),

    /// Frame decode failed.
    #[error("Frame decode failed: {0}")]
    DecodeFailed(String),

    /// Frame encode failed.
    #[error("Frame encode failed: {0}")]
    EncodeFailed(String),

    /// File not found.
    #[error("File not found: {0}")]
    FileNotFound(String),

    /// Invalid parameter.
    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    /// Unsupported codec.
    #[error("Unsupported codec: {0}")]
    UnsupportedCodec(String),

    /// Operation cancelled.
    #[error("Operation cancelled")]
    Cancelled,

    /// Generic audio error.
    #[error("{0}")]
    Other(String),
}

/// Backward-compatible local alias used by moved audio modules.
pub use AudioError as Error;

impl From<ffmpeg_next::Error> for AudioError {
    fn from(e: ffmpeg_next::Error) -> Self {
        AudioError::Ffmpeg(e.to_string())
    }
}
