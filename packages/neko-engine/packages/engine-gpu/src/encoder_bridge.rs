//! GPU Encoder Bridge - Platform-specific GPU buffer handle types
//!
//! This module defines the platform-specific handle types used for
//! zero-copy encoding. The actual encoding pipeline uses:
//! - macOS: RgbaToNv12TextureConverter → IOSurface → VideoToolbox
//! - Linux: LinuxTextureExporter → DMA-BUF fd → VAAPI/NVENC
//! - Windows: WindowsTextureExporter → DXGI SharedHandle → D3D11VA
//!
//! These types are kept as a shared vocabulary for encoder integration.

/// Platform-specific GPU buffer handles for encoder
#[derive(Debug)]
pub struct GpuBufferHandles {
    /// Y plane handle
    pub y_handle: GpuBufferHandle,
    /// UV plane handle
    pub uv_handle: GpuBufferHandle,
}

/// Platform-specific GPU buffer handle
#[derive(Debug)]
pub enum GpuBufferHandle {
    /// macOS: IOSurface
    #[cfg(target_os = "macos")]
    IOSurface { surface: usize, plane: u32 },
    /// Linux: DMA-BUF file descriptor
    #[cfg(target_os = "linux")]
    DmaBuf { fd: i32, offset: u32, stride: u32 },
    /// Windows: D3D11 shared handle
    #[cfg(target_os = "windows")]
    D3d11Shared { handle: usize, array_index: u32 },
    /// CUDA device pointer
    #[cfg(any(target_os = "linux", target_os = "windows"))]
    Cuda { device_ptr: usize, pitch: usize },
}

/// GPU frame ready for encoding
pub struct GpuEncoderFrame {
    /// Frame width
    pub width: u32,
    /// Frame height
    pub height: u32,
    /// Presentation timestamp (in time_base units)
    pub pts: i64,
    /// GPU buffer handles
    pub gpu_handles: GpuBufferHandles,
}
