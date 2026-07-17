//! GPU Texture Import - Import hardware-decoded NV12 textures into wgpu
//!
//! This module provides platform-specific texture import functionality:
//! - macOS: IOSurface → Metal → wgpu
//! - Linux: DMA-BUF → Vulkan → wgpu
//! - Windows: SharedHandle → D3D12 → wgpu
//!
//! Key features:
//! - Zero-copy texture import when platform supports it
//! - BT.601/BT.709 color space support

use crate::error::{GpuError as Error, GpuResult as Result};
use crate::{DefaultPlatformGpuMediaBridge, GpuContext, PlatformGpuMediaBridge};
use neko_engine_types::{DecodedGpuTextureHandle, Nv12GpuTextureSource};

use std::sync::Arc;

/// YUV color space for conversion
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
#[repr(u32)]
pub enum ColorSpace {
    /// BT.601 (SD video, NTSC/PAL)
    Bt601 = 0,
    /// BT.709 (HD video, default for most modern content)
    #[default]
    Bt709 = 1,
    /// BT.2020 (UHD/HDR video)
    Bt2020 = 2,
}

impl ColorSpace {
    /// Create from FFmpeg AVColorSpace value
    pub fn from_ffmpeg(colorspace: i32) -> Self {
        // FFmpeg AVCOL_SPC_* values
        match colorspace {
            1 => ColorSpace::Bt709,     // AVCOL_SPC_BT709
            5 | 6 => ColorSpace::Bt601, // AVCOL_SPC_BT470BG, AVCOL_SPC_SMPTE170M
            9 => ColorSpace::Bt2020,    // AVCOL_SPC_BT2020_NCL
            _ => ColorSpace::Bt709,     // Default to BT.709 for HD content
        }
    }
}

/// Imported NV12 texture for wgpu rendering
///
/// Contains Y and UV textures that can be sampled in shaders.
/// The textures are in NV12 format:
/// - Y texture: Full resolution, R8 format
/// - UV texture: Half resolution, RG8 format (interleaved U and V)
pub struct ImportedNv12Texture {
    /// Y plane texture (luma, full resolution)
    pub y_texture: wgpu::Texture,
    /// UV plane texture (chroma, half resolution, interleaved)
    pub uv_texture: wgpu::Texture,
    /// Y plane texture view
    pub y_view: wgpu::TextureView,
    /// UV plane texture view
    pub uv_view: wgpu::TextureView,
    /// Texture width
    pub width: u32,
    /// Texture height
    pub height: u32,
    /// Presentation timestamp
    pub pts: i64,
    /// Color space for YUV conversion
    pub color_space: ColorSpace,
}

/// NV12 data with linesize information from FFmpeg
pub struct Nv12FrameData<'a> {
    /// Y plane data
    pub y_data: &'a [u8],
    /// UV plane data (interleaved)
    pub uv_data: &'a [u8],
    /// Y plane linesize (bytes per row, may include padding)
    pub y_linesize: u32,
    /// UV plane linesize (bytes per row, may include padding)
    pub uv_linesize: u32,
    /// Actual frame width
    pub width: u32,
    /// Actual frame height
    pub height: u32,
    /// Color space
    pub color_space: ColorSpace,
}

/// NV12 texture importer for wgpu
pub struct Nv12TextureImporter {
    ctx: Arc<GpuContext>,
    bridge: DefaultPlatformGpuMediaBridge,
}

impl Nv12TextureImporter {
    /// Create a new texture importer
    pub fn new(ctx: Arc<GpuContext>) -> Self {
        let bridge = DefaultPlatformGpuMediaBridge::new(Arc::clone(&ctx));
        Self { ctx, bridge }
    }

    /// Create empty NV12 textures for uploading data
    ///
    /// Use this when you have raw NV12 data (Y and UV planes) and want to
    /// upload it to GPU textures for rendering.
    pub fn create_textures(
        &self,
        width: u32,
        height: u32,
        color_space: ColorSpace,
    ) -> ImportedNv12Texture {
        let device = self.ctx.device();

        // Create Y texture (full resolution, R8)
        let y_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("NV12 Y Plane"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::R8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        // Create UV texture (half resolution, RG8)
        let uv_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("NV12 UV Plane"),
            size: wgpu::Extent3d {
                width: width / 2,
                height: height / 2,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rg8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });

        let y_view = y_texture.create_view(&wgpu::TextureViewDescriptor::default());
        let uv_view = uv_texture.create_view(&wgpu::TextureViewDescriptor::default());

        ImportedNv12Texture {
            y_texture,
            uv_texture,
            y_view,
            uv_view,
            width,
            height,
            pts: 0,
            color_space,
        }
    }

    /// Import a hardware-decoded NV12 texture into wgpu
    ///
    /// This is the main entry point for zero-copy texture import.
    /// The implementation is platform-specific.
    #[allow(unused_variables)]
    pub fn import(&self, gpu_texture: &impl Nv12GpuTextureSource) -> Result<ImportedNv12Texture> {
        match gpu_texture.handle() {
            DecodedGpuTextureHandle::None => {
                Err(Error::Other("No GPU texture handle available".to_string()))
            }

            DecodedGpuTextureHandle::CpuNv12 {
                y_data,
                uv_data,
                y_linesize,
                uv_linesize,
            } => {
                // Software decode fallback: upload CPU NV12 data to GPU textures
                let color_space = ColorSpace::from_ffmpeg(gpu_texture.color_space());
                let mut imported =
                    self.create_textures(gpu_texture.width(), gpu_texture.height(), color_space);
                let frame_data = Nv12FrameData {
                    y_data,
                    uv_data,
                    y_linesize: *y_linesize,
                    uv_linesize: *uv_linesize,
                    width: gpu_texture.width(),
                    height: gpu_texture.height(),
                    color_space,
                };
                self.upload_nv12_with_linesize(&imported, &frame_data)?;
                imported.pts = gpu_texture.pts();
                Ok(imported)
            }

            _ => self.bridge.import_decoded_frame(gpu_texture),
        }
    }

    /// Upload NV12 data with linesize handling
    ///
    /// This handles FFmpeg's linesize padding correctly.
    /// Use this when linesize != width (common with hardware decoders).
    pub fn upload_nv12_with_linesize(
        &self,
        imported: &ImportedNv12Texture,
        frame_data: &Nv12FrameData,
    ) -> Result<()> {
        let queue = self.ctx.queue();
        let width = frame_data.width;
        let height = frame_data.height;

        // Handle Y plane with potential linesize padding
        if frame_data.y_linesize == width {
            // No padding, direct upload
            let y_size = (width * height) as usize;
            if frame_data.y_data.len() < y_size {
                return Err(Error::InvalidParameter(format!(
                    "Y data too small: expected {}, got {}",
                    y_size,
                    frame_data.y_data.len()
                )));
            }
            queue.write_texture(
                wgpu::ImageCopyTexture {
                    texture: &imported.y_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &frame_data.y_data[0..y_size],
                wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(width),
                    rows_per_image: Some(height),
                },
                wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
            );
        } else {
            // Has padding, need to strip it row by row
            let mut y_stripped = Vec::with_capacity((width * height) as usize);
            for row in 0..height {
                let start = (row * frame_data.y_linesize) as usize;
                let end = start + width as usize;
                if end > frame_data.y_data.len() {
                    return Err(Error::InvalidParameter(
                        "Y data buffer too small for linesize".to_string(),
                    ));
                }
                y_stripped.extend_from_slice(&frame_data.y_data[start..end]);
            }
            queue.write_texture(
                wgpu::ImageCopyTexture {
                    texture: &imported.y_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &y_stripped,
                wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(width),
                    rows_per_image: Some(height),
                },
                wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
            );
        }

        // Handle UV plane with potential linesize padding
        let uv_width = width / 2;
        let uv_height = height / 2;
        let uv_bytes_per_row = uv_width * 2; // RG8 = 2 bytes per pixel

        if frame_data.uv_linesize == uv_bytes_per_row {
            // No padding, direct upload
            let uv_size = (uv_bytes_per_row * uv_height) as usize;
            if frame_data.uv_data.len() < uv_size {
                return Err(Error::InvalidParameter(format!(
                    "UV data too small: expected {}, got {}",
                    uv_size,
                    frame_data.uv_data.len()
                )));
            }
            queue.write_texture(
                wgpu::ImageCopyTexture {
                    texture: &imported.uv_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &frame_data.uv_data[0..uv_size],
                wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(uv_bytes_per_row),
                    rows_per_image: Some(uv_height),
                },
                wgpu::Extent3d {
                    width: uv_width,
                    height: uv_height,
                    depth_or_array_layers: 1,
                },
            );
        } else {
            // Has padding, strip it
            let mut uv_stripped = Vec::with_capacity((uv_bytes_per_row * uv_height) as usize);
            for row in 0..uv_height {
                let start = (row * frame_data.uv_linesize) as usize;
                let end = start + uv_bytes_per_row as usize;
                if end > frame_data.uv_data.len() {
                    return Err(Error::InvalidParameter(
                        "UV data buffer too small for linesize".to_string(),
                    ));
                }
                uv_stripped.extend_from_slice(&frame_data.uv_data[start..end]);
            }
            queue.write_texture(
                wgpu::ImageCopyTexture {
                    texture: &imported.uv_texture,
                    mip_level: 0,
                    origin: wgpu::Origin3d::ZERO,
                    aspect: wgpu::TextureAspect::All,
                },
                &uv_stripped,
                wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(uv_bytes_per_row),
                    rows_per_image: Some(uv_height),
                },
                wgpu::Extent3d {
                    width: uv_width,
                    height: uv_height,
                    depth_or_array_layers: 1,
                },
            );
        }

        Ok(())
    }

    /// Upload contiguous NV12 data (simple case without linesize padding)
    pub fn upload_nv12_data(&self, imported: &ImportedNv12Texture, nv12_data: &[u8]) -> Result<()> {
        let width = imported.width;
        let height = imported.height;
        let y_size = (width * height) as usize;
        let uv_size = ((width / 2) * (height / 2) * 2) as usize;

        if nv12_data.len() < y_size + uv_size {
            return Err(Error::InvalidParameter(format!(
                "NV12 data too small: expected {}, got {}",
                y_size + uv_size,
                nv12_data.len()
            )));
        }

        let frame_data = Nv12FrameData {
            y_data: &nv12_data[0..y_size],
            uv_data: &nv12_data[y_size..y_size + uv_size],
            y_linesize: width,
            uv_linesize: width, // NV12 UV is interleaved, same width as Y
            width,
            height,
            color_space: imported.color_space,
        };

        self.upload_nv12_with_linesize(imported, &frame_data)
    }
}

/// NV12 to RGB conversion shader for wgpu
///
/// Supports BT.601, BT.709, and BT.2020 color spaces via uniform.
/// Uses linear sampler for UV upscaling (bilinear interpolation).
pub const NV12_TO_RGB_SHADER: &str = r#"
// NV12 to RGB Conversion Shader
// Supports multiple YUV color spaces

struct Uniforms {
    output_size: vec2<f32>,
    // Color space: 0 = BT.601, 1 = BT.709, 2 = BT.2020
    color_space: u32,
    _padding: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var y_texture: texture_2d<f32>;
@group(0) @binding(2) var uv_texture: texture_2d<f32>;
@group(0) @binding(3) var tex_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Fullscreen triangle (more efficient than quad)
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0)
    );

    var uvs = array<vec2<f32>, 3>(
        vec2<f32>(0.0, 1.0),
        vec2<f32>(2.0, 1.0),
        vec2<f32>(0.0, -1.0)
    );

    var output: VertexOutput;
    output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
    output.uv = uvs[vertex_index];
    return output;
}

// BT.601 YUV to RGB (SD video: 480i/576i)
// Used for NTSC/PAL content
// Input is limited range (Y: 16-235, UV: 16-240)
// Input y, u, v are normalized 0-1 from R8Unorm texture sampling
fn yuv_to_rgb_bt601(y: f32, u: f32, v: f32) -> vec3<f32> {
    // Convert from limited range (normalized) to full range
    let y_norm = (y - 0.0627) / 0.8588;  // Map to 0-1
    let u_norm = (u - 0.502) / 0.8784;   // Map to -0.5 to 0.5
    let v_norm = (v - 0.502) / 0.8784;

    // BT.601 inverse matrix (matches rgba_to_nv12.rs encoding)
    let r = y_norm + 1.4017 * v_norm;
    let g = y_norm - 0.3437 * u_norm - 0.7142 * v_norm;
    let b = y_norm + 1.7722 * u_norm;

    return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

// BT.709 YUV to RGB (HD video: 720p/1080p)
// Most common for modern content
// Input is limited range (Y: 16-235, UV: 16-240)
// Input y, u, v are normalized 0-1 from R8Unorm texture sampling
fn yuv_to_rgb_bt709(y: f32, u: f32, v: f32) -> vec3<f32> {
    // Convert from limited range (normalized) to full range
    // Y: 16/255=0.0627 to 235/255=0.9216, range=219/255=0.8588
    // UV: 16/255=0.0627 to 240/255=0.9412, centered at 128/255=0.502
    let y_norm = (y - 0.0627) / 0.8588;  // Map to 0-1
    let u_norm = (u - 0.502) / 0.8784;   // Map to -0.5 to 0.5 (224/255=0.8784)
    let v_norm = (v - 0.502) / 0.8784;

    // BT.709 inverse matrix (matches rgba_to_nv12.rs encoding)
    // These are the exact inverse of the encoding coefficients
    let r = y_norm + 1.5748 * v_norm;
    let g = y_norm - 0.1873 * u_norm - 0.4681 * v_norm;
    let b = y_norm + 1.8556 * u_norm;

    return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

// BT.2020 YUV to RGB (UHD/HDR video: 4K/8K)
// Input is limited range (Y: 16-235, UV: 16-240)
// Input y, u, v are normalized 0-1 from R8Unorm texture sampling
fn yuv_to_rgb_bt2020(y: f32, u: f32, v: f32) -> vec3<f32> {
    // Convert from limited range (normalized) to full range
    let y_norm = (y - 0.0627) / 0.8588;  // Map to 0-1
    let u_norm = (u - 0.502) / 0.8784;   // Map to -0.5 to 0.5
    let v_norm = (v - 0.502) / 0.8784;

    // BT.2020 inverse matrix (matches rgba_to_nv12.rs encoding)
    let r = y_norm + 1.4746 * v_norm;
    let g = y_norm - 0.1645 * u_norm - 0.5713 * v_norm;
    let b = y_norm + 1.8814 * u_norm;

    return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

// Select color space conversion based on uniform
fn yuv_to_rgb(y: f32, u: f32, v: f32, color_space: u32) -> vec3<f32> {
    switch color_space {
        case 0u: { return yuv_to_rgb_bt601(y, u, v); }
        case 2u: { return yuv_to_rgb_bt2020(y, u, v); }
        default: { return yuv_to_rgb_bt709(y, u, v); }
    }
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv;

    // Sample Y at full resolution (R8Unorm texture)
    let y = textureSample(y_texture, tex_sampler, uv).r;

    // Sample UV (interleaved RG8Unorm texture)
    // Linear sampler handles bilinear upscaling automatically
    let uv_sample = textureSample(uv_texture, tex_sampler, uv);
    let cb = uv_sample.r;  // U/Cb component
    let cr = uv_sample.g;  // V/Cr component

    // Convert to RGB using selected color space
    let rgb = yuv_to_rgb(y, cb, cr, uniforms.color_space);

    return vec4<f32>(rgb, 1.0);
}
"#;

/// Uniform buffer layout for NV12 shader
#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct Nv12Uniforms {
    /// Output texture size
    pub output_size: [f32; 2],
    /// Color space (0=BT.601, 1=BT.709, 2=BT.2020)
    pub color_space: u32,
    /// Padding for alignment
    pub _padding: u32,
}

impl Default for Nv12Uniforms {
    fn default() -> Self {
        Self {
            output_size: [1920.0, 1080.0],
            color_space: 1, // BT.709 default
            _padding: 0,
        }
    }
}

impl Nv12Uniforms {
    /// Create uniforms with specified parameters
    pub fn new(width: u32, height: u32, color_space: ColorSpace) -> Self {
        Self {
            output_size: [width as f32, height as f32],
            color_space: color_space as u32,
            _padding: 0,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_color_space_from_ffmpeg() {
        assert_eq!(ColorSpace::from_ffmpeg(1), ColorSpace::Bt709);
        assert_eq!(ColorSpace::from_ffmpeg(5), ColorSpace::Bt601);
        assert_eq!(ColorSpace::from_ffmpeg(6), ColorSpace::Bt601);
        assert_eq!(ColorSpace::from_ffmpeg(9), ColorSpace::Bt2020);
        assert_eq!(ColorSpace::from_ffmpeg(0), ColorSpace::Bt709); // Unknown defaults to BT.709
    }

    #[test]
    fn test_shader_contains_all_color_spaces() {
        assert!(NV12_TO_RGB_SHADER.contains("yuv_to_rgb_bt601"));
        assert!(NV12_TO_RGB_SHADER.contains("yuv_to_rgb_bt709"));
        assert!(NV12_TO_RGB_SHADER.contains("yuv_to_rgb_bt2020"));
    }

    #[test]
    fn test_uniforms_size() {
        // Ensure uniform struct is 16 bytes (vec2 + u32 + u32)
        assert_eq!(std::mem::size_of::<Nv12Uniforms>(), 16);
    }
}
