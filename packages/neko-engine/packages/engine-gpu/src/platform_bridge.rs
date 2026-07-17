//! Platform GPU media bridge contracts.
//!
//! This module keeps native media interop in `engine-gpu`. Kernel preview and
//! export orchestration should select paths through capabilities and receive
//! typed GPU handles instead of branching on platform-specific resources.

use std::sync::Arc;

use crate::error::{GpuError as Error, GpuResult as Result};
use crate::nv12_import::ImportedNv12Texture;
use crate::GpuContext;
use neko_engine_types::{DecodedGpuTextureHandle, GpuOutputHandle, Nv12GpuTextureSource};

#[cfg(target_os = "linux")]
use crate::linux_import::LinuxTextureImporter;
#[cfg(target_os = "macos")]
use crate::macos_import::MacOsTextureImporter;
#[cfg(target_os = "windows")]
use crate::windows_import::WindowsTextureImporter;

/// Direction of a platform GPU media bridge operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformGpuBridgeDirection {
    /// Import a decoder-produced native frame into wgpu textures.
    ImportDecodedFrame,
    /// Export a renderer-produced NV12 frame as an encoder-ready native handle.
    ExportEncoderFrame,
}

/// Pixel format carried through a platform bridge operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformGpuBridgeFormat {
    /// NV12 luma/chroma planes.
    Nv12,
}

/// Native handle family used at the bridge boundary.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformGpuBridgeHandleKind {
    /// macOS IOSurface/CVPixelBuffer interop.
    IOSurface,
    /// Linux VA-API VASurface import.
    VaapiSurface,
    /// Linux DMA-BUF export/import.
    DmaBuf,
    /// Windows D3D11 decoder texture.
    D3D11Texture,
    /// Windows DXGI shared handle.
    DxgiSharedHandle,
}

/// Synchronization primitive required by a bridge capability.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlatformGpuBridgeSynchronization {
    /// `CVPixelBufferLockBaseAddress` waits for VideoToolbox writes.
    CVPixelBufferLock,
    /// `wgpu::Device::poll(Wait)` fences submitted GPU rendering.
    WgpuPollWait,
    /// VA-API surface synchronization.
    VaapiSurfaceSync,
    /// Backend/driver synchronization is required but not fully wired yet.
    DriverManaged,
}

/// Capability query for bridge selection.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PlatformGpuBridgeRequest {
    pub direction: PlatformGpuBridgeDirection,
    pub format: PlatformGpuBridgeFormat,
    pub handle_kind: PlatformGpuBridgeHandleKind,
}

impl PlatformGpuBridgeRequest {
    pub const fn new(
        direction: PlatformGpuBridgeDirection,
        format: PlatformGpuBridgeFormat,
        handle_kind: PlatformGpuBridgeHandleKind,
    ) -> Self {
        Self {
            direction,
            format,
            handle_kind,
        }
    }
}

/// Reported platform bridge capability.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlatformGpuBridgeCapability {
    pub request: PlatformGpuBridgeRequest,
    pub platform: &'static str,
    pub supported: bool,
    pub zero_copy: bool,
    pub synchronization: Vec<PlatformGpuBridgeSynchronization>,
    pub reason: Option<String>,
}

impl PlatformGpuBridgeCapability {
    pub fn supported(
        platform: &'static str,
        request: PlatformGpuBridgeRequest,
        synchronization: Vec<PlatformGpuBridgeSynchronization>,
    ) -> Self {
        Self {
            request,
            platform,
            supported: true,
            zero_copy: true,
            synchronization,
            reason: None,
        }
    }

    pub fn unsupported(
        platform: &'static str,
        request: PlatformGpuBridgeRequest,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            request,
            platform,
            supported: false,
            zero_copy: false,
            synchronization: Vec::new(),
            reason: Some(reason.into()),
        }
    }
}

/// Platform GPU media bridge.
///
/// Implementations may touch IOSurface, DMA-BUF, VA-API, DXGI, D3D, Metal,
/// Vulkan, or platform synchronization APIs. Callers must keep decoder frames
/// and `GpuFrameLease` owners alive while using any raw handle extracted from
/// the returned `GpuOutputHandle`; bare handles are identifiers, not owners.
pub trait PlatformGpuMediaBridge {
    /// Capabilities available on the compiled platform path.
    fn capabilities(&self) -> Vec<PlatformGpuBridgeCapability>;

    /// Select capability for a specific request.
    fn capability(&self, request: PlatformGpuBridgeRequest) -> PlatformGpuBridgeCapability {
        self.capabilities()
            .into_iter()
            .find(|capability| capability.request == request)
            .unwrap_or_else(|| {
                PlatformGpuBridgeCapability::unsupported(
                    std::env::consts::OS,
                    request,
                    "platform bridge capability is not registered",
                )
            })
    }

    /// Import a decoder-produced native NV12 frame into wgpu textures.
    fn import_decoded_frame(
        &self,
        gpu_texture: &dyn Nv12GpuTextureSource,
    ) -> Result<ImportedNv12Texture>;

    /// Wrap an encoder-ready native NV12 handle as a typed output handle.
    fn export_encoder_handle(
        &self,
        native_handle: usize,
        width: u32,
        height: u32,
    ) -> Result<GpuOutputHandle>;
}

/// Default bridge for the currently compiled platform.
pub struct DefaultPlatformGpuMediaBridge {
    ctx: Arc<GpuContext>,
}

impl DefaultPlatformGpuMediaBridge {
    pub fn new(ctx: Arc<GpuContext>) -> Self {
        Self { ctx }
    }

    /// Capabilities available on the currently compiled platform.
    pub fn platform_capabilities() -> Vec<PlatformGpuBridgeCapability> {
        platform_capabilities()
    }
}

impl PlatformGpuMediaBridge for DefaultPlatformGpuMediaBridge {
    fn capabilities(&self) -> Vec<PlatformGpuBridgeCapability> {
        Self::platform_capabilities()
    }

    fn import_decoded_frame(
        &self,
        gpu_texture: &dyn Nv12GpuTextureSource,
    ) -> Result<ImportedNv12Texture> {
        match gpu_texture.handle() {
            #[cfg(target_os = "macos")]
            DecodedGpuTextureHandle::VideoToolbox { pixel_buffer, .. } => {
                let importer = MacOsTextureImporter::new(Arc::clone(&self.ctx))?;
                unsafe { importer.import_videotoolbox(*pixel_buffer, gpu_texture) }
            }

            #[cfg(target_os = "linux")]
            DecodedGpuTextureHandle::Vaapi {
                surface_id,
                display,
            } => {
                let importer = LinuxTextureImporter::new(Arc::clone(&self.ctx))?;
                unsafe { importer.import_vaapi(*surface_id, *display, gpu_texture) }
            }

            #[cfg(target_os = "windows")]
            DecodedGpuTextureHandle::D3d11 {
                texture,
                array_index,
            } => {
                let importer = WindowsTextureImporter::new(Arc::clone(&self.ctx))?;
                unsafe { importer.import_d3d11(*texture, *array_index, gpu_texture) }
            }

            other => Err(Error::UnsupportedCapability(format!(
                "decoded GPU handle {:?} is not supported by the {} platform bridge",
                other,
                std::env::consts::OS
            ))),
        }
    }

    fn export_encoder_handle(
        &self,
        native_handle: usize,
        _width: u32,
        _height: u32,
    ) -> Result<GpuOutputHandle> {
        #[cfg(target_os = "macos")]
        {
            if native_handle == 0 {
                return Err(Error::InvalidParameter(
                    "IOSurface encoder handle must be non-zero".to_string(),
                ));
            }
            Ok(GpuOutputHandle::IOSurface(native_handle))
        }

        #[cfg(not(target_os = "macos"))]
        {
            let _ = native_handle;
            Err(Error::UnsupportedCapability(format!(
                "zero-copy NV12 encoder bridge is not implemented on {}",
                std::env::consts::OS
            )))
        }
    }
}

fn platform_capabilities() -> Vec<PlatformGpuBridgeCapability> {
    let mut capabilities = Vec::new();

    #[cfg(target_os = "macos")]
    {
        capabilities.push(PlatformGpuBridgeCapability::supported(
            "macos",
            PlatformGpuBridgeRequest::new(
                PlatformGpuBridgeDirection::ImportDecodedFrame,
                PlatformGpuBridgeFormat::Nv12,
                PlatformGpuBridgeHandleKind::IOSurface,
            ),
            vec![PlatformGpuBridgeSynchronization::CVPixelBufferLock],
        ));
        capabilities.push(PlatformGpuBridgeCapability::supported(
            "macos",
            PlatformGpuBridgeRequest::new(
                PlatformGpuBridgeDirection::ExportEncoderFrame,
                PlatformGpuBridgeFormat::Nv12,
                PlatformGpuBridgeHandleKind::IOSurface,
            ),
            vec![PlatformGpuBridgeSynchronization::WgpuPollWait],
        ));
    }

    #[cfg(target_os = "linux")]
    {
        capabilities.push(PlatformGpuBridgeCapability::supported(
            "linux",
            PlatformGpuBridgeRequest::new(
                PlatformGpuBridgeDirection::ImportDecodedFrame,
                PlatformGpuBridgeFormat::Nv12,
                PlatformGpuBridgeHandleKind::VaapiSurface,
            ),
            vec![PlatformGpuBridgeSynchronization::VaapiSurfaceSync],
        ));
        capabilities.push(PlatformGpuBridgeCapability::unsupported(
            "linux",
            PlatformGpuBridgeRequest::new(
                PlatformGpuBridgeDirection::ExportEncoderFrame,
                PlatformGpuBridgeFormat::Nv12,
                PlatformGpuBridgeHandleKind::DmaBuf,
            ),
            "DMA-BUF encoder export exists as low-level primitives but is not wired into realtime preview/export",
        ));
    }

    #[cfg(target_os = "windows")]
    {
        capabilities.push(PlatformGpuBridgeCapability::supported(
            "windows",
            PlatformGpuBridgeRequest::new(
                PlatformGpuBridgeDirection::ImportDecodedFrame,
                PlatformGpuBridgeFormat::Nv12,
                PlatformGpuBridgeHandleKind::D3D11Texture,
            ),
            vec![PlatformGpuBridgeSynchronization::DriverManaged],
        ));
        capabilities.push(PlatformGpuBridgeCapability::unsupported(
            "windows",
            PlatformGpuBridgeRequest::new(
                PlatformGpuBridgeDirection::ExportEncoderFrame,
                PlatformGpuBridgeFormat::Nv12,
                PlatformGpuBridgeHandleKind::DxgiSharedHandle,
            ),
            "DXGI encoder export exists as low-level primitives but is not wired into realtime preview/export",
        ));
    }

    capabilities
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn current_platform_reports_bridge_capabilities() {
        let capabilities = DefaultPlatformGpuMediaBridge::platform_capabilities();
        assert!(!capabilities.is_empty());
        assert!(capabilities
            .iter()
            .all(|capability| capability.platform == std::env::consts::OS));
    }

    #[test]
    fn unsupported_capability_is_explicit() {
        let request = PlatformGpuBridgeRequest::new(
            PlatformGpuBridgeDirection::ExportEncoderFrame,
            PlatformGpuBridgeFormat::Nv12,
            PlatformGpuBridgeHandleKind::DmaBuf,
        );
        let capability = PlatformGpuBridgeCapability::unsupported("test", request, "not wired yet");

        assert!(!capability.supported);
        assert!(!capability.zero_copy);
        assert_eq!(capability.reason.as_deref(), Some("not wired yet"));
    }

    #[test]
    fn current_platform_export_capability_is_zero_copy_or_explicitly_unsupported() {
        let capabilities = DefaultPlatformGpuMediaBridge::platform_capabilities();
        let export_capabilities: Vec<_> = capabilities
            .iter()
            .filter(|capability| {
                capability.request.direction == PlatformGpuBridgeDirection::ExportEncoderFrame
            })
            .collect();

        assert!(!export_capabilities.is_empty());
        for capability in export_capabilities {
            if capability.supported {
                assert!(capability.zero_copy);
                assert!(!capability.synchronization.is_empty());
            } else {
                assert!(capability.reason.is_some());
            }
        }
    }
}
