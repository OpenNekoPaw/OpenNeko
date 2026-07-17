//! GPU Transition Processor
//!
//! Provides GPU-accelerated transition effects including:
//! - Fade (crossfade)
//! - Wipe (left, right, up, down)
//! - Iris (circle, rectangle)
//! - Clock wipe
//! - Slide (left, right)
//! - Zoom (in, out)
//! - Dissolve
//! - Pixelate
//! - Ripple
//! - Swirl
//! - Glitch
//! - Flash

#![allow(dead_code)]

use super::buffer_pool::BufferPool;
use super::context::GpuContext;
use super::shaders;
use crate::error::{GpuError as Error, GpuResult as Result};

use bytemuck::{Pod, Zeroable};
use std::sync::Arc;

/// Transition type enumeration
#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum TransitionType {
    #[default]
    Fade = 0,
    WipeLeft = 1,
    WipeRight = 2,
    WipeUp = 3,
    WipeDown = 4,
    IrisCircle = 5,
    IrisRectangle = 6,
    Clock = 7,
    SlideLeft = 8,
    SlideRight = 9,
    ZoomIn = 10,
    ZoomOut = 11,
    Dissolve = 12,
    Pixelate = 13,
    Ripple = 14,
    Swirl = 15,
    Glitch = 16,
    Flash = 17,
}

impl TransitionType {
    /// Create from u32 value
    pub fn from_u32(value: u32) -> Self {
        match value {
            0 => TransitionType::Fade,
            1 => TransitionType::WipeLeft,
            2 => TransitionType::WipeRight,
            3 => TransitionType::WipeUp,
            4 => TransitionType::WipeDown,
            5 => TransitionType::IrisCircle,
            6 => TransitionType::IrisRectangle,
            7 => TransitionType::Clock,
            8 => TransitionType::SlideLeft,
            9 => TransitionType::SlideRight,
            10 => TransitionType::ZoomIn,
            11 => TransitionType::ZoomOut,
            12 => TransitionType::Dissolve,
            13 => TransitionType::Pixelate,
            14 => TransitionType::Ripple,
            15 => TransitionType::Swirl,
            16 => TransitionType::Glitch,
            17 => TransitionType::Flash,
            _ => TransitionType::Fade,
        }
    }

    /// Create from string
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "fade" | "crossfade" => TransitionType::Fade,
            "wipe_left" | "wipeleft" => TransitionType::WipeLeft,
            "wipe_right" | "wiperight" => TransitionType::WipeRight,
            "wipe_up" | "wipeup" => TransitionType::WipeUp,
            "wipe_down" | "wipedown" => TransitionType::WipeDown,
            "iris_circle" | "iriscircle" => TransitionType::IrisCircle,
            "iris_rectangle" | "irisrectangle" => TransitionType::IrisRectangle,
            "clock" => TransitionType::Clock,
            "slide_left" | "slideleft" => TransitionType::SlideLeft,
            "slide_right" | "slideright" => TransitionType::SlideRight,
            "zoom_in" | "zoomin" => TransitionType::ZoomIn,
            "zoom_out" | "zoomout" => TransitionType::ZoomOut,
            "dissolve" => TransitionType::Dissolve,
            "pixelate" => TransitionType::Pixelate,
            "ripple" => TransitionType::Ripple,
            "swirl" => TransitionType::Swirl,
            "glitch" => TransitionType::Glitch,
            "flash" => TransitionType::Flash,
            _ => TransitionType::Fade,
        }
    }
}

/// Transition effect parameters
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct TransitionParams {
    /// Transition type (0-17)
    pub transition_type: u32,
    /// Transition progress (0.0 to 1.0)
    pub progress: f32,
    /// Edge feather/softness (0.0 to 1.0)
    pub feather: f32,
    /// Center X for radial transitions (0.0 to 1.0)
    pub center_x: f32,
    /// Center Y for radial transitions (0.0 to 1.0)
    pub center_y: f32,
    /// Angle for directional transitions (radians)
    pub angle: f32,
    /// Additional parameter 1 (transition-specific)
    pub param1: f32,
    /// Additional parameter 2 (transition-specific)
    pub param2: f32,
}

impl Default for TransitionParams {
    fn default() -> Self {
        Self {
            transition_type: 0,
            progress: 0.0,
            feather: 0.02,
            center_x: 0.5,
            center_y: 0.5,
            angle: 0.0,
            param1: 0.0,
            param2: 0.0,
        }
    }
}

impl TransitionParams {
    /// Create new transition params
    pub fn new(transition_type: TransitionType, progress: f32) -> Self {
        Self {
            transition_type: transition_type as u32,
            progress: progress.clamp(0.0, 1.0),
            ..Default::default()
        }
    }

    /// Create with all options
    pub fn with_options(
        transition_type: TransitionType,
        progress: f32,
        feather: f32,
        center_x: f32,
        center_y: f32,
        angle: f32,
    ) -> Self {
        Self {
            transition_type: transition_type as u32,
            progress: progress.clamp(0.0, 1.0),
            feather: feather.clamp(0.0, 1.0),
            center_x: center_x.clamp(0.0, 1.0),
            center_y: center_y.clamp(0.0, 1.0),
            angle,
            param1: 0.0,
            param2: 0.0,
        }
    }

    /// Set additional parameters
    pub fn with_params(mut self, param1: f32, param2: f32) -> Self {
        self.param1 = param1;
        self.param2 = param2;
        self
    }

    /// Check if transition is at start (from frame only)
    pub fn is_start(&self) -> bool {
        self.progress < 0.001
    }

    /// Check if transition is at end (to frame only)
    pub fn is_end(&self) -> bool {
        self.progress > 0.999
    }
}

/// Uniform buffer for transition shader
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct TransitionUniforms {
    width: u32,
    height: u32,
    transition_type: u32,
    _pad0: u32,
    progress: f32,
    feather: f32,
    center_x: f32,
    center_y: f32,
    angle: f32,
    param1: f32,
    param2: f32,
    _pad1: f32,
}

/// GPU transition processor using compute shaders
///
/// **Deprecated**: Use [`TextureTransitionProcessor`](super::TextureTransitionProcessor) for
/// the texture-based export/preview pipeline. This buffer-based processor is only used by
/// the legacy composite path in `services/impls/timeline.rs`.
#[deprecated(note = "Use TextureTransitionProcessor for the texture-based pipeline")]
pub struct GpuTransitionProcessor {
    ctx: Arc<GpuContext>,
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    buffer_pool: BufferPool,
}

#[allow(deprecated)]
impl GpuTransitionProcessor {
    /// Create a new GPU transition processor
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Create shader module
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Transition Shader"),
            source: wgpu::ShaderSource::Wgsl(shaders::TRANSITION_COMPUTE_SHADER.into()),
        });

        // Create bind group layout
        // Transitions need two input buffers (from and to frames)
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Transition Bind Group Layout"),
            entries: &[
                // From frame (read-only storage)
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
                // To frame (read-only storage)
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Output buffer (read-write storage)
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Uniforms
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
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

        // Create pipeline layout
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Transition Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // Create compute pipeline
        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Transition Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: "main",
        });

        // Create buffer pool
        let buffer_pool = BufferPool::new(ctx.device().clone(), wgpu::BufferUsages::STORAGE, 8);

        Ok(Self {
            ctx,
            pipeline,
            bind_group_layout,
            buffer_pool,
        })
    }

    /// Apply transition between two frames
    pub fn apply_transition(
        &self,
        from_frame: &[u8],
        to_frame: &[u8],
        width: u32,
        height: u32,
        params: &TransitionParams,
    ) -> Result<Vec<u8>> {
        let expected_size = (width * height * 4) as usize;

        // Validate input sizes
        if from_frame.len() != expected_size {
            return Err(Error::InvalidParameter(format!(
                "From frame size mismatch: expected {}, got {}",
                expected_size,
                from_frame.len()
            )));
        }

        if to_frame.len() != expected_size {
            return Err(Error::InvalidParameter(format!(
                "To frame size mismatch: expected {}, got {}",
                expected_size,
                to_frame.len()
            )));
        }

        // Optimization: skip GPU processing for edge cases
        if params.is_start() {
            return Ok(from_frame.to_vec());
        }
        if params.is_end() {
            return Ok(to_frame.to_vec());
        }

        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Create input buffers
        let from_buffer = self
            .ctx
            .create_buffer_with_data(from_frame, wgpu::BufferUsages::STORAGE);
        let to_buffer = self
            .ctx
            .create_buffer_with_data(to_frame, wgpu::BufferUsages::STORAGE);

        // Acquire output buffer from pool
        let output_pooled = self.buffer_pool.acquire(from_frame.len() as u64);
        let output_buffer = output_pooled.buffer();

        // Create uniform buffer
        let uniforms = TransitionUniforms {
            width,
            height,
            transition_type: params.transition_type,
            _pad0: 0,
            progress: params.progress,
            feather: params.feather,
            center_x: params.center_x,
            center_y: params.center_y,
            angle: params.angle,
            param1: params.param1,
            param2: params.param2,
            _pad1: 0.0,
        };

        let uniform_buffer = self
            .ctx
            .create_buffer_with_data(bytemuck::bytes_of(&uniforms), wgpu::BufferUsages::UNIFORM);

        // Create bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Transition Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: from_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: to_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: output_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: uniform_buffer.as_entire_binding(),
                },
            ],
        });

        // Create command encoder and dispatch
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Transition Encoder"),
        });

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Transition Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);

            // Workgroup size is 16x16
            let workgroups_x = width.div_ceil(16);
            let workgroups_y = height.div_ceil(16);
            pass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
        }

        queue.submit(Some(encoder.finish()));

        // Read back results
        self.ctx.read_buffer_sync(output_buffer)
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
    fn test_transition_type_from_u32() {
        assert_eq!(TransitionType::from_u32(0), TransitionType::Fade);
        assert_eq!(TransitionType::from_u32(1), TransitionType::WipeLeft);
        assert_eq!(TransitionType::from_u32(17), TransitionType::Flash);
        assert_eq!(TransitionType::from_u32(100), TransitionType::Fade); // Invalid -> default
    }

    #[test]
    fn test_transition_type_from_str() {
        assert_eq!(TransitionType::from_str("fade"), TransitionType::Fade);
        assert_eq!(
            TransitionType::from_str("wipe_left"),
            TransitionType::WipeLeft
        );
        assert_eq!(
            TransitionType::from_str("WipeLeft"),
            TransitionType::WipeLeft
        );
        assert_eq!(
            TransitionType::from_str("iris_circle"),
            TransitionType::IrisCircle
        );
        assert_eq!(TransitionType::from_str("unknown"), TransitionType::Fade);
    }

    #[test]
    fn test_transition_params_default() {
        let params = TransitionParams::default();
        assert_eq!(params.transition_type, 0);
        assert_eq!(params.progress, 0.0);
        assert!(params.is_start());
        assert!(!params.is_end());
    }

    #[test]
    fn test_transition_params_new() {
        let params = TransitionParams::new(TransitionType::WipeLeft, 0.5);
        assert_eq!(params.transition_type, 1);
        assert_eq!(params.progress, 0.5);
        assert!(!params.is_start());
        assert!(!params.is_end());
    }

    #[test]
    fn test_transition_params_clamping() {
        let params = TransitionParams::with_options(
            TransitionType::Fade,
            1.5,  // Should clamp to 1.0
            2.0,  // Should clamp to 1.0
            -0.5, // Should clamp to 0.0
            1.5,  // Should clamp to 1.0
            0.0,
        );
        assert_eq!(params.progress, 1.0);
        assert_eq!(params.feather, 1.0);
        assert_eq!(params.center_x, 0.0);
        assert_eq!(params.center_y, 1.0);
    }

    #[test]
    fn test_transition_params_is_start_end() {
        let start = TransitionParams::new(TransitionType::Fade, 0.0);
        assert!(start.is_start());
        assert!(!start.is_end());

        let end = TransitionParams::new(TransitionType::Fade, 1.0);
        assert!(!end.is_start());
        assert!(end.is_end());

        let mid = TransitionParams::new(TransitionType::Fade, 0.5);
        assert!(!mid.is_start());
        assert!(!mid.is_end());
    }
}
