//! Linux Zero-Copy Export - wgpu → Vulkan → DMA-BUF / CUDA
//!
//! This module implements zero-copy texture export on Linux:
//! 1. Create Vulkan image with exportable external memory
//! 2. Import into wgpu as render/compute target
//! 3. Export DMA-BUF fd for VAAPI encoder or CUDA ptr for NVENC
//!
//! Pipeline: wgpu (Vulkan) → VkImage + exportable memory → DMA-BUF fd → VAAPI encoder
//!           wgpu (Vulkan) → VkImage + exportable memory → CUDA import → NVENC

use crate::error::{GpuError as Error, GpuResult as Result};
use crate::GpuContext;

use ash::vk;
use std::os::unix::io::RawFd;
use std::sync::Arc;

/// Exported NV12 plane information
#[derive(Debug)]
pub struct ExportedNv12Plane {
    /// DMA-BUF file descriptor (caller must close when done)
    pub fd: RawFd,
    /// Offset within the DMA-BUF
    pub offset: u32,
    /// Row stride in bytes
    pub stride: u32,
    /// Width in pixels
    pub width: u32,
    /// Height in pixels
    pub height: u32,
}

/// Exported NV12 frame with DMA-BUF handles
pub struct ExportedNv12Frame {
    /// Y plane (R8, full resolution)
    pub y_plane: ExportedNv12Plane,
    /// UV plane (RG8, half resolution)
    pub uv_plane: ExportedNv12Plane,
}

impl Drop for ExportedNv12Frame {
    fn drop(&mut self) {
        // Close DMA-BUF fds
        unsafe {
            if self.y_plane.fd >= 0 {
                libc::close(self.y_plane.fd);
            }
            if self.uv_plane.fd >= 0 {
                libc::close(self.uv_plane.fd);
            }
        }
    }
}

/// Vulkan exportable image — a VkImage backed by exportable memory
/// that can be used as a wgpu render/compute target and exported as DMA-BUF.
struct ExportableImage {
    image: vk::Image,
    memory: vk::DeviceMemory,
    /// Allocation size (needed for CUDA import)
    alloc_size: u64,
    /// Row pitch from vkGetImageSubresourceLayout
    row_pitch: u32,
    width: u32,
    height: u32,
}

/// RAII guard for exportable Vulkan resources
struct ExportableImageGuard {
    device: ash::Device,
    image: vk::Image,
    memory: vk::DeviceMemory,
}

impl Drop for ExportableImageGuard {
    fn drop(&mut self) {
        unsafe {
            self.device.destroy_image(self.image, None);
            self.device.free_memory(self.memory, None);
        }
    }
}

unsafe impl Send for ExportableImageGuard {}
unsafe impl Sync for ExportableImageGuard {}

/// Linux zero-copy texture exporter
///
/// Creates Vulkan images with exportable memory that can be:
/// - Used as wgpu render/compute targets (via wgpu_hal)
/// - Exported as DMA-BUF fds for VAAPI encoder
/// - Exported as opaque fds for CUDA/NVENC
pub struct LinuxTextureExporter {
    ctx: Arc<GpuContext>,
}

impl LinuxTextureExporter {
    /// Create a new Linux texture exporter
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Ok(Self { ctx })
    }

    /// Create an exportable NV12 backing store
    ///
    /// Returns wgpu textures backed by exportable Vulkan memory.
    /// After rendering into these textures, call `export_as_dmabuf()`
    /// to get DMA-BUF fds for the encoder.
    pub fn create_backing_store(&self, width: u32, height: u32) -> Result<LinuxExportBackingStore> {
        let device = self.ctx.device();

        let (y_img, uv_img, y_hal, uv_hal) = unsafe {
            device
                .as_hal::<wgpu_hal::api::Vulkan, _, _>(|hal_device| {
                    let hal_device = hal_device
                        .ok_or_else(|| Error::Other("wgpu backend is not Vulkan".to_string()))?;
                    let vk_device = hal_device.raw_device();

                    // Create exportable Y plane image
                    let y_img = self.create_exportable_image(
                        vk_device,
                        hal_device,
                        width,
                        height,
                        vk::Format::R8_UNORM,
                    )?;

                    // Create exportable UV plane image
                    let uv_img = self.create_exportable_image(
                        vk_device,
                        hal_device,
                        width / 2,
                        height / 2,
                        vk::Format::R8G8_UNORM,
                    )?;

                    // Wrap as wgpu_hal textures with drop guards
                    let y_hal = wgpu_hal::vulkan::Device::texture_from_raw(
                        y_img.image,
                        &wgpu_hal::TextureDescriptor {
                            label: Some("Export Y Plane"),
                            size: wgpu::Extent3d {
                                width,
                                height,
                                depth_or_array_layers: 1,
                            },
                            mip_level_count: 1,
                            sample_count: 1,
                            dimension: wgpu::TextureDimension::D2,
                            format: wgpu::TextureFormat::R8Unorm,
                            usage: wgpu_hal::TextureUses::RESOURCE
                                | wgpu_hal::TextureUses::STORAGE_READ_WRITE,
                            memory_flags: wgpu_hal::MemoryFlags::empty(),
                            view_formats: vec![],
                        },
                        Some(Box::new(ExportableImageGuard {
                            device: vk_device.clone(),
                            image: y_img.image,
                            memory: y_img.memory,
                        })),
                    );

                    let uv_hal = wgpu_hal::vulkan::Device::texture_from_raw(
                        uv_img.image,
                        &wgpu_hal::TextureDescriptor {
                            label: Some("Export UV Plane"),
                            size: wgpu::Extent3d {
                                width: width / 2,
                                height: height / 2,
                                depth_or_array_layers: 1,
                            },
                            mip_level_count: 1,
                            sample_count: 1,
                            dimension: wgpu::TextureDimension::D2,
                            format: wgpu::TextureFormat::Rg8Unorm,
                            usage: wgpu_hal::TextureUses::RESOURCE
                                | wgpu_hal::TextureUses::STORAGE_READ_WRITE,
                            memory_flags: wgpu_hal::MemoryFlags::empty(),
                            view_formats: vec![],
                        },
                        Some(Box::new(ExportableImageGuard {
                            device: vk_device.clone(),
                            image: uv_img.image,
                            memory: uv_img.memory,
                        })),
                    );

                    Ok::<
                        (
                            ExportableImage,
                            ExportableImage,
                            wgpu_hal::vulkan::Texture,
                            wgpu_hal::vulkan::Texture,
                        ),
                        Error,
                    >((y_img, uv_img, y_hal, uv_hal))
                })
                .ok_or_else(|| Error::Other("Failed to access Vulkan HAL".to_string()))??
        };

        // Create wgpu textures from HAL
        let y_desc = wgpu::TextureDescriptor {
            label: Some("Export Y Plane (DMA-BUF)"),
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
            label: Some("Export UV Plane (DMA-BUF)"),
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
            unsafe { device.create_texture_from_hal::<wgpu_hal::api::Vulkan>(y_hal, &y_desc) };
        let uv_texture =
            unsafe { device.create_texture_from_hal::<wgpu_hal::api::Vulkan>(uv_hal, &uv_desc) };

        Ok(LinuxExportBackingStore {
            ctx: self.ctx.clone(),
            y_texture,
            uv_texture,
            y_vk_memory: y_img.memory,
            uv_vk_memory: uv_img.memory,
            y_alloc_size: y_img.alloc_size,
            uv_alloc_size: uv_img.alloc_size,
            y_row_pitch: y_img.row_pitch,
            uv_row_pitch: uv_img.row_pitch,
            width,
            height,
        })
    }

    /// Create a Vulkan image with exportable external memory
    unsafe fn create_exportable_image(
        &self,
        vk_device: &ash::Device,
        hal_device: &wgpu_hal::vulkan::Device,
        width: u32,
        height: u32,
        format: vk::Format,
    ) -> Result<ExportableImage> {
        // Create image with exportable memory flag
        let mut external_memory_info = vk::ExternalMemoryImageCreateInfo::builder()
            .handle_types(vk::ExternalMemoryHandleTypeFlags::DMA_BUF_EXT)
            .build();

        let image_info = vk::ImageCreateInfo::builder()
            .push_next(&mut external_memory_info)
            .image_type(vk::ImageType::TYPE_2D)
            .format(format)
            .extent(vk::Extent3D {
                width,
                height,
                depth: 1,
            })
            .mip_levels(1)
            .array_layers(1)
            .samples(vk::SampleCountFlags::TYPE_1)
            .tiling(vk::ImageTiling::LINEAR)
            .usage(
                vk::ImageUsageFlags::SAMPLED
                    | vk::ImageUsageFlags::STORAGE
                    | vk::ImageUsageFlags::TRANSFER_DST,
            )
            .sharing_mode(vk::SharingMode::EXCLUSIVE)
            .initial_layout(vk::ImageLayout::UNDEFINED)
            .build();

        let image = vk_device
            .create_image(&image_info, None)
            .map_err(|e| Error::Other(format!("vkCreateImage (export) failed: {:?}", e)))?;

        let mem_reqs = vk_device.get_image_memory_requirements(image);

        // Allocate with export flag
        let mut export_info = vk::ExportMemoryAllocateInfo::builder()
            .handle_types(vk::ExternalMemoryHandleTypeFlags::DMA_BUF_EXT)
            .build();

        let memory_type_index = self.find_memory_type(
            hal_device,
            mem_reqs.memory_type_bits,
            vk::MemoryPropertyFlags::empty(),
        )?;

        let alloc_info = vk::MemoryAllocateInfo::builder()
            .push_next(&mut export_info)
            .allocation_size(mem_reqs.size)
            .memory_type_index(memory_type_index)
            .build();

        let memory = vk_device.allocate_memory(&alloc_info, None).map_err(|e| {
            vk_device.destroy_image(image, None);
            Error::Other(format!("vkAllocateMemory (export) failed: {:?}", e))
        })?;

        vk_device.bind_image_memory(image, memory, 0).map_err(|e| {
            vk_device.destroy_image(image, None);
            vk_device.free_memory(memory, None);
            Error::Other(format!("vkBindImageMemory (export) failed: {:?}", e))
        })?;

        // Query row pitch for LINEAR tiling
        let subresource = vk::ImageSubresource {
            aspect_mask: vk::ImageAspectFlags::COLOR,
            mip_level: 0,
            array_layer: 0,
        };
        let layout = vk_device.get_image_subresource_layout(image, subresource);

        tracing::debug!(
            "Created exportable image: {}x{}, format={:?}, pitch={}, alloc={}",
            width,
            height,
            format,
            layout.row_pitch,
            mem_reqs.size
        );

        Ok(ExportableImage {
            image,
            memory,
            alloc_size: mem_reqs.size,
            row_pitch: layout.row_pitch as u32,
            width,
            height,
        })
    }

    /// Find a suitable memory type
    fn find_memory_type(
        &self,
        hal_device: &wgpu_hal::vulkan::Device,
        type_bits: u32,
        required_flags: vk::MemoryPropertyFlags,
    ) -> Result<u32> {
        unsafe {
            let instance = hal_device.shared_instance();
            let physical_device = hal_device.raw_physical_device();
            let mem_props = instance
                .raw_instance()
                .get_physical_device_memory_properties(physical_device);

            for i in 0..mem_props.memory_type_count {
                if (type_bits & (1 << i)) != 0 {
                    let props = mem_props.memory_types[i as usize].property_flags;
                    if props.contains(required_flags) {
                        return Ok(i);
                    }
                }
            }

            Err(Error::Other(
                "No suitable Vulkan memory type for export".to_string(),
            ))
        }
    }
}

/// Persistent backing store for exportable NV12 textures on Linux
///
/// Owns Vulkan images with exportable memory. The wgpu textures can be
/// used as compute/render targets, then exported as DMA-BUF fds.
pub struct LinuxExportBackingStore {
    ctx: Arc<GpuContext>,
    /// Y plane wgpu texture (backed by exportable Vulkan memory)
    pub y_texture: wgpu::Texture,
    /// UV plane wgpu texture (backed by exportable Vulkan memory)
    pub uv_texture: wgpu::Texture,
    /// Vulkan device memory handles (for fd export)
    y_vk_memory: vk::DeviceMemory,
    uv_vk_memory: vk::DeviceMemory,
    /// Allocation sizes
    y_alloc_size: u64,
    uv_alloc_size: u64,
    /// Row pitches
    y_row_pitch: u32,
    uv_row_pitch: u32,
    /// Dimensions
    pub width: u32,
    pub height: u32,
}

impl LinuxExportBackingStore {
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

    /// Export the backing store as DMA-BUF file descriptors
    ///
    /// Returns owned fds — the caller (or `ExportedNv12Frame` drop) must close them.
    /// Each call creates new fds via `vkGetMemoryFdKHR`.
    pub fn export_as_dmabuf(&self) -> Result<ExportedNv12Frame> {
        let device = self.ctx.device();

        let (y_fd, uv_fd) = unsafe {
            device
                .as_hal::<wgpu_hal::api::Vulkan, _, _>(|hal_device| {
                    let hal_device = hal_device
                        .ok_or_else(|| Error::Other("wgpu backend is not Vulkan".to_string()))?;

                    let vk_device = hal_device.raw_device();
                    let instance = hal_device.shared_instance();
                    let ext_memory_fd = ash::extensions::khr::ExternalMemoryFd::new(
                        instance.raw_instance(),
                        vk_device,
                    );

                    // Export Y plane memory as DMA-BUF fd
                    let y_get_fd_info = vk::MemoryGetFdInfoKHR::builder()
                        .memory(self.y_vk_memory)
                        .handle_type(vk::ExternalMemoryHandleTypeFlags::DMA_BUF_EXT)
                        .build();
                    let y_fd = ext_memory_fd.get_memory_fd(&y_get_fd_info).map_err(|e| {
                        Error::Other(format!("vkGetMemoryFdKHR (Y) failed: {:?}", e))
                    })?;

                    // Export UV plane memory as DMA-BUF fd
                    let uv_get_fd_info = vk::MemoryGetFdInfoKHR::builder()
                        .memory(self.uv_vk_memory)
                        .handle_type(vk::ExternalMemoryHandleTypeFlags::DMA_BUF_EXT)
                        .build();
                    let uv_fd = ext_memory_fd.get_memory_fd(&uv_get_fd_info).map_err(|e| {
                        // Close Y fd on failure
                        libc::close(y_fd);
                        Error::Other(format!("vkGetMemoryFdKHR (UV) failed: {:?}", e))
                    })?;

                    Ok::<(i32, i32), Error>((y_fd, uv_fd))
                })
                .ok_or_else(|| Error::Other("Failed to access Vulkan HAL".to_string()))??
        };

        tracing::trace!(
            "Exported NV12 as DMA-BUF: Y fd={} (pitch={}), UV fd={} (pitch={})",
            y_fd,
            self.y_row_pitch,
            uv_fd,
            self.uv_row_pitch
        );

        Ok(ExportedNv12Frame {
            y_plane: ExportedNv12Plane {
                fd: y_fd,
                offset: 0,
                stride: self.y_row_pitch,
                width: self.width,
                height: self.height,
            },
            uv_plane: ExportedNv12Plane {
                fd: uv_fd,
                offset: 0,
                stride: self.uv_row_pitch,
                width: self.width / 2,
                height: self.height / 2,
            },
        })
    }

    /// Export as opaque fd for CUDA/NVENC interop
    ///
    /// Returns opaque fds (not DMA-BUF) suitable for `cuImportExternalMemory`.
    /// The caller must close the fds when done.
    pub fn export_for_cuda(&self) -> Result<CudaExportInfo> {
        let device = self.ctx.device();

        let (y_fd, uv_fd) = unsafe {
            device
                .as_hal::<wgpu_hal::api::Vulkan, _, _>(|hal_device| {
                    let hal_device = hal_device
                        .ok_or_else(|| Error::Other("wgpu backend is not Vulkan".to_string()))?;

                    let vk_device = hal_device.raw_device();
                    let instance = hal_device.shared_instance();
                    let ext_memory_fd = ash::extensions::khr::ExternalMemoryFd::new(
                        instance.raw_instance(),
                        vk_device,
                    );

                    let y_info = vk::MemoryGetFdInfoKHR::builder()
                        .memory(self.y_vk_memory)
                        .handle_type(vk::ExternalMemoryHandleTypeFlags::OPAQUE_FD)
                        .build();
                    let y_fd = ext_memory_fd.get_memory_fd(&y_info).map_err(|e| {
                        Error::Other(format!("vkGetMemoryFdKHR (CUDA Y) failed: {:?}", e))
                    })?;

                    let uv_info = vk::MemoryGetFdInfoKHR::builder()
                        .memory(self.uv_vk_memory)
                        .handle_type(vk::ExternalMemoryHandleTypeFlags::OPAQUE_FD)
                        .build();
                    let uv_fd = ext_memory_fd.get_memory_fd(&uv_info).map_err(|e| {
                        libc::close(y_fd);
                        Error::Other(format!("vkGetMemoryFdKHR (CUDA UV) failed: {:?}", e))
                    })?;

                    Ok::<(i32, i32), Error>((y_fd, uv_fd))
                })
                .ok_or_else(|| Error::Other("Failed to access Vulkan HAL".to_string()))??
        };

        Ok(CudaExportInfo {
            y_fd,
            y_size: self.y_alloc_size,
            y_pitch: self.y_row_pitch as usize,
            uv_fd,
            uv_size: self.uv_alloc_size,
            uv_pitch: self.uv_row_pitch as usize,
            width: self.width,
            height: self.height,
        })
    }
}

/// CUDA export information for NVENC
#[derive(Debug)]
pub struct CudaExportInfo {
    /// Y plane opaque fd (caller must close)
    pub y_fd: RawFd,
    /// Y plane allocation size
    pub y_size: u64,
    /// Y plane row pitch
    pub y_pitch: usize,
    /// UV plane opaque fd (caller must close)
    pub uv_fd: RawFd,
    /// UV plane allocation size
    pub uv_size: u64,
    /// UV plane row pitch
    pub uv_pitch: usize,
    /// Width
    pub width: u32,
    /// Height
    pub height: u32,
}

impl Drop for CudaExportInfo {
    fn drop(&mut self) {
        unsafe {
            if self.y_fd >= 0 {
                libc::close(self.y_fd);
            }
            if self.uv_fd >= 0 {
                libc::close(self.uv_fd);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_linux_export_available() {
        assert!(true);
    }
}
