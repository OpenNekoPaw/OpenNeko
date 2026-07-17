//! GPU Compositor - Multi-layer GPU compositing
//!
//! Provides high-performance multi-track video compositing using wgpu compute shaders.
//!
//! Features:
//! - Z-order layer sorting
//! - Multiple blend modes (Photoshop-compatible)
//! - 2D transforms (position, scale, rotation)
//! - Alpha compositing with Porter-Duff
//! - Mask support

use super::context::GpuContext;
use super::shaders;
use crate::error::{GpuError as Error, GpuResult as Result};

use bytemuck::{Pod, Zeroable};
pub use neko_engine_types::BlendMode;
use std::sync::Arc;

// =============================================================================
// Constants
// =============================================================================

/// Maximum number of layers per composite pass
pub const MAX_LAYERS: usize = 32;

// =============================================================================
// Layer Types
// =============================================================================

/// 2D Transform for a layer
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct Transform2D {
    /// Position X (pixels)
    pub x: f32,
    /// Position Y (pixels)
    pub y: f32,
    /// Scale X (1.0 = 100%)
    pub scale_x: f32,
    /// Scale Y (1.0 = 100%)
    pub scale_y: f32,
    /// Rotation (degrees)
    pub rotation: f32,
    /// Anchor point X (0.0 = left, 0.5 = center, 1.0 = right)
    pub anchor_x: f32,
    /// Anchor point Y (0.0 = top, 0.5 = center, 1.0 = bottom)
    pub anchor_y: f32,
    /// Padding for alignment
    pub _padding: f32,
}

impl Default for Transform2D {
    fn default() -> Self {
        Self {
            x: 0.0,
            y: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            rotation: 0.0,
            // Default anchor at top-left (0,0) for simpler positioning
            // Layer position (x,y) will be the top-left corner
            anchor_x: 0.0,
            anchor_y: 0.0,
            _padding: 0.0,
        }
    }
}

impl Transform2D {
    /// Create a transform with center anchor point
    pub fn with_center_anchor() -> Self {
        Self {
            anchor_x: 0.5,
            anchor_y: 0.5,
            ..Default::default()
        }
    }
}

/// Layer data for GPU shader
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
pub struct GpuLayerData {
    /// Source texture offset in combined buffer (byte offset)
    pub src_offset: u32,
    /// Source width
    pub src_width: u32,
    /// Source height
    pub src_height: u32,
    /// Blend mode
    pub blend_mode: u32,
    /// Transform data
    pub transform: Transform2D,
    /// Opacity (0.0 - 1.0)
    pub opacity: f32,
    /// Z-index
    pub z_index: i32,
    /// Has mask
    pub has_mask: u32,
    /// Mask inverted
    pub mask_inverted: u32,
    /// Pixel format (0 = RGBA, 1 = YUV420P)
    pub pixel_format: u32,
    /// Padding for alignment
    pub _padding1: u32,
    pub _padding2: u32,
    pub _padding3: u32,
}

impl Default for GpuLayerData {
    fn default() -> Self {
        Self {
            src_offset: 0,
            src_width: 0,
            src_height: 0,
            blend_mode: BlendMode::Normal.shader_code(),
            transform: Transform2D::default(),
            opacity: 1.0,
            z_index: 0,
            has_mask: 0,
            mask_inverted: 0,
            pixel_format: LayerPixelFormat::Rgba as u32,
            _padding1: 0,
            _padding2: 0,
            _padding3: 0,
        }
    }
}

/// Compositor uniforms for GPU shader
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct CompositorUniforms {
    /// Output width
    output_width: u32,
    /// Output height
    output_height: u32,
    /// Number of layers
    layer_count: u32,
    /// Background color (RGBA packed)
    bg_color: u32,
}

/// Pixel format for composite layer
#[repr(u32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LayerPixelFormat {
    /// RGBA 8-bit per channel (4 bytes per pixel)
    #[default]
    Rgba = 0,
    /// YUV420P planar format (1.5 bytes per pixel)
    /// Data layout: Y plane (W×H) + U plane (W/2×H/2) + V plane (W/2×H/2)
    Yuv420p = 1,
    /// NV12 semi-planar format (1.5 bytes per pixel)
    /// Data layout: Y plane (W×H) + UV interleaved plane (W/2×H/2×2)
    Nv12 = 2,
}

/// Composite layer input
#[derive(Debug, Clone)]
pub struct CompositeLayer {
    /// Layer pixel data (format depends on pixel_format field)
    pub data: Vec<u8>,
    /// Layer width
    pub width: u32,
    /// Layer height
    pub height: u32,
    /// Pixel format of the data
    pub pixel_format: LayerPixelFormat,
    /// Transform
    pub transform: Transform2D,
    /// Opacity (0.0 - 1.0)
    pub opacity: f32,
    /// Blend mode
    pub blend_mode: BlendMode,
    /// Z-index (lower = bottom)
    pub z_index: i32,
    /// Optional mask data (grayscale, same size as layer)
    pub mask: Option<Vec<u8>>,
    /// Invert mask
    pub mask_inverted: bool,
}

impl Default for CompositeLayer {
    fn default() -> Self {
        Self {
            data: Vec::new(),
            width: 0,
            height: 0,
            pixel_format: LayerPixelFormat::default(),
            transform: Transform2D::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            z_index: 0,
            mask: None,
            mask_inverted: false,
        }
    }
}

/// Composite result
#[derive(Debug)]
pub struct CompositeResult {
    /// Output pixel data (RGBA)
    pub data: Vec<u8>,
    /// Output width
    pub width: u32,
    /// Output height
    pub height: u32,
    /// Compositing time in milliseconds
    pub time_ms: f64,
    /// Number of layers composited
    pub layer_count: usize,
}

// =============================================================================
// GPU Compositor
// =============================================================================

/// GPU-accelerated multi-layer compositor
pub struct GpuCompositor {
    ctx: Arc<GpuContext>,
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
}

impl GpuCompositor {
    /// Create a new GPU compositor
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Create composite shader module
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Compositor Shader"),
            source: wgpu::ShaderSource::Wgsl(shaders::COMPOSITOR_SHADER.into()),
        });

        // Create bind group layout
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Compositor Bind Group Layout"),
            entries: &[
                // Layer data buffer (read-only storage)
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
                // Combined input textures buffer (read-only storage)
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
            label: Some("Compositor Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // Create compute pipeline
        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Compositor Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: "composite_main",
        });

        Ok(Self {
            ctx,
            pipeline,
            bind_group_layout,
        })
    }

    /// Composite multiple layers into a single output
    pub fn composite(
        &self,
        layers: &[CompositeLayer],
        output_width: u32,
        output_height: u32,
        background_color: [f32; 4],
    ) -> Result<CompositeResult> {
        let start_time = std::time::Instant::now();

        if layers.is_empty() {
            // Return solid background
            let output_size = (output_width * output_height * 4) as usize;
            let mut data = vec![0u8; output_size];
            let bg_r = (background_color[0] * 255.0) as u8;
            let bg_g = (background_color[1] * 255.0) as u8;
            let bg_b = (background_color[2] * 255.0) as u8;
            let bg_a = (background_color[3] * 255.0) as u8;
            for i in (0..output_size).step_by(4) {
                data[i] = bg_r;
                data[i + 1] = bg_g;
                data[i + 2] = bg_b;
                data[i + 3] = bg_a;
            }
            return Ok(CompositeResult {
                data,
                width: output_width,
                height: output_height,
                time_ms: start_time.elapsed().as_secs_f64() * 1000.0,
                layer_count: 0,
            });
        }

        // Sort layers by z_index
        let mut sorted_layers: Vec<_> = layers.iter().enumerate().collect();
        sorted_layers.sort_by_key(|(_, l)| l.z_index);

        if sorted_layers.len() > MAX_LAYERS {
            return Err(Error::InvalidParameter(format!(
                "Too many layers: {} (max {})",
                sorted_layers.len(),
                MAX_LAYERS
            )));
        }

        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Prepare layer data and combined texture buffer
        let mut gpu_layers: Vec<GpuLayerData> = Vec::with_capacity(sorted_layers.len());
        let mut combined_textures: Vec<u8> = Vec::new();
        let mut current_offset: u32 = 0;

        for (_, layer) in &sorted_layers {
            // Validate data size based on pixel format
            let (data_size, expected_size) = match layer.pixel_format {
                LayerPixelFormat::Rgba => {
                    let expected = (layer.width * layer.height * 4) as usize;
                    (layer.data.len(), expected)
                }
                LayerPixelFormat::Yuv420p => {
                    let y_size = (layer.width * layer.height) as usize;
                    let uv_size = ((layer.width / 2) * (layer.height / 2)) as usize;
                    let expected = y_size + uv_size * 2;
                    (layer.data.len(), expected)
                }
                LayerPixelFormat::Nv12 => {
                    let y_size = (layer.width * layer.height) as usize;
                    let uv_size = ((layer.width / 2) * (layer.height / 2) * 2) as usize;
                    let expected = y_size + uv_size;
                    (layer.data.len(), expected)
                }
            };

            if data_size < expected_size {
                return Err(Error::InvalidParameter(format!(
                    "{:?} layer data size mismatch: expected {}, got {}",
                    layer.pixel_format, expected_size, data_size
                )));
            }

            let gpu_layer = GpuLayerData {
                src_offset: current_offset,
                src_width: layer.width,
                src_height: layer.height,
                blend_mode: layer.blend_mode.shader_code(),
                transform: layer.transform,
                opacity: layer.opacity.clamp(0.0, 1.0),
                z_index: layer.z_index,
                has_mask: if layer.mask.is_some() { 1 } else { 0 },
                mask_inverted: if layer.mask_inverted { 1 } else { 0 },
                pixel_format: layer.pixel_format as u32,
                _padding1: 0,
                _padding2: 0,
                _padding3: 0,
            };

            gpu_layers.push(gpu_layer);

            // Append raw data to combined buffer (YUV or RGBA, no conversion)
            // Pad to 4-byte alignment for GPU buffer access
            let aligned_len = (layer.data.len() + 3) & !3;
            combined_textures.extend_from_slice(&layer.data);
            // Add padding bytes if needed
            combined_textures.resize(
                combined_textures.len() + (aligned_len - layer.data.len()),
                0,
            );
            current_offset += aligned_len as u32;

            // Append mask data if present (tracked in offset for subsequent layers)
            if let Some(ref mask) = layer.mask {
                combined_textures.extend_from_slice(mask);
                // Important: include mask size in offset for next layer
                current_offset += mask.len() as u32;
            }
        }

        // Pad gpu_layers to fixed size for shader
        while gpu_layers.len() < MAX_LAYERS {
            gpu_layers.push(GpuLayerData::default());
        }

        // Create buffers
        let layer_data_buffer = self.ctx.create_buffer_with_data(
            bytemuck::cast_slice(&gpu_layers),
            wgpu::BufferUsages::STORAGE,
        );

        let texture_buffer = self
            .ctx
            .create_buffer_with_data(&combined_textures, wgpu::BufferUsages::STORAGE);

        let output_size = (output_width * output_height * 4) as u64;
        let output_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Compositor Output Buffer"),
            size: output_size,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        // Pack background color
        let bg_packed = ((background_color[0] * 255.0) as u32)
            | (((background_color[1] * 255.0) as u32) << 8)
            | (((background_color[2] * 255.0) as u32) << 16)
            | (((background_color[3] * 255.0) as u32) << 24);

        let uniforms = CompositorUniforms {
            output_width,
            output_height,
            layer_count: sorted_layers.len() as u32,
            bg_color: bg_packed,
        };
        let uniform_buffer = self
            .ctx
            .create_buffer_with_data(bytemuck::bytes_of(&uniforms), wgpu::BufferUsages::UNIFORM);

        // Create bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Compositor Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: layer_data_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: texture_buffer.as_entire_binding(),
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
            label: Some("Compositor Encoder"),
        });

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Compositor Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);

            // Workgroup size is 16x16
            let workgroups_x = output_width.div_ceil(16);
            let workgroups_y = output_height.div_ceil(16);
            pass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
        }

        // Submit commands
        queue.submit(Some(encoder.finish()));

        // Read back results
        let data = self.ctx.read_buffer_sync(&output_buffer)?;

        let elapsed = start_time.elapsed();

        Ok(CompositeResult {
            data,
            width: output_width,
            height: output_height,
            time_ms: elapsed.as_secs_f64() * 1000.0,
            layer_count: sorted_layers.len(),
        })
    }

    /// Get GPU context
    #[allow(dead_code)]
    pub fn context(&self) -> &Arc<GpuContext> {
        &self.ctx
    }
}

// YUV420P to RGB conversion is now done in GPU shader (COMPOSITOR_SHADER)
// See shaders/mod.rs for the GPU-accelerated implementation

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blend_mode_from_str() {
        // Basic
        assert_eq!(BlendMode::from_str("normal"), BlendMode::Normal);
        assert_eq!(BlendMode::from_str("dissolve"), BlendMode::Dissolve);

        // Darken Group
        assert_eq!(BlendMode::from_str("darken"), BlendMode::Darken);
        assert_eq!(BlendMode::from_str("multiply"), BlendMode::Multiply);
        assert_eq!(BlendMode::from_str("color_burn"), BlendMode::ColorBurn);
        assert_eq!(BlendMode::from_str("linear_burn"), BlendMode::LinearBurn);
        assert_eq!(BlendMode::from_str("darker_color"), BlendMode::DarkerColor);

        // Lighten Group
        assert_eq!(BlendMode::from_str("lighten"), BlendMode::Lighten);
        assert_eq!(BlendMode::from_str("screen"), BlendMode::Screen);
        assert_eq!(BlendMode::from_str("color_dodge"), BlendMode::ColorDodge);
        assert_eq!(BlendMode::from_str("linear_dodge"), BlendMode::LinearDodge);
        assert_eq!(BlendMode::from_str("add"), BlendMode::LinearDodge); // alias
        assert_eq!(
            BlendMode::from_str("lighter_color"),
            BlendMode::LighterColor
        );

        // Contrast Group
        assert_eq!(BlendMode::from_str("overlay"), BlendMode::Overlay);
        assert_eq!(BlendMode::from_str("soft_light"), BlendMode::SoftLight);
        assert_eq!(BlendMode::from_str("hard_light"), BlendMode::HardLight);
        assert_eq!(BlendMode::from_str("vivid_light"), BlendMode::VividLight);
        assert_eq!(BlendMode::from_str("linear_light"), BlendMode::LinearLight);
        assert_eq!(BlendMode::from_str("pin_light"), BlendMode::PinLight);
        assert_eq!(BlendMode::from_str("hard_mix"), BlendMode::HardMix);

        // Difference Group
        assert_eq!(BlendMode::from_str("difference"), BlendMode::Difference);
        assert_eq!(BlendMode::from_str("exclusion"), BlendMode::Exclusion);
        assert_eq!(BlendMode::from_str("subtract"), BlendMode::Subtract);
        assert_eq!(BlendMode::from_str("divide"), BlendMode::Divide);

        // HSL Group
        assert_eq!(BlendMode::from_str("hue"), BlendMode::Hue);
        assert_eq!(BlendMode::from_str("saturation"), BlendMode::Saturation);
        assert_eq!(BlendMode::from_str("color"), BlendMode::Color);
        assert_eq!(BlendMode::from_str("luminosity"), BlendMode::Luminosity);

        // Unknown defaults to Normal
        assert_eq!(BlendMode::from_str("unknown"), BlendMode::Normal);
    }

    #[test]
    fn test_transform_default() {
        let t = Transform2D::default();
        assert_eq!(t.x, 0.0);
        assert_eq!(t.y, 0.0);
        assert_eq!(t.scale_x, 1.0);
        assert_eq!(t.scale_y, 1.0);
        assert_eq!(t.rotation, 0.0);
        // Default anchor at top-left for simpler positioning
        assert_eq!(t.anchor_x, 0.0);
        assert_eq!(t.anchor_y, 0.0);
    }

    #[test]
    fn test_transform_center_anchor() {
        let t = Transform2D::with_center_anchor();
        assert_eq!(t.anchor_x, 0.5);
        assert_eq!(t.anchor_y, 0.5);
    }

    /// Create a solid color image for testing
    fn create_solid_image(width: u32, height: u32, r: u8, g: u8, b: u8, a: u8) -> Vec<u8> {
        let size = (width * height * 4) as usize;
        let mut data = Vec::with_capacity(size);
        for _ in 0..(width * height) {
            data.push(r);
            data.push(g);
            data.push(b);
            data.push(a);
        }
        data
    }

    #[tokio::test]
    async fn test_compositor_empty_layers() {
        use crate::GpuContext;

        let ctx = match GpuContext::new().await {
            Ok(c) => Arc::new(c),
            Err(e) => {
                eprintln!("Skipping GPU test: {:?}", e);
                return;
            }
        };

        let compositor = GpuCompositor::new(ctx).unwrap();
        let result = compositor
            .composite(&[], 64, 64, [0.0, 0.0, 0.0, 1.0])
            .unwrap();

        assert_eq!(result.width, 64);
        assert_eq!(result.height, 64);
        assert_eq!(result.layer_count, 0);

        // Should be solid black (background color)
        assert_eq!(result.data.len(), (64 * 64 * 4) as usize);
        // Check first pixel is black with alpha 1.0
        assert_eq!(result.data[0], 0); // R
        assert_eq!(result.data[1], 0); // G
        assert_eq!(result.data[2], 0); // B
        assert_eq!(result.data[3], 255); // A
    }

    #[tokio::test]
    async fn test_compositor_single_layer() {
        use crate::GpuContext;

        let ctx = match GpuContext::new().await {
            Ok(c) => Arc::new(c),
            Err(e) => {
                eprintln!("Skipping GPU test: {:?}", e);
                return;
            }
        };

        let compositor = GpuCompositor::new(ctx).unwrap();

        // Create a solid red layer
        let layer = CompositeLayer {
            data: create_solid_image(4, 4, 255, 0, 0, 255),
            width: 4,
            height: 4,
            transform: Transform2D::default(), // anchor at (0,0)
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            z_index: 0,
            ..Default::default()
        };

        let result = compositor
            .composite(&[layer], 4, 4, [0.0, 0.0, 0.0, 1.0])
            .unwrap();

        assert_eq!(result.width, 4);
        assert_eq!(result.height, 4);
        assert_eq!(result.layer_count, 1);

        // Check first pixel is red
        println!(
            "Single layer test - Pixel 0: R={}, G={}, B={}, A={}",
            result.data[0], result.data[1], result.data[2], result.data[3]
        );
        assert_eq!(result.data[0], 255, "Red channel should be 255");
        assert_eq!(result.data[1], 0, "Green channel should be 0");
        assert_eq!(result.data[2], 0, "Blue channel should be 0");
        assert_eq!(result.data[3], 255, "Alpha channel should be 255");
    }

    #[tokio::test]
    async fn test_compositor_alpha_blend() {
        use crate::GpuContext;

        let ctx = match GpuContext::new().await {
            Ok(c) => Arc::new(c),
            Err(e) => {
                eprintln!("Skipping GPU test: {:?}", e);
                return;
            }
        };

        let compositor = GpuCompositor::new(ctx).unwrap();

        // Bottom layer: solid red
        let layer1 = CompositeLayer {
            data: create_solid_image(4, 4, 255, 0, 0, 255),
            width: 4,
            height: 4,
            transform: Transform2D::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            z_index: 0,
            ..Default::default()
        };

        // Top layer: solid blue with 50% alpha
        let layer2 = CompositeLayer {
            data: create_solid_image(4, 4, 0, 0, 255, 128), // 50% alpha in data
            width: 4,
            height: 4,
            transform: Transform2D::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            z_index: 1,
            ..Default::default()
        };

        let result = compositor
            .composite(&[layer1, layer2], 4, 4, [0.0, 0.0, 0.0, 1.0])
            .unwrap();

        // First pixel should be purple-ish (red + blue with alpha blend)
        // With 50% alpha blue over solid red:
        // out_alpha = 0.5 + 1.0 * 0.5 = 1.0
        // out_r = (0 * 0.5 + 255 * 1.0 * 0.5) / 1.0 = 127.5
        // out_b = (255 * 0.5 + 0 * 1.0 * 0.5) / 1.0 = 127.5
        println!(
            "Alpha blend test - Pixel 0: R={}, G={}, B={}, A={}",
            result.data[0], result.data[1], result.data[2], result.data[3]
        );

        // Allow some tolerance for GPU precision
        assert!(
            (result.data[0] as i32 - 127).abs() < 5,
            "Red should be ~127, got {}",
            result.data[0]
        );
        assert!(
            result.data[1] < 5,
            "Green should be ~0, got {}",
            result.data[1]
        );
        assert!(
            (result.data[2] as i32 - 127).abs() < 5,
            "Blue should be ~127, got {}",
            result.data[2]
        );
        assert_eq!(result.data[3], 255, "Alpha should be 255");
    }

    #[tokio::test]
    async fn test_compositor_multiply_blend() {
        use crate::GpuContext;

        let ctx = match GpuContext::new().await {
            Ok(c) => Arc::new(c),
            Err(e) => {
                eprintln!("Skipping GPU test: {:?}", e);
                return;
            }
        };

        let compositor = GpuCompositor::new(ctx).unwrap();

        // Bottom layer: 50% gray
        let layer1 = CompositeLayer {
            data: create_solid_image(4, 4, 128, 128, 128, 255),
            width: 4,
            height: 4,
            transform: Transform2D::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Normal,
            z_index: 0,
            ..Default::default()
        };

        // Top layer: white with multiply blend
        // multiply(0.5, 1.0) = 0.5
        let layer2 = CompositeLayer {
            data: create_solid_image(4, 4, 255, 255, 255, 255),
            width: 4,
            height: 4,
            transform: Transform2D::default(),
            opacity: 1.0,
            blend_mode: BlendMode::Multiply,
            z_index: 1,
            ..Default::default()
        };

        let result = compositor
            .composite(&[layer1, layer2], 4, 4, [0.0, 0.0, 0.0, 1.0])
            .unwrap();

        println!(
            "Multiply blend test - Pixel 0: R={}, G={}, B={}, A={}",
            result.data[0], result.data[1], result.data[2], result.data[3]
        );

        // multiply(128/255, 255/255) * 255 ≈ 128
        assert!(
            (result.data[0] as i32 - 128).abs() < 5,
            "Result should be ~128, got {}",
            result.data[0]
        );
    }
}
