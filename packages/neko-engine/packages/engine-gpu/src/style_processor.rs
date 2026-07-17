//! GPU Style Effects Processor (Phase 3 — texture-to-texture, zero CPU round-trip)
//!
//! All methods operate on `wgpu::Texture` directly.
//! No `read_buffer_sync` / `read_texture_sync` occurs inside this module.

#![allow(dead_code)]

use super::context::GpuContext;
use super::lut3d::LutRegistry;
use super::shaders;
use crate::error::{GpuError as Error, GpuResult as Result};
use bytemuck::{Pod, Zeroable};
use std::collections::HashMap;
use std::sync::Arc;

// =============================================================================
// Public param structs (unchanged interface)
// =============================================================================

/// Vignette effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct VignetteParams {
    pub amount: f32,
    pub radius: f32,
    pub softness: f32,
    pub roundness: f32,
}

impl Default for VignetteParams {
    fn default() -> Self {
        Self {
            amount: 0.5,
            radius: 0.5,
            softness: 0.5,
            roundness: 1.0,
        }
    }
}

impl VignetteParams {
    pub fn new(amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
            ..Default::default()
        }
    }

    pub fn with_options(amount: f32, radius: f32, softness: f32, roundness: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
            radius: radius.clamp(0.0, 2.0),
            softness: softness.clamp(0.0, 1.0),
            roundness: roundness.clamp(0.0, 1.0),
        }
    }

    pub fn is_identity(&self) -> bool {
        self.amount < 0.001
    }
}

/// Film grain effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct FilmGrainParams {
    pub amount: f32,
    pub size: f32,
    pub time: f32,
    pub color_amount: f32,
}

impl Default for FilmGrainParams {
    fn default() -> Self {
        Self {
            amount: 0.3,
            size: 1.0,
            time: 0.0,
            color_amount: 0.0,
        }
    }
}

impl FilmGrainParams {
    pub fn new(amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
            ..Default::default()
        }
    }

    pub fn with_options(amount: f32, size: f32, time: f32, color_amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 1.0),
            size: size.clamp(0.5, 3.0),
            time,
            color_amount: color_amount.clamp(0.0, 1.0),
        }
    }

    pub fn is_identity(&self) -> bool {
        self.amount < 0.001
    }
}

/// Glow/Bloom effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct GlowParams {
    pub intensity: f32,
    pub threshold: f32,
    pub radius: f32,
    pub _padding: f32,
}

impl Default for GlowParams {
    fn default() -> Self {
        Self {
            intensity: 1.0,
            threshold: 0.7,
            radius: 10.0,
            _padding: 0.0,
        }
    }
}

impl GlowParams {
    pub fn new(intensity: f32) -> Self {
        Self {
            intensity: intensity.clamp(0.0, 2.0),
            ..Default::default()
        }
    }

    pub fn with_options(intensity: f32, threshold: f32, radius: f32) -> Self {
        Self {
            intensity: intensity.clamp(0.0, 2.0),
            threshold: threshold.clamp(0.0, 1.0),
            radius: radius.clamp(1.0, 50.0),
            _padding: 0.0,
        }
    }

    pub fn is_identity(&self) -> bool {
        self.intensity < 0.001
    }
}

/// Chromatic aberration effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct ChromaticAberrationParams {
    pub amount: f32,
    pub angle: f32,
    pub center_x: f32,
    pub center_y: f32,
}

impl Default for ChromaticAberrationParams {
    fn default() -> Self {
        Self {
            amount: 0.01,
            angle: 0.0,
            center_x: 0.5,
            center_y: 0.5,
        }
    }
}

impl ChromaticAberrationParams {
    pub fn new(amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 0.1),
            ..Default::default()
        }
    }

    pub fn with_options(amount: f32, angle: f32, center_x: f32, center_y: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 0.1),
            angle,
            center_x: center_x.clamp(0.0, 1.0),
            center_y: center_y.clamp(0.0, 1.0),
        }
    }

    pub fn is_identity(&self) -> bool {
        self.amount < 0.0001
    }
}

/// Luma Key effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct LumaKeyParams {
    pub threshold: f32, // 0..1 — luminance cutoff
    pub softness: f32,  // 0..1 — transition width
    pub invert: f32,    // 0 or 1 — invert the mask
    pub _pad: f32,
}

impl Default for LumaKeyParams {
    fn default() -> Self {
        Self {
            threshold: 0.5,
            softness: 0.1,
            invert: 0.0,
            _pad: 0.0,
        }
    }
}

impl LumaKeyParams {
    pub fn with_options(threshold: f32, softness: f32, invert: bool) -> Self {
        Self {
            threshold: threshold.clamp(0.0, 1.0),
            softness: softness.clamp(0.0, 1.0),
            invert: if invert { 1.0 } else { 0.0 },
            _pad: 0.0,
        }
    }
    pub fn is_identity(&self) -> bool {
        false
    }
}

/// Chroma Key (green/blue screen) effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct ChromaKeyParams {
    pub key_r: f32,      // 0..1 — key color red
    pub key_g: f32,      // 0..1 — key color green
    pub key_b: f32,      // 0..1 — key color blue
    pub similarity: f32, // 0..0.5 — CbCr distance threshold
    pub smoothness: f32, // 0..0.5 — transition edge width
    pub spill: f32,      // 0..1 — spill suppression strength
    pub _pad0: f32,
    pub _pad1: f32,
}

impl Default for ChromaKeyParams {
    fn default() -> Self {
        Self {
            key_r: 0.0,
            key_g: 1.0,
            key_b: 0.0,
            similarity: 0.2,
            smoothness: 0.05,
            spill: 0.5,
            _pad0: 0.0,
            _pad1: 0.0,
        }
    }
}

impl ChromaKeyParams {
    pub fn with_options(
        key_r: f32,
        key_g: f32,
        key_b: f32,
        similarity: f32,
        smoothness: f32,
        spill: f32,
    ) -> Self {
        Self {
            key_r: key_r.clamp(0.0, 1.0),
            key_g: key_g.clamp(0.0, 1.0),
            key_b: key_b.clamp(0.0, 1.0),
            similarity: similarity.clamp(0.0, 0.5),
            smoothness: smoothness.clamp(0.0, 0.5),
            spill: spill.clamp(0.0, 1.0),
            _pad0: 0.0,
            _pad1: 0.0,
        }
    }
    pub fn is_identity(&self) -> bool {
        false
    }
}

// =============================================================================
// Full color correction uniform params — 256 bytes
// Layout must match WGSL `ColorCorrectionTexParams` in COLOR_CORRECTION_COMPUTE_SHADER
// =============================================================================

/// Color correction uniform parameters for the GPU compute shader.
///
/// 256 bytes, `repr(C)` — matches WGSL `ColorCorrectionTexParams`.
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct ColorCorrectionTexParams {
    // Basic (offsets 0..76, 20 × f32)
    pub brightness: f32,     // +0
    pub exposure: f32,       // +4
    pub contrast: f32,       // +8
    pub highlights: f32,     // +12
    pub shadows: f32,        // +16
    pub whites: f32,         // +20
    pub blacks: f32,         // +24
    pub temperature: f32,    // +28
    pub tint: f32,           // +32
    pub saturation: f32,     // +36
    pub vibrance: f32,       // +40
    pub gamma: f32,          // +44
    pub hue_shift: f32,      // +48
    pub cw_enabled: f32,     // +52  (0 or 1)
    pub curves_enabled: f32, // +56  (0 or 1)
    pub lut_enabled: f32,    // +60  (0 or 1)
    pub lut_intensity: f32,  // +64
    pub hsl_count: f32,      // +68  (0..8)
    pub _pad0: f32,          // +72
    pub _pad1: f32,          // +76
    // Color wheels — [r,g,b,brightness], starts at offset 80 (16-aligned)
    pub cw_shadows: [f32; 4],    // +80
    pub cw_midtones: [f32; 4],   // +96
    pub cw_highlights: [f32; 4], // +112
    // HSL data — 8 × [target_hue, hue_shift, sat_adjust, lum_adjust], starts at +128
    pub hsl_data: [[f32; 4]; 8], // +128..+255
}

const _: () = assert!(
    std::mem::size_of::<ColorCorrectionTexParams>() == 256,
    "ColorCorrectionTexParams must be 256 bytes"
);

impl Default for ColorCorrectionTexParams {
    fn default() -> Self {
        Self {
            brightness: 0.0,
            exposure: 0.0,
            contrast: 1.0,
            highlights: 0.0,
            shadows: 0.0,
            whites: 0.0,
            blacks: 0.0,
            temperature: 0.0,
            tint: 0.0,
            saturation: 1.0,
            vibrance: 0.0,
            gamma: 1.0,
            hue_shift: 0.0,
            cw_enabled: 0.0,
            curves_enabled: 0.0,
            lut_enabled: 0.0,
            lut_intensity: 1.0,
            hsl_count: 0.0,
            _pad0: 0.0,
            _pad1: 0.0,
            cw_shadows: [0.5, 0.5, 0.5, 0.0],
            cw_midtones: [0.5, 0.5, 0.5, 0.0],
            cw_highlights: [0.5, 0.5, 0.5, 0.0],
            hsl_data: [[0.0; 4]; 8],
        }
    }
}

impl ColorCorrectionTexParams {
    /// Return true if all values are at identity (no visible change).
    pub fn is_identity(&self) -> bool {
        self.brightness.abs() < 0.001
            && self.exposure.abs() < 0.001
            && (self.contrast - 1.0).abs() < 0.001
            && self.highlights.abs() < 0.001
            && self.shadows.abs() < 0.001
            && self.whites.abs() < 0.001
            && self.blacks.abs() < 0.001
            && self.temperature.abs() < 0.001
            && self.tint.abs() < 0.001
            && (self.saturation - 1.0).abs() < 0.001
            && self.vibrance.abs() < 0.001
            && (self.gamma - 1.0).abs() < 0.001
            && self.hue_shift.abs() < 0.01
            && self.cw_enabled < 0.001
            && self.curves_enabled < 0.001
            && self.lut_enabled < 0.001
            && self.hsl_count < 0.001
    }
}

// =============================================================================
// GpuLutCache — lazy GPU upload of 3D LUTs from LutRegistry
// =============================================================================

struct GpuLutCache {
    textures: HashMap<String, wgpu::Texture>,
    sampler: wgpu::Sampler,
    identity_tex: wgpu::Texture,
}

impl GpuLutCache {
    fn new(ctx: &GpuContext) -> Self {
        let device = ctx.device();

        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("LUT 3D Sampler"),
            address_mode_u: wgpu::AddressMode::ClampToEdge,
            address_mode_v: wgpu::AddressMode::ClampToEdge,
            address_mode_w: wgpu::AddressMode::ClampToEdge,
            mag_filter: wgpu::FilterMode::Linear,
            min_filter: wgpu::FilterMode::Linear,
            mipmap_filter: wgpu::FilterMode::Linear,
            ..Default::default()
        });

        let identity_tex = Self::create_identity_texture(ctx);
        Self {
            textures: HashMap::new(),
            sampler,
            identity_tex,
        }
    }

    /// 2×2×2 identity LUT: each texel (x=r, y=g, z=b) maps (r,g,b)→(r,g,b).
    fn create_identity_texture(ctx: &GpuContext) -> wgpu::Texture {
        let n = 2u32;
        let mut bytes = Vec::with_capacity((n * n * n * 4) as usize);
        for b in 0..n {
            for g in 0..n {
                for r in 0..n {
                    let s = (n - 1) as f32;
                    bytes.push((r as f32 / s * 255.0).round() as u8);
                    bytes.push((g as f32 / s * 255.0).round() as u8);
                    bytes.push((b as f32 / s * 255.0).round() as u8);
                    bytes.push(255u8);
                }
            }
        }

        let tex = ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("Identity LUT 3D"),
            size: wgpu::Extent3d {
                width: n,
                height: n,
                depth_or_array_layers: n,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D3,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        ctx.queue().write_texture(
            wgpu::ImageCopyTexture {
                texture: &tex,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &bytes,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(n * 4),
                rows_per_image: Some(n),
            },
            wgpu::Extent3d {
                width: n,
                height: n,
                depth_or_array_layers: n,
            },
        );
        tex
    }

    /// Upload a LUT from `LutRegistry` to GPU if not yet cached.
    fn ensure_uploaded(&mut self, ctx: &GpuContext, lut_id: &str) {
        if self.textures.contains_key(lut_id) {
            return;
        }
        let Some(lut_data) = LutRegistry::global().get_data(lut_id) else {
            return;
        };

        let n = lut_data.size as u32;
        let bytes = lut_data.to_texture_bytes();

        let tex = ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("LUT 3D"),
            size: wgpu::Extent3d {
                width: n,
                height: n,
                depth_or_array_layers: n,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D3,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        ctx.queue().write_texture(
            wgpu::ImageCopyTexture {
                texture: &tex,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &bytes,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(n * 4),
                rows_per_image: Some(n),
            },
            wgpu::Extent3d {
                width: n,
                height: n,
                depth_or_array_layers: n,
            },
        );
        self.textures.insert(lut_id.to_string(), tex);
    }

    /// Get the cached texture for `lut_id`, or the identity texture if missing.
    fn get(&self, lut_id: Option<&str>) -> &wgpu::Texture {
        lut_id
            .and_then(|id| self.textures.get(id))
            .unwrap_or(&self.identity_tex)
    }
}

// =============================================================================
// Identity curves buffer (5×256 f32 = 1280 floats, linear identity)
// =============================================================================

fn identity_curves_data() -> Vec<f32> {
    let mut data = vec![0.0f32; 5 * 256];
    for ch in 0..5usize {
        for i in 0..256usize {
            data[ch * 256 + i] = i as f32 / 255.0;
        }
    }
    data
}

// =============================================================================
// GpuStyleProcessor
// =============================================================================

/// GPU style effects processor — texture-to-texture, zero CPU round-trips.
pub struct GpuStyleProcessor {
    ctx: Arc<GpuContext>,

    // Bind group layouts
    bgl_3: wgpu::BindGroupLayout, // bindings 0-2: input_tex, output_tex, uniforms
    bgl_cc: wgpu::BindGroupLayout, // bindings 0-5: + curves, lut_3d, lut_sampler

    // Compute pipelines
    vignette_pipeline: wgpu::ComputePipeline,
    film_grain_pipeline: wgpu::ComputePipeline,
    glow_pipeline: wgpu::ComputePipeline,
    chromatic_aberration_pipeline: wgpu::ComputePipeline,
    color_correction_pipeline: wgpu::ComputePipeline,
    luma_key_pipeline: wgpu::ComputePipeline,
    chroma_key_pipeline: wgpu::ComputePipeline,

    // Per-instance LUT cache and identity resources
    lut_cache: GpuLutCache,
    identity_curves_buf: wgpu::Buffer,
}

impl GpuStyleProcessor {
    /// Create a new GPU style processor with texture-to-texture pipelines.
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // --- Bind group layout for simple effects (3 bindings) ---
        let bgl_3 = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Style Effect BGL (3)"),
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
        });

        // --- Bind group layout for color correction (6 bindings) ---
        let bgl_cc = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Color Correction BGL (6)"),
            entries: &[
                // 0: input texture
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
                // 1: output storage texture
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
                // 2: CC params uniform
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
                // 3: curves storage buffer (5×256 f32, read-only)
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // 4: 3D LUT texture
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: true },
                        view_dimension: wgpu::TextureViewDimension::D3,
                        multisampled: false,
                    },
                    count: None,
                },
                // 5: LUT sampler (linear/trilinear)
                wgpu::BindGroupLayoutEntry {
                    binding: 5,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Sampler(wgpu::SamplerBindingType::Filtering),
                    count: None,
                },
            ],
        });

        // --- Pipelines ---
        let pipeline_layout_3 = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Style Effect Pipeline Layout (3)"),
            bind_group_layouts: &[&bgl_3],
            push_constant_ranges: &[],
        });
        let pipeline_layout_cc = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Color Correction Pipeline Layout (6)"),
            bind_group_layouts: &[&bgl_cc],
            push_constant_ranges: &[],
        });

        macro_rules! make_shader {
            ($src:expr, $label:expr) => {
                device.create_shader_module(wgpu::ShaderModuleDescriptor {
                    label: Some($label),
                    source: wgpu::ShaderSource::Wgsl($src.into()),
                })
            };
        }
        macro_rules! make_pipeline {
            ($module:expr, $layout:expr, $label:expr) => {
                device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
                    label: Some($label),
                    layout: Some($layout),
                    module: &$module,
                    entry_point: "main",
                })
            };
        }

        let vignette_pipeline = make_pipeline!(
            make_shader!(shaders::VIGNETTE_TEX_SHADER, "Vignette Shader"),
            &pipeline_layout_3,
            "Vignette Pipeline"
        );
        let film_grain_pipeline = make_pipeline!(
            make_shader!(shaders::FILM_GRAIN_TEX_SHADER, "Film Grain Shader"),
            &pipeline_layout_3,
            "Film Grain Pipeline"
        );
        let glow_pipeline = make_pipeline!(
            make_shader!(shaders::GLOW_TEX_SHADER, "Glow Shader"),
            &pipeline_layout_3,
            "Glow Pipeline"
        );
        let chromatic_aberration_pipeline = make_pipeline!(
            make_shader!(
                shaders::CHROMATIC_ABERRATION_TEX_SHADER,
                "Chromatic Aberration Shader"
            ),
            &pipeline_layout_3,
            "Chromatic Aberration Pipeline"
        );
        let color_correction_pipeline = make_pipeline!(
            make_shader!(
                shaders::get_color_correction_shader().as_str(),
                "Color Correction Shader"
            ),
            &pipeline_layout_cc,
            "Color Correction Pipeline"
        );
        let luma_key_pipeline = make_pipeline!(
            make_shader!(shaders::LUMA_KEY_TEX_SHADER, "Luma Key Shader"),
            &pipeline_layout_3,
            "Luma Key Pipeline"
        );
        let chroma_key_pipeline = make_pipeline!(
            make_shader!(shaders::CHROMA_KEY_TEX_SHADER, "Chroma Key Shader"),
            &pipeline_layout_3,
            "Chroma Key Pipeline"
        );

        // --- Identity curves buffer (1280 floats, GPU storage) ---
        let identity_data = identity_curves_data();
        let identity_curves_buf = ctx.create_buffer_with_data(
            bytemuck::cast_slice(&identity_data),
            wgpu::BufferUsages::STORAGE,
        );

        // --- LUT cache ---
        let lut_cache = GpuLutCache::new(&ctx);

        Ok(Self {
            ctx,
            bgl_3,
            bgl_cc,
            vignette_pipeline,
            film_grain_pipeline,
            glow_pipeline,
            chromatic_aberration_pipeline,
            color_correction_pipeline,
            luma_key_pipeline,
            chroma_key_pipeline,
            lut_cache,
            identity_curves_buf,
        })
    }

    // =========================================================================
    // Public texture-to-texture API
    // =========================================================================

    /// Apply vignette effect: input → output (both `Rgba8Unorm`).
    pub fn apply_vignette_tex(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        params: &VignetteParams,
    ) -> Result<()> {
        if params.is_identity() {
            return self.copy_texture(input, output);
        }
        self.run_effect_tex(input, output, &self.vignette_pipeline, &self.bgl_3, params)
    }

    /// Apply film grain effect: input → output.
    pub fn apply_film_grain_tex(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        params: &FilmGrainParams,
    ) -> Result<()> {
        if params.is_identity() {
            return self.copy_texture(input, output);
        }
        self.run_effect_tex(
            input,
            output,
            &self.film_grain_pipeline,
            &self.bgl_3,
            params,
        )
    }

    /// Apply glow/bloom effect: input → output.
    pub fn apply_glow_tex(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        params: &GlowParams,
    ) -> Result<()> {
        if params.is_identity() {
            return self.copy_texture(input, output);
        }
        self.run_effect_tex(input, output, &self.glow_pipeline, &self.bgl_3, params)
    }

    /// Apply chromatic aberration: input → output.
    pub fn apply_chromatic_aberration_tex(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        params: &ChromaticAberrationParams,
    ) -> Result<()> {
        if params.is_identity() {
            return self.copy_texture(input, output);
        }
        self.run_effect_tex(
            input,
            output,
            &self.chromatic_aberration_pipeline,
            &self.bgl_3,
            params,
        )
    }

    /// Apply luma key: pixels below threshold become transparent.
    pub fn apply_luma_key_tex(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        params: &LumaKeyParams,
    ) -> Result<()> {
        self.run_effect_tex(input, output, &self.luma_key_pipeline, &self.bgl_3, params)
    }

    /// Apply chroma key (green/blue screen removal) with spill suppression.
    pub fn apply_chroma_key_tex(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        params: &ChromaKeyParams,
    ) -> Result<()> {
        self.run_effect_tex(
            input,
            output,
            &self.chroma_key_pipeline,
            &self.bgl_3,
            params,
        )
    }

    /// Apply full color correction (basic + color wheels + HSL + curves + 3D LUT).
    ///
    /// - `curves_data`: 5×256 f32 `[rgb, r, g, b, luma]`. `None` → identity curves.
    /// - `lut_id`: key into `LutRegistry`. LUT is uploaded lazily on first use.
    pub fn apply_color_correction_tex(
        &mut self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        params: &ColorCorrectionTexParams,
        curves_data: Option<&[f32]>,
        lut_id: Option<&str>,
    ) -> Result<()> {
        let w = input.width();
        let h = input.height();

        // Step 1: Ensure LUT is on GPU (mutably borrows lut_cache only)
        if params.lut_enabled > 0.5 {
            if let Some(id) = lut_id {
                let ctx = Arc::clone(&self.ctx);
                self.lut_cache.ensure_uploaded(&ctx, id);
            }
        }

        // Step 2: Create texture views
        let input_view = input.create_view(&wgpu::TextureViewDescriptor::default());
        let output_view = output.create_view(&wgpu::TextureViewDescriptor::default());

        // Step 3: Create or borrow curves buffer
        let temp_curves_buf: Option<wgpu::Buffer>;
        let curves_buf: &wgpu::Buffer = if let Some(data) = curves_data {
            let buf = self
                .ctx
                .create_buffer_with_data(bytemuck::cast_slice(data), wgpu::BufferUsages::STORAGE);
            temp_curves_buf = Some(buf);
            temp_curves_buf.as_ref().unwrap()
        } else {
            &self.identity_curves_buf
        };

        // Step 4: Get LUT texture and sampler views
        let lut_id_active = if params.lut_enabled > 0.5 {
            lut_id
        } else {
            None
        };
        let lut_tex = self.lut_cache.get(lut_id_active);
        let lut_view = lut_tex.create_view(&wgpu::TextureViewDescriptor {
            dimension: Some(wgpu::TextureViewDimension::D3),
            ..Default::default()
        });
        let lut_sampler = &self.lut_cache.sampler;

        // Step 5: Uniform buffer
        let uniform_buf = self
            .ctx
            .create_buffer_with_data(bytemuck::bytes_of(params), wgpu::BufferUsages::UNIFORM);

        // Step 6: Build bind group and dispatch
        let entries = [
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
                resource: uniform_buf.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 3,
                resource: curves_buf.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 4,
                resource: wgpu::BindingResource::TextureView(&lut_view),
            },
            wgpu::BindGroupEntry {
                binding: 5,
                resource: wgpu::BindingResource::Sampler(lut_sampler),
            },
        ];

        let device = self.ctx.device();
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("CC Tex Bind Group"),
            layout: &self.bgl_cc,
            entries: &entries,
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("CC Tex Encoder"),
        });
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("CC Tex Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.color_correction_pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.dispatch_workgroups(w.div_ceil(16), h.div_ceil(16), 1);
        }
        self.ctx.queue().submit(Some(encoder.finish()));

        Ok(())
    }

    /// Accessor for the wgpu context.
    pub fn context(&self) -> &Arc<GpuContext> {
        &self.ctx
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    /// Run a 3-binding texture effect (input_tex → output_tex via uniforms).
    fn run_effect_tex<U: Pod>(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        pipeline: &wgpu::ComputePipeline,
        bgl: &wgpu::BindGroupLayout,
        uniforms: &U,
    ) -> Result<()> {
        let w = input.width();
        let h = input.height();

        let input_view = input.create_view(&wgpu::TextureViewDescriptor::default());
        let output_view = output.create_view(&wgpu::TextureViewDescriptor::default());

        let uniform_buf = self
            .ctx
            .create_buffer_with_data(bytemuck::bytes_of(uniforms), wgpu::BufferUsages::UNIFORM);

        let bind_group = self
            .ctx
            .device()
            .create_bind_group(&wgpu::BindGroupDescriptor {
                label: Some("Effect Tex Bind Group"),
                layout: bgl,
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
                        resource: uniform_buf.as_entire_binding(),
                    },
                ],
            });

        let mut encoder =
            self.ctx
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("Effect Tex Encoder"),
                });
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Effect Tex Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.dispatch_workgroups(w.div_ceil(16), h.div_ceil(16), 1);
        }
        self.ctx.queue().submit(Some(encoder.finish()));
        Ok(())
    }

    /// GPU-side texture copy via command encoder (used when effect is identity).
    fn copy_texture(&self, src: &wgpu::Texture, dst: &wgpu::Texture) -> Result<()> {
        let w = src.width();
        let h = src.height();

        if w != dst.width() || h != dst.height() {
            return Err(Error::InvalidParameter(
                "copy_texture: dimension mismatch".into(),
            ));
        }

        let mut encoder =
            self.ctx
                .device()
                .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                    label: Some("Texture Copy"),
                });
        encoder.copy_texture_to_texture(
            wgpu::ImageCopyTexture {
                texture: src,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyTexture {
                texture: dst,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::Extent3d {
                width: w,
                height: h,
                depth_or_array_layers: 1,
            },
        );
        self.ctx.queue().submit(Some(encoder.finish()));
        Ok(())
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_vignette_params_default() {
        let params = VignetteParams::default();
        assert_eq!(params.amount, 0.5);
        assert_eq!(params.radius, 0.5);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_vignette_params_identity() {
        let params = VignetteParams::new(0.0);
        assert!(params.is_identity());
    }

    #[test]
    fn test_vignette_params_clamping() {
        let params = VignetteParams::with_options(2.0, 5.0, 2.0, 2.0);
        assert_eq!(params.amount, 1.0);
        assert_eq!(params.radius, 2.0);
        assert_eq!(params.softness, 1.0);
        assert_eq!(params.roundness, 1.0);
    }

    #[test]
    fn test_film_grain_params_default() {
        let params = FilmGrainParams::default();
        assert_eq!(params.amount, 0.3);
        assert_eq!(params.size, 1.0);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_film_grain_params_identity() {
        let params = FilmGrainParams::new(0.0);
        assert!(params.is_identity());
    }

    #[test]
    fn test_film_grain_params_clamping() {
        let params = FilmGrainParams::with_options(2.0, 10.0, 0.0, 2.0);
        assert_eq!(params.amount, 1.0);
        assert_eq!(params.size, 3.0);
        assert_eq!(params.color_amount, 1.0);
    }

    #[test]
    fn test_glow_params_default() {
        let params = GlowParams::default();
        assert_eq!(params.intensity, 1.0);
        assert_eq!(params.threshold, 0.7);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_glow_params_identity() {
        let params = GlowParams::new(0.0);
        assert!(params.is_identity());
    }

    #[test]
    fn test_glow_params_clamping() {
        let params = GlowParams::with_options(5.0, 2.0, 100.0);
        assert_eq!(params.intensity, 2.0);
        assert_eq!(params.threshold, 1.0);
        assert_eq!(params.radius, 50.0);
    }

    #[test]
    fn test_chromatic_aberration_params_default() {
        let params = ChromaticAberrationParams::default();
        assert_eq!(params.amount, 0.01);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_chromatic_aberration_params_identity() {
        let params = ChromaticAberrationParams::new(0.0);
        assert!(params.is_identity());
    }

    #[test]
    fn test_chromatic_aberration_params_clamping() {
        let params = ChromaticAberrationParams::with_options(1.0, 0.0, 2.0, -1.0);
        assert_eq!(params.amount, 0.1);
        assert_eq!(params.center_x, 1.0);
        assert_eq!(params.center_y, 0.0);
    }

    #[test]
    fn test_cc_tex_params_size() {
        assert_eq!(std::mem::size_of::<ColorCorrectionTexParams>(), 256);
    }

    #[test]
    fn test_cc_tex_params_default_is_identity() {
        let p = ColorCorrectionTexParams::default();
        assert!(p.is_identity());
    }

    #[test]
    fn test_identity_curves_data() {
        let data = identity_curves_data();
        assert_eq!(data.len(), 5 * 256);
        // First channel: identity curve
        assert!((data[0] - 0.0).abs() < 0.001);
        assert!((data[128] - 128.0 / 255.0).abs() < 0.001);
        assert!((data[255] - 1.0).abs() < 0.001);
    }
}
