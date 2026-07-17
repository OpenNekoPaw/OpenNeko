//! Texture Compositor - GPU texture-based multi-layer compositing
//!
//! Unlike the buffer-based compositor which copies pixel data to storage buffers,
//! this compositor works directly with GPU textures for true zero-copy compositing.
//!
//! Architecture:
//! - Each layer is a GPU texture (from hardware decoder or render target)
//! - Compositing is done using render pipeline with texture sampling
//! - Layers are composited one by one onto the output texture

use super::context::GpuContext;
use super::gpu_layer::GpuLayer;
use crate::error::GpuResult as Result;

use bytemuck::{Pod, Zeroable};
use std::sync::Arc;

/// Shader for texture-based compositing
const TEXTURE_COMPOSITE_SHADER: &str = r#"
// Texture-based layer compositing shader
// Uses render pipeline for proper GPU texture sampling

struct Uniforms {
    // Output dimensions
    output_width: f32,
    output_height: f32,
    // Source dimensions
    src_width: f32,
    src_height: f32,
    // Transform
    position_x: f32,
    position_y: f32,
    scale_x: f32,
    scale_y: f32,
    rotation: f32,       // radians
    anchor_x: f32,
    anchor_y: f32,
    // Compositing
    opacity: f32,
    blend_mode: u32,
    has_mask: u32,
    mask_inverted: u32,
    _padding: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var src_texture: texture_2d<f32>;
@group(0) @binding(2) var src_sampler: sampler;
@group(0) @binding(3) var mask_texture: texture_2d<f32>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Fullscreen triangle vertex shader
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

const PI: f32 = 3.14159265359;

// Blend mode constants
const BLEND_NORMAL: u32 = 0u;
const BLEND_MULTIPLY: u32 = 3u;
const BLEND_SCREEN: u32 = 8u;
const BLEND_OVERLAY: u32 = 12u;
const BLEND_SOFT_LIGHT: u32 = 13u;
const BLEND_HARD_LIGHT: u32 = 14u;
const BLEND_DIFFERENCE: u32 = 19u;
const BLEND_EXCLUSION: u32 = 20u;

// Inverse transform: output coord -> source coord
fn inverse_transform(out_pos: vec2<f32>) -> vec2<f32> {
    let cos_r = cos(uniforms.rotation);
    let sin_r = sin(uniforms.rotation);

    // Anchor point in source pixels
    let ax = uniforms.anchor_x * uniforms.src_width;
    let ay = uniforms.anchor_y * uniforms.src_height;

    // Inverse scale
    let inv_scale_x = 1.0 / uniforms.scale_x;
    let inv_scale_y = 1.0 / uniforms.scale_y;

    // Translate to origin (relative to layer position)
    let tx = out_pos.x - uniforms.position_x;
    let ty = out_pos.y - uniforms.position_y;

    // Inverse rotation
    let rx = tx * cos_r + ty * sin_r;
    let ry = -tx * sin_r + ty * cos_r;

    // Inverse scale and translate to anchor
    let src_x = rx * inv_scale_x + ax;
    let src_y = ry * inv_scale_y + ay;

    return vec2<f32>(src_x, src_y);
}

// Blend mode functions
fn blend_normal(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return blend;
}

fn blend_multiply(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return base * blend;
}

fn blend_screen(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return 1.0 - (1.0 - base) * (1.0 - blend);
}

fn blend_overlay(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r), 2.0 * base.r * blend.r, base.r < 0.5),
        select(1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g), 2.0 * base.g * blend.g, base.g < 0.5),
        select(1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b), 2.0 * base.b * blend.b, base.b < 0.5)
    );
}

fn soft_light_channel(base: f32, blend: f32) -> f32 {
    if (blend < 0.5) {
        return base - (1.0 - 2.0 * blend) * base * (1.0 - base);
    }
    let d = select(sqrt(base), ((16.0 * base - 12.0) * base + 4.0) * base, base <= 0.25);
    return base + (2.0 * blend - 1.0) * (d - base);
}

fn blend_soft_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        soft_light_channel(base.r, blend.r),
        soft_light_channel(base.g, blend.g),
        soft_light_channel(base.b, blend.b)
    );
}

fn blend_hard_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r), 2.0 * base.r * blend.r, blend.r < 0.5),
        select(1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g), 2.0 * base.g * blend.g, blend.g < 0.5),
        select(1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b), 2.0 * base.b * blend.b, blend.b < 0.5)
    );
}

fn blend_difference(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return abs(base - blend);
}

fn blend_exclusion(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return base + blend - 2.0 * base * blend;
}

fn apply_blend_mode(base: vec3<f32>, blend: vec3<f32>, mode: u32) -> vec3<f32> {
    switch (mode) {
        case BLEND_NORMAL: { return blend_normal(base, blend); }
        case BLEND_MULTIPLY: { return blend_multiply(base, blend); }
        case BLEND_SCREEN: { return blend_screen(base, blend); }
        case BLEND_OVERLAY: { return blend_overlay(base, blend); }
        case BLEND_SOFT_LIGHT: { return blend_soft_light(base, blend); }
        case BLEND_HARD_LIGHT: { return blend_hard_light(base, blend); }
        case BLEND_DIFFERENCE: { return blend_difference(base, blend); }
        case BLEND_EXCLUSION: { return blend_exclusion(base, blend); }
        default: { return blend; }
    }
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    // Convert UV (0-1) to output pixel coordinates
    let out_pos = vec2<f32>(
        input.uv.x * uniforms.output_width,
        input.uv.y * uniforms.output_height
    );

    // Transform to source coordinates
    let src_pos = inverse_transform(out_pos);

    // Bounds check
    if (src_pos.x < 0.0 || src_pos.x >= uniforms.src_width ||
        src_pos.y < 0.0 || src_pos.y >= uniforms.src_height) {
        discard;
    }

    // Sample source texture (normalize to 0-1 UV)
    let src_uv = vec2<f32>(
        src_pos.x / uniforms.src_width,
        src_pos.y / uniforms.src_height
    );
    var src_color = textureSample(src_texture, src_sampler, src_uv);

    // Apply mask if present
    if (uniforms.has_mask != 0u) {
        let mask_color = textureSample(mask_texture, src_sampler, src_uv);
        var mask_alpha = mask_color.r; // Use red channel as mask
        if (uniforms.mask_inverted != 0u) {
            mask_alpha = 1.0 - mask_alpha;
        }
        src_color.a = src_color.a * mask_alpha;
    }

    // Apply opacity
    src_color.a = src_color.a * uniforms.opacity;

    // For blend modes other than normal, we need the destination color
    // This is handled by the blend state in the render pipeline
    // The shader outputs premultiplied alpha

    return src_color;
}
"#;

/// Uniforms for texture compositor
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct TextureCompositorUniforms {
    output_width: f32,
    output_height: f32,
    src_width: f32,
    src_height: f32,
    position_x: f32,
    position_y: f32,
    scale_x: f32,
    scale_y: f32,
    rotation: f32,
    anchor_x: f32,
    anchor_y: f32,
    opacity: f32,
    blend_mode: u32,
    has_mask: u32,
    mask_inverted: u32,
    _padding: u32,
}

/// Composite result from texture compositor
#[derive(Debug)]
pub struct TextureCompositeResult {
    /// Output texture (RGBA)
    pub texture: wgpu::Texture,
    /// Output texture view
    pub view: wgpu::TextureView,
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Compositing time in milliseconds
    pub time_ms: f64,
    /// Number of layers composited
    pub layer_count: usize,
}

/// GPU texture-based compositor
///
/// This compositor uses render pipeline with texture sampling for
/// true zero-copy multi-layer compositing.
pub struct TextureCompositor {
    ctx: Arc<GpuContext>,
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    uniform_buffer: wgpu::Buffer,
    sampler: wgpu::Sampler,
    /// Dummy 1x1 texture for when mask is not used
    #[allow(dead_code)]
    dummy_texture: wgpu::Texture,
    dummy_view: wgpu::TextureView,
}

impl TextureCompositor {
    /// Create a new texture compositor
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Create shader module
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Texture Compositor Shader"),
            source: wgpu::ShaderSource::Wgsl(TEXTURE_COMPOSITE_SHADER.into()),
        });

        // Create bind group layout
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Texture Compositor Bind Group Layout"),
            entries: &[
                // Uniforms
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Source texture
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                // Sampler
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
                // Mask texture
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Texture Compositor Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // Create render pipeline with alpha blending
        // Use Rgba16Float for HDR support and to avoid color banding
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Texture Compositor Pipeline"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: "vs_main",
                buffers: &[],
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: "fs_main",
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba16Float,
                    blend: Some(wgpu::BlendState {
                        color: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::SrcAlpha,
                            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                            operation: wgpu::BlendOperation::Add,
                        },
                        alpha: wgpu::BlendComponent {
                            src_factor: wgpu::BlendFactor::One,
                            dst_factor: wgpu::BlendFactor::OneMinusSrcAlpha,
                            operation: wgpu::BlendOperation::Add,
                        },
                    }),
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

        // Create uniform buffer
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Texture Compositor Uniforms"),
            size: std::mem::size_of::<TextureCompositorUniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Create sampler with bilinear filtering
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Texture Compositor Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        // Create dummy 1x1 texture for when mask is not used
        let dummy_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Dummy Mask Texture"),
            size: wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let dummy_view = dummy_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Initialize dummy texture with white
        ctx.queue().write_texture(
            wgpu::ImageCopyTexture {
                texture: &dummy_texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &[255u8, 255, 255, 255],
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(4),
                rows_per_image: Some(1),
            },
            wgpu::Extent3d {
                width: 1,
                height: 1,
                depth_or_array_layers: 1,
            },
        );

        Ok(Self {
            ctx,
            pipeline,
            bind_group_layout,
            uniform_buffer,
            sampler,
            dummy_texture,
            dummy_view,
        })
    }

    /// Create an output texture (16-bit float for HDR support)
    pub fn create_output_texture(&self, width: u32, height: u32) -> wgpu::Texture {
        self.ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("Compositor Output"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            // Use Rgba16Float for HDR support and to avoid color banding
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        })
    }

    /// Composite multiple GPU layers
    ///
    /// Layers are composited in order (first = bottom, last = top).
    /// Returns the output texture.
    pub fn composite(
        &self,
        layers: &[&GpuLayer],
        output_width: u32,
        output_height: u32,
        background_color: [f32; 4],
    ) -> Result<TextureCompositeResult> {
        let start_time = std::time::Instant::now();

        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Create output texture
        let output_texture = self.create_output_texture(output_width, output_height);
        let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Create command encoder
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Texture Compositor Encoder"),
        });

        // Clear with background color
        {
            let _pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Clear Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &output_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: background_color[0] as f64,
                            g: background_color[1] as f64,
                            b: background_color[2] as f64,
                            a: background_color[3] as f64,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
        }

        // Sort layers by z_index
        let mut sorted_layers: Vec<_> = layers.iter().enumerate().collect();
        sorted_layers.sort_by_key(|(_, layer)| layer.z_index);

        // Composite each layer
        for (_, layer) in sorted_layers.iter() {
            self.composite_layer(
                &mut encoder,
                layer,
                &output_view,
                output_width,
                output_height,
            )?;
        }

        // Submit commands and wait for completion
        queue.submit(std::iter::once(encoder.finish()));
        self.ctx.device().poll(wgpu::Maintain::Wait);

        let elapsed = start_time.elapsed();

        Ok(TextureCompositeResult {
            texture: output_texture,
            view: output_view,
            width: output_width,
            height: output_height,
            time_ms: elapsed.as_secs_f64() * 1000.0,
            layer_count: layers.len(),
        })
    }

    /// Composite a single layer onto the output
    fn composite_layer(
        &self,
        encoder: &mut wgpu::CommandEncoder,
        layer: &GpuLayer,
        output_view: &wgpu::TextureView,
        output_width: u32,
        output_height: u32,
    ) -> Result<()> {
        let queue = self.ctx.queue();

        // Create uniforms
        let uniforms = TextureCompositorUniforms {
            output_width: output_width as f32,
            output_height: output_height as f32,
            src_width: layer.width as f32,
            src_height: layer.height as f32,
            position_x: layer.transform.x,
            position_y: layer.transform.y,
            scale_x: layer.transform.scale_x,
            scale_y: layer.transform.scale_y,
            rotation: layer.transform.rotation * std::f32::consts::PI / 180.0,
            anchor_x: layer.transform.anchor_x,
            anchor_y: layer.transform.anchor_y,
            opacity: layer.opacity,
            blend_mode: layer.blend_mode.shader_code(),
            has_mask: if layer.has_mask() { 1 } else { 0 },
            mask_inverted: if layer.is_mask_inverted() { 1 } else { 0 },
            _padding: 0,
        };

        // Update uniform buffer
        queue.write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&uniforms));

        // Get mask view
        let mask_view = layer
            .mask
            .as_ref()
            .map(|m| &m.view)
            .unwrap_or(&self.dummy_view);

        // Create bind group
        let bind_group = self
            .ctx
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Texture Compositor Bind Group"),
                layout: &self.bind_group_layout,
                entries: &[
                    wgpu::BindGroupEntry {
                        binding: 0,
                        resource: self.uniform_buffer.as_entire_binding(),
                    },
                    wgpu::BindGroupEntry {
                        binding: 1,
                        resource: wgpu::BindingResource::TextureView(&layer.view),
                    },
                    wgpu::BindGroupEntry {
                        binding: 2,
                        resource: wgpu::BindingResource::Sampler(&self.sampler),
                    },
                    wgpu::BindGroupEntry {
                        binding: 3,
                        resource: wgpu::BindingResource::TextureView(mask_view),
                    },
                ],
            });

        // Render pass
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Layer Composite Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: output_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load, // Preserve existing content
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1);
        }

        Ok(())
    }

    /// Read output texture to CPU (for encoding or testing)
    pub fn read_output_sync(&self, result: &TextureCompositeResult) -> Result<Vec<u8>> {
        self.ctx
            .read_texture_sync(&result.texture, result.width, result.height)
    }

    /// Get GPU context
    pub fn context(&self) -> &Arc<GpuContext> {
        &self.ctx
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uniforms_size() {
        // Ensure uniform struct is properly aligned (multiple of 16 bytes)
        let size = std::mem::size_of::<TextureCompositorUniforms>();
        assert_eq!(size % 16, 0, "Uniforms size must be 16-byte aligned");
    }
}
