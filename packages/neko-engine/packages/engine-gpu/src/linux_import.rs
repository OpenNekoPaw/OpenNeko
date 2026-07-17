//! Linux Zero-Copy Import - DMA-BUF → Vulkan → wgpu
//!
//! This module implements zero-copy texture import on Linux:
//! 1. Export VASurface to DMA-BUF file descriptor via vaExportSurfaceHandle
//! 2. Import DMA-BUF into Vulkan using VK_EXT_external_memory_dma_buf / VK_KHR_external_memory_fd
//! 3. Create wgpu::Texture from VkImage via wgpu_hal
//!
//! Pipeline: VAAPI → VASurface → DMA-BUF fd → VkImage + VkDeviceMemory → wgpu::Texture
//!
//! Required Vulkan extensions:
//! - VK_KHR_external_memory_fd
//! - VK_EXT_external_memory_dma_buf
//! - VK_EXT_image_drm_format_modifier (for tiled formats)

use crate::error::{GpuError as Error, GpuResult as Result};
use crate::nv12_import::{ColorSpace, ImportedNv12Texture};
use crate::GpuContext;
use neko_engine_types::Nv12GpuTextureSource;

use ash::vk;
use std::os::unix::io::RawFd;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// VA-API FFI declarations
// ---------------------------------------------------------------------------

/// VA status code
type VAStatus = i32;
const VA_STATUS_SUCCESS: VAStatus = 0;

/// VA surface attribute memory type for DRM PRIME 2
const VA_SURFACE_ATTRIB_MEM_TYPE_DRM_PRIME_2: u32 = 0x40000000;

/// VA export flags
const VA_EXPORT_SURFACE_READ_ONLY: u32 = 0x0001;
const VA_EXPORT_SURFACE_SEPARATE_LAYERS: u32 = 0x0004;

/// DRM PRIME object (one per DMA-BUF backing object)
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
struct VADRMPRIMEObject {
    fd: i32,
    size: u32,
    drm_format_modifier: u64,
}

/// DRM PRIME layer (one per logical plane)
#[repr(C)]
#[derive(Debug, Clone, Copy, Default)]
struct VADRMPRIMELayer {
    drm_format: u32,
    num_planes: u32,
    object_index: [u32; 4],
    offset: [u32; 4],
    pitch: [u32; 4],
}

/// VADRMPRIMESurfaceDescriptor - output of vaExportSurfaceHandle
#[repr(C)]
#[derive(Debug, Clone, Copy)]
struct VADRMPRIMESurfaceDescriptor {
    fourcc: u32,
    width: u32,
    height: u32,
    num_objects: u32,
    objects: [VADRMPRIMEObject; 4],
    num_layers: u32,
    layers: [VADRMPRIMELayer; 4],
}

impl Default for VADRMPRIMESurfaceDescriptor {
    fn default() -> Self {
        Self {
            fourcc: 0,
            width: 0,
            height: 0,
            num_objects: 0,
            objects: [VADRMPRIMEObject::default(); 4],
            num_layers: 0,
            layers: [VADRMPRIMELayer::default(); 4],
        }
    }
}

#[link(name = "va")]
extern "C" {
    fn vaExportSurfaceHandle(
        display: *mut std::ffi::c_void,
        surface_id: u32,
        mem_type: u32,
        flags: u32,
        descriptor: *mut VADRMPRIMESurfaceDescriptor,
    ) -> VAStatus;

    fn vaSyncSurface(display: *mut std::ffi::c_void, surface_id: u32) -> VAStatus;
}

// ---------------------------------------------------------------------------
// DMA-BUF types
// ---------------------------------------------------------------------------

/// DMA-BUF plane information
#[derive(Debug, Clone)]
pub struct DmaBufPlane {
    /// File descriptor for the DMA-BUF
    pub fd: RawFd,
    /// Offset within the DMA-BUF
    pub offset: u32,
    /// Stride (bytes per row)
    pub stride: u32,
    /// DRM format modifier
    pub modifier: u64,
}

/// DMA-BUF frame information
#[derive(Debug, Clone)]
pub struct DmaBufFrame {
    /// Width in pixels
    pub width: u32,
    /// Height in pixels
    pub height: u32,
    /// DRM fourcc format (e.g., DRM_FORMAT_NV12)
    pub fourcc: u32,
    /// Plane information
    pub planes: Vec<DmaBufPlane>,
}

impl DmaBufFrame {
    /// Create a new DMA-BUF frame descriptor
    pub fn new(width: u32, height: u32, fourcc: u32) -> Self {
        Self {
            width,
            height,
            fourcc,
            planes: Vec::new(),
        }
    }

    /// Add a plane to the frame
    pub fn add_plane(&mut self, fd: RawFd, offset: u32, stride: u32, modifier: u64) {
        self.planes.push(DmaBufPlane {
            fd,
            offset,
            stride,
            modifier,
        });
    }

    /// Check if this is a valid NV12 frame
    pub fn is_valid_nv12(&self) -> bool {
        self.fourcc == DRM_FORMAT_NV12 && self.planes.len() == 2
    }
}

// DRM format constants
pub const DRM_FORMAT_NV12: u32 = 0x3231564E; // 'NV12'
pub const DRM_FORMAT_P010: u32 = 0x30313050; // 'P010' (10-bit)
pub const DRM_FORMAT_MOD_LINEAR: u64 = 0;
pub const DRM_FORMAT_MOD_INVALID: u64 = 0x00ffffffffffffff;

// ---------------------------------------------------------------------------
// RAII guard for DMA-BUF file descriptors
// ---------------------------------------------------------------------------

/// Closes DMA-BUF file descriptors on drop to prevent fd leaks.
struct DmaBufGuard {
    fds: Vec<RawFd>,
}

impl DmaBufGuard {
    fn new() -> Self {
        Self { fds: Vec::new() }
    }

    fn push(&mut self, fd: RawFd) {
        self.fds.push(fd);
    }

    /// Disarm the guard — caller takes ownership of the fds.
    fn disarm(mut self) {
        self.fds.clear();
    }
}

impl Drop for DmaBufGuard {
    fn drop(&mut self) {
        for &fd in &self.fds {
            if fd >= 0 {
                unsafe {
                    libc::close(fd);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// LinuxTextureImporter
// ---------------------------------------------------------------------------

/// Linux zero-copy texture importer using DMA-BUF → Vulkan → wgpu
pub struct LinuxTextureImporter {
    ctx: Arc<GpuContext>,
}

impl LinuxTextureImporter {
    /// Create a new Linux texture importer
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Ok(Self { ctx })
    }

    /// Import NV12 texture from VAAPI surface via DMA-BUF
    ///
    /// Full zero-copy pipeline:
    /// 1. vaSyncSurface — wait for VAAPI decode to finish
    /// 2. vaExportSurfaceHandle — export VASurface as DMA-BUF fds
    /// 3. Create VkImage with external memory for each NV12 plane
    /// 4. Import DMA-BUF fd into VkDeviceMemory
    /// 5. Wrap VkImage as wgpu::Texture via wgpu_hal
    ///
    /// # Safety
    /// The surface_id and display must be valid VAAPI handles.
    pub unsafe fn import_vaapi(
        &self,
        surface_id: u32,
        display: usize,
        gpu_texture: &(impl Nv12GpuTextureSource + ?Sized),
    ) -> Result<ImportedNv12Texture> {
        // Step 1: Sync — ensure decode is complete before export
        let va_display = display as *mut std::ffi::c_void;
        let status = vaSyncSurface(va_display, surface_id);
        if status != VA_STATUS_SUCCESS {
            return Err(Error::Other(format!(
                "vaSyncSurface failed: status={}",
                status
            )));
        }

        // Step 2: Export VASurface to DMA-BUF
        let dma_buf = self.export_vaapi_to_dmabuf(surface_id, va_display, gpu_texture)?;

        // Step 3-5: Import DMA-BUF into wgpu via Vulkan.
        // import_dmabuf_plane() dup()'s each fd before passing to Vulkan,
        // so the originals remain valid during import.
        let result = self.import_dmabuf(&dma_buf, gpu_texture);

        // Close original DMA-BUF fds — Vulkan consumed dup'd copies,
        // so these originals are no longer needed.
        for plane in &dma_buf.planes {
            if plane.fd >= 0 {
                libc::close(plane.fd);
            }
        }

        result
    }

    /// Export VAAPI surface to DMA-BUF via vaExportSurfaceHandle
    unsafe fn export_vaapi_to_dmabuf(
        &self,
        surface_id: u32,
        display: *mut std::ffi::c_void,
        _gpu_texture: &(impl Nv12GpuTextureSource + ?Sized),
    ) -> Result<DmaBufFrame> {
        let mut desc = VADRMPRIMESurfaceDescriptor::default();

        let status = vaExportSurfaceHandle(
            display,
            surface_id,
            VA_SURFACE_ATTRIB_MEM_TYPE_DRM_PRIME_2,
            VA_EXPORT_SURFACE_READ_ONLY | VA_EXPORT_SURFACE_SEPARATE_LAYERS,
            &mut desc,
        );

        if status != VA_STATUS_SUCCESS {
            return Err(Error::Other(format!(
                "vaExportSurfaceHandle failed: status={}",
                status
            )));
        }

        // Build DmaBufFrame from descriptor.
        // With SEPARATE_LAYERS, each layer has exactly 1 plane.
        // NV12 → 2 layers: Y (R8) and UV (RG8).
        let mut frame = DmaBufFrame::new(desc.width, desc.height, desc.fourcc);
        let mut guard = DmaBufGuard::new();

        for i in 0..desc.num_layers as usize {
            let layer = &desc.layers[i];
            if layer.num_planes < 1 {
                continue;
            }
            let obj_idx = layer.object_index[0] as usize;
            let obj = &desc.objects[obj_idx];

            guard.push(obj.fd);
            frame.add_plane(
                obj.fd,
                layer.offset[0],
                layer.pitch[0],
                obj.drm_format_modifier,
            );
        }

        if !frame.is_valid_nv12() {
            // guard drops here, closing all fds
            return Err(Error::Other(format!(
                "VAAPI export did not produce valid NV12: fourcc={:#x}, planes={}",
                frame.fourcc,
                frame.planes.len()
            )));
        }

        // Disarm guard — fds are owned by DmaBufFrame now.
        // They will be closed after import_dmabuf_plane() has dup()'d them.
        guard.disarm();

        tracing::debug!(
            "VAAPI DMA-BUF export: {}x{}, fourcc={:#x}, planes={}",
            desc.width,
            desc.height,
            desc.fourcc,
            frame.planes.len()
        );

        Ok(frame)
    }

    /// Import DMA-BUF into wgpu via Vulkan external memory
    fn import_dmabuf(
        &self,
        dma_buf: &DmaBufFrame,
        gpu_texture: &(impl Nv12GpuTextureSource + ?Sized),
    ) -> Result<ImportedNv12Texture> {
        if dma_buf.planes.len() < 2 {
            return Err(Error::Other(
                "DMA-BUF NV12 requires at least 2 planes".to_string(),
            ));
        }
        if dma_buf.planes.iter().any(|p| p.fd < 0) {
            return Err(Error::Other(
                "DMA-BUF import failed: invalid file descriptor".to_string(),
            ));
        }

        let device = self.ctx.device();

        // Access the Vulkan HAL device through wgpu
        let (y_texture, uv_texture) = unsafe {
            device
                .as_hal::<wgpu_hal::api::Vulkan, _, _>(|hal_device| {
                    let hal_device = hal_device
                        .ok_or_else(|| Error::Other("wgpu backend is not Vulkan".to_string()))?;

                    let vk_device = hal_device.raw_device();

                    // Import Y plane (R8Unorm, full resolution)
                    let y_image = self.import_dmabuf_plane(
                        vk_device,
                        &dma_buf.planes[0],
                        dma_buf.width,
                        dma_buf.height,
                        vk::Format::R8_UNORM,
                    )?;

                    // Import UV plane (R8G8Unorm, half resolution)
                    let uv_image = self.import_dmabuf_plane(
                        vk_device,
                        &dma_buf.planes[1],
                        dma_buf.width / 2,
                        dma_buf.height / 2,
                        vk::Format::R8G8_UNORM,
                    )?;

                    // Wrap VkImages as wgpu_hal textures
                    let y_hal = wgpu_hal::vulkan::Device::texture_from_raw(
                        y_image.image,
                        &wgpu_hal::TextureDescriptor {
                            label: Some("NV12 Y Plane (DMA-BUF)"),
                            size: wgpu::Extent3d {
                                width: dma_buf.width,
                                height: dma_buf.height,
                                depth_or_array_layers: 1,
                            },
                            mip_level_count: 1,
                            sample_count: 1,
                            dimension: wgpu::TextureDimension::D2,
                            format: wgpu::TextureFormat::R8Unorm,
                            usage: wgpu_hal::TextureUses::RESOURCE,
                            memory_flags: wgpu_hal::MemoryFlags::empty(),
                            view_formats: vec![],
                        },
                        // Drop guard: clean up VkImage + VkDeviceMemory when wgpu drops the texture
                        Some(Box::new(VulkanImportGuard {
                            device: vk_device.clone(),
                            image: y_image.image,
                            memory: y_image.memory,
                        })),
                    );

                    let uv_hal = wgpu_hal::vulkan::Device::texture_from_raw(
                        uv_image.image,
                        &wgpu_hal::TextureDescriptor {
                            label: Some("NV12 UV Plane (DMA-BUF)"),
                            size: wgpu::Extent3d {
                                width: dma_buf.width / 2,
                                height: dma_buf.height / 2,
                                depth_or_array_layers: 1,
                            },
                            mip_level_count: 1,
                            sample_count: 1,
                            dimension: wgpu::TextureDimension::D2,
                            format: wgpu::TextureFormat::Rg8Unorm,
                            usage: wgpu_hal::TextureUses::RESOURCE,
                            memory_flags: wgpu_hal::MemoryFlags::empty(),
                            view_formats: vec![],
                        },
                        Some(Box::new(VulkanImportGuard {
                            device: vk_device.clone(),
                            image: uv_image.image,
                            memory: uv_image.memory,
                        })),
                    );

                    Ok::<(wgpu_hal::vulkan::Texture, wgpu_hal::vulkan::Texture), Error>((
                        y_hal, uv_hal,
                    ))
                })
                .ok_or_else(|| Error::Other("Failed to access Vulkan HAL".to_string()))??
        };

        // Create wgpu::Texture from HAL textures
        let y_texture_desc = wgpu::TextureDescriptor {
            label: Some("NV12 Y Plane (Zero-Copy)"),
            size: wgpu::Extent3d {
                width: dma_buf.width,
                height: dma_buf.height,
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
                width: dma_buf.width / 2,
                height: dma_buf.height / 2,
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
            device.create_texture_from_hal::<wgpu_hal::api::Vulkan>(y_texture, &y_texture_desc)
        };
        let uv_wgpu = unsafe {
            device.create_texture_from_hal::<wgpu_hal::api::Vulkan>(uv_texture, &uv_texture_desc)
        };

        let y_view = y_wgpu.create_view(&wgpu::TextureViewDescriptor::default());
        let uv_view = uv_wgpu.create_view(&wgpu::TextureViewDescriptor::default());

        tracing::trace!(
            "Zero-copy DMA-BUF import successful: {}x{} NV12",
            dma_buf.width,
            dma_buf.height
        );

        Ok(ImportedNv12Texture {
            y_texture: y_wgpu,
            uv_texture: uv_wgpu,
            y_view,
            uv_view,
            width: dma_buf.width,
            height: dma_buf.height,
            pts: gpu_texture.pts(),
            color_space: ColorSpace::from_ffmpeg(gpu_texture.color_space()),
        })
    }

    /// Import a single DMA-BUF plane as a VkImage with imported external memory
    ///
    /// Steps:
    /// 1. Create VkImage with VkExternalMemoryImageCreateInfo
    /// 2. Query memory requirements
    /// 3. Import DMA-BUF fd via VkImportMemoryFdInfoKHR
    /// 4. Bind imported memory to image
    unsafe fn import_dmabuf_plane(
        &self,
        vk_device: &ash::Device,
        plane: &DmaBufPlane,
        width: u32,
        height: u32,
        format: vk::Format,
    ) -> Result<VulkanImportedImage> {
        // 1. Create VkImage with external memory support
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
            .usage(vk::ImageUsageFlags::SAMPLED)
            .sharing_mode(vk::SharingMode::EXCLUSIVE)
            .initial_layout(vk::ImageLayout::UNDEFINED)
            .build();

        let image = vk_device
            .create_image(&image_info, None)
            .map_err(|e| Error::Other(format!("vkCreateImage failed: {:?}", e)))?;

        // 2. Query memory requirements
        let mem_reqs = vk_device.get_image_memory_requirements(image);

        // 3. Import DMA-BUF fd.
        // Per Vulkan spec, vkAllocateMemory with VkImportMemoryFdInfoKHR takes
        // ownership of the fd on success. We dup() the fd so the original
        // (owned by DmaBufFrame) can be closed independently by DmaBufGuard.
        let dup_fd = libc::dup(plane.fd);
        if dup_fd < 0 {
            vk_device.destroy_image(image, None);
            return Err(Error::Other(format!(
                "dup() failed for DMA-BUF fd {}: {}",
                plane.fd,
                std::io::Error::last_os_error()
            )));
        }

        let mut import_fd_info = vk::ImportMemoryFdInfoKHR::builder()
            .handle_type(vk::ExternalMemoryHandleTypeFlags::DMA_BUF_EXT)
            .fd(dup_fd)
            .build();

        // Find a suitable memory type that supports the image
        let memory_type_index = self
            .find_memory_type_index(mem_reqs.memory_type_bits, vk::MemoryPropertyFlags::empty())?;

        let alloc_info = vk::MemoryAllocateInfo::builder()
            .push_next(&mut import_fd_info)
            .allocation_size(mem_reqs.size)
            .memory_type_index(memory_type_index)
            .build();

        let memory = vk_device.allocate_memory(&alloc_info, None).map_err(|e| {
            // On failure, Vulkan does NOT consume the fd, so we must close it.
            libc::close(dup_fd);
            vk_device.destroy_image(image, None);
            Error::Other(format!("vkAllocateMemory (DMA-BUF import) failed: {:?}", e))
        })?;

        // 4. Bind memory to image
        vk_device
            .bind_image_memory(image, memory, 0)
            .map_err(|e| Error::Other(format!("vkBindImageMemory failed: {:?}", e)))?;

        tracing::trace!(
            "Imported DMA-BUF plane: fd={}, {}x{}, format={:?}",
            plane.fd,
            width,
            height,
            format
        );

        Ok(VulkanImportedImage { image, memory })
    }

    /// Find a memory type index that satisfies the type bits and property flags
    fn find_memory_type_index(
        &self,
        type_bits: u32,
        required_flags: vk::MemoryPropertyFlags,
    ) -> Result<u32> {
        let device = self.ctx.device();

        unsafe {
            device
                .as_hal::<wgpu_hal::api::Vulkan, _, _>(|hal_device| {
                    let hal_device = hal_device
                        .ok_or_else(|| Error::Other("wgpu backend is not Vulkan".to_string()))?;

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
                        "No suitable Vulkan memory type for DMA-BUF import".to_string(),
                    ))
                })
                .ok_or_else(|| Error::Other("Failed to access Vulkan HAL".to_string()))?
        }
    }
}

// ---------------------------------------------------------------------------
// Vulkan import helpers
// ---------------------------------------------------------------------------

/// Intermediate result from importing a single DMA-BUF plane
struct VulkanImportedImage {
    image: vk::Image,
    memory: vk::DeviceMemory,
}

/// RAII guard that destroys VkImage + VkDeviceMemory when the wgpu texture is dropped.
/// Note: The DMA-BUF fd is NOT stored here — Vulkan takes ownership of the dup'd fd
/// on successful vkAllocateMemory, and the original fd is closed by DmaBufGuard.
struct VulkanImportGuard {
    device: ash::Device,
    image: vk::Image,
    memory: vk::DeviceMemory,
}

impl Drop for VulkanImportGuard {
    fn drop(&mut self) {
        unsafe {
            self.device.destroy_image(self.image, None);
            self.device.free_memory(self.memory, None);
        }
    }
}

// Safety: VkImage/VkDeviceMemory handles are thread-safe when not concurrently accessed
unsafe impl Send for VulkanImportGuard {}
unsafe impl Sync for VulkanImportGuard {}

// ---------------------------------------------------------------------------
// CUDA texture importer — GPU-to-GPU copy via CUDA-Vulkan interop
// ---------------------------------------------------------------------------

// CUDA driver API FFI declarations
type CUresult = i32;
type CUdeviceptr = usize;
type CUexternalMemory = *mut std::ffi::c_void;
type CUstream = *mut std::ffi::c_void;

const CUDA_SUCCESS: CUresult = 0;

/// CUDA external memory handle type — POSIX file descriptor
const CU_EXTERNAL_MEMORY_HANDLE_TYPE_OPAQUE_FD: u32 = 1;

/// CUDA_EXTERNAL_MEMORY_HANDLE_DESC
///
/// Layout on 64-bit Linux:
///   offset  0: type          (u32, 4 bytes)
///   offset  4: _type_pad     (4 bytes — alignment padding, union contains pointers)
///   offset  8: handle union  (16 bytes — max of: int fd, struct{void*,void*} win32)
///   offset 24: size          (u64, 8 bytes)
///   offset 32: flags         (u32, 4 bytes)
///   offset 36: reserved      (u32 × 16 = 64 bytes)
#[repr(C)]
struct CudaExternalMemoryHandleDesc {
    handle_type: u32,
    _type_pad: u32,         // padding: union is 8-byte aligned (contains pointers)
    handle_union: [u8; 16], // union { int fd; struct { void*, const void* } win32; ... }
    size: u64,
    flags: u32,
    _reserved: [u32; 16],
}

impl CudaExternalMemoryHandleDesc {
    /// Create a descriptor for importing a POSIX file descriptor
    fn new_opaque_fd(fd: i32, size: u64) -> Self {
        let mut handle_union = [0u8; 16];
        handle_union[..4].copy_from_slice(&fd.to_ne_bytes());
        Self {
            handle_type: CU_EXTERNAL_MEMORY_HANDLE_TYPE_OPAQUE_FD,
            _type_pad: 0,
            handle_union,
            size,
            flags: 0,
            _reserved: [0u32; 16],
        }
    }
}

/// CUDA_EXTERNAL_MEMORY_BUFFER_DESC
#[repr(C)]
#[derive(Default)]
struct CudaExternalMemoryBufferDesc {
    offset: u64,
    size: u64,
    flags: u32,
    _reserved: [u32; 16],
}

/// CUDA_MEMCPY2D for cuMemcpy2DAsync
#[repr(C)]
struct CudaMemcpy2D {
    src_x_in_bytes: usize,
    src_y: usize,
    src_memory_type: u32, // CU_MEMORYTYPE_DEVICE = 2
    src_host: *const std::ffi::c_void,
    src_device: CUdeviceptr,
    src_array: *const std::ffi::c_void,
    src_pitch: usize,
    dst_x_in_bytes: usize,
    dst_y: usize,
    dst_memory_type: u32, // CU_MEMORYTYPE_DEVICE = 2
    dst_host: *mut std::ffi::c_void,
    dst_device: CUdeviceptr,
    dst_array: *mut std::ffi::c_void,
    dst_pitch: usize,
    width_in_bytes: usize,
    height: usize,
}

impl Default for CudaMemcpy2D {
    fn default() -> Self {
        Self {
            src_x_in_bytes: 0,
            src_y: 0,
            src_memory_type: 0,
            src_host: std::ptr::null(),
            src_device: 0,
            src_array: std::ptr::null(),
            src_pitch: 0,
            dst_x_in_bytes: 0,
            dst_y: 0,
            dst_memory_type: 0,
            dst_host: std::ptr::null_mut(),
            dst_device: 0,
            dst_array: std::ptr::null_mut(),
            dst_pitch: 0,
            width_in_bytes: 0,
            height: 0,
        }
    }
}

const CU_MEMORYTYPE_DEVICE: u32 = 2;

#[cfg(feature = "cuda")]
#[link(name = "cuda")]
extern "C" {
    fn cuImportExternalMemory(
        ext_mem: *mut CUexternalMemory,
        desc: *const CudaExternalMemoryHandleDesc,
    ) -> CUresult;

    fn cuExternalMemoryGetMappedBuffer(
        dev_ptr: *mut CUdeviceptr,
        ext_mem: CUexternalMemory,
        desc: *const CudaExternalMemoryBufferDesc,
    ) -> CUresult;

    fn cuDestroyExternalMemory(ext_mem: CUexternalMemory) -> CUresult;

    fn cuMemcpy2DAsync_v2(copy: *const CudaMemcpy2D, stream: CUstream) -> CUresult;

    fn cuStreamSynchronize(stream: CUstream) -> CUresult;
}

/// CUDA texture importer for NVIDIA GPUs
///
/// Uses CUDA-Vulkan interop for GPU-to-GPU transfer:
/// 1. Vulkan allocates exportable memory (VK_KHR_external_memory_fd)
/// 2. CUDA imports the Vulkan memory via cuImportExternalMemory
/// 3. CUDA copies NVDEC frame data into the shared buffer (cuMemcpy2DAsync)
/// 4. wgpu uses the Vulkan texture directly
///
/// This avoids CPU roundtrip — data stays on GPU throughout.
#[cfg(feature = "cuda")]
pub struct CudaTextureImporter {
    ctx: Arc<GpuContext>,
}

#[cfg(feature = "cuda")]
impl CudaTextureImporter {
    /// Create a new CUDA texture importer
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Ok(Self { ctx })
    }

    /// Import NV12 texture from CUDA device memory (NVDEC output)
    ///
    /// Pipeline: NVDEC → CUdeviceptr → cuMemcpy2D → Vulkan shared buffer → wgpu
    ///
    /// # Safety
    /// The device_ptr must be a valid CUdeviceptr from FFmpeg NVDEC.
    pub unsafe fn import_cuda(
        &self,
        device_ptr: usize,
        pitch: usize,
        gpu_texture: &(impl Nv12GpuTextureSource + ?Sized),
    ) -> Result<ImportedNv12Texture> {
        let width = gpu_texture.width();
        let height = gpu_texture.height();
        let device = self.ctx.device();

        // Step 1-2: Create Vulkan textures with exportable memory,
        //           export as fd, import into CUDA, copy NVDEC data
        let (y_texture, uv_texture) = device
            .as_hal::<wgpu_hal::api::Vulkan, _, _>(|hal_device| {
                let hal_device = hal_device
                    .ok_or_else(|| Error::Other("wgpu backend is not Vulkan".to_string()))?;

                let vk_device = hal_device.raw_device();

                // Create exportable Y plane
                let y_result = self.create_exportable_plane_and_copy(
                    vk_device,
                    hal_device,
                    device_ptr,
                    pitch,
                    width,
                    height,
                    vk::Format::R8_UNORM,
                    0,              // Y plane offset = 0
                    width as usize, // Y plane: 1 byte per pixel
                    height as usize,
                )?;

                // Create exportable UV plane
                // NV12: UV plane starts at offset pitch * height in CUDA memory
                let uv_offset = pitch * height as usize;
                let uv_result = self.create_exportable_plane_and_copy(
                    vk_device,
                    hal_device,
                    device_ptr + uv_offset,
                    pitch,
                    width / 2,
                    height / 2,
                    vk::Format::R8G8_UNORM,
                    0,
                    (width) as usize, // UV plane: 2 bytes per pixel, width/2 pixels = width bytes
                    (height / 2) as usize,
                )?;

                // Wrap as wgpu_hal textures
                let y_hal = wgpu_hal::vulkan::Device::texture_from_raw(
                    y_result.image,
                    &wgpu_hal::TextureDescriptor {
                        label: Some("NV12 Y Plane (CUDA)"),
                        size: wgpu::Extent3d {
                            width,
                            height,
                            depth_or_array_layers: 1,
                        },
                        mip_level_count: 1,
                        sample_count: 1,
                        dimension: wgpu::TextureDimension::D2,
                        format: wgpu::TextureFormat::R8Unorm,
                        usage: wgpu_hal::TextureUses::RESOURCE,
                        memory_flags: wgpu_hal::MemoryFlags::empty(),
                        view_formats: vec![],
                    },
                    Some(Box::new(VulkanImportGuard {
                        device: vk_device.clone(),
                        image: y_result.image,
                        memory: y_result.memory,
                    })),
                );

                let uv_hal = wgpu_hal::vulkan::Device::texture_from_raw(
                    uv_result.image,
                    &wgpu_hal::TextureDescriptor {
                        label: Some("NV12 UV Plane (CUDA)"),
                        size: wgpu::Extent3d {
                            width: width / 2,
                            height: height / 2,
                            depth_or_array_layers: 1,
                        },
                        mip_level_count: 1,
                        sample_count: 1,
                        dimension: wgpu::TextureDimension::D2,
                        format: wgpu::TextureFormat::Rg8Unorm,
                        usage: wgpu_hal::TextureUses::RESOURCE,
                        memory_flags: wgpu_hal::MemoryFlags::empty(),
                        view_formats: vec![],
                    },
                    Some(Box::new(VulkanImportGuard {
                        device: vk_device.clone(),
                        image: uv_result.image,
                        memory: uv_result.memory,
                    })),
                );

                Ok::<(wgpu_hal::vulkan::Texture, wgpu_hal::vulkan::Texture), Error>((y_hal, uv_hal))
            })
            .ok_or_else(|| Error::Other("Failed to access Vulkan HAL".to_string()))??;

        // Create wgpu textures
        let y_desc = wgpu::TextureDescriptor {
            label: Some("NV12 Y Plane (CUDA Zero-Copy)"),
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
        let uv_desc = wgpu::TextureDescriptor {
            label: Some("NV12 UV Plane (CUDA Zero-Copy)"),
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

        let y_wgpu = device.create_texture_from_hal::<wgpu_hal::api::Vulkan>(y_texture, &y_desc);
        let uv_wgpu = device.create_texture_from_hal::<wgpu_hal::api::Vulkan>(uv_texture, &uv_desc);

        let y_view = y_wgpu.create_view(&wgpu::TextureViewDescriptor::default());
        let uv_view = uv_wgpu.create_view(&wgpu::TextureViewDescriptor::default());

        tracing::trace!(
            "CUDA GPU-to-GPU import successful: {}x{} NV12",
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

    /// Create a Vulkan image with exportable memory, export as fd,
    /// import into CUDA, and copy NVDEC data into it.
    ///
    /// Returns the VkImage + VkDeviceMemory (data already copied).
    unsafe fn create_exportable_plane_and_copy(
        &self,
        vk_device: &ash::Device,
        hal_device: &wgpu_hal::vulkan::Device,
        src_device_ptr: CUdeviceptr,
        src_pitch: usize,
        width: u32,
        height: u32,
        format: vk::Format,
        _plane_offset: usize,
        copy_width_bytes: usize,
        copy_height: usize,
    ) -> Result<VulkanImportedImage> {
        // 1. Create VkImage with exportable external memory
        let mut external_memory_info = vk::ExternalMemoryImageCreateInfo::builder()
            .handle_types(vk::ExternalMemoryHandleTypeFlags::OPAQUE_FD)
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
            .usage(vk::ImageUsageFlags::SAMPLED | vk::ImageUsageFlags::TRANSFER_DST)
            .sharing_mode(vk::SharingMode::EXCLUSIVE)
            .initial_layout(vk::ImageLayout::UNDEFINED)
            .build();

        let image = vk_device
            .create_image(&image_info, None)
            .map_err(|e| Error::Other(format!("vkCreateImage (CUDA) failed: {:?}", e)))?;

        let mem_reqs = vk_device.get_image_memory_requirements(image);

        // 2. Allocate exportable memory
        let mut export_info = vk::ExportMemoryAllocateInfo::builder()
            .handle_types(vk::ExternalMemoryHandleTypeFlags::OPAQUE_FD)
            .build();

        let memory_type_index =
            self.find_memory_type_for_cuda(hal_device, mem_reqs.memory_type_bits)?;

        let alloc_info = vk::MemoryAllocateInfo::builder()
            .push_next(&mut export_info)
            .allocation_size(mem_reqs.size)
            .memory_type_index(memory_type_index)
            .build();

        let memory = vk_device.allocate_memory(&alloc_info, None).map_err(|e| {
            vk_device.destroy_image(image, None);
            Error::Other(format!("vkAllocateMemory (CUDA export) failed: {:?}", e))
        })?;

        vk_device.bind_image_memory(image, memory, 0).map_err(|e| {
            vk_device.destroy_image(image, None);
            vk_device.free_memory(memory, None);
            Error::Other(format!("vkBindImageMemory (CUDA) failed: {:?}", e))
        })?;

        // 3. Export Vulkan memory as fd
        let get_fd_info = vk::MemoryGetFdInfoKHR::builder()
            .memory(memory)
            .handle_type(vk::ExternalMemoryHandleTypeFlags::OPAQUE_FD)
            .build();

        // Use vkGetMemoryFdKHR via ash extension
        let instance = hal_device.shared_instance();
        let ext_memory_fd =
            ash::extensions::khr::ExternalMemoryFd::new(instance.raw_instance(), vk_device);

        let exported_fd = ext_memory_fd.get_memory_fd(&get_fd_info).map_err(|e| {
            vk_device.destroy_image(image, None);
            vk_device.free_memory(memory, None);
            Error::Other(format!("vkGetMemoryFdKHR failed: {:?}", e))
        })?;

        // 4. Import fd into CUDA
        let mut cuda_ext_mem: CUexternalMemory = std::ptr::null_mut();
        let cuda_handle_desc =
            CudaExternalMemoryHandleDesc::new_opaque_fd(exported_fd, mem_reqs.size);

        let cu_result = cuImportExternalMemory(&mut cuda_ext_mem, &cuda_handle_desc);
        if cu_result != CUDA_SUCCESS {
            // cuImportExternalMemory consumes the fd on success;
            // on failure we must close it ourselves.
            libc::close(exported_fd);
            vk_device.destroy_image(image, None);
            vk_device.free_memory(memory, None);
            return Err(Error::Other(format!(
                "cuImportExternalMemory failed: {}",
                cu_result
            )));
        }
        // fd is consumed by CUDA on success — do not close

        // 5. Get CUDA device pointer for the imported memory
        let mut cuda_dst_ptr: CUdeviceptr = 0;
        let buf_desc = CudaExternalMemoryBufferDesc {
            offset: 0,
            size: mem_reqs.size,
            ..Default::default()
        };

        let cu_result = cuExternalMemoryGetMappedBuffer(&mut cuda_dst_ptr, cuda_ext_mem, &buf_desc);
        if cu_result != CUDA_SUCCESS {
            cuDestroyExternalMemory(cuda_ext_mem);
            vk_device.destroy_image(image, None);
            vk_device.free_memory(memory, None);
            return Err(Error::Other(format!(
                "cuExternalMemoryGetMappedBuffer failed: {}",
                cu_result
            )));
        }

        // 6. Copy NVDEC frame data from source to shared buffer
        // Query actual row pitch from Vulkan — LINEAR tiling may add alignment padding
        let subresource = vk::ImageSubresource {
            aspect_mask: vk::ImageAspectFlags::COLOR,
            mip_level: 0,
            array_layer: 0,
        };
        let layout = vk_device.get_image_subresource_layout(image, subresource);
        let dst_pitch = layout.row_pitch as usize;

        let copy_params = CudaMemcpy2D {
            src_memory_type: CU_MEMORYTYPE_DEVICE,
            src_device: src_device_ptr,
            src_pitch,
            dst_memory_type: CU_MEMORYTYPE_DEVICE,
            dst_device: cuda_dst_ptr,
            dst_pitch,
            width_in_bytes: copy_width_bytes,
            height: copy_height,
            ..Default::default()
        };

        let cu_result = cuMemcpy2DAsync_v2(&copy_params, std::ptr::null_mut()); // null = default stream
        if cu_result != CUDA_SUCCESS {
            cuDestroyExternalMemory(cuda_ext_mem);
            vk_device.destroy_image(image, None);
            vk_device.free_memory(memory, None);
            return Err(Error::Other(format!(
                "cuMemcpy2DAsync failed: {}",
                cu_result
            )));
        }

        // Synchronize to ensure copy is complete before Vulkan uses the data
        let cu_result = cuStreamSynchronize(std::ptr::null_mut());
        if cu_result != CUDA_SUCCESS {
            cuDestroyExternalMemory(cuda_ext_mem);
            vk_device.destroy_image(image, None);
            vk_device.free_memory(memory, None);
            return Err(Error::Other(format!(
                "cuStreamSynchronize failed: {}",
                cu_result
            )));
        }

        // Clean up CUDA external memory handle (Vulkan memory remains valid)
        cuDestroyExternalMemory(cuda_ext_mem);

        tracing::trace!(
            "CUDA → Vulkan copy: {}x{} ({} bytes/row, dst_pitch={}), src={:#x} → dst={:#x}",
            width,
            height,
            copy_width_bytes,
            dst_pitch,
            src_device_ptr,
            cuda_dst_ptr
        );

        Ok(VulkanImportedImage { image, memory })
    }

    /// Find a memory type suitable for CUDA interop (device-local + exportable)
    fn find_memory_type_for_cuda(
        &self,
        hal_device: &wgpu_hal::vulkan::Device,
        type_bits: u32,
    ) -> Result<u32> {
        unsafe {
            let instance = hal_device.shared_instance();
            let physical_device = hal_device.raw_physical_device();
            let mem_props = instance
                .raw_instance()
                .get_physical_device_memory_properties(physical_device);

            // Prefer DEVICE_LOCAL for best CUDA interop performance
            for i in 0..mem_props.memory_type_count {
                if (type_bits & (1 << i)) != 0 {
                    let props = mem_props.memory_types[i as usize].property_flags;
                    if props.contains(vk::MemoryPropertyFlags::DEVICE_LOCAL) {
                        return Ok(i);
                    }
                }
            }

            // Fallback: any compatible type
            for i in 0..mem_props.memory_type_count {
                if (type_bits & (1 << i)) != 0 {
                    return Ok(i);
                }
            }

            Err(Error::Other(
                "No suitable Vulkan memory type for CUDA interop".to_string(),
            ))
        }
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_drm_format_constants() {
        assert_eq!(DRM_FORMAT_NV12, 0x3231564E);
        assert_eq!(DRM_FORMAT_P010, 0x30313050);
        assert_eq!(DRM_FORMAT_MOD_LINEAR, 0);
    }

    #[test]
    fn test_dmabuf_frame_valid_nv12() {
        let mut frame = DmaBufFrame::new(1920, 1080, DRM_FORMAT_NV12);
        assert!(!frame.is_valid_nv12()); // no planes yet
        frame.add_plane(10, 0, 1920, DRM_FORMAT_MOD_LINEAR);
        frame.add_plane(11, 0, 1920, DRM_FORMAT_MOD_LINEAR);
        assert!(frame.is_valid_nv12());
    }

    #[test]
    fn test_dmabuf_guard_closes_fds() {
        // Just verify the guard compiles and can be created
        let guard = DmaBufGuard::new();
        drop(guard);
    }
}
