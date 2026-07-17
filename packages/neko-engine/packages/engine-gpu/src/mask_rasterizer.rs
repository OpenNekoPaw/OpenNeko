//! Mask Rasterizer - SDF-based GPU mask generation
//!
//! Converts GPU-local mask geometry (rectangle, ellipse, polygon, bezier) into
//! grayscale mask textures using Signed Distance Field (SDF) computation.
//!
//! The generated mask data is a `Vec<u8>` (single-channel grayscale) that can be
//! directly consumed by `CompositeLayer::mask` for GPU compositing.
//!
//! Strategy:
//! - Rectangle / Ellipse: exact SDF on GPU compute shader
//! - Polygon: per-edge distance on GPU compute shader
//! - Bezier: sample control points → polygon fallback
//! - Feather: smoothstep on SDF threshold (zero extra pass)
//! - Expansion: SDF offset (zero extra pass)
//! - Multiple masks: blend on CPU using mask blend modes

use super::context::GpuContext;
use crate::error::{GpuError as Error, GpuResult as Result};

use bytemuck::{Pod, Zeroable};
use std::sync::Arc;

// =============================================================================
// Constants
// =============================================================================

/// Maximum polygon vertices supported by the GPU shader
const MAX_POLYGON_VERTICES: usize = 64;

// =============================================================================
// Public input DTOs
// =============================================================================

/// Bezier control point for GPU mask paths.
#[derive(Debug, Clone)]
pub struct GpuMaskBezierPoint {
    pub position: [f32; 2],
    pub handle_in: [f32; 2],
    pub handle_out: [f32; 2],
}

/// GPU-local mask geometry.
#[derive(Debug, Clone)]
pub enum GpuMaskShape {
    Rectangle {
        center_x: f32,
        center_y: f32,
        width: f32,
        height: f32,
        rotation: f32,
        corner_radius: f32,
    },
    Ellipse {
        center_x: f32,
        center_y: f32,
        width: f32,
        height: f32,
        rotation: f32,
    },
    Polygon {
        points: Vec<[f32; 2]>,
    },
    Bezier {
        control_points: Vec<GpuMaskBezierPoint>,
        closed: bool,
    },
}

/// GPU-local mask input for SDF rasterization.
#[derive(Debug, Clone)]
pub struct GpuElementMask {
    pub shape: GpuMaskShape,
    pub inverted: bool,
    pub feather: f32,
    pub expansion: f32,
    pub opacity: f32,
    pub blend_mode: String,
}

// =============================================================================
// GPU Uniforms
// =============================================================================

/// Uniforms for the mask SDF compute shader
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct MaskUniforms {
    /// Output width in pixels
    width: u32,
    /// Output height in pixels
    height: u32,
    /// Shape type: 0=rectangle, 1=ellipse, 2=polygon
    shape_type: u32,
    /// Number of polygon vertices (only for polygon shape)
    vertex_count: u32,

    // Rectangle / Ellipse params (shared layout)
    /// Center X (normalized 0-1)
    center_x: f32,
    /// Center Y (normalized 0-1)
    center_y: f32,
    /// Half-width (normalized)
    half_w: f32,
    /// Half-height (normalized)
    half_h: f32,
    /// Rotation in radians
    rotation: f32,
    /// Corner radius (rectangle only, normalized)
    corner_radius: f32,

    // Mask processing params
    /// Feather amount in pixels
    feather: f32,
    /// Expansion amount in pixels (positive = expand, negative = contract)
    expansion: f32,
    /// Mask opacity (0.0 - 1.0)
    opacity: f32,
    /// Whether mask is inverted (0 or 1)
    inverted: u32,

    /// Padding for 16-byte alignment
    _pad0: u32,
    _pad1: u32,
}

/// Polygon vertex data passed to GPU
#[repr(C)]
#[derive(Debug, Clone, Copy, Pod, Zeroable)]
struct PolygonVertex {
    x: f32,
    y: f32,
}

// =============================================================================
// Mask SDF Shader
// =============================================================================

const MASK_SDF_SHADER: &str = r#"
// Mask SDF Compute Shader
// Generates grayscale mask from signed distance fields

struct Uniforms {
    width: u32,
    height: u32,
    shape_type: u32,       // 0=rectangle, 1=ellipse, 2=polygon
    vertex_count: u32,
    center_x: f32,
    center_y: f32,
    half_w: f32,
    half_h: f32,
    rotation: f32,
    corner_radius: f32,
    feather: f32,
    expansion: f32,
    opacity: f32,
    inverted: u32,
    _pad0: u32,
    _pad1: u32,
}

struct Vertex {
    x: f32,
    y: f32,
}

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> vertices: array<Vertex>;
@group(0) @binding(2) var<storage, read_write> output: array<u32>;

// SDF for rounded rectangle (in local rotated space)
fn sd_rounded_box(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let q = abs(p) - b + vec2<f32>(r, r);
    return length(max(q, vec2<f32>(0.0, 0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// SDF for ellipse (approximation using scaling)
fn sd_ellipse(p: vec2<f32>, ab: vec2<f32>) -> f32 {
    // Scale to make it a circle, compute distance, scale back
    let scaled_p = p / ab;
    let d = length(scaled_p) - 1.0;
    // Approximate gradient length for correct distance
    let grad_len = length(scaled_p / ab);
    if grad_len < 0.0001 {
        return -min(ab.x, ab.y);
    }
    return d * length(p) / grad_len;
}

// SDF for polygon (exact, using winding number for inside/outside)
fn sd_polygon(p: vec2<f32>, n: u32) -> f32 {
    if n < 3u {
        return 1e10;
    }

    var min_dist: f32 = 1e10;
    var winding: i32 = 0;

    var prev = vec2<f32>(vertices[n - 1u].x, vertices[n - 1u].y);

    for (var i = 0u; i < n; i = i + 1u) {
        let curr = vec2<f32>(vertices[i].x, vertices[i].y);
        let edge = curr - prev;
        let w = p - prev;

        // Closest point on edge segment
        let t = clamp(dot(w, edge) / dot(edge, edge), 0.0, 1.0);
        let closest = prev + t * edge;
        let d = length(p - closest);
        min_dist = min(min_dist, d);

        // Winding number (cross product test)
        let c1 = prev.y <= p.y;
        let c2 = curr.y > p.y;
        let c3 = curr.y <= p.y;
        let c4 = prev.y > p.y;
        let cross_val = edge.x * w.y - edge.y * w.x;

        if c1 && c2 && cross_val > 0.0 {
            winding = winding + 1;
        }
        if c3 && c4 && cross_val < 0.0 {
            winding = winding - 1;
        }

        prev = curr;
    }

    // Inside if winding != 0
    if winding != 0 {
        return -min_dist;
    }
    return min_dist;
}

// Rotate a 2D point by angle (radians)
fn rotate2d(p: vec2<f32>, angle: f32) -> vec2<f32> {
    let c = cos(angle);
    let s = sin(angle);
    return vec2<f32>(p.x * c - p.y * s, p.x * s + p.y * c);
}

@compute @workgroup_size(16, 16)
fn mask_main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let px = gid.x;
    let py = gid.y;

    if px >= u.width || py >= u.height {
        return;
    }

    // Pixel center in normalized coordinates (0-1)
    let uv = vec2<f32>(
        (f32(px) + 0.5) / f32(u.width),
        (f32(py) + 0.5) / f32(u.height)
    );

    var dist: f32 = 1e10;

    switch u.shape_type {
        // Rectangle
        case 0u: {
            let center = vec2<f32>(u.center_x, u.center_y);
            let local_p = rotate2d(uv - center, -u.rotation);
            let half_size = vec2<f32>(u.half_w, u.half_h);
            // corner_radius is already normalized
            let cr = min(u.corner_radius, min(u.half_w, u.half_h));
            dist = sd_rounded_box(local_p, half_size, cr);
        }
        // Ellipse
        case 1u: {
            let center = vec2<f32>(u.center_x, u.center_y);
            let local_p = rotate2d(uv - center, -u.rotation);
            let ab = vec2<f32>(u.half_w, u.half_h);
            dist = sd_ellipse(local_p, ab);
        }
        // Polygon
        case 2u: {
            // Polygon vertices are already in normalized coords
            dist = sd_polygon(uv, u.vertex_count);
        }
        default: {
            dist = 1e10;
        }
    }

    // Apply expansion (negative dist = inside, so subtract expansion to grow)
    let expansion_norm = u.expansion / f32(max(u.width, u.height));
    dist = dist - expansion_norm;

    // Convert SDF to alpha using feather as smoothstep range
    var alpha: f32;
    if u.feather > 0.0 {
        let feather_norm = u.feather / f32(max(u.width, u.height));
        alpha = 1.0 - smoothstep(-feather_norm, feather_norm, dist);
    } else {
        // Hard edge
        alpha = select(0.0, 1.0, dist <= 0.0);
    }

    // Apply opacity
    alpha = alpha * u.opacity;

    // Apply inversion
    if u.inverted != 0u {
        alpha = 1.0 - alpha;
    }

    // Write grayscale value (pack 4 pixels per u32 for byte output)
    let val = u32(clamp(alpha * 255.0, 0.0, 255.0));
    let idx = py * u.width + px;
    // Each pixel is one byte, but storage buffer is u32-based
    // We use atomic-free approach: each thread writes to its own index
    // and we read back as bytes
    output[idx] = val;
}
"#;

// =============================================================================
// MaskRasterizer
// =============================================================================

/// GPU-accelerated mask rasterizer using SDF compute shaders
pub struct MaskRasterizer {
    ctx: Arc<GpuContext>,
    pipeline: wgpu::ComputePipeline,
    bind_group_layout: wgpu::BindGroupLayout,
}

impl MaskRasterizer {
    /// Create a new mask rasterizer
    pub fn new(ctx: Arc<GpuContext>) -> Result<Self> {
        let device = ctx.device();

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Mask SDF Shader"),
            source: wgpu::ShaderSource::Wgsl(MASK_SDF_SHADER.into()),
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("Mask SDF Bind Group Layout"),
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
                // Polygon vertices (storage, read-only)
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
                // Output buffer (storage, read-write)
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
            ],
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("Mask SDF Pipeline Layout"),
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let pipeline = device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some("Mask SDF Pipeline"),
            layout: Some(&pipeline_layout),
            module: &shader,
            entry_point: "mask_main",
        });

        Ok(Self {
            ctx,
            pipeline,
            bind_group_layout,
        })
    }

    /// Rasterize a single mask to grayscale pixel data
    ///
    /// Returns `Vec<u8>` of size `width * height` (one byte per pixel).
    fn rasterize_single(&self, mask: &GpuElementMask, width: u32, height: u32) -> Result<Vec<u8>> {
        let (
            shape_type,
            center_x,
            center_y,
            half_w,
            half_h,
            rotation,
            corner_radius,
            polygon_verts,
        ) = Self::extract_shape_params(&mask.shape, width, height)?;

        let uniforms = MaskUniforms {
            width,
            height,
            shape_type,
            vertex_count: polygon_verts.len() as u32,
            center_x,
            center_y,
            half_w,
            half_h,
            rotation,
            corner_radius,
            feather: mask.feather,
            expansion: mask.expansion,
            opacity: mask.opacity,
            inverted: if mask.inverted { 1 } else { 0 },
            _pad0: 0,
            _pad1: 0,
        };

        let device = self.ctx.device();
        let queue = self.ctx.queue();

        // Create uniform buffer
        let uniform_buffer = self
            .ctx
            .create_buffer_with_data(bytemuck::bytes_of(&uniforms), wgpu::BufferUsages::UNIFORM);

        // Create vertex buffer (at least 1 element for valid binding)
        let verts = if polygon_verts.is_empty() {
            vec![PolygonVertex { x: 0.0, y: 0.0 }]
        } else {
            polygon_verts
        };
        let vertex_buffer = self
            .ctx
            .create_buffer_with_data(bytemuck::cast_slice(&verts), wgpu::BufferUsages::STORAGE);

        // Output buffer: one u32 per pixel (we only use the low byte)
        let output_size = (width * height) as u64 * 4; // u32 per pixel
        let output_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Mask SDF Output"),
            size: output_size,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_SRC,
            mapped_at_creation: false,
        });

        // Create bind group
        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("Mask SDF Bind Group"),
            layout: &self.bind_group_layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: uniform_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: vertex_buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: output_buffer.as_entire_binding(),
                },
            ],
        });

        // Dispatch compute
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("Mask SDF Encoder"),
        });

        {
            let mut pass = encoder.begin_compute_pass(&wgpu::ComputePassDescriptor {
                label: Some("Mask SDF Pass"),
                timestamp_writes: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind_group, &[]);

            let wg_x = width.div_ceil(16);
            let wg_y = height.div_ceil(16);
            pass.dispatch_workgroups(wg_x, wg_y, 1);
        }

        queue.submit(Some(encoder.finish()));

        // Read back u32 data and extract low bytes
        let raw_data = self.ctx.read_buffer_sync(&output_buffer)?;
        let pixel_count = (width * height) as usize;
        let mut result = Vec::with_capacity(pixel_count);

        // raw_data is Vec<u8> representing u32 array in little-endian
        for i in 0..pixel_count {
            // Each u32 stores one pixel value in its lowest byte
            let byte_offset = i * 4;
            if byte_offset < raw_data.len() {
                result.push(raw_data[byte_offset]);
            } else {
                result.push(0);
            }
        }

        Ok(result)
    }

    /// Extract shape parameters into uniform-compatible form
    #[allow(clippy::type_complexity)]
    fn extract_shape_params(
        shape: &GpuMaskShape,
        width: u32,
        height: u32,
    ) -> Result<(u32, f32, f32, f32, f32, f32, f32, Vec<PolygonVertex>)> {
        let w = width as f32;
        let h = height as f32;

        match shape {
            GpuMaskShape::Rectangle {
                center_x,
                center_y,
                width: rect_w,
                height: rect_h,
                rotation,
                corner_radius,
            } => {
                Ok((
                    0, // shape_type = rectangle
                    center_x / w,
                    center_y / h,
                    (rect_w / 2.0) / w,
                    (rect_h / 2.0) / h,
                    rotation.to_radians(),
                    corner_radius / w.max(h),
                    Vec::new(),
                ))
            }
            GpuMaskShape::Ellipse {
                center_x,
                center_y,
                width: ell_w,
                height: ell_h,
                rotation,
            } => {
                Ok((
                    1, // shape_type = ellipse
                    center_x / w,
                    center_y / h,
                    (ell_w / 2.0) / w,
                    (ell_h / 2.0) / h,
                    rotation.to_radians(),
                    0.0,
                    Vec::new(),
                ))
            }
            GpuMaskShape::Polygon { points } => {
                if points.len() > MAX_POLYGON_VERTICES {
                    return Err(Error::InvalidParameter(format!(
                        "Polygon has {} vertices, max {}",
                        points.len(),
                        MAX_POLYGON_VERTICES
                    )));
                }
                let verts: Vec<PolygonVertex> = points
                    .iter()
                    .map(|p| PolygonVertex {
                        x: p[0] / w,
                        y: p[1] / h,
                    })
                    .collect();
                Ok((2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, verts))
            }
            GpuMaskShape::Bezier {
                control_points,
                closed: _,
            } => {
                // Bezier fallback: sample cubic bezier segments into polygon vertices
                let mut verts = Vec::new();
                let samples_per_segment = 8;

                if control_points.len() < 2 {
                    return Err(Error::InvalidParameter(
                        "Bezier mask needs at least 2 control points".to_string(),
                    ));
                }

                for i in 0..control_points.len() {
                    let cp0 = &control_points[i];
                    let cp1 = &control_points[(i + 1) % control_points.len()];

                    let p0 = cp0.position;
                    let p1 = cp0.handle_out;
                    let p2 = cp1.handle_in;
                    let p3 = cp1.position;

                    for s in 0..samples_per_segment {
                        let t = s as f32 / samples_per_segment as f32;
                        let it = 1.0 - t;
                        let x = it * it * it * p0[0]
                            + 3.0 * it * it * t * p1[0]
                            + 3.0 * it * t * t * p2[0]
                            + t * t * t * p3[0];
                        let y = it * it * it * p0[1]
                            + 3.0 * it * it * t * p1[1]
                            + 3.0 * it * t * t * p2[1]
                            + t * t * t * p3[1];
                        verts.push(PolygonVertex { x: x / w, y: y / h });
                    }
                }

                if verts.len() > MAX_POLYGON_VERTICES {
                    // Downsample to fit
                    let step = verts.len() as f32 / MAX_POLYGON_VERTICES as f32;
                    let downsampled: Vec<PolygonVertex> = (0..MAX_POLYGON_VERTICES)
                        .map(|i| verts[(i as f32 * step) as usize])
                        .collect();
                    verts = downsampled;
                }

                Ok((2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, verts)) // polygon fallback
            }
        }
    }

    /// Rasterize multiple masks and composite them according to blend modes.
    ///
    /// Returns `Vec<u8>` of size `width * height` (single-channel grayscale mask).
    /// The result is suitable for `CompositeLayer::mask`.
    pub fn rasterize_masks(
        &self,
        masks: &[GpuElementMask],
        width: u32,
        height: u32,
    ) -> Result<Vec<u8>> {
        if masks.is_empty() {
            return Ok(Vec::new());
        }

        if masks.len() == 1 {
            return self.rasterize_single(&masks[0], width, height);
        }

        // Start with first mask
        let mut combined = self.rasterize_single(&masks[0], width, height)?;
        let pixel_count = (width * height) as usize;

        // Blend subsequent masks
        for mask in &masks[1..] {
            let layer = self.rasterize_single(mask, width, height)?;
            Self::blend_mask_layer(&mut combined, &layer, &mask.blend_mode, pixel_count);
        }

        Ok(combined)
    }

    /// Blend a mask layer into the combined mask buffer
    fn blend_mask_layer(dst: &mut [u8], src: &[u8], blend_mode: &str, count: usize) {
        for i in 0..count {
            let d = dst[i] as f32 / 255.0;
            let s = src[i] as f32 / 255.0;

            let result = match blend_mode {
                "subtract" => (d - s).max(0.0),
                "intersect" => d * s,
                "difference" => (d - s).abs(),
                _ => (d + s).min(1.0), // "add" or default
            };

            dst[i] = (result * 255.0).clamp(0.0, 255.0) as u8;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mask_uniforms_alignment() {
        let size = std::mem::size_of::<MaskUniforms>();
        assert_eq!(
            size % 16,
            0,
            "MaskUniforms must be 16-byte aligned, got {}",
            size
        );
    }

    #[test]
    fn test_polygon_vertex_size() {
        assert_eq!(std::mem::size_of::<PolygonVertex>(), 8);
    }

    #[test]
    fn test_extract_rectangle_params() {
        let shape = GpuMaskShape::Rectangle {
            center_x: 960.0,
            center_y: 540.0,
            width: 400.0,
            height: 300.0,
            rotation: 0.0,
            corner_radius: 10.0,
        };
        let (st, cx, cy, hw, hh, rot, cr, verts) =
            MaskRasterizer::extract_shape_params(&shape, 1920, 1080).unwrap();
        assert_eq!(st, 0);
        assert!((cx - 0.5).abs() < 0.001);
        assert!((cy - 0.5).abs() < 0.001);
        assert!((hw - 200.0 / 1920.0).abs() < 0.001);
        assert!((hh - 150.0 / 1080.0).abs() < 0.001);
        assert_eq!(rot, 0.0);
        assert!(cr > 0.0);
        assert!(verts.is_empty());
    }

    #[test]
    fn test_extract_polygon_params() {
        let shape = GpuMaskShape::Polygon {
            points: vec![[100.0, 100.0], [500.0, 100.0], [300.0, 400.0]],
        };
        let (st, _, _, _, _, _, _, verts) =
            MaskRasterizer::extract_shape_params(&shape, 1920, 1080).unwrap();
        assert_eq!(st, 2);
        assert_eq!(verts.len(), 3);
    }

    #[test]
    fn test_polygon_vertex_limit() {
        let points: Vec<[f32; 2]> = (0..65).map(|i| [i as f32, i as f32]).collect();
        let shape = GpuMaskShape::Polygon { points };
        let result = MaskRasterizer::extract_shape_params(&shape, 1920, 1080);
        assert!(result.is_err());
    }

    #[test]
    fn test_blend_mask_add() {
        let mut dst = vec![128, 200, 0, 255];
        let src = vec![100, 100, 100, 100];
        MaskRasterizer::blend_mask_layer(&mut dst, &src, "add", 4);
        assert_eq!(dst[0], 228); // 128 + 100
        assert_eq!(dst[1], 255); // clamped
        assert_eq!(dst[2], 100);
        assert_eq!(dst[3], 255); // clamped
    }

    #[test]
    fn test_blend_mask_subtract() {
        let mut dst = vec![200, 50, 0];
        let src = vec![100, 100, 100];
        MaskRasterizer::blend_mask_layer(&mut dst, &src, "subtract", 3);
        assert!((dst[0] as i32 - 100).abs() <= 1);
        assert_eq!(dst[1], 0); // clamped to 0
        assert_eq!(dst[2], 0);
    }

    #[test]
    fn test_blend_mask_intersect() {
        let mut dst = vec![255, 128, 0];
        let src = vec![128, 255, 128];
        MaskRasterizer::blend_mask_layer(&mut dst, &src, "intersect", 3);
        assert!((dst[0] as i32 - 128).abs() <= 1); // 1.0 * 0.502 ≈ 0.502
        assert!((dst[1] as i32 - 128).abs() <= 1); // 0.502 * 1.0 ≈ 0.502
        assert_eq!(dst[2], 0); // 0 * anything = 0
    }
}
