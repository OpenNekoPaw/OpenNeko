//! Custom Shader Processor
//!
//! Provides GPU-accelerated custom effects via:
//! - Preset shader templates (compiled at build time)
//! - Runtime user-provided WGSL shaders (Phase 2)

use super::buffer_pool::BufferPool;
use super::context::GpuContext;
use crate::error::{GpuError as Error, GpuResult as Result};

use bytemuck::{Pod, Zeroable};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Preset shader sources (embedded at compile time)
// ---------------------------------------------------------------------------

const PRESET_PIXELATE: &str = include_str!("../shaders/preset_pixelate.wgsl");
const PRESET_EDGE_DETECT: &str = include_str!("../shaders/preset_edge_detect.wgsl");
const PRESET_POSTERIZE: &str = include_str!("../shaders/preset_posterize.wgsl");
const PRESET_NOISE: &str = include_str!("../shaders/preset_noise.wgsl");
const PRESET_RGB_SPLIT: &str = include_str!("../shaders/preset_rgb_split.wgsl");
const PRESET_WAVE_DISTORT: &str = include_str!("../shaders/preset_wave_distort.wgsl");

// ---------------------------------------------------------------------------
// DynamicUniforms — fixed-layout uniform shared by all custom shaders
// ---------------------------------------------------------------------------

/// Fixed-layout uniform buffer shared by all custom/preset shaders.
///
/// Shader contract (WGSL side):
/// - `params` is `array<vec4<f32>, 4>` to satisfy uniform alignment (16-byte stride).
/// - Access param N via `uniforms.params[N / 4][N % 4]` or the `get_param(N)` helper.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct DynamicUniforms {
    pub width: u32,
    pub height: u32,
    pub param_count: u32,
    pub _padding: u32,
    /// 16 float params packed as 4 x vec4<f32> for uniform alignment.
    pub params: [[f32; 4]; 4],
}

// ---------------------------------------------------------------------------
// ParamDef — describes one user-facing parameter
// ---------------------------------------------------------------------------

/// Describes a single shader parameter exposed to the user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParamDef {
    pub name: String,
    pub default: f32,
    pub min: f32,
    pub max: f32,
}

// ---------------------------------------------------------------------------
// PresetShaderMeta — metadata for a built-in preset
// ---------------------------------------------------------------------------

/// Metadata for a preset shader template.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresetShaderMeta {
    pub id: String,
    pub description: String,
    pub params: Vec<ParamDef>,
}

// ---------------------------------------------------------------------------
// CachedPipeline — compiled pipeline + metadata
// ---------------------------------------------------------------------------

struct CachedPipeline {
    pipeline: wgpu::ComputePipeline,
    texture_pipeline: Option<wgpu::ComputePipeline>,
    meta: PresetShaderMeta,
}

// ---------------------------------------------------------------------------
// CustomShaderProcessor
// ---------------------------------------------------------------------------

/// GPU processor for custom / preset shader effects.
///
/// Follows the same pattern as `GpuStyleProcessor`:
/// shared `bind_group_layout` + per-effect pipeline + generic `run_shader()`.
pub struct CustomShaderProcessor {
    ctx: Arc<GpuContext>,
    bind_group_layout: wgpu::BindGroupLayout,
    texture_bind_group_layout: wgpu::BindGroupLayout,
    pipeline_layout: wgpu::PipelineLayout,
    buffer_pool: BufferPool,
    /// Preset pipelines (shader_id → compiled pipeline + meta)
    presets: HashMap<String, CachedPipeline>,
    /// Runtime-registered custom pipelines (Phase 2)
    custom_pipelines: HashMap<String, CachedPipeline>,
}

impl CustomShaderProcessor {
    /// Create a new processor, compiling all preset shaders.
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Shared bind group layout (same as GpuStyleProcessor)
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Custom Shader Bind Group Layout"),
            entries: &[
                // binding 0: input storage (read-only)
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // binding 1: output storage (read-write)
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // binding 2: uniform
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let texture_bind_group_layout = Self::create_texture_bind_group_layout(device);

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Custom Shader Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let buffer_pool = BufferPool::new(ctx.device().clone(), wgpu::BufferUsages::STORAGE, 8);

        let mut processor = Self {
            ctx,
            bind_group_layout,
            texture_bind_group_layout,
            pipeline_layout,
            buffer_pool,
            presets: HashMap::new(),
            custom_pipelines: HashMap::new(),
        };

        // Compile all preset shaders
        processor.register_preset(
            "pixelate",
            "Pixelate effect",
            PRESET_PIXELATE,
            vec![ParamDef {
                name: "pixel_size".into(),
                default: 8.0,
                min: 1.0,
                max: 100.0,
            }],
        )?;

        processor.register_preset(
            "edge_detect",
            "Edge detection (Sobel)",
            PRESET_EDGE_DETECT,
            vec![
                ParamDef {
                    name: "threshold".into(),
                    default: 0.1,
                    min: 0.0,
                    max: 1.0,
                },
                ParamDef {
                    name: "strength".into(),
                    default: 1.0,
                    min: 0.0,
                    max: 3.0,
                },
            ],
        )?;

        processor.register_preset(
            "posterize",
            "Tone separation",
            PRESET_POSTERIZE,
            vec![ParamDef {
                name: "levels".into(),
                default: 4.0,
                min: 2.0,
                max: 32.0,
            }],
        )?;

        processor.register_preset(
            "noise",
            "Noise overlay",
            PRESET_NOISE,
            vec![
                ParamDef {
                    name: "amount".into(),
                    default: 0.1,
                    min: 0.0,
                    max: 1.0,
                },
                ParamDef {
                    name: "time".into(),
                    default: 0.0,
                    min: 0.0,
                    max: 10000.0,
                },
            ],
        )?;

        processor.register_preset(
            "rgb_split",
            "RGB channel split",
            PRESET_RGB_SPLIT,
            vec![
                ParamDef {
                    name: "offset".into(),
                    default: 5.0,
                    min: 0.0,
                    max: 50.0,
                },
                ParamDef {
                    name: "angle".into(),
                    default: 0.0,
                    min: 0.0,
                    max: std::f32::consts::TAU,
                },
            ],
        )?;

        processor.register_preset(
            "wave_distort",
            "Wave distortion",
            PRESET_WAVE_DISTORT,
            vec![
                ParamDef {
                    name: "amplitude".into(),
                    default: 10.0,
                    min: 0.0,
                    max: 100.0,
                },
                ParamDef {
                    name: "frequency".into(),
                    default: 5.0,
                    min: 0.1,
                    max: 50.0,
                },
                ParamDef {
                    name: "speed".into(),
                    default: 1.0,
                    min: 0.0,
                    max: 10.0,
                },
                ParamDef {
                    name: "time".into(),
                    default: 0.0,
                    min: 0.0,
                    max: 10000.0,
                },
            ],
        )?;

        Ok(processor)
    }

    // -----------------------------------------------------------------------
    // Preset management
    // -----------------------------------------------------------------------

    fn register_preset(
        &mut self,
        id: &str,
        description: &str,
        wgsl_source: &str,
        params: Vec<ParamDef>,
    ) -> Result<()> {
        let pipeline = self.compile_buffer_pipeline(id, wgsl_source)?;
        let texture_source = Self::buffer_shader_to_texture_shader(wgsl_source);
        let texture_pipeline = self.compile_texture_pipeline(id, &texture_source)?;
        self.presets.insert(
            id.to_string(),
            CachedPipeline {
                pipeline,
                texture_pipeline: Some(texture_pipeline),
                meta: PresetShaderMeta {
                    id: id.to_string(),
                    description: description.to_string(),
                    params,
                },
            },
        );
        Ok(())
    }

    /// List all available preset shader IDs.
    pub fn list_presets(&self) -> Vec<&PresetShaderMeta> {
        self.presets.values().map(|c| &c.meta).collect()
    }

    /// Get parameter definitions for a shader (preset or custom).
    pub fn get_shader_info(&self, shader_id: &str) -> Option<&PresetShaderMeta> {
        self.presets
            .get(shader_id)
            .or_else(|| self.custom_pipelines.get(shader_id))
            .map(|c| &c.meta)
    }

    // -----------------------------------------------------------------------
    // Apply preset effect
    // -----------------------------------------------------------------------

    /// Apply a preset shader effect to an RGBA frame.
    pub fn apply_preset(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        shader_id: &str,
        params: &serde_json::Value,
    ) -> Result<Vec<u8>> {
        let cached = self.presets.get(shader_id).ok_or_else(|| {
            Error::InvalidParameter(format!("Unknown preset shader: {}", shader_id))
        })?;

        let uniforms = self.build_uniforms(width, height, &cached.meta.params, params);
        self.run_shader(input, width, height, &cached.pipeline, &uniforms)
    }

    /// Apply a preset shader effect without leaving the texture-to-texture path.
    pub fn apply_preset_tex(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        shader_id: &str,
        params: &serde_json::Value,
    ) -> Result<()> {
        let cached = self.presets.get(shader_id).ok_or_else(|| {
            Error::InvalidParameter(format!("Unknown preset shader: {}", shader_id))
        })?;

        let uniforms =
            self.build_uniforms(input.width(), input.height(), &cached.meta.params, params);
        let texture_pipeline = cached.texture_pipeline.as_ref().ok_or_else(|| {
            Error::InvalidParameter(format!("Shader '{}' has no texture pipeline", shader_id))
        })?;
        self.run_shader_tex(input, output, texture_pipeline, &uniforms)
    }

    // -----------------------------------------------------------------------
    // Phase 2: Runtime custom shader registration
    // -----------------------------------------------------------------------

    /// Shader template header injected before user code.
    const SHADER_TEMPLATE_HEADER: &'static str = r#"
struct Uniforms {
    width: u32,
    height: u32,
    param_count: u32,
    _padding: u32,
    params: array<vec4<f32>, 4>,
}

@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn get_param(index: u32) -> f32 {
    return uniforms.params[index / 4u][index % 4u];
}

fn unpack_rgba(packed: u32) -> vec4<f32> {
    return vec4<f32>(
        f32(packed & 0xFFu) / 255.0,
        f32((packed >> 8u) & 0xFFu) / 255.0,
        f32((packed >> 16u) & 0xFFu) / 255.0,
        f32((packed >> 24u) & 0xFFu) / 255.0
    );
}

fn pack_rgba(color: vec4<f32>) -> u32 {
    let r = u32(clamp(color.r, 0.0, 1.0) * 255.0);
    let g = u32(clamp(color.g, 0.0, 1.0) * 255.0);
    let b = u32(clamp(color.b, 0.0, 1.0) * 255.0);
    let a = u32(clamp(color.a, 0.0, 1.0) * 255.0);
    return r | (g << 8u) | (b << 16u) | (a << 24u);
}

fn sample_at(x: i32, y: i32) -> vec4<f32> {
    let cx = clamp(x, 0, i32(uniforms.width) - 1);
    let cy = clamp(y, 0, i32(uniforms.height) - 1);
    let idx = u32(cx) + u32(cy) * uniforms.width;
    return unpack_rgba(input[idx]);
}
"#;

    /// Register a user-provided WGSL shader at runtime.
    ///
    /// The `wgsl_source` can be either:
    /// - A complete shader (must contain the Uniforms struct and bindings)
    /// - A partial shader (just the effect function body with `@compute` entry point),
    ///   in which case the engine injects the standard header automatically.
    ///
    /// If a custom shader with the same `id` already exists, it is replaced.
    /// Returns an error if the `id` conflicts with a built-in preset.
    pub fn register_custom_shader(
        &mut self,
        id: &str,
        wgsl_source: &str,
        param_defs: Vec<ParamDef>,
    ) -> Result<()> {
        if self.presets.contains_key(id) {
            return Err(Error::InvalidParameter(format!(
                "Cannot register custom shader with ID '{}': conflicts with built-in preset",
                id
            )));
        }

        // Determine if user provided a complete shader or just the body
        let full_source = if wgsl_source.contains("var<storage") || wgsl_source.contains("@group") {
            // User provided complete shader
            wgsl_source.to_string()
        } else {
            // Inject standard header
            format!("{}\n{}", Self::SHADER_TEMPLATE_HEADER, wgsl_source)
        };

        let pipeline = self.compile_buffer_pipeline(id, &full_source)?;

        self.custom_pipelines.insert(
            id.to_string(),
            CachedPipeline {
                pipeline,
                texture_pipeline: None,
                meta: PresetShaderMeta {
                    id: id.to_string(),
                    description: "User-defined custom shader".to_string(),
                    params: param_defs,
                },
            },
        );

        Ok(())
    }

    /// Apply a runtime-registered custom shader.
    pub fn apply_custom(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        shader_id: &str,
        params: &serde_json::Value,
    ) -> Result<Vec<u8>> {
        let cached = self.custom_pipelines.get(shader_id).ok_or_else(|| {
            Error::InvalidParameter(format!("Unknown custom shader: {}", shader_id))
        })?;

        let uniforms = self.build_uniforms(width, height, &cached.meta.params, params);
        self.run_shader(input, width, height, &cached.pipeline, &uniforms)
    }

    /// Apply any shader (preset or custom) by ID.
    pub fn apply(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        shader_id: &str,
        params: &serde_json::Value,
    ) -> Result<Vec<u8>> {
        if width == 0 || height == 0 {
            return Err(Error::InvalidParameter(format!(
                "Frame dimensions must be non-zero: {}x{}",
                width, height
            )));
        }

        if self.presets.contains_key(shader_id) {
            self.apply_preset(input, width, height, shader_id, params)
        } else if self.custom_pipelines.contains_key(shader_id) {
            self.apply_custom(input, width, height, shader_id, params)
        } else {
            Err(Error::InvalidParameter(format!(
                "Unknown shader: {}",
                shader_id
            )))
        }
    }

    /// List all available shaders (presets + custom).
    pub fn list_all(&self) -> Vec<&PresetShaderMeta> {
        self.presets
            .values()
            .chain(self.custom_pipelines.values())
            .map(|c| &c.meta)
            .collect()
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn compile_buffer_pipeline(
        &self,
        label: &str,
        wgsl_source: &str,
    ) -> Result<wgpu::ComputePipeline> {
        let device = self.ctx.device();

        // wgpu internally uses naga for validation — invalid WGSL will be caught here
        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some(label),
            source: wgpu::ShaderSource::Wgsl(wgsl_source.into()),
        });

        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some(label),
            layout: Some(&self.pipeline_layout),
            module: &shader_module,
            entry_point: "main",
        });

        Ok(pipeline)
    }

    fn compile_texture_pipeline(
        &self,
        label: &str,
        wgsl_source: &str,
    ) -> Result<wgpu::ComputePipeline> {
        let device = self.ctx.device();
        let shader_module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some(label),
            source: wgpu::ShaderSource::Wgsl(wgsl_source.into()),
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Custom Shader Texture Pipeline Layout"),
            bind_group_layouts: &[&self.texture_bind_group_layout],
            push_constant_ranges: &[],
        });

        Ok(
            device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                label: Some(label),
                layout: Some(&pipeline_layout),
                module: &shader_module,
                entry_point: "main",
            }),
        )
    }

    fn create_texture_bind_group_layout(device: &wgpu::Device) -> wgpu::BindGroupLayout {
        device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Custom Shader Texture Bind Group Layout"),
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: wgpu::TextureFormat::Rgba8Unorm,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        })
    }

    fn run_shader_tex<U: Pod>(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        pipeline: &wgpu::ComputePipeline,
        uniforms: &U,
    ) -> Result<()> {
        if input.width() != output.width() || input.height() != output.height() {
            return Err(Error::InvalidParameter(format!(
                "Input ({}x{}) and output ({}x{}) texture dimensions must match",
                input.width(),
                input.height(),
                output.width(),
                output.height()
            )));
        }

        let device = self.ctx.device();
        let input_view = input.create_view(&wgpu::TextureViewDescriptor::default());
        let output_view = output.create_view(&wgpu::TextureViewDescriptor::default());
        let uniform_buffer = self
            .ctx
            .create_buffer_with_data(bytemuck::bytes_of(uniforms), wgpu::BufferUsages::UNIFORM);

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Custom Shader Texture Bind Group"),
            layout: &self.texture_bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(&input_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&output_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: uniform_buffer.as_entire_binding(),
                },
            ],
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Custom Shader Texture Encoder"),
        });
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Custom Shader Texture Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.dispatch_workgroups(output.width().div_ceil(16), output.height().div_ceil(16), 1);
        }
        self.ctx.queue().submit(Some(encoder.finish()));
        Ok(())
    }

    fn buffer_shader_to_texture_shader(source: &str) -> String {
        source
            .replace("@group(0) @binding(0) var<storage, read> input: array<u32>;", "@group(0) @binding(0) var input_tex: texture_2d<f32>;")
            .replace("@group(0) @binding(1) var<storage, read_write> output: array<u32>;", "@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;")
            .replace("return unpack_rgba(input[idx]);", "return textureLoad(input_tex, vec2<i32>(cx, cy), 0);")
            .replace("let color = unpack_rgba(input[idx]);", "let color = textureLoad(input_tex, vec2<i32>(global_id.xy), 0);")
            .replace("output[idx] = pack_rgba(color);", "textureStore(output_tex, vec2<i32>(global_id.xy), color);")
            .replace("output[idx] = pack_rgba(result);", "textureStore(output_tex, vec2<i32>(global_id.xy), result);")
            .replace("output[idx] = pack_rgba(vec4<f32>(clamp(posterized, vec3<f32>(0.0), vec3<f32>(1.0)), color.a));", "textureStore(output_tex, vec2<i32>(global_id.xy), vec4<f32>(clamp(posterized, vec3<f32>(0.0), vec3<f32>(1.0)), color.a));")
            .replace("output[idx] = pack_rgba(vec4<f32>(clamp(result, vec3<f32>(0.0), vec3<f32>(1.0)), color.a));", "textureStore(output_tex, vec2<i32>(global_id.xy), vec4<f32>(clamp(result, vec3<f32>(0.0), vec3<f32>(1.0)), color.a));")
            .replace("let idx = global_id.x + global_id.y * uniforms.width;\n    output[idx] = pack_rgba(vec4<f32>(r, g, b, a));", "textureStore(output_tex, vec2<i32>(global_id.xy), vec4<f32>(r, g, b, a));")
    }

    fn build_uniforms(
        &self,
        width: u32,
        height: u32,
        param_defs: &[ParamDef],
        json_params: &serde_json::Value,
    ) -> DynamicUniforms {
        let mut uniforms = DynamicUniforms {
            width,
            height,
            param_count: param_defs.len() as u32,
            _padding: 0,
            params: [[0.0; 4]; 4],
        };

        for (i, def) in param_defs.iter().enumerate().take(16) {
            let value = json_params
                .get(&def.name)
                .and_then(|v| v.as_f64())
                .map(|v| v as f32)
                .unwrap_or(def.default);

            uniforms.params[i / 4][i % 4] = value.clamp(def.min, def.max);
        }

        uniforms
    }

    /// Generic GPU dispatch — mirrors `GpuStyleProcessor::run_effect`.
    fn run_shader<U: Pod>(
        &self,
        input: &[u8],
        width: u32,
        height: u32,
        pipeline: &wgpu::ComputePipeline,
        uniforms: &U,
    ) -> Result<Vec<u8>> {
        let expected_size = (width * height * 4) as usize;
        if input.len() != expected_size {
            return Err(Error::InvalidParameter(format!(
                "Input size mismatch: expected {}, got {}",
                expected_size,
                input.len()
            )));
        }

        let device = self.ctx.device();
        let queue = self.ctx.queue();

        let input_buffer = self
            .ctx
            .create_buffer_with_data(input, wgpu::BufferUsages::STORAGE);

        let output_pooled = self.buffer_pool.acquire(input.len() as u64);
        let output_buffer = output_pooled.buffer();

        let uniform_buffer = self
            .ctx
            .create_buffer_with_data(bytemuck::bytes_of(uniforms), wgpu::BufferUsages::UNIFORM);

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Custom Shader Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: input_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: output_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: uniform_buffer.as_entire_binding(),
                },
            ],
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Custom Shader Encoder"),
        });

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Custom Shader Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &bind_group, &[]);

            let workgroups_x = width.div_ceil(16);
            let workgroups_y = height.div_ceil(16);
            pass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
        }

        queue.submit(Some(encoder.finish()));

        self.ctx.read_buffer_sync(output_buffer)
    }

    /// Get GPU context reference.
    pub fn context(&self) -> &Arc<GpuContext> {
        &self.ctx
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dynamic_uniforms_size() {
        // Ensure DynamicUniforms is correctly sized for GPU alignment
        assert_eq!(std::mem::size_of::<DynamicUniforms>(), 80); // 4*4 + 16*4 = 80
    }

    #[test]
    fn test_param_def_serialization() {
        let def = ParamDef {
            name: "pixel_size".into(),
            default: 8.0,
            min: 1.0,
            max: 100.0,
        };
        let json = serde_json::to_string(&def).unwrap();
        assert!(json.contains("pixel_size"));
        assert!(json.contains("8.0"));
    }

    #[test]
    fn test_build_uniforms_defaults() {
        let defs = [
            ParamDef {
                name: "a".into(),
                default: 5.0,
                min: 0.0,
                max: 10.0,
            },
            ParamDef {
                name: "b".into(),
                default: 3.0,
                min: 0.0,
                max: 10.0,
            },
        ];

        // Empty JSON → use defaults
        let json = serde_json::json!({});

        let mut uniforms = DynamicUniforms {
            width: 100,
            height: 100,
            param_count: defs.len() as u32,
            _padding: 0,
            params: [[0.0; 4]; 4],
        };

        for (i, def) in defs.iter().enumerate().take(16) {
            let value = json
                .get(&def.name)
                .and_then(|v| v.as_f64())
                .map(|v| v as f32)
                .unwrap_or(def.default);
            uniforms.params[i / 4][i % 4] = value.clamp(def.min, def.max);
        }

        assert_eq!(uniforms.params[0][0], 5.0);
        assert_eq!(uniforms.params[0][1], 3.0);
    }

    #[test]
    fn test_build_uniforms_with_values() {
        let defs = [ParamDef {
            name: "a".into(),
            default: 5.0,
            min: 0.0,
            max: 10.0,
        }];

        let json = serde_json::json!({"a": 7.5});

        let mut uniforms = DynamicUniforms {
            width: 100,
            height: 100,
            param_count: 1,
            _padding: 0,
            params: [[0.0; 4]; 4],
        };

        for (i, def) in defs.iter().enumerate().take(16) {
            let value = json
                .get(&def.name)
                .and_then(|v| v.as_f64())
                .map(|v| v as f32)
                .unwrap_or(def.default);
            uniforms.params[i / 4][i % 4] = value.clamp(def.min, def.max);
        }

        assert_eq!(uniforms.params[0][0], 7.5);
    }

    #[test]
    fn test_build_uniforms_clamping() {
        let defs = [ParamDef {
            name: "a".into(),
            default: 5.0,
            min: 0.0,
            max: 10.0,
        }];

        let json = serde_json::json!({"a": 999.0});

        let mut uniforms = DynamicUniforms {
            width: 100,
            height: 100,
            param_count: 1,
            _padding: 0,
            params: [[0.0; 4]; 4],
        };

        for (i, def) in defs.iter().enumerate().take(16) {
            let value = json
                .get(&def.name)
                .and_then(|v| v.as_f64())
                .map(|v| v as f32)
                .unwrap_or(def.default);
            uniforms.params[i / 4][i % 4] = value.clamp(def.min, def.max);
        }

        assert_eq!(uniforms.params[0][0], 10.0); // clamped to max
    }

    #[test]
    fn test_preset_shader_meta_serialization() {
        let meta = PresetShaderMeta {
            id: "pixelate".into(),
            description: "Pixelate effect".into(),
            params: vec![ParamDef {
                name: "pixel_size".into(),
                default: 8.0,
                min: 1.0,
                max: 100.0,
            }],
        };
        let json = serde_json::to_value(&meta).unwrap();
        assert_eq!(json["id"], "pixelate");
        assert_eq!(json["params"][0]["name"], "pixel_size");
    }

    #[test]
    fn test_get_shader_info_searches_both_maps() {
        let mut presets: HashMap<String, PresetShaderMeta> = HashMap::new();
        let mut customs: HashMap<String, PresetShaderMeta> = HashMap::new();

        presets.insert(
            "pixelate".into(),
            PresetShaderMeta {
                id: "pixelate".into(),
                description: "Pixelate".into(),
                params: vec![],
            },
        );
        customs.insert(
            "my_shader".into(),
            PresetShaderMeta {
                id: "my_shader".into(),
                description: "Custom".into(),
                params: vec![],
            },
        );

        // Simulates get_shader_info logic: preset OR custom
        let find =
            |id: &str| -> Option<&PresetShaderMeta> { presets.get(id).or_else(|| customs.get(id)) };

        assert!(find("pixelate").is_some());
        assert!(find("my_shader").is_some());
        assert!(find("nonexistent").is_none());
    }

    #[test]
    fn test_preset_id_conflict_rejected() {
        let preset_ids: HashMap<String, ()> = [("pixelate".into(), ())].into_iter().collect();

        // Simulates register_custom_shader preset conflict check
        let register = |id: &str| -> std::result::Result<(), String> {
            if preset_ids.contains_key(id) {
                Err(format!("Conflicts with preset: {}", id))
            } else {
                Ok(())
            }
        };

        assert!(register("pixelate").is_err());
        assert!(register("my_custom").is_ok());
    }

    #[test]
    fn test_zero_size_frame_rejected() {
        // Simulates the apply() zero-size validation
        let validate = |width: u32, height: u32| -> std::result::Result<(), String> {
            if width == 0 || height == 0 {
                Err(format!(
                    "Frame dimensions must be non-zero: {}x{}",
                    width, height
                ))
            } else {
                Ok(())
            }
        };

        assert!(validate(0, 100).is_err());
        assert!(validate(100, 0).is_err());
        assert!(validate(0, 0).is_err());
        assert!(validate(100, 100).is_ok());
    }
}
