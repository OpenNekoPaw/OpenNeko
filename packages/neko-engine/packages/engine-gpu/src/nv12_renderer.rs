//! NV12 Renderer - Convert NV12 textures to RGBA for compositing
//!
//! This module provides a GPU render pipeline that:
//! 1. Takes NV12 Y and UV textures as input
//! 2. Converts to RGBA using the appropriate color space
//! 3. Outputs to an RGBA texture for compositor input
//!
//! This is the bridge between hardware-decoded NV12 frames and the wgpu compositor.

use crate::error::GpuResult as Result;
use crate::nv12_import::{ColorSpace, ImportedNv12Texture, Nv12Uniforms, NV12_TO_RGB_SHADER};
use crate::GpuContext;

use std::sync::Arc;

/// NV12 to RGBA render pipeline
pub struct Nv12Renderer {
    ctx: Arc<GpuContext>,
    pipeline: wgpu::RenderPipeline,
    bind_group_layout: wgpu::BindGroupLayout,
    uniform_buffer: wgpu::Buffer,
    sampler: wgpu::Sampler,
}

impl Nv12Renderer {
    /// Create a new NV12 renderer
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        // Create shader module
        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("NV12 to RGB Shader"),
            source: wgpu::ShaderSource::Wgsl(NV12_TO_RGB_SHADER.into()),
        });

        // Create bind group layout
        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("NV12 Bind Group Layout"),
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
                // Y texture
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
                // UV texture
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
            label: Some("NV12 Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        // Create render pipeline
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("NV12 to RGBA Pipeline"),
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
                    // Use Rgba16Float for HDR support and to avoid color banding
                    // during multi-pass compositing operations
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

        // Create uniform buffer
        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("NV12 Uniforms"),
            size: std::mem::size_of::<Nv12Uniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        // Create linear sampler for UV upscaling
        let sampler = device.create_sampler(&wgpu::SamplerDescriptor {
            label: Some("NV12 Sampler"),
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

    /// Create an RGBA output texture (16-bit float for HDR support)
    pub fn create_output_texture(&self, width: u32, height: u32) -> wgpu::Texture {
        self.ctx.device().create_texture(&wgpu::TextureDescriptor {
            label: Some("NV12 RGBA Output"),
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

    /// Render NV12 texture to RGBA
    ///
    /// Converts the imported NV12 texture to RGBA format using the GPU.
    pub fn render(
        &self,
        nv12: &ImportedNv12Texture,
        output: &wgpu::TextureView,
        color_space: ColorSpace,
    ) {
        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Update uniforms
        let uniforms = Nv12Uniforms::new(nv12.width, nv12.height, color_space);
        queue.write_buffer(&self.uniform_buffer, 0, bytemuck::bytes_of(&uniforms));

        // Create bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("NV12 Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: self.uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&nv12.y_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: wgpu::BindingResource::TextureView(&nv12.uv_view),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: wgpu::BindingResource::Sampler(&self.sampler),
                },
            ],
        });

        // Create command encoder
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("NV12 Render Encoder"),
        });

        // Render pass
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("NV12 to RGBA Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: output,
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

            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);
            pass.draw(0..3, 0..1); // Fullscreen triangle
        }

        // Submit
        queue.submit(std::iter::once(encoder.finish()));
    }

    /// Render NV12 to a new RGBA texture
    ///
    /// Convenience method that creates the output texture and renders to it.
    pub fn render_to_new_texture(&self, nv12: &ImportedNv12Texture) -> wgpu::Texture {
        let output = self.create_output_texture(nv12.width, nv12.height);
        let output_view = output.create_view(&wgpu::TextureViewDescriptor::default());
        self.render(nv12, &output_view, nv12.color_space);
        output
    }
}

/// Cached NV12 renderer with texture pool
pub struct Nv12RenderCache {
    renderer: Nv12Renderer,
    output_textures: Vec<(u32, u32, wgpu::Texture)>,
}

impl Nv12RenderCache {
    /// Create a new render cache
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        Ok(Self {
            renderer: Nv12Renderer::new(ctx)?,
            output_textures: Vec::new(),
        })
    }

    /// Get or create an output texture of the specified size
    pub fn get_output_texture(&mut self, width: u32, height: u32) -> &wgpu::Texture {
        // Find existing texture with matching size
        if let Some(idx) = self
            .output_textures
            .iter()
            .position(|(w, h, _)| *w == width && *h == height)
        {
            return &self.output_textures[idx].2;
        }

        // Create new texture
        let texture = self.renderer.create_output_texture(width, height);
        self.output_textures.push((width, height, texture));
        &self.output_textures.last().unwrap().2
    }

    /// Render NV12 to RGBA using cached resources
    pub fn render(&mut self, nv12: &ImportedNv12Texture) -> &wgpu::Texture {
        // Get or create output texture
        let width = nv12.width;
        let height = nv12.height;

        // Find or create texture
        let texture_idx = if let Some(idx) = self
            .output_textures
            .iter()
            .position(|(w, h, _)| *w == width && *h == height)
        {
            idx
        } else {
            let texture = self.renderer.create_output_texture(width, height);
            self.output_textures.push((width, height, texture));
            self.output_textures.len() - 1
        };

        // Render
        let output_view = self.output_textures[texture_idx]
            .2
            .create_view(&wgpu::TextureViewDescriptor::default());
        self.renderer.render(nv12, &output_view, nv12.color_space);

        &self.output_textures[texture_idx].2
    }

    /// Get the underlying renderer
    pub fn renderer(&self) -> &Nv12Renderer {
        &self.renderer
    }

    /// Clear cached textures
    pub fn clear(&mut self) {
        self.output_textures.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nv12_uniforms_alignment() {
        // Ensure uniform struct is properly aligned
        assert_eq!(std::mem::size_of::<Nv12Uniforms>(), 16);
    }

    /// Test NV12 to RGBA conversion with known input values
    /// This test verifies the GPU shader produces correct RGB output
    #[test]
    fn test_nv12_to_rgba_conversion() {
        // Create GPU context
        let ctx = match pollster::block_on(GpuContext::new()) {
            Ok(ctx) => Arc::new(ctx),
            Err(e) => {
                eprintln!("Skipping test: GPU not available: {}", e);
                return;
            }
        };

        // Create NV12 renderer
        let renderer = Nv12Renderer::new(ctx.clone()).expect("Failed to create renderer");

        // Create NV12 importer
        let importer = crate::Nv12TextureImporter::new(ctx.clone());

        // Test dimensions
        let width = 64u32;
        let height = 64u32;

        // Create test NV12 data with known values
        // Test case 1: Mid-gray (Y=128, U=128, V=128) should produce ~gray RGB
        let y_size = (width * height) as usize;
        let uv_width = width / 2;
        let uv_height = height / 2;
        let uv_size = (uv_width * uv_height * 2) as usize;

        let mut nv12_data = vec![0u8; y_size + uv_size];

        // Fill Y plane with 128 (mid-gray in limited range)
        for value in nv12_data.iter_mut().take(y_size) {
            *value = 128;
        }

        // Fill UV plane with 128 (neutral chroma)
        for i in 0..uv_size {
            nv12_data[y_size + i] = 128;
        }

        // Create and upload NV12 texture
        let nv12_texture = importer.create_textures(width, height, ColorSpace::Bt709);
        importer
            .upload_nv12_data(&nv12_texture, &nv12_data)
            .expect("Failed to upload NV12 data");

        // Render to RGBA
        let rgba_texture = renderer.render_to_new_texture(&nv12_texture);

        // Read back RGBA data
        let rgba_data = read_texture_to_cpu(&ctx, &rgba_texture, width, height);

        // Verify output
        // Y=128 with neutral UV should produce approximately gray
        // BT.709: R = 1.164*(128-16) + 1.793*(128-128) ≈ 130
        let r = rgba_data[0];
        let g = rgba_data[1];
        let b = rgba_data[2];
        let a = rgba_data[3];

        println!("Test 1 (Y=128, UV=128): RGBA({}, {}, {}, {})", r, g, b, a);

        // Allow some tolerance for floating point precision
        assert!(r > 100 && r < 160, "R should be ~130, got {}", r);
        assert!(g > 100 && g < 160, "G should be ~130, got {}", g);
        assert!(b > 100 && b < 160, "B should be ~130, got {}", b);
        assert_eq!(a, 255, "Alpha should be 255");

        // Test case 2: Black (Y=16, U=128, V=128) - limited range black
        for value in nv12_data.iter_mut().take(y_size) {
            *value = 16; // Limited range black
        }
        importer
            .upload_nv12_data(&nv12_texture, &nv12_data)
            .expect("Failed to upload NV12 data");

        let rgba_texture2 = renderer.render_to_new_texture(&nv12_texture);
        let rgba_data2 = read_texture_to_cpu(&ctx, &rgba_texture2, width, height);

        let r2 = rgba_data2[0];
        let g2 = rgba_data2[1];
        let b2 = rgba_data2[2];

        println!(
            "Test 2 (Y=16, UV=128): RGBA({}, {}, {}, {})",
            r2, g2, rgba_data2[2], rgba_data2[3]
        );

        // Y=16 should produce black (0,0,0)
        assert!(r2 < 10, "R should be ~0, got {}", r2);
        assert!(g2 < 10, "G should be ~0, got {}", g2);
        assert!(b2 < 10, "B should be ~0, got {}", b2);

        // Test case 3: White (Y=235, U=128, V=128) - limited range white
        for value in nv12_data.iter_mut().take(y_size) {
            *value = 235; // Limited range white
        }
        importer
            .upload_nv12_data(&nv12_texture, &nv12_data)
            .expect("Failed to upload NV12 data");

        let rgba_texture3 = renderer.render_to_new_texture(&nv12_texture);
        let rgba_data3 = read_texture_to_cpu(&ctx, &rgba_texture3, width, height);

        let r3 = rgba_data3[0];
        let g3 = rgba_data3[1];
        let b3 = rgba_data3[2];

        println!(
            "Test 3 (Y=235, UV=128): RGBA({}, {}, {}, {})",
            r3, g3, b3, rgba_data3[3]
        );

        // Y=235 should produce white (~255,255,255)
        assert!(r3 > 245, "R should be ~255, got {}", r3);
        assert!(g3 > 245, "G should be ~255, got {}", g3);
        assert!(b3 > 245, "B should be ~255, got {}", b3);

        println!("All NV12 to RGBA conversion tests passed!");
    }

    /// Helper function to read texture data back to CPU
    /// Handles Rgba16Float format and converts to u8 values
    fn read_texture_to_cpu(
        ctx: &GpuContext,
        texture: &wgpu::Texture,
        width: u32,
        height: u32,
    ) -> Vec<u8> {
        let device = ctx.device();
        let queue = ctx.queue();

        // Rgba16Float = 8 bytes per pixel (4 x f16)
        let bytes_per_pixel = 8u32;
        let bytes_per_row = width * bytes_per_pixel;
        let padded_bytes_per_row = (bytes_per_row + 255) & !255; // Align to 256
        let buffer_size = padded_bytes_per_row * height;

        let staging_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Staging Buffer"),
            size: buffer_size as u64,
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });

        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Read Texture Encoder"),
        });

        encoder.copy_texture_to_buffer(
            wgpu::ImageCopyTexture {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::ImageCopyBuffer {
                buffer: &staging_buffer,
                layout: wgpu::ImageDataLayout {
                    offset: 0,
                    bytes_per_row: Some(padded_bytes_per_row),
                    rows_per_image: Some(height),
                },
            },
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );

        queue.submit(std::iter::once(encoder.finish()));

        // Map buffer and read data
        let buffer_slice = staging_buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            tx.send(result).unwrap();
        });
        device.poll(wgpu::Maintain::Wait);
        rx.recv().unwrap().expect("Failed to map buffer");

        let data = buffer_slice.get_mapped_range();

        // Convert f16 to u8: read as half-floats and convert to 0-255 range
        let mut result = Vec::with_capacity((width * height * 4) as usize);
        for row in 0..height {
            let row_start = (row * padded_bytes_per_row) as usize;
            for col in 0..width {
                let pixel_start = row_start + (col * bytes_per_pixel) as usize;
                // Read 4 f16 values (R, G, B, A)
                for channel in 0..4 {
                    let offset = pixel_start + channel * 2;
                    let f16_bits = u16::from_le_bytes([data[offset], data[offset + 1]]);
                    let f32_val = half::f16::from_bits(f16_bits).to_f32();
                    // Clamp to 0-1 and convert to 0-255
                    let u8_val = (f32_val.clamp(0.0, 1.0) * 255.0).round() as u8;
                    result.push(u8_val);
                }
            }
        }

        result
    }
}
