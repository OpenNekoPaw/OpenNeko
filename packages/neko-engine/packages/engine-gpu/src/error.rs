//! GPU-local error contract.

use thiserror::Error;

/// Result type for GPU infrastructure operations.
pub type GpuResult<T> = std::result::Result<T, GpuError>;

/// Compatibility alias for migrated modules.
pub type Result<T> = GpuResult<T>;

/// Compatibility alias for migrated modules.
pub use GpuError as Error;

/// Errors owned by the GPU infrastructure crate.
#[derive(Error, Debug)]
pub enum GpuError {
    /// GPU initialization failed.
    #[error("GPU initialization failed: {0}")]
    GpuInit(String),

    /// GPU device lost.
    #[error("GPU device lost")]
    GpuDeviceLost,

    /// Shader compilation failed.
    #[error("Shader compilation failed: {0}")]
    ShaderCompilation(String),

    /// Buffer operation failed.
    #[error("Buffer operation failed: {0}")]
    BufferError(String),

    /// Invalid parameter.
    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    /// Unsupported GPU capability.
    #[error("Unsupported capability: {0}")]
    UnsupportedCapability(String),

    /// Unknown GPU effect id.
    #[error("Unknown effect: {0}")]
    UnknownEffect(String),

    /// Generic GPU error.
    #[error("{0}")]
    Other(String),
}

impl From<wgpu::RequestDeviceError> for GpuError {
    fn from(error: wgpu::RequestDeviceError) -> Self {
        Self::GpuInit(error.to_string())
    }
}
