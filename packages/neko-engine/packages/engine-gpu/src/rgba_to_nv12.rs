//! RGBA to NV12 Conversion - GPU compute shader for encoder input
//!
//! This module provides GPU-accelerated RGBA to NV12 conversion for:
//! - Hardware encoder input (NVENC, VideoToolbox, VAAPI prefer NV12)
//! - Zero-copy encoding pipeline (avoid CPU format conversion)
//!
//! NV12 Format:
//! - Y plane: Full resolution, 1 byte per pixel (luma)
//! - UV plane: Half resolution, 2 bytes per pixel (interleaved Cb/Cr)

use crate::error::{GpuError as Error, GpuResult as Result};
use crate::GpuContext;
use std::sync::Arc;

/// RGBA to NV12 conversion shader
pub const RGBA_TO_NV12_SHADER: &str = r#"
// RGBA to NV12 Conversion Compute Shader
// Converts RGBA texture to NV12 dual-plane format for hardware encoders

struct Uniforms {
    width: u32,
    height: u32,
    // Color space: 0 = BT.601, 1 = BT.709, 2 = BT.2020
    color_space: u32,
    _padding: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var input_texture: texture_2d<f32>;
@group(0) @binding(2) var<storage, read_write> y_plane: array<u32>;
@group(0) @binding(3) var<storage, read_write> uv_plane: array<u32>;

// BT.601 RGB to YUV (SD video)
fn rgb_to_yuv_bt601(rgb: vec3<f32>) -> vec3<f32> {
    let y = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
    let u = -0.169 * rgb.r - 0.331 * rgb.g + 0.500 * rgb.b + 0.5;
    let v = 0.500 * rgb.r - 0.419 * rgb.g - 0.081 * rgb.b + 0.5;
    return vec3<f32>(y, u, v);
}

// BT.709 RGB to YUV (HD video)
fn rgb_to_yuv_bt709(rgb: vec3<f32>) -> vec3<f32> {
    let y = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
    let u = -0.1146 * rgb.r - 0.3854 * rgb.g + 0.5000 * rgb.b + 0.5;
    let v = 0.5000 * rgb.r - 0.4542 * rgb.g - 0.0458 * rgb.b + 0.5;
    return vec3<f32>(y, u, v);
}

// BT.2020 RGB to YUV (UHD video)
fn rgb_to_yuv_bt2020(rgb: vec3<f32>) -> vec3<f32> {
    let y = 0.2627 * rgb.r + 0.6780 * rgb.g + 0.0593 * rgb.b;
    let u = -0.1396 * rgb.r - 0.3604 * rgb.g + 0.5000 * rgb.b + 0.5;
    let v = 0.5000 * rgb.r - 0.4598 * rgb.g - 0.0402 * rgb.b + 0.5;
    return vec3<f32>(y, u, v);
}

fn rgb_to_yuv(rgb: vec3<f32>, color_space: u32) -> vec3<f32> {
    switch color_space {
        case 0u: { return rgb_to_yuv_bt601(rgb); }
        case 2u: { return rgb_to_yuv_bt2020(rgb); }
        default: { return rgb_to_yuv_bt709(rgb); }
    }
}

// Y plane kernel: process 4 pixels at a time (pack into u32)
@compute @workgroup_size(16, 16)
fn compute_y(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // Each thread processes 4 horizontal pixels
    let x4 = global_id.x * 4u;
    let y = global_id.y;

    if (x4 >= uniforms.width || y >= uniforms.height) {
        return;
    }

    // Process 4 pixels and pack into one u32
    var packed: u32 = 0u;
    for (var i: u32 = 0u; i < 4u; i = i + 1u) {
        let x = x4 + i;
        if (x < uniforms.width) {
            let rgba = textureLoad(input_texture, vec2<i32>(i32(x), i32(y)), 0);
            let yuv = rgb_to_yuv(rgba.rgb, uniforms.color_space);
            // Convert to limited range: Y = 16 + Y * 219
            let y_limited = 16.0 + clamp(yuv.x, 0.0, 1.0) * 219.0;
            let y_byte = u32(clamp(y_limited, 16.0, 235.0));
            packed = packed | (y_byte << (i * 8u));
        }
    }

    // Calculate word index in Y plane
    let word_idx = (y * uniforms.width + x4) / 4u;
    y_plane[word_idx] = packed;
}

// UV plane kernel: one thread per 2x2 pixel block, process 2 blocks at a time
@compute @workgroup_size(16, 16)
fn compute_uv(@builtin(global_invocation_id) global_id: vec3<u32>) {
    // Each thread processes 2 UV pairs (4 bytes = 1 u32)
    let block_x2 = global_id.x * 2u;
    let block_y = global_id.y;

    let uv_width = uniforms.width / 2u;
    let uv_height = uniforms.height / 2u;

    if (block_x2 >= uv_width || block_y >= uv_height) {
        return;
    }

    var packed: u32 = 0u;

    // Process 2 UV pairs
    for (var b: u32 = 0u; b < 2u; b = b + 1u) {
        let block_x = block_x2 + b;
        if (block_x >= uv_width) {
            continue;
        }

        // Sample 2x2 block and average UV
        let x0 = block_x * 2u;
        let y0 = block_y * 2u;

        var u_sum: f32 = 0.0;
        var v_sum: f32 = 0.0;

        for (var dy: u32 = 0u; dy < 2u; dy = dy + 1u) {
            for (var dx: u32 = 0u; dx < 2u; dx = dx + 1u) {
                let px = min(x0 + dx, uniforms.width - 1u);
                let py = min(y0 + dy, uniforms.height - 1u);
                let rgba = textureLoad(input_texture, vec2<i32>(i32(px), i32(py)), 0);
                let yuv = rgb_to_yuv(rgba.rgb, uniforms.color_space);
                u_sum = u_sum + yuv.y;
                v_sum = v_sum + yuv.z;
            }
        }

        let u_avg = u_sum / 4.0;
        let v_avg = v_sum / 4.0;

        // Convert to limited range: UV = 16 + UV * 224
        let u_limited = 16.0 + clamp(u_avg, 0.0, 1.0) * 224.0;
        let v_limited = 16.0 + clamp(v_avg, 0.0, 1.0) * 224.0;
        let u_byte = u32(clamp(u_limited, 16.0, 240.0));
        let v_byte = u32(clamp(v_limited, 16.0, 240.0));

        // Pack U and V into the u32 (NV12: UVUV...)
        let shift = b * 16u;
        packed = packed | (u_byte << shift) | (v_byte << (shift + 8u));
    }

    // Calculate word index in UV plane
    let word_idx = (block_y * uv_width + block_x2) / 2u;
    uv_plane[word_idx] = packed;
}
"#;

/// Uniform buffer for RGBA to NV12 conversion
#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct RgbaToNv12Uniforms {
    pub width: u32,
    pub height: u32,
    pub color_space: u32,
    pub _padding: u32,
}

/// NV12 output buffers
pub struct Nv12OutputBuffers {
    /// Y plane buffer (width * height bytes)
    pub y_buffer: wgpu::Buffer,
    /// UV plane buffer (width/2 * height/2 * 2 bytes)
    pub uv_buffer: wgpu::Buffer,
    /// Width
    pub width: u32,
    /// Height
    pub height: u32,
}

impl Nv12OutputBuffers {
    /// Get Y plane size in bytes
    pub fn y_size(&self) -> usize {
        (self.width * self.height) as usize
    }

    /// Get UV plane size in bytes
    pub fn uv_size(&self) -> usize {
        ((self.width / 2) * (self.height / 2) * 2) as usize
    }

    /// Total NV12 buffer size
    pub fn total_size(&self) -> usize {
        self.y_size() + self.uv_size()
    }
}

/// GPU RGBA to NV12 converter
pub struct RgbaToNv12Converter {
    ctx: Arc<GpuContext>,
    y_pipeline: wgpu::ComputePipeline,
    uv_pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    uniform_buffer: wgpu::Buffer,
    /// Cached Y plane staging buffer for readback
    staging_y: Option<wgpu::Buffer>,
    /// Cached UV plane staging buffer for readback
    staging_uv: Option<wgpu::Buffer>,
    /// Cached staging buffer dimensions
    staging_size: (u32, u32),
}

impl RgbaToNv12Converter {
    /// Create a new RGBA to NV12 converter
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Create shader module
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("RGBA to NV12 Shader"),
            source: wgpu::ShaderSource::Wgsl(RGBA_TO_NV12_SHADER.into()),
        });

        // Create bind group layout
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("RGBA to NV12 Bind Group Layout"),
            entries: &[
                // Uniforms
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                // Input RGBA texture
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                // Y plane output
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
                // UV plane output
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::COMPUTE,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: false },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("RGBA to NV12 Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // Create Y plane compute pipeline
        let y_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("RGBA to NV12 Y Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: "compute_y",
        });

        // Create UV plane compute pipeline
        let uv_pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("RGBA to NV12 UV Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: "compute_uv",
        });

        // Create uniform buffer
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("RGBA to NV12 Uniforms"),
            size: std::mem::size_of::<RgbaToNv12Uniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Ok(Self {
            ctx,
            y_pipeline,
            uv_pipeline,
            bind_group_layout,
            uniform_buffer,
            staging_y: None,
            staging_uv: None,
            staging_size: (0, 0),
        })
    }

    /// Create output buffers for NV12 data
    pub fn create_output_buffers(&self, width: u32, height: u32) -> Nv12OutputBuffers {
        let device = self.ctx.device();

        let y_size = (width * height) as u64;
        let uv_size = ((width / 2) * (height / 2) * 2) as u64;

        let y_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("NV12 Y Plane"),
            size: y_size,
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::COPY_SRC
                | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let uv_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("NV12 UV Plane"),
            size: uv_size,
            usage: wgpu::BufferUsages::STORAGE
                | wgpu::BufferUsages::COPY_SRC
                | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        Nv12OutputBuffers {
            y_buffer,
            uv_buffer,
            width,
            height,
        }
    }

    /// Convert RGBA texture to NV12 format
    ///
    /// This submits GPU work and returns immediately.
    /// Call `wait_for_completion()` before reading the output buffers.
    pub fn convert(
        &self,
        input_texture: &wgpu::TextureView,
        output: &Nv12OutputBuffers,
        color_space: u32,
    ) -> Result<()> {
        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Update uniforms
        let uniforms = RgbaToNv12Uniforms {
            width: output.width,
            height: output.height,
            color_space,
            _padding: 0,
        };
        queue.write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&uniforms));

        // Create bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("RGBA to NV12 Bind Group"),
            layout: &self.bind_group_layout,
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
                    resource: output.y_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: output.uv_buffer.as_entire_binding(),
                },
            ],
        });

        // Create command encoder
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("RGBA to NV12 Encoder"),
        });

        // Dispatch Y plane computation
        // Each thread processes 4 horizontal pixels, so divide width by 4
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Y Plane Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.y_pipeline);
            pass.set_bind_group(0, &bind_group, &[]);

            // Width is divided by 4 because each thread processes 4 pixels
            let workgroups_x = output.width.div_ceil(4).div_ceil(16);
            let workgroups_y = output.height.div_ceil(16);
            pass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
        }

        // Dispatch UV plane computation
        // Each thread processes 2 UV pairs (4 bytes)
        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("UV Plane Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.uv_pipeline);
            pass.set_bind_group(0, &bind_group, &[]);

            // UV width is width/2, and each thread processes 2 UV pairs
            let workgroups_x = (output.width / 2).div_ceil(2).div_ceil(16);
            let workgroups_y = (output.height / 2).div_ceil(16);
            pass.dispatch_workgroups(workgroups_x, workgroups_y, 1);
        }

        // Submit work
        queue.submit(std::iter::once(encoder.finish()));

        Ok(())
    }

    /// Wait for GPU work to complete (synchronization fence)
    ///
    /// IMPORTANT: Call this before reading output buffers or passing to encoder!
    /// Without this, the encoder may receive incomplete/corrupted data.
    pub fn wait_for_completion(&self) {
        // Submit empty command buffer and wait
        self.ctx.device().poll(wgpu::Maintain::Wait);
    }

    /// Convert and wait for completion (blocking)
    pub fn convert_sync(
        &self,
        input_texture: &wgpu::TextureView,
        output: &Nv12OutputBuffers,
        color_space: u32,
    ) -> Result<()> {
        self.convert(input_texture, output, color_space)?;
        self.wait_for_completion();
        Ok(())
    }

    /// Read NV12 data from GPU buffers to CPU memory for encoding
    ///
    /// This transfers GPU-processed NV12 data to CPU for FFmpeg encoding.
    /// Staging buffers are cached and reused across frames for performance.
    pub fn read_nv12_data_blocking(&mut self, output: &Nv12OutputBuffers) -> Result<Vec<u8>> {
        let device = self.ctx.device();

        // Reuse or create staging buffers (cached for performance)
        let needs_new_staging = self.staging_size != (output.width, output.height);
        if needs_new_staging {
            self.staging_y = Some(device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("Y Staging (cached)"),
                size: output.y_size() as u64,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }));

            self.staging_uv = Some(device.create_buffer(&wgpu::BufferDescriptor {
                label: Some("UV Staging (cached)"),
                size: output.uv_size() as u64,
                usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
                mapped_at_creation: false,
            }));

            self.staging_size = (output.width, output.height);
        }

        let y_staging = self.staging_y.as_ref().unwrap();
        let uv_staging = self.staging_uv.as_ref().unwrap();

        // Copy from storage to staging
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("NV12 Readback"),
        });

        encoder.copy_buffer_to_buffer(&output.y_buffer, 0, y_staging, 0, output.y_size() as u64);
        encoder.copy_buffer_to_buffer(&output.uv_buffer, 0, uv_staging, 0, output.uv_size() as u64);

        self.ctx.queue().submit(std::iter::once(encoder.finish()));

        // Map Y plane (blocking)
        let y_slice = y_staging.slice(..);
        let (y_tx, y_rx) = std::sync::mpsc::channel();
        y_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = y_tx.send(result);
        });

        // Map UV plane (blocking)
        let uv_slice = uv_staging.slice(..);
        let (uv_tx, uv_rx) = std::sync::mpsc::channel();
        uv_slice.map_async(wgpu::MapMode::Read, move |result| {
            let _ = uv_tx.send(result);
        });

        // Wait for mapping
        device.poll(wgpu::Maintain::Wait);

        y_rx.recv()
            .map_err(|_| Error::Other("Y buffer mapping cancelled".to_string()))?
            .map_err(|e| Error::Other(format!("Y buffer mapping failed: {:?}", e)))?;

        uv_rx
            .recv()
            .map_err(|_| Error::Other("UV buffer mapping cancelled".to_string()))?
            .map_err(|e| Error::Other(format!("UV buffer mapping failed: {:?}", e)))?;

        // Read data
        let mut nv12_data = Vec::with_capacity(output.total_size());
        nv12_data.extend_from_slice(&y_slice.get_mapped_range());
        nv12_data.extend_from_slice(&uv_slice.get_mapped_range());

        // Unmap buffers (required before next use)
        y_staging.unmap();
        uv_staging.unmap();

        Ok(nv12_data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_uniforms_size() {
        assert_eq!(std::mem::size_of::<RgbaToNv12Uniforms>(), 16);
    }

    #[test]
    fn test_nv12_buffer_sizes() {
        // 1920x1080
        let y_size = 1920 * 1080;
        let uv_size = (1920 / 2) * (1080 / 2) * 2;
        let total = y_size + uv_size;

        assert_eq!(y_size, 2073600);
        assert_eq!(uv_size, 1036800);
        assert_eq!(total, 3110400); // 1.5 * width * height
    }
}
