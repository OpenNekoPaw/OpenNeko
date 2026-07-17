//! Texture-based Transition Processor
//!
//! GPU render pipeline implementation for video transition effects.
//! Uses texture_2d bindings (zero-copy) instead of storage buffers.
//!
//! This replaces the buffer-based `GpuTransitionProcessor` in the new
//! `GpuExportPipeline` / preview pipeline, reusing the existing
//! `transitions.wgsl` function library.

use super::context::GpuContext;
use super::transition_processor::TransitionParams;
use crate::error::GpuResult as Result;

use std::sync::Arc;

/// Dispatch shader for texture-based transitions.
///
/// Assembled at runtime as: COMMON_WGSL + TRANSITIONS_WGSL + this dispatch code.
/// The vertex shader uses the fullscreen triangle pattern (no vertex buffers).
/// The fragment shader dispatches to transition functions based on transition_type.
const TEXTURE_TRANSITION_DISPATCH: &str = r#"
// Texture-based Transition Dispatch Shader
// Bindings: uniform params, from_texture, to_texture, sampler

struct TransitionUniforms {
    transition_type: u32,
    progress: f32,
    feather: f32,
    center_x: f32,
    center_y: f32,
    angle: f32,
    param1: f32,
    param2: f32,
}

@group(0) @binding(0) var<uniform> uniforms: TransitionUniforms;
@group(0) @binding(1) var from_texture: texture_2d<f32>;
@group(0) @binding(2) var to_texture: texture_2d<f32>;
@group(0) @binding(3) var tex_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    // Fullscreen triangle
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

// Transition type constants (must match TransitionType enum in Rust)
const TRANS_FADE: u32 = 0u;
const TRANS_WIPE_LEFT: u32 = 1u;
const TRANS_WIPE_RIGHT: u32 = 2u;
const TRANS_WIPE_UP: u32 = 3u;
const TRANS_WIPE_DOWN: u32 = 4u;
const TRANS_IRIS_CIRCLE: u32 = 5u;
const TRANS_IRIS_RECTANGLE: u32 = 6u;
const TRANS_CLOCK: u32 = 7u;
const TRANS_SLIDE_LEFT: u32 = 8u;
const TRANS_SLIDE_RIGHT: u32 = 9u;
const TRANS_ZOOM_IN: u32 = 10u;
const TRANS_ZOOM_OUT: u32 = 11u;
const TRANS_DISSOLVE: u32 = 12u;
const TRANS_PIXELATE: u32 = 13u;
const TRANS_RIPPLE: u32 = 14u;
const TRANS_SWIRL: u32 = 15u;
const TRANS_GLITCH: u32 = 16u;
const TRANS_FLASH: u32 = 17u;

// Noise function for dissolve effect
fn hash(p: vec2<f32>) -> f32 {
    return fract(sin(dot(p, vec2<f32>(12.9898, 78.233))) * 43758.5453);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
    let uv = input.uv;
    let from_color = textureSample(from_texture, tex_sampler, uv);
    let to_color = textureSample(to_texture, tex_sampler, uv);
    let center = vec2<f32>(uniforms.center_x, uniforms.center_y);
    let progress = uniforms.progress;
    let feather = uniforms.feather;

    switch uniforms.transition_type {
        // Basic fade
        case TRANS_FADE: {
            return transition_fade(from_color, to_color, progress);
        }

        // Wipe transitions (return mix factor)
        case TRANS_WIPE_LEFT: {
            let f = transition_wipe_left(uv, progress, feather);
            return mix_transition(from_color, to_color, f);
        }
        case TRANS_WIPE_RIGHT: {
            let f = transition_wipe_right(uv, progress, feather);
            return mix_transition(from_color, to_color, f);
        }
        case TRANS_WIPE_UP: {
            let f = transition_wipe_up(uv, progress, feather);
            return mix_transition(from_color, to_color, f);
        }
        case TRANS_WIPE_DOWN: {
            let f = transition_wipe_down(uv, progress, feather);
            return mix_transition(from_color, to_color, f);
        }

        // Iris transitions
        case TRANS_IRIS_CIRCLE: {
            let f = transition_iris_circle(uv, progress, feather, center);
            return mix_transition(from_color, to_color, f);
        }
        case TRANS_IRIS_RECTANGLE: {
            let f = transition_iris_rectangle(uv, progress, feather, center);
            return mix_transition(from_color, to_color, f);
        }

        // Clock wipe
        case TRANS_CLOCK: {
            let f = transition_clock(uv, progress, feather, center, true);
            return mix_transition(from_color, to_color, f);
        }

        // Slide/push transitions (texture-aware, use transition_push)
        case TRANS_SLIDE_LEFT: {
            return transition_push(uv, progress, vec2<f32>(-1.0, 0.0), from_texture, to_texture, tex_sampler);
        }
        case TRANS_SLIDE_RIGHT: {
            return transition_push(uv, progress, vec2<f32>(1.0, 0.0), from_texture, to_texture, tex_sampler);
        }

        // Zoom transitions (UV offset → sample → blend)
        case TRANS_ZOOM_IN: {
            let distorted_uv = transition_zoom_in(uv, progress, center);
            let from_distorted = textureSample(from_texture, tex_sampler, distorted_uv);
            return mix(from_distorted, to_color, progress);
        }
        case TRANS_ZOOM_OUT: {
            let distorted_uv = transition_zoom_out(uv, progress, center);
            let from_distorted = textureSample(from_texture, tex_sampler, distorted_uv);
            return mix(from_distorted, to_color, progress);
        }

        // Dissolve (noise-based threshold)
        case TRANS_DISSOLVE: {
            let noise = hash(uv * 100.0);
            let f = smoothstep(progress - feather * 0.5, progress + feather * 0.5, noise);
            return mix(to_color, from_color, f);
        }

        // Pixelate (UV quantization → blend)
        case TRANS_PIXELATE: {
            let max_pixels = select(uniforms.param1, 20.0, uniforms.param1 <= 0.0);
            let quantized_uv = transition_pixelate(uv, progress, max_pixels);
            let from_pixelated = textureSample(from_texture, tex_sampler, quantized_uv);
            let to_pixelated = textureSample(to_texture, tex_sampler, quantized_uv);
            return mix(from_pixelated, to_pixelated, progress);
        }

        // Ripple (UV distortion → blend)
        case TRANS_RIPPLE: {
            let frequency = select(uniforms.param1, 10.0, uniforms.param1 <= 0.0);
            let amplitude = select(uniforms.param2, 0.03, uniforms.param2 <= 0.0);
            let distorted_uv = transition_ripple(uv, progress, center, frequency, amplitude);
            let from_rippled = textureSample(from_texture, tex_sampler, distorted_uv);
            return mix(from_rippled, to_color, progress);
        }

        // Swirl (UV rotation distortion → blend)
        case TRANS_SWIRL: {
            let max_angle = select(uniforms.param1, 3.0, uniforms.param1 <= 0.0);
            let distorted_uv = transition_swirl(uv, progress, center, max_angle);
            let from_swirled = textureSample(from_texture, tex_sampler, distorted_uv);
            return mix(from_swirled, to_color, progress);
        }

        // Glitch (horizontal UV offset → blend)
        case TRANS_GLITCH: {
            let intensity = select(uniforms.param1, 1.0, uniforms.param1 <= 0.0);
            let seed = select(uniforms.param2, 42.0, uniforms.param2 <= 0.0);
            let distorted_uv = transition_glitch(uv, progress, intensity, seed);
            let from_glitched = textureSample(from_texture, tex_sampler, distorted_uv);
            return mix(from_glitched, to_color, progress);
        }

        // Flash (white flash overlay)
        case TRANS_FLASH: {
            return transition_flash(from_color, to_color, progress, vec3<f32>(1.0, 1.0, 1.0));
        }

        // Default: fade
        default: {
            return transition_fade(from_color, to_color, progress);
        }
    }
}
"#;

/// Texture-based transition processor using render pipeline.
///
/// Takes two `Rgba16Float` textures (from/to) and produces a blended output.
/// Reuses `transitions.wgsl` function library for all 18 transition effects.
pub struct TextureTransitionProcessor {
    ctx: Arc<GpuContext>,
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    uniform_buffer: wgpu::Buffer,
    sampler: wgpu::Sampler,
}

impl TextureTransitionProcessor {
    /// Create a new texture-based transition processor.
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Assemble full shader: common utils + transition functions + dispatch
        let shader_source = format!(
            "{}\n{}\n{}",
            super::shaders::COMMON_WGSL,
            super::shaders::TRANSITIONS_WGSL,
            TEXTURE_TRANSITION_DISPATCH
        );

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Texture Transition Shader"),
            source: wgpu::ShaderSource::Wgsl(shader_source.into()),
        });

        // Bind group layout: uniform + from_texture + to_texture + sampler
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Texture Transition Bind Group Layout"),
            entries: &[
                // Uniforms
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // From texture
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
                // To texture
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
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
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Texture Transition Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // Render pipeline — no blending (shader handles mixing internally)
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Texture Transition Pipeline"),
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

        // Reusable uniform buffer (TransitionParams is 32 bytes)
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Texture Transition Uniforms"),
            size: std::mem::size_of::<TransitionParams>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Bilinear sampler with clamp-to-edge
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("Texture Transition Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Nearest,
            ..Default::default()
        });

        Ok(Self {
            ctx,
            pipeline,
            bind_group_layout,
            uniform_buffer,
            sampler,
        })
    }

    /// Apply transition between two textures.
    ///
    /// Takes two canvas-sized `Rgba16Float` texture views and produces
    /// a blended output texture. The transition type and progress are
    /// specified in `params`.
    ///
    /// Returns `(output_texture, output_view)` — the caller owns the texture.
    pub fn apply_transition(
        &self,
        from_view: &wgpu::TextureView,
        to_view: &wgpu::TextureView,
        output_width: u32,
        output_height: u32,
        params: &TransitionParams,
    ) -> Result<(wgpu::Texture, wgpu::TextureView)> {
        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Create output texture (Rgba16Float, same as TextureCompositor)
        let output_texture = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("Transition Output"),
            size: wgpu::Extent3d {
                width: output_width,
                height: output_height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba16Float,
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT
                | wgpu::TextureUsages::TEXTURE_BINDING
                | wgpu::TextureUsages::COPY_SRC,
            view_formats: &[],
        });
        let output_view = output_texture.create_view(&wgpu::TextureViewDescriptor::default());

        // Short-circuit edge cases: progress ~0 or ~1
        if params.is_start() || params.is_end() {
            let source_view = if params.is_start() {
                from_view
            } else {
                to_view
            };
            // Blit source to output via a simple render pass with textureSample at uv
            self.blit_texture(source_view, &output_view, output_width, output_height);
            return Ok((output_texture, output_view));
        }

        // Write transition params to uniform buffer
        queue.write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(params));

        // Create per-frame bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Texture Transition Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(from_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(to_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });

        // Execute render pass
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Texture Transition Encoder"),
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Texture Transition Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &output_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1); // Fullscreen triangle
        }

        queue.submit(std::iter::once(encoder.finish()));

        Ok((output_texture, output_view))
    }

    /// Blit a source texture to the output using the transition pipeline with a fade at progress=0 or 1.
    fn blit_texture(
        &self,
        source_view: &wgpu::TextureView,
        output_view: &wgpu::TextureView,
        _output_width: u32,
        _output_height: u32,
    ) {
        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Use fade at progress=0 (returns from_color) or progress=1 (returns to_color)
        // For blit, we set both from and to to the same source
        let blit_params = TransitionParams::new(
            super::transition_processor::TransitionType::Fade,
            0.5, // Any value — from and to are the same texture
        );
        queue.write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&blit_params));

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Texture Transition Blit Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(source_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(source_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Texture Transition Blit Encoder"),
        });

        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Texture Transition Blit Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: output_view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::TRANSPARENT),
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

        queue.submit(std::iter::once(encoder.finish()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transition_params_uniform_alignment() {
        // TransitionParams is #[repr(C)] with 8 x f32/u32 = 32 bytes
        // Must be 16-byte aligned for uniform buffer
        let size = std::mem::size_of::<TransitionParams>();
        assert_eq!(size, 32);
        assert_eq!(size % 16, 0, "TransitionParams must be 16-byte aligned");
    }

    #[test]
    fn test_shader_assembly() {
        // Verify shader sources can be concatenated without issues
        let shader = format!(
            "{}\n{}\n{}",
            super::super::shaders::COMMON_WGSL,
            super::super::shaders::TRANSITIONS_WGSL,
            TEXTURE_TRANSITION_DISPATCH
        );
        assert!(shader.contains("fn transition_fade"));
        assert!(shader.contains("fn transition_push"));
        assert!(shader.contains("fn fs_main"));
        assert!(shader.contains("fn vs_main"));
        assert!(shader.contains("TRANS_FLASH"));
        // Verify no duplicate PI definition — COMMON_WGSL defines it,
        // transitions.wgsl and dispatch shader should not
        let pi_count = shader.matches("const PI:").count();
        assert_eq!(
            pi_count, 1,
            "PI should be defined exactly once (in common.wgsl)"
        );
    }
}
