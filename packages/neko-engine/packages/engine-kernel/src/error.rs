//! Error types for media processor

use neko_engine_types::PipelineContractError;
use thiserror::Error;

/// Result type alias for media processor operations
pub type Result<T> = std::result::Result<T, Error>;

/// Error types for media processor
#[derive(Error, Debug)]
pub enum Error {
    /// GPU initialization failed
    #[error("GPU initialization failed: {0}")]
    GpuInit(String),

    /// GPU device lost
    #[error("GPU device lost")]
    GpuDeviceLost,

    /// Shader compilation failed
    #[error("Shader compilation failed: {0}")]
    ShaderCompilation(String),

    /// Buffer operation failed
    #[error("Buffer operation failed: {0}")]
    BufferError(String),

    /// FFmpeg error
    #[error("FFmpeg error: {0}")]
    Ffmpeg(String),

    /// Decoder not initialized
    #[error("Decoder not initialized")]
    DecoderNotInitialized,

    /// Encoder not initialized
    #[error("Encoder not initialized")]
    EncoderNotInitialized,

    /// Muxer not initialized
    #[error("Muxer not initialized")]
    MuxerNotInitialized,

    /// Invalid seek position
    #[error("Invalid seek position: {0}")]
    InvalidSeek(f64),

    /// Frame decode failed
    #[error("Frame decode failed: {0}")]
    DecodeFailed(String),

    /// Frame encode failed
    #[error("Frame encode failed: {0}")]
    EncodeFailed(String),

    /// Invalid frame format
    #[error("Invalid frame format: expected {expected}, got {actual}")]
    InvalidFormat { expected: String, actual: String },

    /// File not found
    #[error("File not found: {0}")]
    FileNotFound(String),

    /// Invalid parameter
    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    /// Unsupported codec
    #[error("Unsupported codec: {0}")]
    UnsupportedCodec(String),

    /// Unsupported container format
    #[error("Unsupported container format: {0}")]
    UnsupportedContainer(String),

    /// Unsupported engine capability
    #[error("Unsupported capability: {0}")]
    UnsupportedCapability(String),

    /// Unsupported pipeline output for the selected sink
    #[error("Unsupported pipeline output: {0}")]
    UnsupportedOutput(String),

    /// Unknown GPU effect id
    #[error("Unknown effect: {0}")]
    UnknownEffect(String),

    /// Operation has already completed
    #[error("Already completed: {0}")]
    AlreadyCompleted(String),

    /// Hardware encoder not available
    #[error("Hardware encoder not available: {0}")]
    HwEncoderNotAvailable(String),

    /// Operation cancelled
    #[error("Operation cancelled")]
    Cancelled,

    /// Resource not found
    #[error("Not found: {0}")]
    NotFound(String),

    /// Frame not found at specified time
    #[error("Frame not found at time: {0}")]
    FrameNotFound(f64),

    /// GPU operation error
    #[error("GPU error: {0}")]
    GpuError(String),

    /// GPU budget policy temporarily paused preview work
    #[error("GPU busy: retry after {retry_after_ms}ms ({message})")]
    GpuBusy {
        /// Retry hint in milliseconds.
        retry_after_ms: u64,
        /// Human-readable reason.
        message: String,
    },

    /// JPEG encoding error
    #[error("JPEG error: {0}")]
    Jpeg(String),

    /// IO error
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Generic error
    #[error("{0}")]
    Other(String),
}

impl From<wgpu::RequestDeviceError> for Error {
    fn from(e: wgpu::RequestDeviceError) -> Self {
        Error::GpuInit(e.to_string())
    }
}

impl From<neko_engine_gpu::GpuError> for Error {
    fn from(e: neko_engine_gpu::GpuError) -> Self {
        match e {
            neko_engine_gpu::GpuError::GpuInit(message) => Error::GpuInit(message),
            neko_engine_gpu::GpuError::GpuDeviceLost => Error::GpuDeviceLost,
            neko_engine_gpu::GpuError::ShaderCompilation(message) => {
                Error::ShaderCompilation(message)
            }
            neko_engine_gpu::GpuError::BufferError(message) => Error::BufferError(message),
            neko_engine_gpu::GpuError::InvalidParameter(message) => {
                Error::InvalidParameter(message)
            }
            neko_engine_gpu::GpuError::UnsupportedCapability(message) => {
                Error::UnsupportedCapability(message)
            }
            neko_engine_gpu::GpuError::UnknownEffect(effect_id) => Error::UnknownEffect(effect_id),
            neko_engine_gpu::GpuError::Other(message) => Error::Other(message),
        }
    }
}

impl From<ffmpeg_next::Error> for Error {
    fn from(e: ffmpeg_next::Error) -> Self {
        Error::Ffmpeg(e.to_string())
    }
}

impl From<neko_engine_codec::CodecError> for Error {
    fn from(e: neko_engine_codec::CodecError) -> Self {
        match e {
            neko_engine_codec::CodecError::Ffmpeg(message) => Error::Ffmpeg(message),
            neko_engine_codec::CodecError::DecoderNotInitialized => Error::DecoderNotInitialized,
            neko_engine_codec::CodecError::EncoderNotInitialized => Error::EncoderNotInitialized,
            neko_engine_codec::CodecError::MuxerNotInitialized => Error::MuxerNotInitialized,
            neko_engine_codec::CodecError::InvalidSeek(position) => Error::InvalidSeek(position),
            neko_engine_codec::CodecError::DecodeFailed(message) => Error::DecodeFailed(message),
            neko_engine_codec::CodecError::EncodeFailed(message) => Error::EncodeFailed(message),
            neko_engine_codec::CodecError::FileNotFound(path) => Error::FileNotFound(path),
            neko_engine_codec::CodecError::InvalidParameter(message) => {
                Error::InvalidParameter(message)
            }
            neko_engine_codec::CodecError::UnsupportedCodec(codec) => {
                Error::UnsupportedCodec(codec)
            }
            neko_engine_codec::CodecError::UnsupportedContainer(container) => {
                Error::UnsupportedContainer(container)
            }
            neko_engine_codec::CodecError::UnsupportedCapability(message) => {
                Error::UnsupportedCapability(message)
            }
            neko_engine_codec::CodecError::AlreadyCompleted(message) => {
                Error::AlreadyCompleted(message)
            }
            neko_engine_codec::CodecError::HwEncoderNotAvailable(message) => {
                Error::HwEncoderNotAvailable(message)
            }
            neko_engine_codec::CodecError::Cancelled => Error::Cancelled,
            neko_engine_codec::CodecError::Other(message) => Error::Other(message),
        }
    }
}

impl From<neko_engine_audio::AudioError> for Error {
    fn from(e: neko_engine_audio::AudioError) -> Self {
        match e {
            neko_engine_audio::AudioError::Ffmpeg(message) => Error::Ffmpeg(message),
            neko_engine_audio::AudioError::DecoderNotInitialized => Error::DecoderNotInitialized,
            neko_engine_audio::AudioError::EncoderNotInitialized => Error::EncoderNotInitialized,
            neko_engine_audio::AudioError::InvalidSeek(position) => Error::InvalidSeek(position),
            neko_engine_audio::AudioError::DecodeFailed(message) => Error::DecodeFailed(message),
            neko_engine_audio::AudioError::EncodeFailed(message) => Error::EncodeFailed(message),
            neko_engine_audio::AudioError::FileNotFound(path) => Error::FileNotFound(path),
            neko_engine_audio::AudioError::InvalidParameter(message) => {
                Error::InvalidParameter(message)
            }
            neko_engine_audio::AudioError::UnsupportedCodec(codec) => {
                Error::UnsupportedCodec(codec)
            }
            neko_engine_audio::AudioError::Cancelled => Error::Cancelled,
            neko_engine_audio::AudioError::Other(message) => Error::Other(message),
        }
    }
}

impl From<neko_runtime_media::MediaError> for Error {
    fn from(e: neko_runtime_media::MediaError) -> Self {
        match e {
            neko_runtime_media::MediaError::FileNotFound(path) => Error::FileNotFound(path),
            neko_runtime_media::MediaError::NotFound(message) => Error::NotFound(message),
            neko_runtime_media::MediaError::Ffmpeg(message) => Error::Ffmpeg(message),
            neko_runtime_media::MediaError::Image(message)
            | neko_runtime_media::MediaError::Parse(message)
            | neko_runtime_media::MediaError::Other(message) => Error::Other(message),
        }
    }
}

impl From<PipelineContractError> for Error {
    fn from(e: PipelineContractError) -> Self {
        match e {
            PipelineContractError::UnsupportedHandle { .. }
            | PipelineContractError::EncoderInputUnsupported { .. }
            | PipelineContractError::MissingReadback { .. } => {
                Error::UnsupportedCapability(e.to_string())
            }
            PipelineContractError::ReadbackFailed(message) => Error::GpuError(message),
        }
    }
}
