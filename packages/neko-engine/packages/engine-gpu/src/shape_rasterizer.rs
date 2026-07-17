//! Shape Rasterizer - CPU-side 2D shape rasterization to RGBA buffer
//!
//! Uses `tiny-skia` for path rendering with solid/gradient fills, strokes, and shadows.
//! The output RGBA buffer (premultiplied alpha) is uploaded to a wgpu texture for GPU
//! compositing via `GpuLayerBuilder`.
//!
//! Pipeline:
//! ```text
//! GpuShapeElementData → [tiny-skia path + fill/stroke/shadow] → RGBA Vec<u8>
//!   → [queue.write_texture] → wgpu::Texture → GpuLayer
//! ```
//!
//! Coordinate system: all shape geometry uses 0–100% normalized coordinates that
//! are scaled to the output canvas dimensions at rasterization time.

use std::sync::Arc;

use tiny_skia::{
    Color, FillRule, GradientStop, LineCap as TinyLineCap, LineJoin as TinyLineJoin,
    LinearGradient, Paint, Path, PathBuilder, Pixmap, Point, RadialGradient, SpreadMode, Stroke,
    StrokeDash, Transform,
};

use crate::GpuContext;

// =============================================================================
// Public types
// =============================================================================

/// Result of rasterizing a shape to a CPU pixel buffer
pub struct RasterizedShape {
    /// RGBA pixel data (premultiplied alpha, row-major)
    pub data: Vec<u8>,
    /// Texture width in pixels
    pub width: u32,
    /// Texture height in pixels
    pub height: u32,
}

/// Gradient stop for GPU shape fill.
#[derive(Debug, Clone)]
pub struct GpuShapeGradientStop {
    pub offset: f32,
    pub color: String,
}

/// Gradient definition for GPU shape fill.
#[derive(Debug, Clone)]
pub struct GpuShapeGradientData {
    pub gradient_type: String,
    pub stops: Vec<GpuShapeGradientStop>,
    pub angle: Option<f32>,
    pub center_x: Option<f32>,
    pub center_y: Option<f32>,
    pub radius: Option<f32>,
}

/// Fill properties for GPU shape rasterization.
#[derive(Debug, Clone)]
pub struct GpuShapeFillData {
    pub fill_type: String,
    pub color: Option<String>,
    pub gradient: Option<GpuShapeGradientData>,
    pub opacity: f32,
}

impl Default for GpuShapeFillData {
    fn default() -> Self {
        Self {
            fill_type: String::new(),
            color: None,
            gradient: None,
            opacity: 1.0,
        }
    }
}

/// Stroke properties for GPU shape rasterization.
#[derive(Debug, Clone)]
pub struct GpuShapeStrokeData {
    pub enabled: bool,
    pub color: String,
    pub width: f32,
    pub opacity: f32,
    pub line_cap: String,
    pub line_join: String,
    pub miter_limit: f32,
    pub dash_array: Vec<f32>,
    pub dash_offset: f32,
}

impl Default for GpuShapeStrokeData {
    fn default() -> Self {
        Self {
            enabled: false,
            color: "#000000".to_string(),
            width: 1.0,
            opacity: 1.0,
            line_cap: "butt".to_string(),
            line_join: "miter".to_string(),
            miter_limit: 4.0,
            dash_array: Vec::new(),
            dash_offset: 0.0,
        }
    }
}

/// Shadow properties for GPU shape rasterization.
#[derive(Debug, Clone, Default)]
pub struct GpuShapeShadowData {
    pub enabled: bool,
    pub color: String,
    pub blur: f32,
    pub offset_x: f32,
    pub offset_y: f32,
}

/// GPU-local shape rasterization input.
#[derive(Debug, Clone, Default)]
pub struct GpuShapeElementData {
    pub shape_type: String,
    pub shape_params: serde_json::Value,
    pub fill: GpuShapeFillData,
    pub stroke: GpuShapeStrokeData,
    pub shadow: GpuShapeShadowData,
}

/// CPU shape rasterizer using tiny-skia
///
/// Rasterizes `GpuShapeElementData` at the output canvas size, then uploads the
/// result to a wgpu texture for compositing.
pub struct ShapeRasterizer {
    gpu_ctx: Arc<GpuContext>,
}

impl ShapeRasterizer {
    pub fn new(gpu_ctx: Arc<GpuContext>) -> Self {
        Self { gpu_ctx }
    }

    /// Rasterize a shape element to an RGBA buffer at (`canvas_w` × `canvas_h`).
    ///
    /// Returns `None` if the shape type is unknown or the path could not be built.
    pub fn rasterize(
        &self,
        data: &GpuShapeElementData,
        canvas_w: u32,
        canvas_h: u32,
    ) -> Option<RasterizedShape> {
        let mut pixmap = Pixmap::new(canvas_w, canvas_h)?;

        let path = self.build_path(data, canvas_w, canvas_h)?;

        // Render shadow first (behind fill and stroke)
        if data.shadow.enabled && !data.shadow.color.is_empty() {
            render_shadow(&mut pixmap, &path, &data.shadow);
        }

        // Render fill
        if data.fill.fill_type != "none" && !data.fill.fill_type.is_empty() {
            render_fill(&mut pixmap, &path, &data.fill, canvas_w, canvas_h);
        }

        // Render stroke
        if data.stroke.enabled && data.stroke.width > 0.0 {
            render_stroke(&mut pixmap, &path, &data.stroke);
        }

        Some(RasterizedShape {
            data: pixmap.data().to_vec(),
            width: canvas_w,
            height: canvas_h,
        })
    }

    /// Upload rasterized shape data to a wgpu RGBA8 texture
    pub fn upload_to_texture(&self, rasterized: &RasterizedShape) -> wgpu::Texture {
        let texture = self
            .gpu_ctx
            .device()
            .create_texture(&wgpu::TextureDescriptor {
                label: Some("Shape Texture"),
                size: wgpu::Extent3d {
                    width: rasterized.width,
                    height: rasterized.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::COPY_DST
                    | wgpu::TextureUsages::COPY_SRC,
                view_formats: &[],
            });

        self.gpu_ctx.queue().write_texture(
            wgpu::ImageCopyTexture {
                texture: &texture,
                mip_level: 0,
                origin: wgpu::Origin3d::ZERO,
                aspect: wgpu::TextureAspect::All,
            },
            &rasterized.data,
            wgpu::ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(rasterized.width * 4),
                rows_per_image: Some(rasterized.height),
            },
            wgpu::Extent3d {
                width: rasterized.width,
                height: rasterized.height,
                depth_or_array_layers: 1,
            },
        );

        texture
    }

    // =========================================================================
    // Path builders (one per shape type)
    // =========================================================================

    fn build_path(&self, data: &GpuShapeElementData, w: u32, h: u32) -> Option<Path> {
        let fw = w as f32;
        let fh = h as f32;
        let p = &data.shape_params;

        match data.shape_type.as_str() {
            "rectangle" => build_rectangle(p, fw, fh),
            "ellipse" => build_ellipse(p, fw, fh),
            "polygon" => build_polygon(p, fw, fh),
            "star" => build_star(p, fw, fh),
            "line" => build_line(p, fw, fh),
            "bezier" => build_bezier(p, fw, fh),
            other => {
                tracing::warn!("ShapeRasterizer: unknown shape type '{}'", other);
                None
            }
        }
    }
}

// =============================================================================
// Shape path construction
// =============================================================================

fn build_rectangle(p: &serde_json::Value, fw: f32, fh: f32) -> Option<Path> {
    let cx = get_pct(p, "centerX", 50.0) * fw;
    let cy = get_pct(p, "centerY", 50.0) * fh;
    let rw = get_pct(p, "width", 50.0) * fw;
    let rh = get_pct(p, "height", 30.0) * fh;
    let corner_radius_pct = get_f32(p, "cornerRadius", 0.0);
    let rotation = get_f32(p, "rotation", 0.0);

    let left = cx - rw / 2.0;
    let top = cy - rh / 2.0;

    let mut pb = PathBuilder::new();
    if corner_radius_pct > 0.0 {
        // Corner radius as percentage of min(width, height) / 2
        let r = (corner_radius_pct / 100.0 * rw.min(rh) / 2.0)
            .min(rw / 2.0)
            .min(rh / 2.0);
        pb.move_to(left + r, top);
        pb.line_to(left + rw - r, top);
        pb.quad_to(left + rw, top, left + rw, top + r);
        pb.line_to(left + rw, top + rh - r);
        pb.quad_to(left + rw, top + rh, left + rw - r, top + rh);
        pb.line_to(left + r, top + rh);
        pb.quad_to(left, top + rh, left, top + rh - r);
        pb.line_to(left, top + r);
        pb.quad_to(left, top, left + r, top);
    } else {
        pb.move_to(left, top);
        pb.line_to(left + rw, top);
        pb.line_to(left + rw, top + rh);
        pb.line_to(left, top + rh);
    }
    pb.close();

    apply_rotation(pb.finish()?, rotation, cx, cy)
}

fn build_ellipse(p: &serde_json::Value, fw: f32, fh: f32) -> Option<Path> {
    let cx = get_pct(p, "centerX", 50.0) * fw;
    let cy = get_pct(p, "centerY", 50.0) * fh;
    let rx = get_pct(p, "radiusX", 25.0) * fw;
    let ry = get_pct(p, "radiusY", 25.0) * fh;
    let rotation = get_f32(p, "rotation", 0.0);

    // Approximate ellipse with 4 cubic Béziers (κ ≈ 0.5523)
    const K: f32 = 0.552_284_8;
    let mut pb = PathBuilder::new();
    pb.move_to(cx + rx, cy);
    pb.cubic_to(cx + rx, cy - K * ry, cx + K * rx, cy - ry, cx, cy - ry);
    pb.cubic_to(cx - K * rx, cy - ry, cx - rx, cy - K * ry, cx - rx, cy);
    pb.cubic_to(cx - rx, cy + K * ry, cx - K * rx, cy + ry, cx, cy + ry);
    pb.cubic_to(cx + K * rx, cy + ry, cx + rx, cy + K * ry, cx + rx, cy);
    pb.close();

    apply_rotation(pb.finish()?, rotation, cx, cy)
}

fn build_polygon(p: &serde_json::Value, fw: f32, fh: f32) -> Option<Path> {
    let pts = p.get("points").and_then(|v| v.as_array())?;
    if pts.len() < 3 {
        return None;
    }
    let mut pb = PathBuilder::new();
    for (i, pt) in pts.iter().enumerate() {
        let x = get_f32(pt, "x", 0.0) / 100.0 * fw;
        let y = get_f32(pt, "y", 0.0) / 100.0 * fh;
        if i == 0 {
            pb.move_to(x, y);
        } else {
            pb.line_to(x, y);
        }
    }
    pb.close();
    pb.finish()
}

fn build_star(p: &serde_json::Value, fw: f32, fh: f32) -> Option<Path> {
    let cx = get_pct(p, "centerX", 50.0) * fw;
    let cy = get_pct(p, "centerY", 50.0) * fh;
    let num_pts = get_f32(p, "points", 5.0).max(3.0) as u32;
    let outer_r = get_pct(p, "outerRadius", 25.0) * fw.min(fh);
    let inner_ratio = get_f32(p, "innerRadiusRatio", 0.4).clamp(0.0, 1.0);
    let inner_r = outer_r * inner_ratio;
    // Default rotation puts first outer point at top
    let rot_deg = get_f32(p, "rotation", -90.0);
    let rot_rad = rot_deg.to_radians();

    let total = num_pts * 2;
    let step = std::f32::consts::TAU / total as f32;
    let mut pb = PathBuilder::new();
    for i in 0..total {
        let angle = rot_rad + step * i as f32;
        let r = if i % 2 == 0 { outer_r } else { inner_r };
        let x = cx + r * angle.cos();
        let y = cy + r * angle.sin();
        if i == 0 {
            pb.move_to(x, y);
        } else {
            pb.line_to(x, y);
        }
    }
    pb.close();
    pb.finish()
}

fn build_line(p: &serde_json::Value, fw: f32, fh: f32) -> Option<Path> {
    let sx = get_pct(p, "startX", 25.0) * fw;
    let sy = get_pct(p, "startY", 50.0) * fh;
    let ex = get_pct(p, "endX", 75.0) * fw;
    let ey = get_pct(p, "endY", 50.0) * fh;
    let mut pb = PathBuilder::new();
    pb.move_to(sx, sy);
    pb.line_to(ex, ey);
    pb.finish()
}

fn build_bezier(p: &serde_json::Value, fw: f32, fh: f32) -> Option<Path> {
    let pts = p.get("points").and_then(|v| v.as_array())?;
    if pts.is_empty() {
        return None;
    }
    let closed = p.get("closed").and_then(|v| v.as_bool()).unwrap_or(false);

    let pt_x = |v: &serde_json::Value, k: &str, fb: f32| -> f32 { get_f32(v, k, fb) / 100.0 * fw };
    let pt_y = |v: &serde_json::Value, k: &str, fb: f32| -> f32 { get_f32(v, k, fb) / 100.0 * fh };

    let mut pb = PathBuilder::new();
    let first_x = pt_x(&pts[0], "x", 0.0);
    let first_y = pt_y(&pts[0], "y", 0.0);
    pb.move_to(first_x, first_y);

    for i in 1..pts.len() {
        let prev = &pts[i - 1];
        let curr = &pts[i];
        let curr_x = pt_x(curr, "x", 0.0);
        let curr_y = pt_y(curr, "y", 0.0);
        let prev_x = pt_x(prev, "x", 0.0);
        let prev_y = pt_y(prev, "y", 0.0);
        // Outgoing control point of previous node
        let cp1x = pt_x(prev, "cp2x", prev_x / fw * 100.0);
        let cp1y = pt_y(prev, "cp2y", prev_y / fh * 100.0);
        // Incoming control point of current node
        let cp2x = pt_x(curr, "cp1x", curr_x / fw * 100.0);
        let cp2y = pt_y(curr, "cp1y", curr_y / fh * 100.0);
        pb.cubic_to(cp1x, cp1y, cp2x, cp2y, curr_x, curr_y);
    }

    if closed && pts.len() > 1 {
        let last = &pts[pts.len() - 1];
        let last_x = pt_x(last, "x", 0.0);
        let last_y = pt_y(last, "y", 0.0);
        let cp1x = pt_x(last, "cp2x", last_x / fw * 100.0);
        let cp1y = pt_y(last, "cp2y", last_y / fh * 100.0);
        let cp2x = pt_x(&pts[0], "cp1x", first_x / fw * 100.0);
        let cp2y = pt_y(&pts[0], "cp1y", first_y / fh * 100.0);
        pb.cubic_to(cp1x, cp1y, cp2x, cp2y, first_x, first_y);
        pb.close();
    }

    pb.finish()
}

// =============================================================================
// Rendering passes
// =============================================================================

fn render_shadow(pixmap: &mut Pixmap, path: &Path, shadow: &GpuShapeShadowData) {
    let (r, g, b, a) = parse_color(&shadow.color);
    let Some(color) = Color::from_rgba(r, g, b, a) else {
        return;
    };
    let mut paint = Paint::default();
    paint.set_color(color);
    paint.anti_alias = true;
    let t = Transform::from_translate(shadow.offset_x, shadow.offset_y);
    pixmap.fill_path(path, &paint, FillRule::Winding, t, None);
    // Gaussian blur on shadow is a P2 enhancement — rendered as hard shadow for now
}

fn render_fill(pixmap: &mut Pixmap, path: &Path, fill: &GpuShapeFillData, w: u32, h: u32) {
    let mut paint = Paint {
        anti_alias: true,
        ..Default::default()
    };

    match fill.fill_type.as_str() {
        "solid" => {
            let color_str = fill.color.as_deref().unwrap_or("#000000");
            let (r, g, b, _) = parse_color(color_str);
            let a = fill.opacity;
            let Some(color) = Color::from_rgba(r, g, b, a) else {
                return;
            };
            paint.set_color(color);
            pixmap.fill_path(path, &paint, FillRule::Winding, Transform::identity(), None);
        }
        "gradient" => {
            if let Some(gradient) = &fill.gradient {
                render_gradient_fill(pixmap, path, gradient, fill.opacity, w, h);
            }
        }
        _ => {}
    }
}

fn render_gradient_fill(
    pixmap: &mut Pixmap,
    path: &Path,
    gradient: &GpuShapeGradientData,
    opacity: f32,
    w: u32,
    h: u32,
) {
    let stops: Vec<GradientStop> = gradient
        .stops
        .iter()
        .filter_map(|s| {
            let (r, g, b, a) = parse_color(&s.color);
            let color = Color::from_rgba(r, g, b, a * opacity)?;
            Some(GradientStop::new(s.offset, color))
        })
        .collect();
    if stops.is_empty() {
        return;
    }

    let fw = w as f32;
    let fh = h as f32;
    let mut paint = Paint {
        anti_alias: true,
        ..Default::default()
    };

    let shader = match gradient.gradient_type.as_str() {
        "radial" => {
            let cx = gradient.center_x.unwrap_or(0.5) * fw;
            let cy = gradient.center_y.unwrap_or(0.5) * fh;
            let radius = gradient.radius.unwrap_or(0.5) * fw.min(fh);
            RadialGradient::new(
                Point::from_xy(cx, cy),
                Point::from_xy(cx, cy), // focal point == center
                radius,
                stops,
                SpreadMode::Pad,
                Transform::identity(),
            )
        }
        _ => {
            // Linear gradient (default)
            let angle = gradient.angle.unwrap_or(0.0).to_radians();
            let cx = fw / 2.0;
            let cy = fh / 2.0;
            let half_len = (fw * fw + fh * fh).sqrt() / 2.0;
            // Angle measured clockwise from top
            let start = Point::from_xy(cx - angle.sin() * half_len, cy - angle.cos() * half_len);
            let end = Point::from_xy(cx + angle.sin() * half_len, cy + angle.cos() * half_len);
            LinearGradient::new(start, end, stops, SpreadMode::Pad, Transform::identity())
        }
    };

    let Some(shader) = shader else { return };
    paint.shader = shader;
    pixmap.fill_path(path, &paint, FillRule::Winding, Transform::identity(), None);
}

fn render_stroke(pixmap: &mut Pixmap, path: &Path, stroke_data: &GpuShapeStrokeData) {
    let (r, g, b, _) = parse_color(&stroke_data.color);
    let a = stroke_data.opacity;
    let Some(color) = Color::from_rgba(r, g, b, a) else {
        return;
    };

    let mut paint = Paint::default();
    paint.set_color(color);
    paint.anti_alias = true;

    let line_cap = match stroke_data.line_cap.as_str() {
        "round" => TinyLineCap::Round,
        "square" => TinyLineCap::Square,
        _ => TinyLineCap::Butt,
    };
    let line_join = match stroke_data.line_join.as_str() {
        "round" => TinyLineJoin::Round,
        "bevel" => TinyLineJoin::Bevel,
        _ => TinyLineJoin::Miter,
    };

    let mut stroke = Stroke {
        width: stroke_data.width,
        line_cap,
        line_join,
        miter_limit: stroke_data.miter_limit,
        ..Default::default()
    };

    if !stroke_data.dash_array.is_empty() {
        stroke.dash = StrokeDash::new(stroke_data.dash_array.clone(), stroke_data.dash_offset);
    }

    pixmap.stroke_path(path, &paint, &stroke, Transform::identity(), None);
}

// =============================================================================
// Helpers
// =============================================================================

fn apply_rotation(path: Path, degrees: f32, cx: f32, cy: f32) -> Option<Path> {
    if degrees.abs() < 0.001 {
        return Some(path);
    }
    path.transform(Transform::from_rotate_at(degrees, cx, cy))
}

/// Extract a 0–100% field as a 0.0–1.0 ratio
fn get_pct(v: &serde_json::Value, key: &str, default_pct: f32) -> f32 {
    get_f32(v, key, default_pct) / 100.0
}

fn get_f32(v: &serde_json::Value, key: &str, default: f32) -> f32 {
    v.get(key)
        .and_then(|x| x.as_f64())
        .map(|x| x as f32)
        .unwrap_or(default)
}

/// Parse CSS color string to (r, g, b, a) floats in 0.0–1.0
///
/// Supports: `#rrggbb`, `#rgb`, `rgba(r,g,b,a)`, `rgb(r,g,b)`
fn parse_color(s: &str) -> (f32, f32, f32, f32) {
    let s = s.trim();
    if s.starts_with('#') {
        let (r, g, b) = parse_hex_rgb(s);
        return (r, g, b, 1.0);
    }
    if s.starts_with("rgba(") || s.starts_with("rgb(") {
        return parse_rgb_fn(s);
    }
    (0.0, 0.0, 0.0, 1.0)
}

fn parse_hex_rgb(hex: &str) -> (f32, f32, f32) {
    let s = hex.trim_start_matches('#');
    if s.len() == 6 {
        let r = u8::from_str_radix(&s[0..2], 16).unwrap_or(0);
        let g = u8::from_str_radix(&s[2..4], 16).unwrap_or(0);
        let b = u8::from_str_radix(&s[4..6], 16).unwrap_or(0);
        return (r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0);
    }
    if s.len() == 3 {
        let r = u8::from_str_radix(&s[0..1], 16).unwrap_or(0);
        let g = u8::from_str_radix(&s[1..2], 16).unwrap_or(0);
        let b = u8::from_str_radix(&s[2..3], 16).unwrap_or(0);
        return (
            r as f32 * 17.0 / 255.0,
            g as f32 * 17.0 / 255.0,
            b as f32 * 17.0 / 255.0,
        );
    }
    (0.0, 0.0, 0.0)
}

fn parse_rgb_fn(s: &str) -> (f32, f32, f32, f32) {
    let inner = s
        .trim_start_matches("rgba(")
        .trim_start_matches("rgb(")
        .trim_end_matches(')');
    let parts: Vec<f32> = inner
        .split(',')
        .filter_map(|x| x.trim().parse::<f32>().ok())
        .collect();
    let r = parts.first().copied().unwrap_or(0.0) / 255.0;
    let g = parts.get(1).copied().unwrap_or(0.0) / 255.0;
    let b = parts.get(2).copied().unwrap_or(0.0) / 255.0;
    let a = parts.get(3).copied().unwrap_or(1.0); // already 0–1 in CSS rgba
    (r, g, b, a)
}
