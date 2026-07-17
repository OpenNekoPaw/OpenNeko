//! GPU Blur Processor
//!
//! Provides GPU-accelerated blur effects including:
//! - Box blur
//! - Gaussian blur
//! - Directional/Motion blur
//! - Radial blur
//! - Zoom blur
//! - Sharpen
//!
//! All processing is texture-to-texture (zero CPU round-trip).
//! Input: `wgpu::Texture` (any float format)
//! Output: `wgpu::Texture` (Rgba8Unorm)

use super::context::GpuContext;
use super::shaders;
use crate::error::{GpuError as Error, GpuResult as Result};

use bytemuck::{Pod, Zeroable};
use std::sync::Arc;

// =============================================================================
// Public parameter types
// =============================================================================

/// Blur type enumeration
#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum BlurType {
    /// Box blur - simple averaging
    #[default]
    Box = 0,
    /// Gaussian blur - weighted averaging with bell curve
    Gaussian = 1,
    /// Directional/Motion blur - blur along a direction
    Directional = 2,
    /// Radial blur - blur radiating from center
    Radial = 3,
    /// Zoom blur - blur zooming from center
    Zoom = 4,
}

impl From<u32> for BlurType {
    fn from(value: u32) -> Self {
        match value {
            0 => BlurType::Box,
            1 => BlurType::Gaussian,
            2 => BlurType::Directional,
            3 => BlurType::Radial,
            4 => BlurType::Zoom,
            _ => BlurType::Box,
        }
    }
}

/// Blur effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct BlurParams {
    /// Blur type (0=box, 1=gaussian, 2=directional, 3=radial, 4=zoom)
    pub blur_type: u32,
    /// Blur radius in pixels (1-100)
    pub radius: f32,
    /// Direction X component for directional blur (-1.0 to 1.0)
    pub direction_x: f32,
    /// Direction Y component for directional blur (-1.0 to 1.0)
    pub direction_y: f32,
    /// Center X for radial/zoom blur (0.0 to 1.0, normalized)
    pub center_x: f32,
    /// Center Y for radial/zoom blur (0.0 to 1.0, normalized)
    pub center_y: f32,
    /// Blur strength/intensity (0.0 to 1.0)
    pub strength: f32,
    /// Number of samples for quality (8-64)
    pub samples: u32,
}

impl Default for BlurParams {
    fn default() -> Self {
        Self {
            blur_type: 0,
            radius: 5.0,
            direction_x: 1.0,
            direction_y: 0.0,
            center_x: 0.5,
            center_y: 0.5,
            strength: 1.0,
            samples: 16,
        }
    }
}

#[allow(dead_code)]
impl BlurParams {
    /// Create box blur params
    pub fn box_blur(radius: f32) -> Self {
        Self {
            blur_type: BlurType::Box as u32,
            radius: radius.clamp(1.0, 100.0),
            ..Default::default()
        }
    }

    /// Create gaussian blur params
    pub fn gaussian(radius: f32) -> Self {
        Self {
            blur_type: BlurType::Gaussian as u32,
            radius: radius.clamp(1.0, 100.0),
            ..Default::default()
        }
    }

    /// Create directional/motion blur params
    pub fn directional(radius: f32, angle_degrees: f32) -> Self {
        let angle_rad = angle_degrees.to_radians();
        Self {
            blur_type: BlurType::Directional as u32,
            radius: radius.clamp(1.0, 100.0),
            direction_x: angle_rad.cos(),
            direction_y: angle_rad.sin(),
            ..Default::default()
        }
    }

    /// Create radial blur params
    pub fn radial(strength: f32, center_x: f32, center_y: f32) -> Self {
        Self {
            blur_type: BlurType::Radial as u32,
            strength: strength.clamp(0.0, 1.0),
            center_x: center_x.clamp(0.0, 1.0),
            center_y: center_y.clamp(0.0, 1.0),
            samples: 32,
            ..Default::default()
        }
    }

    /// Create zoom blur params
    pub fn zoom(strength: f32, center_x: f32, center_y: f32) -> Self {
        Self {
            blur_type: BlurType::Zoom as u32,
            strength: strength.clamp(0.0, 1.0),
            center_x: center_x.clamp(0.0, 1.0),
            center_y: center_y.clamp(0.0, 1.0),
            samples: 32,
            ..Default::default()
        }
    }

    /// Check if blur is effectively disabled
    pub fn is_identity(&self) -> bool {
        self.radius < 1.0 && self.strength < 0.001
    }
}

/// Sharpen effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct SharpenParams {
    /// Sharpen amount (0.0 to 5.0)
    pub amount: f32,
    /// Radius for unsharp mask (0.5 to 5.0)
    pub radius: f32,
    /// Threshold to avoid sharpening noise (0.0 to 1.0)
    pub threshold: f32,
    /// Padding for alignment
    pub _padding: f32,
}

impl Default for SharpenParams {
    fn default() -> Self {
        Self {
            amount: 1.0,
            radius: 1.0,
            threshold: 0.0,
            _padding: 0.0,
        }
    }
}

#[allow(dead_code)]
impl SharpenParams {
    /// Create sharpen params
    pub fn new(amount: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 5.0),
            ..Default::default()
        }
    }

    /// Create sharpen params with all options
    pub fn with_options(amount: f32, radius: f32, threshold: f32) -> Self {
        Self {
            amount: amount.clamp(0.0, 5.0),
            radius: radius.clamp(0.5, 5.0),
            threshold: threshold.clamp(0.0, 1.0),
            _padding: 0.0,
        }
    }

    /// Check if sharpen is effectively disabled
    pub fn is_identity(&self) -> bool {
        self.amount < 0.001
    }
}

// =============================================================================
// Internal uniform structs (match WGSL layout in BLUR_TEX_SHADER / SHARPEN_TEX_SHADER)
// =============================================================================

/// Uniforms for BLUR_TEX_SHADER — must match WGSL `BlurTexUniforms` exactly
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct BlurTexUniforms {
    blur_type: u32,
    samples: u32,
    radius: f32,
    direction_x: f32,
    direction_y: f32,
    center_x: f32,
    center_y: f32,
    strength: f32,
}

/// Uniforms for SHARPEN_TEX_SHADER — must match WGSL `SharpenTexUniforms` exactly
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct SharpenTexUniforms {
    amount: f32,
    radius: f32,
    threshold: f32,
    _pad: f32,
}

// =============================================================================
// GpuBlurProcessor
// =============================================================================

/// GPU blur processor — texture-to-texture compute pipeline.
///
/// Operates entirely on GPU textures (`wgpu::Texture → wgpu::Texture`).
/// Input may be any float-compatible format; output is always `Rgba8Unorm`.
pub struct GpuBlurProcessor {
    ctx: Arc<GpuContext>,
    /// Texture-based BGL: input_tex(0) + output_tex(1) + uniforms(2)
    bgl: wgpu::BindGroupLayout,
    blur_pipeline: wgpu::ComputePipeline,
    sharpen_pipeline: wgpu::ComputePipeline,
}

impl GpuBlurProcessor {
    /// Create a new GPU blur processor
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Texture-based bind group layout (3 bindings)
        let bgl = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("BlurTex BGL"),
            entries: &[
                // binding 0: input texture (read, any float format)
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
                // binding 1: output texture (write, Rgba8Unorm storage)
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
                // binding 2: uniforms
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

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("BlurTex Pipeline Layout"),
            bind_group_layouts: &[&bgl],
            push_constant_ranges: &[],
        });

        let blur_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("BlurTex Shader"),
            source: wgpu::ShaderSource::Wgsl(shaders::BLUR_TEX_SHADER.into()),
        });
        let blur_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("BlurTex Pipeline"),
            layout: Some(&pipeline_layout),
            module: &blur_shader,
            entry_point: "main",
        });

        let sharpen_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("SharpenTex Shader"),
            source: wgpu::ShaderSource::Wgsl(shaders::SHARPEN_TEX_SHADER.into()),
        });
        let sharpen_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("SharpenTex Pipeline"),
            layout: Some(&pipeline_layout),
            module: &sharpen_shader,
            entry_point: "main",
        });

        Ok(Self {
            ctx,
            bgl,
            blur_pipeline,
            sharpen_pipeline,
        })
    }

    // =========================================================================
    // Public texture API
    // =========================================================================

    /// Apply blur to an input texture, writing results to output texture.
    ///
    /// `input` may be any float-compatible format (Rgba16Float, Rgba8Unorm, etc.)
    /// `output` must be `Rgba8Unorm` with `STORAGE_BINDING` usage.
    pub fn apply_blur_tex(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        params: &BlurParams,
    ) -> Result<()> {
        let uniforms = BlurTexUniforms {
            blur_type: params.blur_type,
            samples: params.samples.clamp(8, 64),
            radius: params.radius,
            direction_x: params.direction_x,
            direction_y: params.direction_y,
            center_x: params.center_x,
            center_y: params.center_y,
            strength: params.strength,
        };
        self.run_effect_tex(input, output, &self.blur_pipeline, &uniforms)
    }

    /// Apply sharpen to an input texture, writing results to output texture.
    ///
    /// `input` may be any float-compatible format.
    /// `output` must be `Rgba8Unorm` with `STORAGE_BINDING` usage.
    pub fn apply_sharpen_tex(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        params: &SharpenParams,
    ) -> Result<()> {
        let uniforms = SharpenTexUniforms {
            amount: params.amount,
            radius: params.radius,
            threshold: params.threshold,
            _pad: 0.0,
        };
        self.run_effect_tex(input, output, &self.sharpen_pipeline, &uniforms)
    }

    // =========================================================================
    // Internal helpers
    // =========================================================================

    /// Run a single texture-to-texture compute pass with uniform data.
    fn run_effect_tex<U: Pod>(
        &self,
        input: &wgpu::Texture,
        output: &wgpu::Texture,
        pipeline: &wgpu::ComputePipeline,
        uniforms: &U,
    ) -> Result<()> {
        let device = self.ctx.device();
        let queue = self.ctx.queue();

        let width = output.width();
        let height = output.height();

        let input_view = input.create_view(&wgpu::TextureViewDescriptor::default());
        let output_view = output.create_view(&wgpu::TextureViewDescriptor::default());

        let uniform_buf = self
            .ctx
            .create_buffer_with_data(bytemuck::bytes_of(uniforms), wgpu::BufferUsages::UNIFORM);

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("BlurTex BindGroup"),
            layout: &self.bgl,
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

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("BlurTex Encoder"),
        });
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("BlurTex Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            let wx = width.div_ceil(16);
            let wy = height.div_ceil(16);
            pass.dispatch_workgroups(wx, wy, 1);
        }
        queue.submit(Some(encoder.finish()));

        // Validate output dimensions match input
        if input.width() != width || input.height() != height {
            return Err(Error::InvalidParameter(format!(
                "Input ({}x{}) and output ({}x{}) texture dimensions must match",
                input.width(),
                input.height(),
                width,
                height,
            )));
        }

        Ok(())
    }

    /// Get GPU context
    #[allow(dead_code)]
    pub fn context(&self) -> &Arc<GpuContext> {
        &self.ctx
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blur_params_default() {
        let params = BlurParams::default();
        assert_eq!(params.blur_type, 0);
        assert_eq!(params.radius, 5.0);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_blur_params_box() {
        let params = BlurParams::box_blur(10.0);
        assert_eq!(params.blur_type, BlurType::Box as u32);
        assert_eq!(params.radius, 10.0);
    }

    #[test]
    fn test_blur_params_gaussian() {
        let params = BlurParams::gaussian(15.0);
        assert_eq!(params.blur_type, BlurType::Gaussian as u32);
        assert_eq!(params.radius, 15.0);
    }

    #[test]
    fn test_blur_params_directional() {
        let params = BlurParams::directional(20.0, 45.0);
        assert_eq!(params.blur_type, BlurType::Directional as u32);
        assert_eq!(params.radius, 20.0);
        // cos(45°) ≈ 0.707
        assert!((params.direction_x - 0.707).abs() < 0.01);
        assert!((params.direction_y - 0.707).abs() < 0.01);
    }

    #[test]
    fn test_blur_params_radial() {
        let params = BlurParams::radial(0.5, 0.3, 0.7);
        assert_eq!(params.blur_type, BlurType::Radial as u32);
        assert_eq!(params.strength, 0.5);
        assert_eq!(params.center_x, 0.3);
        assert_eq!(params.center_y, 0.7);
    }

    #[test]
    fn test_blur_params_zoom() {
        let params = BlurParams::zoom(0.8, 0.5, 0.5);
        assert_eq!(params.blur_type, BlurType::Zoom as u32);
        assert_eq!(params.strength, 0.8);
    }

    #[test]
    fn test_blur_params_clamping() {
        let params = BlurParams::box_blur(200.0);
        assert_eq!(params.radius, 100.0); // Clamped to max

        let params = BlurParams::radial(5.0, 2.0, -1.0);
        assert_eq!(params.strength, 1.0); // Clamped to max
        assert_eq!(params.center_x, 1.0); // Clamped to max
        assert_eq!(params.center_y, 0.0); // Clamped to min
    }

    #[test]
    fn test_blur_params_identity() {
        let params = BlurParams {
            radius: 0.5,
            strength: 0.0,
            ..BlurParams::default()
        };
        assert!(params.is_identity());
    }

    #[test]
    fn test_sharpen_params_default() {
        let params = SharpenParams::default();
        assert_eq!(params.amount, 1.0);
        assert_eq!(params.radius, 1.0);
        assert_eq!(params.threshold, 0.0);
        assert!(!params.is_identity());
    }

    #[test]
    fn test_sharpen_params_new() {
        let params = SharpenParams::new(2.5);
        assert_eq!(params.amount, 2.5);
    }

    #[test]
    fn test_sharpen_params_with_options() {
        let params = SharpenParams::with_options(1.5, 2.0, 0.1);
        assert_eq!(params.amount, 1.5);
        assert_eq!(params.radius, 2.0);
        assert_eq!(params.threshold, 0.1);
    }

    #[test]
    fn test_sharpen_params_clamping() {
        let params = SharpenParams::with_options(10.0, 10.0, 2.0);
        assert_eq!(params.amount, 5.0); // Clamped
        assert_eq!(params.radius, 5.0); // Clamped
        assert_eq!(params.threshold, 1.0); // Clamped
    }

    #[test]
    fn test_sharpen_params_identity() {
        let params = SharpenParams::new(0.0);
        assert!(params.is_identity());
    }

    #[test]
    fn test_blur_type_from_u32() {
        assert_eq!(BlurType::from(0), BlurType::Box);
        assert_eq!(BlurType::from(1), BlurType::Gaussian);
        assert_eq!(BlurType::from(2), BlurType::Directional);
        assert_eq!(BlurType::from(3), BlurType::Radial);
        assert_eq!(BlurType::from(4), BlurType::Zoom);
        assert_eq!(BlurType::from(99), BlurType::Box); // Default fallback
    }

    #[test]
    fn test_blur_tex_uniforms_size() {
        // BlurTexUniforms must be 32 bytes (8 × f32/u32)
        assert_eq!(std::mem::size_of::<BlurTexUniforms>(), 32);
    }

    #[test]
    fn test_sharpen_tex_uniforms_size() {
        // SharpenTexUniforms must be 16 bytes (4 × f32)
        assert_eq!(std::mem::size_of::<SharpenTexUniforms>(), 16);
    }
}
