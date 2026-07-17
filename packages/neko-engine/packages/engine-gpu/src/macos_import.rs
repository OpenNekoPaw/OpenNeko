//! macOS Zero-Copy Import - IOSurface → Metal → wgpu
//!
//! This module implements zero-copy texture import on macOS:
//! 1. Get IOSurface from CVPixelBuffer (VideoToolbox output)
//! 2. Create MTLTexture from IOSurface
//! 3. Import MTLTexture into wgpu using wgpu_hal
//!
//! Reference:
//! - https://developer.apple.com/documentation/metal/mtldevice
//! - https://developer.apple.com/documentation/iosurface

use crate::error::{GpuError as Error, GpuResult as Result};
use crate::nv12_import::{ColorSpace, ImportedNv12Texture};
use crate::GpuContext;
use neko_engine_types::Nv12GpuTextureSource;

use std::sync::Arc;

use metal::{
    Device as MTLDevice, MTLPixelFormat, MTLTextureType, MTLTextureUsage, TextureDescriptor,
};
use objc::runtime::Object;
use objc::{msg_send, sel, sel_impl};

// Import ForeignType trait for as_ptr()
use metal::foreign_types::ForeignType;

/// IOSurface reference type (opaque pointer)
type IOSurfaceRef = *mut Object;

// External C functions for IOSurface
#[link(name = "IOSurface", kind = "framework")]
extern "C" {
    fn IOSurfaceGetPlaneCount(surface: IOSurfaceRef) -> usize;
    fn IOSurfaceGetWidthOfPlane(surface: IOSurfaceRef, plane: usize) -> usize;
    fn IOSurfaceGetHeightOfPlane(surface: IOSurfaceRef, plane: usize) -> usize;
}

// External C functions for CoreVideo
#[allow(clashing_extern_declarations)]
#[link(name = "CoreVideo", kind = "framework")]
extern "C" {
    fn CVPixelBufferGetIOSurface(pixelBuffer: *mut Object) -> IOSurfaceRef;
    fn CVPixelBufferLockBaseAddress(pixelBuffer: *mut Object, lockFlags: u64) -> i32;
    fn CVPixelBufferUnlockBaseAddress(pixelBuffer: *mut Object, unlockFlags: u64) -> i32;
}

// CVPixelBuffer lock flags
#[allow(non_upper_case_globals)]
const kCVPixelBufferLock_ReadOnly: u64 = 0x00000001;

/// macOS zero-copy texture importer
pub struct MacOsTextureImporter {
    ctx: Arc<GpuContext>,
    metal_device: MTLDevice,
}

impl MacOsTextureImporter {
    /// Create a new macOS texture importer
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        // Get Metal device from wgpu
        let metal_device = MTLDevice::system_default()
            .ok_or_else(|| Error::Other("No Metal device available".to_string()))?;

        Ok(Self { ctx, metal_device })
    }

    /// Import NV12 texture from VideoToolbox CVPixelBuffer
    ///
    /// # Safety
    /// The pixel_buffer must be a valid CVPixelBufferRef from VideoToolbox.
    pub unsafe fn import_videotoolbox(
        &self,
        pixel_buffer: usize,
        gpu_texture: &(impl Nv12GpuTextureSource + ?Sized),
    ) -> Result<ImportedNv12Texture> {
        let cv_pixel_buffer = pixel_buffer as *mut Object;

        // CRITICAL: Lock CVPixelBuffer to ensure GPU has finished writing
        // CVPixelBufferLockBaseAddress waits for GPU operations to complete,
        // unlike IOSurfaceLock which only provides CPU-level synchronization.
        let lock_result =
            CVPixelBufferLockBaseAddress(cv_pixel_buffer, kCVPixelBufferLock_ReadOnly);
        if lock_result != 0 {
            return Err(Error::Other(format!(
                "CVPixelBufferLockBaseAddress failed: {}",
                lock_result
            )));
        }

        // Get IOSurface from CVPixelBuffer (now safe to access)
        let io_surface = CVPixelBufferGetIOSurface(cv_pixel_buffer);
        if io_surface.is_null() {
            CVPixelBufferUnlockBaseAddress(cv_pixel_buffer, kCVPixelBufferLock_ReadOnly);
            return Err(Error::Other(
                "Failed to get IOSurface from CVPixelBuffer".to_string(),
            ));
        }

        // Verify plane count (NV12 has 2 planes)
        let plane_count = IOSurfaceGetPlaneCount(io_surface);
        if plane_count != 2 {
            CVPixelBufferUnlockBaseAddress(cv_pixel_buffer, kCVPixelBufferLock_ReadOnly);
            return Err(Error::Other(format!(
                "Expected 2 planes for NV12, got {}",
                plane_count
            )));
        }

        // Get plane dimensions
        let y_width = IOSurfaceGetWidthOfPlane(io_surface, 0);
        let y_height = IOSurfaceGetHeightOfPlane(io_surface, 0);
        let uv_width = IOSurfaceGetWidthOfPlane(io_surface, 1);
        let uv_height = IOSurfaceGetHeightOfPlane(io_surface, 1);

        // Create Metal textures from IOSurface
        let result = self.create_metal_textures_from_iosurface(
            cv_pixel_buffer,
            io_surface,
            y_width,
            y_height,
            uv_width,
            uv_height,
            gpu_texture,
        );

        // Unlock CVPixelBuffer after texture creation
        CVPixelBufferUnlockBaseAddress(cv_pixel_buffer, kCVPixelBufferLock_ReadOnly);

        result
    }

    /// Create Metal textures from IOSurface planes
    ///
    /// Note: The caller must ensure GPU synchronization before calling this function.
    /// Use CVPixelBufferLockBaseAddress to wait for VideoToolbox GPU operations.
    #[allow(clippy::too_many_arguments)]
    #[allow(unused_variables)]
    unsafe fn create_metal_textures_from_iosurface(
        &self,
        cv_pixel_buffer: *mut Object,
        io_surface: IOSurfaceRef,
        y_width: usize,
        y_height: usize,
        uv_width: usize,
        uv_height: usize,
        gpu_texture: &(impl Nv12GpuTextureSource + ?Sized),
    ) -> Result<ImportedNv12Texture> {
        // GPU synchronization is handled by CVPixelBufferLockBaseAddress in the caller.
        // IOSurfaceLock only provides CPU-level synchronization and does NOT wait for GPU.

        // Create Y plane texture descriptor (R8Unorm)
        let y_desc = TextureDescriptor::new();
        y_desc.set_pixel_format(MTLPixelFormat::R8Unorm);
        y_desc.set_width(y_width as u64);
        y_desc.set_height(y_height as u64);
        y_desc.set_usage(MTLTextureUsage::ShaderRead);

        // Create UV plane texture descriptor (RG8Unorm)
        let uv_desc = TextureDescriptor::new();
        uv_desc.set_pixel_format(MTLPixelFormat::RG8Unorm);
        uv_desc.set_width(uv_width as u64);
        uv_desc.set_height(uv_height as u64);
        uv_desc.set_usage(MTLTextureUsage::ShaderRead);

        // Create Metal textures from IOSurface using objc message sending
        // MTLDevice.newTextureWithDescriptor:iosurface:plane:
        let metal_device_ptr = self.metal_device.as_ptr();

        let y_metal_texture: *mut Object = msg_send![
            metal_device_ptr,
            newTextureWithDescriptor: y_desc.as_ptr()
            iosurface: io_surface
            plane: 0usize
        ];

        if y_metal_texture.is_null() {
            return Err(Error::Other(
                "Failed to create Metal Y texture from IOSurface".to_string(),
            ));
        }

        let uv_metal_texture: *mut Object = msg_send![
            metal_device_ptr,
            newTextureWithDescriptor: uv_desc.as_ptr()
            iosurface: io_surface
            plane: 1usize
        ];

        if uv_metal_texture.is_null() {
            // Release Y texture
            let _: () = msg_send![y_metal_texture, release];
            return Err(Error::Other(
                "Failed to create Metal UV texture from IOSurface".to_string(),
            ));
        }

        tracing::debug!(
            "Created Metal textures from IOSurface: Y={:?}, UV={:?}",
            y_metal_texture,
            uv_metal_texture
        );

        // Import Metal textures into wgpu using wgpu_hal
        // This is the zero-copy path - no CPU memory copy needed!

        // Wrap raw pointers as metal::Texture
        let y_metal = metal::Texture::from_ptr(y_metal_texture as *mut metal::MTLTexture);
        let uv_metal = metal::Texture::from_ptr(uv_metal_texture as *mut metal::MTLTexture);

        // Create wgpu_hal textures from Metal textures
        let y_hal_texture = unsafe {
            wgpu_hal::metal::Device::texture_from_raw(
                y_metal.clone(),
                wgpu::TextureFormat::R8Unorm,
                MTLTextureType::D2,
                1, // array_layers
                1, // mip_levels
                wgpu_hal::CopyExtent {
                    width: y_width as u32,
                    height: y_height as u32,
                    depth: 1,
                },
            )
        };

        let uv_hal_texture = unsafe {
            wgpu_hal::metal::Device::texture_from_raw(
                uv_metal.clone(),
                wgpu::TextureFormat::Rg8Unorm,
                MTLTextureType::D2,
                1, // array_layers
                1, // mip_levels
                wgpu_hal::CopyExtent {
                    width: uv_width as u32,
                    height: uv_height as u32,
                    depth: 1,
                },
            )
        };

        // Create wgpu textures from HAL textures
        let device = self.ctx.device();

        let y_texture_desc = wgpu::TextureDescriptor {
            label: Some("NV12 Y Plane (Zero-Copy)"),
            size: wgpu::Extent3d {
                width: y_width as u32,
                height: y_height as u32,
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
            label: Some("NV12 UV Plane (Zero-Copy)"),
            size: wgpu::Extent3d {
                width: uv_width as u32,
                height: uv_height as u32,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        };

        // Use create_texture_from_hal to wrap the HAL textures
        let y_texture = unsafe {
            device.create_texture_from_hal::<wgpu_hal::api::Metal>(y_hal_texture, &y_texture_desc)
        };

        let uv_texture = unsafe {
            device.create_texture_from_hal::<wgpu_hal::api::Metal>(uv_hal_texture, &uv_texture_desc)
        };

        let y_view = y_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let uv_view = uv_texture.create_view(&wgpu::TextureViewDescriptor::default());

        tracing::trace!(
            "Zero-copy import successful: {}x{} NV12 from IOSurface",
            y_width,
            y_height
        );

        Ok(ImportedNv12Texture {
            y_texture,
            uv_texture,
            y_view,
            uv_view,
            width: y_width as u32,
            height: y_height as u32,
            pts: gpu_texture.pts(),
            color_space: ColorSpace::from_ffmpeg(gpu_texture.color_space()),
        })
    }

    /// Get the Metal device
    pub fn metal_device(&self) -> &MTLDevice {
        &self.metal_device
    }
}
