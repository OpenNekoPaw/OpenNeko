//! Error types for runtime-media

use thiserror::Error;

/// Result type alias
pub type Result<T> = std::result::Result<T, MediaError>;

/// Error types for media processing operations
#[derive(Error, Debug)]
pub enum MediaError {
    /// File not found
    #[error("File not found: {0}")]
    FileNotFound(String),

    /// Resource not found
    #[error("Not found: {0}")]
    NotFound(String),

    /// FFmpeg error
    #[error("FFmpeg error: {0}")]
    Ffmpeg(String),

    /// Image processing error
    #[error("Image error: {0}")]
    Image(String),

    /// Parse error
    #[error("Parse error: {0}")]
    Parse(String),

    /// General error
    #[error("{0}")]
    Other(String),
}

impl From<image::ImageError> for MediaError {
    fn from(e: image::ImageError) -> Self {
        MediaError::Image(e.to_string())
    }
}

impl From<std::io::Error> for MediaError {
    fn from(e: std::io::Error) -> Self {
        MediaError::Other(e.to_string())
    }
}

impl From<ffmpeg_next::Error> for MediaError {
    fn from(e: ffmpeg_next::Error) -> Self {
        MediaError::Ffmpeg(e.to_string())
    }
}

impl From<serde_json::Error> for MediaError {
    fn from(e: serde_json::Error) -> Self {
        MediaError::Parse(e.to_string())
    }
}
