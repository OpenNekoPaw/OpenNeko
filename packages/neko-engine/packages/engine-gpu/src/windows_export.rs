//! Windows Zero-Copy Export - wgpu → D3D12 → DXGI SharedHandle → D3D11VA
//!
//! This module implements zero-copy texture export on Windows:
//! 1. Create D3D12 resource with shared heap flag
//! 2. Import into wgpu as render/compute target
//! 3. Export DXGI shared handle for D3D11VA/Media Foundation encoder
//!
//! Pipeline: wgpu (D3D12) → ID3D12Resource → DXGI SharedHandle → D3D11VA encoder

use crate::error::{GpuError as Error, GpuResult as Result};
use crate::GpuContext;

use std::mem::ManuallyDrop;
use std::sync::Arc;

use windows::{
    core::{Interface, PCWSTR},
    Win32::{
        Foundation::{CloseHandle, HANDLE},
        Graphics::{
            Direct3D12::{
                ID3D12Device, ID3D12Resource, D3D12_HEAP_FLAG_SHARED, D3D12_HEAP_PROPERTIES,
                D3D12_HEAP_TYPE_DEFAULT, D3D12_RESOURCE_DESC, D3D12_RESOURCE_DIMENSION_TEXTURE2D,
                D3D12_RESOURCE_FLAG_ALLOW_SIMULTANEOUS_ACCESS, D3D12_RESOURCE_STATE_COMMON,
                D3D12_TEXTURE_LAYOUT_UNKNOWN,
            },
            Dxgi::Common::{DXGI_FORMAT_R8G8_UNORM, DXGI_FORMAT_R8_UNORM, DXGI_SAMPLE_DESC},
        },
    },
};

/// Exported NV12 plane with DXGI shared handle
#[derive(Debug)]
pub struct ExportedPlaneHandle {
    /// DXGI shared handle (caller must close via CloseHandle)
    pub handle: HANDLE,
    /// Width in pixels
    pub width: u32,
    /// Height in pixels
    pub height: u32,
}

/// Exported NV12 frame with DXGI shared handles
pub struct ExportedNv12Handles {
    /// Y plane shared handle
    pub y_plane: ExportedPlaneHandle,
    /// UV plane shared handle
    pub uv_plane: ExportedPlaneHandle,
}

impl Drop for ExportedNv12Handles {
    fn drop(&mut self) {
        unsafe {
            if !self.y_plane.handle.is_invalid() {
                let _ = CloseHandle(self.y_plane.handle);
            }
            if !self.uv_plane.handle.is_invalid() {
                let _ = CloseHandle(self.uv_plane.handle);
            }
        }
    }
}

/// Windows zero-copy texture exporter
///
/// Creates D3D12 resources that can be:
/// - Used as wgpu render/compute targets (via wgpu_hal)
/// - Exported as DXGI shared handles for D3D11VA encoder
pub struct WindowsTextureExporter {
    ctx: Arc<GpuContext>,
}

impl WindowsTextureExporter {
    /// Create a new Windows texture exporter
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Ok(Self { ctx })
    }

    /// Create an exportable NV12 backing store
    pub fn create_backing_store(
        &self,
        width: u32,
        height: u32,
    ) -> Result<WindowsExportBackingStore> {
        let device = self.ctx.device();

        let (y_resource, uv_resource, y_hal, uv_hal) = unsafe {
            device
                .as_hal::<wgpu_hal::api::Dx12, _, _>(|hal_device| {
                    let hal_device = hal_device
                        .ok_or_else(|| Error::Other("wgpu backend is not D3D12".to_string()))?;

                    let d3d12_device = hal_device.raw_device();

                    // Create shared D3D12 resources
                    let y_resource = self.create_shared_resource(
                        d3d12_device,
                        width,
                        height,
                        DXGI_FORMAT_R8_UNORM,
                    )?;
                    let uv_resource = self.create_shared_resource(
                        d3d12_device,
                        width / 2,
                        height / 2,
                        DXGI_FORMAT_R8G8_UNORM,
                    )?;

                    // Convert to d3d12 crate Resource for wgpu_hal
                    let y_raw =
                        Interface::as_raw(&y_resource) as *mut winapi::um::d3d12::ID3D12Resource;
                    let uv_raw =
                        Interface::as_raw(&uv_resource) as *mut winapi::um::d3d12::ID3D12Resource;

                    // AddRef for the d3d12 crate copies (windows crate still owns one ref)
                    Interface::as_raw(&y_resource).as_ref().unwrap().AddRef();
                    Interface::as_raw(&uv_resource).as_ref().unwrap().AddRef();

                    let y_d3d12_res: d3d12::Resource = std::mem::transmute(y_raw);
                    let uv_d3d12_res: d3d12::Resource = std::mem::transmute(uv_raw);

                    // Wrap as wgpu_hal textures
                    let y_hal = wgpu_hal::dx12::Device::texture_from_raw(
                        y_d3d12_res,
                        wgpu::TextureFormat::R8Unorm,
                        wgpu::TextureDimension::D2,
                        wgpu::Extent3d {
                            width,
                            height,
                            depth_or_array_layers: 1,
                        },
                        1,
                        1,
                    );

                    let uv_hal = wgpu_hal::dx12::Device::texture_from_raw(
                        uv_d3d12_res,
                        wgpu::TextureFormat::Rg8Unorm,
                        wgpu::TextureDimension::D2,
                        wgpu::Extent3d {
                            width: width / 2,
                            height: height / 2,
                            depth_or_array_layers: 1,
                        },
                        1,
                        1,
                    );

                    Ok((y_resource, uv_resource, y_hal, uv_hal))
                })
                .ok_or_else(|| Error::Other("Failed to access D3D12 HAL".to_string()))??
        };

        // Create wgpu textures
        let y_desc = wgpu::TextureDescriptor {
            label: Some("Export Y Plane (D3D12 Shared)"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::STORAGE_BINDING,
            view_formats: &[],
        };
        let uv_desc = wgpu::TextureDescriptor {
            label: Some("Export UV Plane (D3D12 Shared)"),
            size: wgpu::Extent3d {
                width: width / 2,
                height: height / 2,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::STORAGE_BINDING,
            view_formats: &[],
        };

        let y_texture =
            unsafe { device.create_texture_from_hal::<wgpu_hal::api::Dx12>(y_hal, &y_desc) };
        let uv_texture =
            unsafe { device.create_texture_from_hal::<wgpu_hal::api::Dx12>(uv_hal, &uv_desc) };

        Ok(WindowsExportBackingStore {
            y_texture,
            uv_texture,
            y_resource,
            uv_resource,
            width,
            height,
        })
    }

    /// Create a D3D12 resource with shared heap flag
    unsafe fn create_shared_resource(
        &self,
        d3d12_device: &d3d12::Device,
        width: u32,
        height: u32,
        format: windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT,
    ) -> Result<ID3D12Resource> {
        // Wrap d3d12 crate device as windows crate ID3D12Device
        let raw_ptr = d3d12_device.as_mut_ptr();
        let win_device: ManuallyDrop<ID3D12Device> =
            ManuallyDrop::new(std::mem::transmute_copy(&raw_ptr));

        let heap_props = D3D12_HEAP_PROPERTIES {
            Type: D3D12_HEAP_TYPE_DEFAULT,
            ..std::mem::zeroed()
        };

        let resource_desc = D3D12_RESOURCE_DESC {
            Dimension: D3D12_RESOURCE_DIMENSION_TEXTURE2D,
            Alignment: 0,
            Width: width as u64,
            Height: height,
            DepthOrArraySize: 1,
            MipLevels: 1,
            Format: format,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Layout: D3D12_TEXTURE_LAYOUT_UNKNOWN,
            Flags: D3D12_RESOURCE_FLAG_ALLOW_SIMULTANEOUS_ACCESS,
        };

        let mut resource: Option<ID3D12Resource> = None;
        win_device
            .CreateCommittedResource(
                &heap_props,
                D3D12_HEAP_FLAG_SHARED,
                &resource_desc,
                D3D12_RESOURCE_STATE_COMMON,
                None, // optimized clear value
                &mut resource,
            )
            .map_err(|e| Error::Other(format!("CreateCommittedResource (shared) failed: {}", e)))?;

        resource.ok_or_else(|| Error::Other("CreateCommittedResource returned null".to_string()))
    }
}

/// Persistent backing store for exportable NV12 textures on Windows
pub struct WindowsExportBackingStore {
    /// Y plane wgpu texture
    pub y_texture: wgpu::Texture,
    /// UV plane wgpu texture
    pub uv_texture: wgpu::Texture,
    /// D3D12 resources (for shared handle export)
    y_resource: ID3D12Resource,
    uv_resource: ID3D12Resource,
    /// Dimensions
    pub width: u32,
    pub height: u32,
}

impl WindowsExportBackingStore {
    /// Create texture views for shader binding
    pub fn create_views(&self) -> (wgpu::TextureView, wgpu::TextureView) {
        let y_view = self
            .y_texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let uv_view = self
            .uv_texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        (y_view, uv_view)
    }

    /// Export as DXGI shared handles for D3D11VA encoder
    ///
    /// Returns owned handles — the caller (or `ExportedNv12Handles` drop) must close them.
    pub fn export_as_shared_handles(&self) -> Result<ExportedNv12Handles> {
        unsafe {
            // Create shared handle for Y plane
            let y_handle = self.create_shared_handle(&self.y_resource, "Y")?;

            // Create shared handle for UV plane
            let uv_handle = match self.create_shared_handle(&self.uv_resource, "UV") {
                Ok(h) => h,
                Err(e) => {
                    let _ = CloseHandle(y_handle);
                    return Err(e);
                }
            };

            tracing::trace!(
                "Exported NV12 as DXGI shared handles: Y={:?}, UV={:?}",
                y_handle,
                uv_handle
            );

            Ok(ExportedNv12Handles {
                y_plane: ExportedPlaneHandle {
                    handle: y_handle,
                    width: self.width,
                    height: self.height,
                },
                uv_plane: ExportedPlaneHandle {
                    handle: uv_handle,
                    width: self.width / 2,
                    height: self.height / 2,
                },
            })
        }
    }

    /// Create a DXGI shared handle from a D3D12 resource
    unsafe fn create_shared_handle(
        &self,
        resource: &ID3D12Resource,
        label: &str,
    ) -> Result<HANDLE> {
        // Query IDXGIResource1 from ID3D12Resource
        let dxgi_resource: windows::Win32::Graphics::Dxgi::IDXGIResource1 =
            resource.cast().map_err(|e| {
                Error::Other(format!(
                    "QueryInterface IDXGIResource1 ({}) failed: {}",
                    label, e
                ))
            })?;

        let handle = dxgi_resource
            .CreateSharedHandle(
                None,
                windows::Win32::Graphics::Dxgi::DXGI_SHARED_RESOURCE_READ,
                PCWSTR::null(),
            )
            .map_err(|e| Error::Other(format!("CreateSharedHandle ({}) failed: {}", label, e)))?;

        if handle.is_invalid() {
            return Err(Error::Other(format!(
                "CreateSharedHandle ({}) returned invalid handle",
                label
            )));
        }

        Ok(handle)
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_windows_export_available() {
        assert!(true);
    }
}
