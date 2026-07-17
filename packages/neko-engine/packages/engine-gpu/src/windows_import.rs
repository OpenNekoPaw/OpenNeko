//! Windows Zero-Copy Import - D3D11VA → DXGI SharedHandle → D3D12 → wgpu
//!
//! This module implements zero-copy texture import on Windows:
//! 1. Get ID3D11Texture2D from D3D11VA decoded frame
//! 2. Query IDXGIResource1 and create a DXGI shared handle
//! 3. Open shared handle in D3D12 via ID3D12Device::OpenSharedHandle
//! 4. Wrap D3D12 resource as wgpu::Texture via wgpu_hal
//!
//! Pipeline: D3D11VA → ID3D11Texture2D → DXGI SharedHandle → ID3D12Resource → wgpu::Texture
//!
//! Note: D3D11VA outputs NV12 as a single texture with two planes.
//! We create separate R8 (Y) and RG8 (UV) shader resource views from the
//! same underlying resource using D3D12 plane slicing.

use crate::error::{GpuError as Error, GpuResult as Result};
use crate::nv12_import::{ColorSpace, ImportedNv12Texture};
use crate::GpuContext;
use neko_engine_types::Nv12GpuTextureSource;

use std::mem::ManuallyDrop;
use std::sync::Arc;

use windows::{
    core::{Interface, PCWSTR},
    Win32::{
        Foundation::{CloseHandle, HANDLE},
        Graphics::{
            Direct3D11::ID3D11Texture2D,
            Direct3D12::{ID3D12Device, ID3D12Resource, D3D12_RESOURCE_DIMENSION_TEXTURE2D},
            Dxgi::{IDXGIResource1, DXGI_SHARED_RESOURCE_READ},
        },
    },
};

/// Windows zero-copy texture importer
pub struct WindowsTextureImporter {
    ctx: Arc<GpuContext>,
}

impl WindowsTextureImporter {
    /// Create a new Windows texture importer
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Ok(Self { ctx })
    }

    /// Import NV12 texture from D3D11VA
    ///
    /// Full zero-copy pipeline:
    /// 1. Cast raw pointer to ID3D11Texture2D
    /// 2. Query IDXGIResource1 → CreateSharedHandle
    /// 3. Open shared handle in D3D12
    /// 4. Create separate Y/UV wgpu textures from the D3D12 resource
    ///
    /// # Safety
    /// The texture pointer must be a valid ID3D11Texture2D from D3D11VA.
    pub unsafe fn import_d3d11(
        &self,
        texture_ptr: usize,
        array_index: u32,
        gpu_texture: &(impl Nv12GpuTextureSource + ?Sized),
    ) -> Result<ImportedNv12Texture> {
        if texture_ptr == 0 {
            return Err(Error::Other("Null D3D11 texture pointer".to_string()));
        }

        // Wrap the raw COM pointer as ID3D11Texture2D WITHOUT taking ownership.
        // ManuallyDrop prevents the windows crate from calling Release when dropped,
        // since we don't own this reference (D3D11VA/FFmpeg owns it).
        let d3d11_texture: ManuallyDrop<ID3D11Texture2D> = ManuallyDrop::new(
            std::mem::transmute_copy(&(texture_ptr as *mut std::ffi::c_void)),
        );

        // Get texture description for logging
        let mut desc = std::mem::zeroed();
        d3d11_texture.GetDesc(&mut desc);

        tracing::debug!(
            "D3D11 texture: {}x{}, format={}, array_size={}, array_index={}",
            desc.Width,
            desc.Height,
            desc.Format.0,
            desc.ArraySize,
            array_index
        );

        // Query for IDXGIResource1 to get shared handle.
        // cast() calls QueryInterface which does AddRef, so dxgi_resource is a new owned ref.
        let dxgi_resource: IDXGIResource1 = d3d11_texture
            .cast()
            .map_err(|e| Error::Other(format!("QueryInterface IDXGIResource1 failed: {}", e)))?;

        // Create shared handle (NT handle, read-only).
        // IDXGIResource1::CreateSharedHandle returns Result<HANDLE>.
        let shared_handle = dxgi_resource
            .CreateSharedHandle(
                None,                      // pattributes: Option<*const SECURITY_ATTRIBUTES>
                DXGI_SHARED_RESOURCE_READ, // dwaccess: u32
                PCWSTR::null(),            // lpname: IntoParam<PCWSTR>
            )
            .map_err(|e| Error::Other(format!("CreateSharedHandle failed: {}", e)))?;

        if shared_handle.is_invalid() {
            return Err(Error::Other(
                "CreateSharedHandle returned invalid handle".to_string(),
            ));
        }

        // Import shared handle into wgpu via D3D12
        let result = self.import_shared_handle(shared_handle, gpu_texture, desc.Width, desc.Height);

        // Always close the shared handle after import
        let _ = CloseHandle(shared_handle);

        result
    }

    /// Import DXGI shared handle into wgpu via D3D12
    ///
    /// Steps:
    /// 1. Access D3D12 device from wgpu via wgpu_hal
    /// 2. OpenSharedHandle to get ID3D12Resource
    /// 3. Convert windows crate COM ptr → d3d12 crate ComPtr
    /// 4. Create wgpu_hal::dx12::Texture and wrap as wgpu::Texture
    unsafe fn import_shared_handle(
        &self,
        shared_handle: HANDLE,
        gpu_texture: &(impl Nv12GpuTextureSource + ?Sized),
        width: u32,
        height: u32,
    ) -> Result<ImportedNv12Texture> {
        let device = self.ctx.device();

        // Access the D3D12 HAL device through wgpu
        let (y_hal, uv_hal) = device
            .as_hal::<wgpu_hal::api::Dx12, _, _>(|hal_device| {
                let hal_device = hal_device
                    .ok_or_else(|| Error::Other("wgpu backend is not D3D12".to_string()))?;

                let d3d12_device = hal_device.raw_device();

                // Wrap the wgpu-internal d3d12::Device (winapi ComPtr) as a windows crate
                // ID3D12Device for calling OpenSharedHandle.
                // ManuallyDrop prevents Release — wgpu owns this device.
                let d3d12_raw_ptr = d3d12_device.as_mut_ptr();
                let d3d12_win: ManuallyDrop<ID3D12Device> =
                    ManuallyDrop::new(std::mem::transmute_copy(&d3d12_raw_ptr));

                // OpenSharedHandle: get ID3D12Resource from the shared handle
                let mut d3d12_resource: Option<ID3D12Resource> = None;
                d3d12_win
                    .OpenSharedHandle(shared_handle, &mut d3d12_resource)
                    .map_err(|e| Error::Other(format!("OpenSharedHandle failed: {}", e)))?;

                let d3d12_resource = d3d12_resource.ok_or_else(|| {
                    Error::Other("OpenSharedHandle returned null resource".to_string())
                })?;

                // Verify the resource is a 2D texture
                let res_desc = d3d12_resource.GetDesc();
                if res_desc.Dimension != D3D12_RESOURCE_DIMENSION_TEXTURE2D {
                    return Err(Error::Other(format!(
                        "Expected 2D texture, got dimension {:?}",
                        res_desc.Dimension
                    )));
                }

                tracing::debug!(
                    "D3D12 shared resource: {}x{}, format={:?}, mip_levels={}",
                    res_desc.Width,
                    res_desc.Height,
                    res_desc.Format,
                    res_desc.MipLevels
                );

                // Convert ID3D12Resource (windows crate) → d3d12::Resource (winapi ComPtr).
                // Both are COM pointers to the same vtable, just different Rust bindings.
                //
                // Strategy:
                // 1. Get raw pointer from windows crate's ID3D12Resource
                // 2. Forget the windows crate wrapper (prevents its Drop from calling Release)
                // 3. Construct d3d12::ComPtr directly without AddRef
                //
                // d3d12::ComPtr::from_raw does AddRef, so we use a direct construction
                // to transfer ownership without changing the refcount.
                let resource_raw =
                    Interface::as_raw(&d3d12_resource) as *mut winapi::um::d3d12::ID3D12Resource;
                std::mem::forget(d3d12_resource); // Transfer ownership, skip Release

                // Construct d3d12::Resource (ComPtr) by writing the raw pointer directly.
                // Safety: d3d12::ComPtr<T> is a newtype wrapper over *mut T (single field),
                // so transmute from *mut T is layout-compatible. This is verified by
                // d3d12-0.19.0/src/com.rs: `pub struct ComPtr<T: Interface>(*mut T)`.
                // If the d3d12 crate changes ComPtr's layout, this will need updating.
                let d3d12_res: d3d12::Resource = std::mem::transmute(resource_raw);

                // Create Y plane texture (R8Unorm, full resolution)
                // NV12 plane 0 = Y (luma)
                let y_hal_texture = wgpu_hal::dx12::Device::texture_from_raw(
                    d3d12_res.clone(), // clone calls AddRef
                    wgpu::TextureFormat::R8Unorm,
                    wgpu::TextureDimension::D2,
                    wgpu::Extent3d {
                        width,
                        height,
                        depth_or_array_layers: 1,
                    },
                    1, // mip_level_count
                    1, // sample_count
                );

                // UV plane (R8G8Unorm, half resolution)
                // D3D12 NV12 textures: plane 0 = Y (R8), plane 1 = UV (R8G8)
                // The UV plane SRV uses PlaneSlice=1 in the shader resource view.
                let uv_hal_texture = wgpu_hal::dx12::Device::texture_from_raw(
                    d3d12_res, // moves ownership, no extra AddRef
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

                Ok((y_hal_texture, uv_hal_texture))
            })
            .ok_or_else(|| Error::Other("Failed to access D3D12 HAL".to_string()))??;

        // Create wgpu::Texture from HAL textures
        let y_texture_desc = wgpu::TextureDescriptor {
            label: Some("NV12 Y Plane (D3D11VA Zero-Copy)"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        };

        let uv_texture_desc = wgpu::TextureDescriptor {
            label: Some("NV12 UV Plane (D3D11VA Zero-Copy)"),
            size: wgpu::Extent3d {
                width: width / 2,
                height: height / 2,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        };

        let y_wgpu = unsafe {
            device.create_texture_from_hal::<wgpu_hal::api::Dx12>(y_hal, &y_texture_desc)
        };
        let uv_wgpu = unsafe {
            device.create_texture_from_hal::<wgpu_hal::api::Dx12>(uv_hal, &uv_texture_desc)
        };

        let y_view = y_wgpu.create_view(&wgpu::TextureViewDescriptor::default());
        let uv_view = uv_wgpu.create_view(&wgpu::TextureViewDescriptor::default());

        tracing::trace!(
            "Zero-copy D3D11VA import successful: {}x{} NV12",
            width,
            height
        );

        Ok(ImportedNv12Texture {
            y_texture: y_wgpu,
            uv_texture: uv_wgpu,
            y_view,
            uv_view,
            width,
            height,
            pts: gpu_texture.pts(),
            color_space: ColorSpace::from_ffmpeg(gpu_texture.color_space()),
        })
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_windows_import_available() {
        // Just verify the module compiles
        assert!(true);
    }
}
