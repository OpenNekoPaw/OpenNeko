//! RGBA to NV12 Texture Conversion - Dual Render Pass Pipeline for zero-copy encoding
//!
//! This module provides GPU-accelerated RGBA to NV12 conversion using two separate
//! render passes for Y and UV planes (due to wgpu MRT size limitations).
//!
//! Architecture (Dual Render Pass Pipeline):
//! - Pass 1: RGBA → Y plane (R8Unorm, full resolution)
//! - Pass 2: RGBA → UV plane (RG8Unorm, half resolution with 2x2 averaging)
//! - Hardware ROP handles f32 → u8 quantization automatically
//! - IOSurface is shared directly with VideoToolbox for encoding
//!
//! Pipeline:
//! 1. Input: RGBA texture from compositor
//! 2. Render Pass 1: RGBA → Y (R8Unorm) at full resolution
//! 3. Render Pass 2: RGBA → UV (RG8Unorm) at half resolution
//! 4. Output: IOSurface textures ready for VideoToolbox
//!
//! Note: wgpu doesn't support different-sized MRT attachments, so we use two passes.
//! This is still efficient as both passes share the same input texture binding.

use crate::error::{GpuError as Error, GpuResult as Result};
use crate::{DefaultPlatformGpuMediaBridge, GpuContext, PlatformGpuMediaBridge};
use neko_engine_types::{GpuFrameKeepAlive, GpuOutputHandle};
use std::collections::VecDeque;
use std::sync::Arc;

#[cfg(target_os = "macos")]
use super::macos_export::{IOSurfaceBackingStore, MacOsTextureExporter};

/// Y Plane Render Shader - outputs luminance at full resolution
pub const RGBA_TO_Y_SHADER: &str = r#"
// Y Plane Render Shader
// Converts RGBA to Y (luminance) at full resolution
//
// NOTE: No gamma correction is applied here because:
// 1. NV12→RGB import does NOT apply sRGB→linear conversion
// 2. The compositor processes sRGB data (stored in Rgba16Float for precision)
// 3. Applying linear→sRGB here would double-gamma the output
//
// Output is LIMITED RANGE (TV range): Y = 16-235
// This matches the import shader which expects limited range input

struct Uniforms {
    output_width: f32,
    output_height: f32,
    // Color space: 0 = BT.601, 1 = BT.709, 2 = BT.2020
    color_space: u32,
    _padding: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Fullscreen triangle vertex shader
// Uses oversized triangle that covers entire viewport when clipped
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    // Fullscreen triangle: v0=(-1,-1), v1=(3,-1), v2=(-1,3)
    var pos: vec2<f32>;
    var uv: vec2<f32>;
    switch vertex_index {
        case 0u: { pos = vec2<f32>(-1.0, -1.0); uv = vec2<f32>(0.0, 1.0); }
        case 1u: { pos = vec2<f32>(3.0, -1.0); uv = vec2<f32>(2.0, 1.0); }
        case 2u: { pos = vec2<f32>(-1.0, 3.0); uv = vec2<f32>(0.0, -1.0); }
        default: { pos = vec2<f32>(0.0, 0.0); uv = vec2<f32>(0.0, 0.0); }
    }
    out.position = vec4<f32>(pos, 0.0, 1.0);
    out.uv = uv;
    return out;
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var input_texture: texture_2d<f32>;
@group(0) @binding(2) var input_sampler: sampler;

// BT.601 RGB to Y (SD video) - outputs full range 0-1
fn rgb_to_y_bt601(rgb: vec3<f32>) -> f32 {
    return 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
}

// BT.709 RGB to Y (HD video) - outputs full range 0-1
fn rgb_to_y_bt709(rgb: vec3<f32>) -> f32 {
    return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

// BT.2020 RGB to Y (UHD video) - outputs full range 0-1
fn rgb_to_y_bt2020(rgb: vec3<f32>) -> f32 {
    return 0.2627 * rgb.r + 0.6780 * rgb.g + 0.0593 * rgb.b;
}

fn rgb_to_y(rgb: vec3<f32>, color_space: u32) -> f32 {
    switch color_space {
        case 0u: { return rgb_to_y_bt601(rgb); }
        case 2u: { return rgb_to_y_bt2020(rgb); }
        default: { return rgb_to_y_bt709(rgb); }
    }
}

// Convert full range Y (0-1) to limited range (16-235)
// Output is normalized 0-1 for R8Unorm texture (will be stored as 0-255)
fn full_to_limited_y(y: f32) -> f32 {
    // Y_limited = 16 + Y_full * 219
    // Normalized: Y_limited / 255 = (16 + Y_full * 219) / 255
    return (16.0 + y * 219.0) / 255.0;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) f32 {
    // Use textureLoad for unfilterable Rgba16Float
    let tex_size = textureDimensions(input_texture);
    let tex_coord = vec2<i32>(in.uv * vec2<f32>(tex_size));
    let rgba = textureLoad(input_texture, tex_coord, 0);

    // Input is already sRGB (no gamma correction needed)
    // The NV12→RGB import outputs sRGB, compositor preserves it
    let rgb = clamp(rgba.rgb, vec3<f32>(0.0), vec3<f32>(1.0));

    // Calculate full range Y
    let y_full = rgb_to_y(rgb, uniforms.color_space);

    // Convert to limited range for video encoding
    return full_to_limited_y(y_full);
}
"#;

/// UV Plane Render Shader - outputs chrominance at half resolution with 2x2 averaging
pub const RGBA_TO_UV_SHADER: &str = r#"
// UV Plane Render Shader
// Converts RGBA to UV (chrominance) at half resolution
// Each output pixel averages a 2x2 block from the input
//
// NOTE: No gamma correction is applied here because:
// 1. NV12→RGB import does NOT apply sRGB→linear conversion
// 2. The compositor processes sRGB data (stored in Rgba16Float for precision)
// 3. Applying linear→sRGB here would double-gamma the output
//
// Output is LIMITED RANGE (TV range): UV = 16-240, centered at 128
// This matches the import shader which expects limited range input

struct Uniforms {
    output_width: f32,   // Full resolution width
    output_height: f32,  // Full resolution height
    // Color space: 0 = BT.601, 1 = BT.709, 2 = BT.2020
    color_space: u32,
    _padding: u32,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Fullscreen triangle vertex shader
// Uses oversized triangle that covers entire viewport when clipped
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    // Fullscreen triangle: v0=(-1,-1), v1=(3,-1), v2=(-1,3)
    var pos: vec2<f32>;
    var uv: vec2<f32>;
    switch vertex_index {
        case 0u: { pos = vec2<f32>(-1.0, -1.0); uv = vec2<f32>(0.0, 1.0); }
        case 1u: { pos = vec2<f32>(3.0, -1.0); uv = vec2<f32>(2.0, 1.0); }
        case 2u: { pos = vec2<f32>(-1.0, 3.0); uv = vec2<f32>(0.0, -1.0); }
        default: { pos = vec2<f32>(0.0, 0.0); uv = vec2<f32>(0.0, 0.0); }
    }
    out.position = vec4<f32>(pos, 0.0, 1.0);
    out.uv = uv;
    return out;
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var input_texture: texture_2d<f32>;
@group(0) @binding(2) var input_sampler: sampler;

// BT.601 RGB to UV (SD video) - outputs centered at 0.5 (full range)
fn rgb_to_uv_bt601(rgb: vec3<f32>) -> vec2<f32> {
    let u = -0.169 * rgb.r - 0.331 * rgb.g + 0.500 * rgb.b;
    let v = 0.500 * rgb.r - 0.419 * rgb.g - 0.081 * rgb.b;
    return vec2<f32>(u, v);  // Range: -0.5 to 0.5
}

// BT.709 RGB to UV (HD video) - outputs centered at 0 (full range)
fn rgb_to_uv_bt709(rgb: vec3<f32>) -> vec2<f32> {
    let u = -0.1146 * rgb.r - 0.3854 * rgb.g + 0.5000 * rgb.b;
    let v = 0.5000 * rgb.r - 0.4542 * rgb.g - 0.0458 * rgb.b;
    return vec2<f32>(u, v);  // Range: -0.5 to 0.5
}

// BT.2020 RGB to UV (UHD video) - outputs centered at 0 (full range)
fn rgb_to_uv_bt2020(rgb: vec3<f32>) -> vec2<f32> {
    let u = -0.1396 * rgb.r - 0.3604 * rgb.g + 0.5000 * rgb.b;
    let v = 0.5000 * rgb.r - 0.4598 * rgb.g - 0.0402 * rgb.b;
    return vec2<f32>(u, v);  // Range: -0.5 to 0.5
}

fn rgb_to_uv(rgb: vec3<f32>, color_space: u32) -> vec2<f32> {
    switch color_space {
        case 0u: { return rgb_to_uv_bt601(rgb); }
        case 2u: { return rgb_to_uv_bt2020(rgb); }
        default: { return rgb_to_uv_bt709(rgb); }
    }
}

// Convert full range UV (-0.5 to 0.5) to limited range (16-240, centered at 128)
// Output is normalized 0-1 for RG8Unorm texture (will be stored as 0-255)
fn full_to_limited_uv(uv: vec2<f32>) -> vec2<f32> {
    // UV_limited = 128 + UV_full * 224
    // Normalized: UV_limited / 255 = (128 + UV_full * 224) / 255
    return (vec2<f32>(128.0) + uv * 224.0) / 255.0;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec2<f32> {
    // Use textureLoad for unfilterable Rgba16Float
    let tex_size = textureDimensions(input_texture);

    // Calculate base texel coordinate (UV texture is half resolution, so multiply by 2)
    let base_coord = vec2<i32>(in.uv * vec2<f32>(tex_size));

    // Sample 2x2 block using textureLoad
    let rgba00 = textureLoad(input_texture, base_coord, 0);
    let rgba10 = textureLoad(input_texture, base_coord + vec2<i32>(1, 0), 0);
    let rgba01 = textureLoad(input_texture, base_coord + vec2<i32>(0, 1), 0);
    let rgba11 = textureLoad(input_texture, base_coord + vec2<i32>(1, 1), 0);

    // Input is already sRGB (no gamma correction needed)
    let rgb00 = clamp(rgba00.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let rgb10 = clamp(rgba10.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let rgb01 = clamp(rgba01.rgb, vec3<f32>(0.0), vec3<f32>(1.0));
    let rgb11 = clamp(rgba11.rgb, vec3<f32>(0.0), vec3<f32>(1.0));

    // Convert each to UV (full range, centered at 0) and average
    let uv00 = rgb_to_uv(rgb00, uniforms.color_space);
    let uv10 = rgb_to_uv(rgb10, uniforms.color_space);
    let uv01 = rgb_to_uv(rgb01, uniforms.color_space);
    let uv11 = rgb_to_uv(rgb11, uniforms.color_space);

    let uv_avg = (uv00 + uv10 + uv01 + uv11) * 0.25;

    // Convert to limited range for video encoding
    return full_to_limited_uv(uv_avg);
}
"#;

/// Uniform buffer for RGBA to NV12 render pipeline
#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct RgbaToNv12RenderUniforms {
    pub output_width: f32,
    pub output_height: f32,
    pub color_space: u32,
    pub _padding: u32,
}

/// Per-frame RGBA->NV12 bridge diagnostics.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct RgbaToNv12TextureConvertStats {
    pub iosurface_creations: u64,
    pub gpu_wait_time_ms: f32,
    pub reused_backing: bool,
    pub transient_backing: bool,
}

/// GPU RGBA to NV12 texture converter for zero-copy encoding
///
/// This converter uses a **Dual Render Pass Pipeline** for Y and UV planes
/// (due to wgpu not supporting different-sized MRT attachments).
///
/// Architecture (Dual Render Pass Pipeline):
/// - Pass 1: RGBA → Y plane (R8Unorm, full resolution)
/// - Pass 2: RGBA → UV plane (RG8Unorm, half resolution with 2x2 averaging)
/// - Hardware ROP handles f32 → u8 quantization automatically
/// - Staging textures → Metal blit → IOSurface (avoids wgpu HAL issues)
///
/// Pipeline:
/// 1. Render Pass 1: RGBA → Y (R8Unorm) at full resolution
/// 2. Render Pass 2: RGBA → UV (RG8Unorm) at half resolution
/// 3. Direct rendering to IOSurface-backed textures (true zero-copy)
/// 4. IOSurface ready for VideoToolbox encoding
#[cfg(target_os = "macos")]
pub struct RgbaToNv12TextureConverter {
    ctx: Arc<GpuContext>,
    /// Y plane render pipeline (RGBA → Y at full resolution)
    y_render_pipeline: wgpu::RenderPipeline,
    /// UV plane render pipeline (RGBA → UV at half resolution)
    uv_render_pipeline: wgpu::RenderPipeline,
    /// Shared bind group layout for both pipelines
    render_bind_group_layout: wgpu::BindGroupLayout,
    uniform_buffer: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// Cached texture dimensions
    texture_size: (u32, u32),
    /// Number of IOSurface backing stores created by this converter.
    iosurface_creations: u64,
    /// IOSurface exporter
    exporter: MacOsTextureExporter,
    /// Platform bridge for encoder handle wrapping and capability reporting.
    bridge: DefaultPlatformGpuMediaBridge,
    /// Ring of persistent IOSurface backing stores.
    ///
    /// VideoToolbox may consume the previous frame asynchronously after
    /// `send_frame()` returns. A small ring prevents the next render from
    /// overwriting the same IOSurface while the encoder still references it.
    output_backings: VecDeque<Arc<IOSurfaceBackingStore>>,
}

const ENCODER_BACKING_RING_SIZE: usize = 6;

#[cfg(target_os = "macos")]
impl RgbaToNv12TextureConverter {
    /// Create a new RGBA to NV12 texture converter using dual render pass pipeline
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // ========== Shared Bind Group Layout ==========
        let render_bind_group_layout =
            device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
                label: Some("RGBA to NV12 Render Bind Group Layout"),
                entries: &[
                    // Uniforms
                    wgpu::BindGroupLayoutEntry {
                        binding: 0,
                        visibility: wgpu::ShaderStages::VERTEX | wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Buffer {
                            ty: wgpu::BufferBindingType::Uniform,
                            has_dynamic_offset: false,
                            min_binding_size: None,
                        },
                        count: None,
                    },
                    // Input RGBA texture (use unfilterable for Rgba16Float compatibility)
                    wgpu::BindGroupLayoutEntry {
                        binding: 1,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Texture {
                            sample_type: wgpu::TextureSampleType::Float { filterable: false },
                            view_dimension: wgpu::TextureViewDimension::D2,
                            multisampled: false,
                        },
                        count: None,
                    },
                    // Sampler (non-filtering for unfilterable texture)
                    wgpu::BindGroupLayoutEntry {
                        binding: 2,
                        visibility: wgpu::ShaderStages::FRAGMENT,
                        ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::NonFiltering),
                        count: None,
                    },
                ],
            });

        let render_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("RGBA to NV12 Render Pipeline Layout"),
                bind_group_layouts: &[&render_bind_group_layout],
                push_constant_ranges: &[],
            });

        // ========== Y Plane Render Pipeline ==========
        let y_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("RGBA to Y Shader"),
            source: wgpu::ShaderSource::Wgsl(RGBA_TO_Y_SHADER.into()),
        });

        let y_render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("RGBA to Y Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &y_shader,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &y_shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::R8Unorm,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        // ========== UV Plane Render Pipeline ==========
        let uv_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("RGBA to UV Shader"),
            source: wgpu::ShaderSource::Wgsl(RGBA_TO_UV_SHADER.into()),
        });

        let uv_render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("RGBA to UV Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &uv_shader,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &uv_shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rg8Unorm,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: None,
                unclipped_depth: false,
                polygon_mode: wgpu::PolygonMode::Fill,
                conservative: false,
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
        });

        // ========== Shared Resources ==========
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("RGBA to NV12 Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Nearest,
            min_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("RGBA to NV12 Uniforms"),
            size: std::mem::size_of::<RgbaToNv12RenderUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // IOSurface exporter
        let exporter = MacOsTextureExporter::new(ctx.clone())?;
        let bridge = DefaultPlatformGpuMediaBridge::new(Arc::clone(&ctx));

        tracing::info!("RGBA to NV12 texture converter initialized (Dual Render Pass Pipeline)");

        Ok(Self {
            ctx,
            y_render_pipeline,
            uv_render_pipeline,
            render_bind_group_layout,
            uniform_buffer,
            sampler,
            texture_size: (0, 0),
            iosurface_creations: 0,
            exporter,
            bridge,
            output_backings: VecDeque::with_capacity(ENCODER_BACKING_RING_SIZE),
        })
    }

    /// Convert RGBA texture to NV12 and return IOSurface handle
    ///
    /// This is the main entry point for zero-copy encoding.
    /// Returns the IOSurface handle that can be passed directly to VideoToolbox.
    ///
    /// Pipeline (True Zero-Copy - Direct Render to IOSurface):
    /// 1. Render Pass 1: RGBA → IOSurface Y texture (full resolution)
    /// 2. Render Pass 2: RGBA → IOSurface UV texture (half resolution)
    /// 3. Synchronize IOSurface for VideoToolbox
    ///
    /// No CPU intermediate copy - render output goes directly to IOSurface.
    pub fn convert_to_iosurface(
        &mut self,
        input_texture: &wgpu::TextureView,
        width: u32,
        height: u32,
        color_space: u32,
    ) -> Result<usize> {
        self.convert_to_encoder_handle(input_texture, width, height, color_space)?
            .native_encoder_handle()
            .map_err(|error| Error::UnsupportedCapability(error.to_string()))
    }

    /// Convert RGBA texture to an encoder-ready platform handle.
    pub fn convert_to_encoder_handle(
        &mut self,
        input_texture: &wgpu::TextureView,
        width: u32,
        height: u32,
        color_space: u32,
    ) -> Result<GpuOutputHandle> {
        self.convert_to_encoder_handle_with_owner(input_texture, width, height, color_space)
            .map(|(handle, _backing, _stats)| handle)
    }

    /// Convert RGBA texture to an encoder-ready platform handle and retain the
    /// IOSurface owner for the returned frame lease.
    pub fn convert_to_encoder_handle_with_owner(
        &mut self,
        input_texture: &wgpu::TextureView,
        width: u32,
        height: u32,
        color_space: u32,
    ) -> Result<(
        GpuOutputHandle,
        Arc<dyn GpuFrameKeepAlive>,
        RgbaToNv12TextureConvertStats,
    )> {
        let (backing, retain_for_reuse, reused_backing) =
            self.acquire_output_backing(width, height)?;

        let (iosurface_y, iosurface_uv) = backing.import_as_render_targets(self.ctx.device())?;

        let uniforms = RgbaToNv12RenderUniforms {
            output_width: width as f32,
            output_height: height as f32,
            color_space,
            _padding: 0,
        };
        self.ctx
            .queue()
            .write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&uniforms));

        let y_view = iosurface_y.create_view(&wgpu::TextureViewDescriptor::default());
        let uv_view = iosurface_uv.create_view(&wgpu::TextureViewDescriptor::default());

        let bind_group = self
            .ctx
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("RGBA to NV12 Render Bind Group"),
                layout: &self.render_bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: self.uniform_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::TextureView(input_texture),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::Sampler(&self.sampler),
                    },
                ],
            });

        let mut encoder =
            self.ctx
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("RGBA to NV12 Direct Render Encoder"),
                });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("RGBA to Y (IOSurface Direct)"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &y_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLACK),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&self.y_render_pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1);
        }

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("RGBA to UV (IOSurface Direct)"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &uv_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.5,
                            g: 0.5,
                            b: 0.0,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&self.uv_render_pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1);
        }

        let wait_started = std::time::Instant::now();
        let submission = self.ctx.queue().submit(std::iter::once(encoder.finish()));
        self.ctx.device().poll(wgpu::Maintain::wait_for(submission));
        let gpu_wait_time_ms = wait_started.elapsed().as_secs_f32() * 1000.0;

        let handle = self
            .bridge
            .export_encoder_handle(backing.io_surface_handle(), width, height)
            .inspect_err(|_error| {
                if retain_for_reuse {
                    self.output_backings.push_back(Arc::clone(&backing));
                }
            })?;

        if retain_for_reuse {
            self.output_backings.push_back(Arc::clone(&backing));
        }

        Ok((
            handle,
            backing as Arc<dyn GpuFrameKeepAlive>,
            RgbaToNv12TextureConvertStats {
                iosurface_creations: self.iosurface_creations,
                gpu_wait_time_ms,
                reused_backing,
                transient_backing: !retain_for_reuse,
            },
        ))
    }

    /// Get the cached output texture dimensions
    #[allow(dead_code)]
    pub fn cached_dimensions(&self) -> Option<(u32, u32)> {
        (!self.output_backings.is_empty()).then_some(self.texture_size)
    }

    fn acquire_output_backing(
        &mut self,
        width: u32,
        height: u32,
    ) -> Result<(Arc<IOSurfaceBackingStore>, bool, bool)> {
        if self.texture_size != (width, height) {
            self.output_backings.clear();
            self.texture_size = (width, height);
        }

        if let Some(index) = self
            .output_backings
            .iter()
            .position(|backing| Arc::strong_count(backing) == 1)
        {
            let backing = self
                .output_backings
                .remove(index)
                .ok_or_else(|| Error::Other("IOSurface backing ring index vanished".to_string()))?;
            return Ok((backing, true, true));
        }

        let backing = Arc::new(self.exporter.create_backing_store(width, height)?);
        self.iosurface_creations = self.iosurface_creations.saturating_add(1);
        let retain_for_reuse = self.output_backings.len() < ENCODER_BACKING_RING_SIZE;
        if retain_for_reuse {
            tracing::info!(
                "Created IOSurface backing store for true zero-copy: {}x{} ({}/{})",
                width,
                height,
                self.output_backings.len() + 1,
                ENCODER_BACKING_RING_SIZE
            );
        } else {
            tracing::debug!(
                "Created transient IOSurface backing store because all reusable surfaces are busy: {}x{}",
                width,
                height
            );
        }
        Ok((backing, retain_for_reuse, false))
    }
}

/// Stub implementation for non-macOS platforms
#[cfg(not(target_os = "macos"))]
pub struct RgbaToNv12TextureConverter {
    _ctx: Arc<GpuContext>,
}

#[cfg(not(target_os = "macos"))]
impl RgbaToNv12TextureConverter {
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Err(Error::Other(
            "Zero-copy texture conversion only supported on macOS".to_string(),
        ))
    }

    pub fn convert_to_iosurface(
        &mut self,
        _input_texture: &wgpu::TextureView,
        _width: u32,
        _height: u32,
        _color_space: u32,
    ) -> Result<usize> {
        Err(Error::Other(
            "Zero-copy texture conversion only supported on macOS".to_string(),
        ))
    }

    pub fn convert_to_encoder_handle(
        &mut self,
        _input_texture: &wgpu::TextureView,
        _width: u32,
        _height: u32,
        _color_space: u32,
    ) -> Result<GpuOutputHandle> {
        Err(Error::UnsupportedCapability(format!(
            "zero-copy NV12 encoder bridge is not implemented on {}",
            std::env::consts::OS
        )))
    }

    pub fn convert_to_encoder_handle_with_owner(
        &mut self,
        _input_texture: &wgpu::TextureView,
        _width: u32,
        _height: u32,
        _color_space: u32,
    ) -> Result<(
        GpuOutputHandle,
        Arc<dyn GpuFrameKeepAlive>,
        RgbaToNv12TextureConvertStats,
    )> {
        Err(Error::UnsupportedCapability(format!(
            "zero-copy NV12 encoder bridge is not implemented on {}",
            std::env::consts::OS
        )))
    }

    pub fn cached_dimensions(&self) -> Option<(u32, u32)> {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uniforms_size() {
        assert_eq!(std::mem::size_of::<RgbaToNv12RenderUniforms>(), 16);
    }
}
