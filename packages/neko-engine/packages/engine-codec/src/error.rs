//! Error types for codec infrastructure.

use thiserror::Error;

/// Result type alias for codec operations.
pub type CodecResult<T> = std::result::Result<T, CodecError>;

/// Backward-compatible local alias used by moved codec modules.
pub type Result<T> = CodecResult<T>;

/// Codec infrastructure failures.
#[derive(Error, Debug)]
pub enum CodecError {
    /// FFmpeg operation failed.
    #[error("FFmpeg error: {0}")]
    Ffmpeg(String),

    /// Decoder not initialized.
    #[error("Decoder not initialized")]
    DecoderNotInitialized,

    /// Encoder not initialized.
    #[error("Encoder not initialized")]
    EncoderNotInitialized,

    /// Muxer not initialized.
    #[error("Muxer not initialized")]
    MuxerNotInitialized,

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

    /// Unsupported container format.
    #[error("Unsupported container format: {0}")]
    UnsupportedContainer(String),

    /// Unsupported native codec capability.
    #[error("Unsupported capability: {0}")]
    UnsupportedCapability(String),

    /// Operation has already completed.
    #[error("Already completed: {0}")]
    AlreadyCompleted(String),

    /// Hardware encoder not available.
    #[error("Hardware encoder not available: {0}")]
    HwEncoderNotAvailable(String),

    /// Operation cancelled.
    #[error("Operation cancelled")]
    Cancelled,

    /// Generic codec error.
    #[error("{0}")]
    Other(String),
}

/// Backward-compatible local alias used by moved codec modules.
pub use CodecError as Error;

impl From<ffmpeg_next::Error> for CodecError {
    fn from(e: ffmpeg_next::Error) -> Self {
        CodecError::Ffmpeg(e.to_string())
    }
}
