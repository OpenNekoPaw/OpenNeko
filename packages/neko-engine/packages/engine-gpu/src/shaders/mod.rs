//! GPU Shaders module
//!
//! WGSL shaders for GPU-accelerated video processing.
//! Uses texture format for compatibility with WebGPU.

#![allow(dead_code)]

/// Common utilities (color conversion, math functions)
pub const COMMON_WGSL: &str = include_str!("../../shaders/common.wgsl");

/// Blend mode functions (26 Photoshop-compatible modes)
pub const BLEND_MODES_WGSL: &str = include_str!("../../shaders/blend_modes.wgsl");

/// Color correction functions (exposure, contrast, HSL, etc.)
pub const COLOR_CORRECTION_WGSL: &str = include_str!("../../shaders/color_correction.wgsl");

/// Video transition effects
pub const TRANSITIONS_WGSL: &str = include_str!("../../shaders/transitions.wgsl");

/// Video effects (blur, sharpen, vignette, etc.)
pub const EFFECTS_WGSL: &str = include_str!("../../shaders/effects.wgsl");

/// Easing functions for GPU animation (30+ easing types)
pub const EASING_WGSL: &str = include_str!("../../shaders/easing.wgsl");

/// Full color correction compute shader (texture format, 6 bindings).
///
/// Bindings:
///   0: input_tex  — texture_2d<f32>
///   1: output_tex — texture_storage_2d<rgba8unorm, write>
///   2: params     — uniform ColorCorrectionTexParams (256 bytes)
///   3: curves     — storage<read> CurvesBuffer (5×256 entries: rgb/r/g/b/luma)
///   4: lut_3d     — texture_3d<f32>  (n×n×n, x=R y=G z=B)
///   5: lut_sampler— sampler (linear/trilinear)
pub const COLOR_CORRECTION_COMPUTE_SHADER: &str = r#"
// Full Color Correction Compute Shader — Texture-to-Texture, 6 bindings
// Self-contained (no external includes required)

// =============================================================================
// Uniforms — must match Rust ColorCorrectionTexParams (repr(C), 256 bytes)
// =============================================================================

struct ColorCorrectionTexParams {
    // Basic (13 params × f32 = 52 bytes)
    brightness:     f32, // +0
    exposure:       f32, // +4
    contrast:       f32, // +8
    highlights:     f32, // +12
    shadows:        f32, // +16
    whites:         f32, // +20
    blacks:         f32, // +24
    temperature:    f32, // +28
    tint:           f32, // +32
    saturation:     f32, // +36
    vibrance:       f32, // +40
    gamma:          f32, // +44
    hue_shift:      f32, // +48
    // Flags
    cw_enabled:     f32, // +52  (0 or 1)
    curves_enabled: f32, // +56  (0 or 1)
    lut_enabled:    f32, // +60  (0 or 1)
    lut_intensity:  f32, // +64
    hsl_count:      f32, // +68  (0..8)
    _pad0:          f32, // +72
    _pad1:          f32, // +76
    // Color wheels: (r,g,b,brightness) × 3 = 48 bytes  (starts at +80, 16-aligned)
    cw_shadows:     vec4<f32>, // +80
    cw_midtones:    vec4<f32>, // +96
    cw_highlights:  vec4<f32>, // +112
    // HSL data: 8 × vec4<f32> = 128 bytes (starts at +128)
    hsl_data:       array<vec4<f32>, 8>, // +128..+255
}

struct CurvesBuffer {
    data: array<f32, 1280>,
}

// =============================================================================
// Bindings
// =============================================================================

@group(0) @binding(0) var input_tex:   texture_2d<f32>;
@group(0) @binding(1) var output_tex:  texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> p:  ColorCorrectionTexParams;
@group(0) @binding(3) var<storage, read> curves: CurvesBuffer;
@group(0) @binding(4) var lut_3d:      texture_3d<f32>;
@group(0) @binding(5) var lut_sampler: sampler;

// =============================================================================
// Color math
// =============================================================================

fn luminance(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)); }

fn rgb_to_hsl(rgb: vec3<f32>) -> vec3<f32> {
    let mx = max(max(rgb.r, rgb.g), rgb.b);
    let mn = min(min(rgb.r, rgb.g), rgb.b);
    let d  = mx - mn;
    let l  = (mx + mn) * 0.5;
    var h = 0.0; var s = 0.0;
    if (d > 0.0001) {
        s = select(d / (2.0 - mx - mn), d / (mx + mn), l < 0.5);
        if      (mx == rgb.r) { h = (rgb.g - rgb.b) / d + select(0.0, 6.0, rgb.g < rgb.b); }
        else if (mx == rgb.g) { h = (rgb.b - rgb.r) / d + 2.0; }
        else                  { h = (rgb.r - rgb.g) / d + 4.0; }
        h /= 6.0;
    }
    return vec3<f32>(h, s, l);
}

fn hue2rgb(p: f32, q: f32, t: f32) -> f32 {
    var t1 = t;
    if (t1 < 0.0) { t1 += 1.0; } if (t1 > 1.0) { t1 -= 1.0; }
    if (t1 < 1.0/6.0) { return p + (q-p)*6.0*t1; }
    if (t1 < 1.0/2.0) { return q; }
    if (t1 < 2.0/3.0) { return p + (q-p)*(2.0/3.0-t1)*6.0; }
    return p;
}

fn hsl_to_rgb(hsl: vec3<f32>) -> vec3<f32> {
    if (hsl.y < 0.0001) { return vec3<f32>(hsl.z); }
    let q = select(hsl.z + hsl.y - hsl.z*hsl.y, hsl.z*(1.0+hsl.y), hsl.z < 0.5);
    let p = 2.0*hsl.z - q;
    return vec3<f32>(hue2rgb(p,q,hsl.x+1.0/3.0), hue2rgb(p,q,hsl.x), hue2rgb(p,q,hsl.x-1.0/3.0));
}

// =============================================================================
// CC pipeline functions
// =============================================================================

fn cc_exposure(c: vec3<f32>, stops: f32) -> vec3<f32>  { return c * pow(2.0, stops); }
fn cc_brightness(c: vec3<f32>, a: f32)   -> vec3<f32>  { return c + a; }
fn cc_contrast(c: vec3<f32>, a: f32)     -> vec3<f32>  { return (c - 0.5) * a + 0.5; }
fn cc_gamma(c: vec3<f32>, g: f32)        -> vec3<f32>  { return pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0/g)); }

fn cc_saturation(c: vec3<f32>, a: f32) -> vec3<f32> {
    return mix(vec3<f32>(luminance(c)), c, a);
}
fn cc_vibrance(c: vec3<f32>, a: f32) -> vec3<f32> {
    let sat = max(max(c.r,c.g),c.b) - min(min(c.r,c.g),c.b);
    return mix(vec3<f32>(luminance(c)), c, 1.0 + a*(1.0-sat));
}
fn cc_hue_shift(c: vec3<f32>, deg: f32) -> vec3<f32> {
    var hsl = rgb_to_hsl(c); hsl.x = fract(hsl.x + deg/360.0); return hsl_to_rgb(hsl);
}
fn cc_temperature(c: vec3<f32>, t: f32) -> vec3<f32> {
    let s = t; return vec3<f32>(c.r + s*0.1, c.g, c.b - s*0.1);
}
fn cc_tint(c: vec3<f32>, t: f32) -> vec3<f32> { return vec3<f32>(c.r, c.g + t*0.1, c.b); }

fn cc_highlights(c: vec3<f32>, a: f32) -> vec3<f32> {
    return c + a * smoothstep(0.5, 1.0, luminance(c));
}
fn cc_shadows(c: vec3<f32>, a: f32) -> vec3<f32> {
    return c + a * (1.0 - smoothstep(0.0, 0.5, luminance(c)));
}
fn cc_whites(c: vec3<f32>, a: f32) -> vec3<f32> {
    return c + a * smoothstep(0.75, 1.0, luminance(c));
}
fn cc_blacks(c: vec3<f32>, a: f32) -> vec3<f32> {
    return c + a * (1.0 - smoothstep(0.0, 0.25, luminance(c)));
}

// HSL per-color adjustment: target_hue in 0-1, hue_shift/sat_adj/lum_adj in -0.5..0.5
fn cc_hsl_range(c: vec3<f32>, target_hue: f32, hue_shift: f32, sat_adj: f32, lum_adj: f32) -> vec3<f32> {
    var hsl = rgb_to_hsl(c);
    // Weight: angular distance on hue wheel (wrap-around, width ~1/6)
    var diff = abs(hsl.x - target_hue);
    if (diff > 0.5) { diff = 1.0 - diff; }
    let weight = smoothstep(1.0/6.0, 0.0, diff);
    if (weight < 0.001) { return c; }
    hsl.x  = fract(hsl.x + hue_shift * weight);
    hsl.y  = clamp(hsl.y + sat_adj * weight, 0.0, 1.0);
    hsl.z  = clamp(hsl.z + lum_adj * weight, 0.0, 1.0);
    return mix(c, hsl_to_rgb(hsl), weight);
}

// 3-way color wheel correction
fn cc_color_wheel(
    c:    vec3<f32>,
    sh:   vec4<f32>,   // shadows    (r,g,b,brightness)
    mid:  vec4<f32>,   // midtones   (r,g,b,brightness)
    hi:   vec4<f32>,   // highlights (r,g,b,brightness)
) -> vec3<f32> {
    let lum = luminance(c);
    let shadow_w    = 1.0 - smoothstep(0.0, 0.5, lum);
    let highlight_w = smoothstep(0.5, 1.0, lum);
    let midtone_w   = 1.0 - shadow_w - highlight_w;

    var result = c;
    // Color tint: shift each channel proportionally (0.5=neutral)
    result += (sh.rgb  - 0.5) * 2.0 * shadow_w;
    result += (mid.rgb - 0.5) * 2.0 * midtone_w;
    result += (hi.rgb  - 0.5) * 2.0 * highlight_w;
    // Brightness offset
    result += sh.w  * shadow_w;
    result += mid.w * midtone_w;
    result += hi.w  * highlight_w;
    return result;
}

// =============================================================================
// Curves (5×256 f32 buffer: indices rgb=0, r=1, g=2, b=3, luma=4)
// =============================================================================

fn sample_curve(channel: u32, value: f32) -> f32 {
    let idx = channel * 256u + u32(clamp(round(value * 255.0), 0.0, 255.0));
    return curves.data[idx];
}

fn apply_curves(c: vec3<f32>) -> vec3<f32> {
    // Per-channel
    var r = sample_curve(1u, c.r);
    var g = sample_curve(2u, c.g);
    var b = sample_curve(3u, c.b);
    // Luma curve — scale channels to preserve colour balance
    let lum_in  = luminance(vec3<f32>(r, g, b));
    let lum_out = sample_curve(4u, lum_in);
    let scale   = select(lum_out / lum_in, 1.0, lum_in < 0.001);
    r *= scale; g *= scale; b *= scale;
    // RGB master
    r = sample_curve(0u, r);
    g = sample_curve(0u, g);
    b = sample_curve(0u, b);
    return vec3<f32>(r, g, b);
}

// =============================================================================
// Main
// =============================================================================

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dims  = textureDimensions(input_tex);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }
    let coord = vec2<i32>(gid.xy);

    var c4 = textureLoad(input_tex, coord, 0);
    var c  = c4.rgb;

    // Basic CC pipeline
    c = cc_exposure(c,    p.exposure);
    c = cc_brightness(c,  p.brightness);
    c = cc_temperature(c, p.temperature);
    c = cc_tint(c,        p.tint);
    c = cc_highlights(c,  p.highlights);
    c = cc_shadows(c,     p.shadows);
    c = cc_whites(c,      p.whites);
    c = cc_blacks(c,      p.blacks);
    c = cc_contrast(c,    p.contrast);
    c = cc_gamma(c,       p.gamma);
    c = cc_vibrance(c,    p.vibrance);
    c = cc_saturation(c,  p.saturation);
    c = cc_hue_shift(c,   p.hue_shift);

    // HSL per-color adjustments
    let hsl_n = u32(p.hsl_count);
    for (var i = 0u; i < hsl_n; i++) {
        let d = p.hsl_data[i];
        c = cc_hsl_range(c, d.x, d.y, d.z, d.w);
    }

    // Color wheels
    if (p.cw_enabled > 0.5) {
        c = cc_color_wheel(c, p.cw_shadows, p.cw_midtones, p.cw_highlights);
    }

    // Curves
    if (p.curves_enabled > 0.5) {
        c = apply_curves(c);
    }

    c = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));

    // 3D LUT
    if (p.lut_enabled > 0.5) {
        let lut_c = textureSampleLevel(lut_3d, lut_sampler, c, 0.0).rgb;
        c = mix(c, lut_c, p.lut_intensity);
        c = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
    }

    textureStore(output_tex, coord, vec4<f32>(c, c4.a));
}
"#;

/// Blend mode compute shader using texture format
pub const BLEND_MODE_COMPUTE_SHADER: &str = r#"
// Blend Mode Compute Shader
// Uses texture format for WebGPU/wgpu compatibility

struct Params {
    blend_mode: u32,  // 0=normal, 1=multiply, 2=screen, etc.
    opacity: f32,
    _padding: vec2<f32>,
}

@group(0) @binding(0) var base_texture: texture_2d<f32>;
@group(0) @binding(1) var blend_texture: texture_2d<f32>;
@group(0) @binding(2) var output_texture: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let dims = textureDimensions(base_texture);
    if (global_id.x >= dims.x || global_id.y >= dims.y) {
        return;
    }

    let coord = vec2<i32>(global_id.xy);
    let base = textureLoad(base_texture, coord, 0);
    let blend = textureLoad(blend_texture, coord, 0);

    var blended: vec3<f32>;

    // Select blend mode
    switch (params.blend_mode) {
        case 0u: { blended = blend_normal(base.rgb, blend.rgb); }
        case 1u: { blended = blend_multiply(base.rgb, blend.rgb); }
        case 2u: { blended = blend_screen(base.rgb, blend.rgb); }
        case 3u: { blended = blend_overlay(base.rgb, blend.rgb); }
        case 4u: { blended = blend_darken(base.rgb, blend.rgb); }
        case 5u: { blended = blend_lighten(base.rgb, blend.rgb); }
        case 6u: { blended = blend_color_dodge(base.rgb, blend.rgb); }
        case 7u: { blended = blend_color_burn(base.rgb, blend.rgb); }
        case 8u: { blended = blend_hard_light(base.rgb, blend.rgb); }
        case 9u: { blended = blend_soft_light(base.rgb, blend.rgb); }
        case 10u: { blended = blend_difference(base.rgb, blend.rgb); }
        case 11u: { blended = blend_exclusion(base.rgb, blend.rgb); }
        case 12u: { blended = blend_hue(base.rgb, blend.rgb); }
        case 13u: { blended = blend_saturation(base.rgb, blend.rgb); }
        case 14u: { blended = blend_color(base.rgb, blend.rgb); }
        case 15u: { blended = blend_luminosity(base.rgb, blend.rgb); }
        default: { blended = blend.rgb; }
    }

    let result = apply_blend(base, blend, blended, params.opacity);
    textureStore(output_texture, coord, result);
}
"#;

/// Get full color correction shader (texture format, 6 bindings, full params + curves + LUT).
/// Self-contained — no external WGSL includes needed.
pub fn get_color_correction_shader() -> String {
    COLOR_CORRECTION_COMPUTE_SHADER.to_string()
}

/// Get full blend mode shader with common utilities included (texture format)
pub fn get_blend_mode_shader() -> String {
    format!(
        "{}\n{}\n{}",
        COMMON_WGSL, BLEND_MODES_WGSL, BLEND_MODE_COMPUTE_SHADER
    )
}

/// Get full transition shader with common utilities included
pub fn get_transition_shader() -> String {
    format!("{}\n{}", COMMON_WGSL, TRANSITIONS_WGSL)
}

/// Get full effects shader with common utilities included
pub fn get_effects_shader() -> String {
    format!("{}\n{}", COMMON_WGSL, EFFECTS_WGSL)
}

/// Get easing functions shader for GPU animation
pub fn get_easing_shader() -> String {
    EASING_WGSL.to_string()
}

/// Get full animation shader with easing and common utilities
pub fn get_animation_shader() -> String {
    format!("{}\n{}", COMMON_WGSL, EASING_WGSL)
}

/// Blur compute shader (storage buffer format)
/// Supports: box, gaussian, directional, radial, zoom blur
pub const BLUR_COMPUTE_SHADER: &str = r#"
// Blur Compute Shader (Storage Buffer Format)

struct Uniforms {
    width: u32,
    height: u32,
    blur_type: u32,    // 0=box, 1=gaussian, 2=directional, 3=radial, 4=zoom
    samples: u32,
    radius: f32,
    direction_x: f32,
    direction_y: f32,
    center_x: f32,
    center_y: f32,
    strength: f32,
    _padding: vec2<f32>,
}

@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

const PI: f32 = 3.14159265359;

// Unpack RGBA from u32
fn unpack_rgba(packed: u32) -> vec4<f32> {
    return vec4<f32>(
        f32(packed & 0xFFu) / 255.0,
        f32((packed >> 8u) & 0xFFu) / 255.0,
        f32((packed >> 16u) & 0xFFu) / 255.0,
        f32((packed >> 24u) & 0xFFu) / 255.0
    );
}

// Pack RGBA to u32
fn pack_rgba(color: vec4<f32>) -> u32 {
    let r = u32(clamp(color.r, 0.0, 1.0) * 255.0);
    let g = u32(clamp(color.g, 0.0, 1.0) * 255.0);
    let b = u32(clamp(color.b, 0.0, 1.0) * 255.0);
    let a = u32(clamp(color.a, 0.0, 1.0) * 255.0);
    return r | (g << 8u) | (b << 16u) | (a << 24u);
}

// Sample with bounds check
fn sample_at(x: i32, y: i32) -> vec4<f32> {
    let cx = clamp(x, 0, i32(uniforms.width) - 1);
    let cy = clamp(y, 0, i32(uniforms.height) - 1);
    let idx = u32(cx) + u32(cy) * uniforms.width;
    return unpack_rgba(input[idx]);
}

// Gaussian weight
fn gaussian_weight(x: f32, sigma: f32) -> f32 {
    return exp(-(x * x) / (2.0 * sigma * sigma));
}

// Box blur
fn box_blur(px: i32, py: i32) -> vec4<f32> {
    let r = i32(uniforms.radius);
    var color = vec4<f32>(0.0);
    var count = 0.0;

    for (var dy = -r; dy <= r; dy = dy + 1) {
        for (var dx = -r; dx <= r; dx = dx + 1) {
            color = color + sample_at(px + dx, py + dy);
            count = count + 1.0;
        }
    }

    return color / count;
}

// Gaussian blur
fn gaussian_blur(px: i32, py: i32) -> vec4<f32> {
    let r = i32(uniforms.radius);
    let sigma = uniforms.radius / 3.0;
    var color = vec4<f32>(0.0);
    var weight_sum = 0.0;

    for (var dy = -r; dy <= r; dy = dy + 1) {
        for (var dx = -r; dx <= r; dx = dx + 1) {
            let dist = sqrt(f32(dx * dx + dy * dy));
            let w = gaussian_weight(dist, sigma);
            color = color + sample_at(px + dx, py + dy) * w;
            weight_sum = weight_sum + w;
        }
    }

    return color / weight_sum;
}

// Directional/Motion blur
fn directional_blur(px: i32, py: i32) -> vec4<f32> {
    let samples = i32(uniforms.samples);
    var color = vec4<f32>(0.0);

    for (var i = 0; i < samples; i = i + 1) {
        let t = (f32(i) - f32(samples - 1) * 0.5) / f32(samples);
        let offset_x = uniforms.direction_x * uniforms.radius * t;
        let offset_y = uniforms.direction_y * uniforms.radius * t;
        color = color + sample_at(px + i32(offset_x), py + i32(offset_y));
    }

    return color / f32(samples);
}

// Radial blur
fn radial_blur(px: i32, py: i32) -> vec4<f32> {
    let uv = vec2<f32>(f32(px) / f32(uniforms.width), f32(py) / f32(uniforms.height));
    let center = vec2<f32>(uniforms.center_x, uniforms.center_y);
    let dir = uv - center;
    let dist = length(dir);

    let samples = i32(uniforms.samples);
    var color = vec4<f32>(0.0);

    for (var i = 0; i < samples; i = i + 1) {
        let t = f32(i) / f32(samples - 1);
        let angle = uniforms.strength * dist * (t - 0.5) * 0.1;
        let cos_a = cos(angle);
        let sin_a = sin(angle);

        let rotated = vec2<f32>(
            dir.x * cos_a - dir.y * sin_a,
            dir.x * sin_a + dir.y * cos_a
        );

        let sample_uv = center + rotated;
        let sx = i32(sample_uv.x * f32(uniforms.width));
        let sy = i32(sample_uv.y * f32(uniforms.height));
        color = color + sample_at(sx, sy);
    }

    return color / f32(samples);
}

// Zoom blur
fn zoom_blur(px: i32, py: i32) -> vec4<f32> {
    let uv = vec2<f32>(f32(px) / f32(uniforms.width), f32(py) / f32(uniforms.height));
    let center = vec2<f32>(uniforms.center_x, uniforms.center_y);
    let dir = uv - center;

    let samples = i32(uniforms.samples);
    var color = vec4<f32>(0.0);

    for (var i = 0; i < samples; i = i + 1) {
        let t = f32(i) / f32(samples - 1);
        let scale = 1.0 + uniforms.strength * (t - 0.5) * 0.1;
        let sample_uv = center + dir * scale;
        let sx = i32(sample_uv.x * f32(uniforms.width));
        let sy = i32(sample_uv.y * f32(uniforms.height));
        color = color + sample_at(sx, sy);
    }

    return color / f32(samples);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= uniforms.width || global_id.y >= uniforms.height) {
        return;
    }

    let px = i32(global_id.x);
    let py = i32(global_id.y);
    var color: vec4<f32>;

    switch (uniforms.blur_type) {
        case 0u: { color = box_blur(px, py); }
        case 1u: { color = gaussian_blur(px, py); }
        case 2u: { color = directional_blur(px, py); }
        case 3u: { color = radial_blur(px, py); }
        case 4u: { color = zoom_blur(px, py); }
        default: { color = sample_at(px, py); }
    }

    let idx = global_id.x + global_id.y * uniforms.width;
    output[idx] = pack_rgba(color);
}
"#;

/// Sharpen compute shader (storage buffer format)
/// Uses unsharp mask algorithm
pub const SHARPEN_COMPUTE_SHADER: &str = r#"
// Sharpen Compute Shader (Storage Buffer Format)
// Uses unsharp mask algorithm

// NOTE: Use individual f32 instead of vec3<f32> to match Rust repr(C) layout
// vec3<f32> requires 16-byte alignment in WGSL, but Rust [f32; 3] only needs 4-byte
struct Uniforms {
    width: u32,
    height: u32,
    amount: f32,
    radius: f32,
    threshold: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

// Unpack RGBA from u32
fn unpack_rgba(packed: u32) -> vec4<f32> {
    return vec4<f32>(
        f32(packed & 0xFFu) / 255.0,
        f32((packed >> 8u) & 0xFFu) / 255.0,
        f32((packed >> 16u) & 0xFFu) / 255.0,
        f32((packed >> 24u) & 0xFFu) / 255.0
    );
}

// Pack RGBA to u32
fn pack_rgba(color: vec4<f32>) -> u32 {
    let r = u32(clamp(color.r, 0.0, 1.0) * 255.0);
    let g = u32(clamp(color.g, 0.0, 1.0) * 255.0);
    let b = u32(clamp(color.b, 0.0, 1.0) * 255.0);
    let a = u32(clamp(color.a, 0.0, 1.0) * 255.0);
    return r | (g << 8u) | (b << 16u) | (a << 24u);
}

// Sample with bounds check
fn sample_at(x: i32, y: i32) -> vec4<f32> {
    let cx = clamp(x, 0, i32(uniforms.width) - 1);
    let cy = clamp(y, 0, i32(uniforms.height) - 1);
    let idx = u32(cx) + u32(cy) * uniforms.width;
    return unpack_rgba(input[idx]);
}

// Luminance
fn luminance(color: vec3<f32>) -> f32 {
    return dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
}

// Gaussian weight
fn gaussian_weight(x: f32, sigma: f32) -> f32 {
    return exp(-(x * x) / (2.0 * sigma * sigma));
}

// Blur for unsharp mask
fn blur_at(px: i32, py: i32) -> vec4<f32> {
    let r = i32(ceil(uniforms.radius));
    let sigma = uniforms.radius / 3.0;
    var color = vec4<f32>(0.0);
    var weight_sum = 0.0;

    for (var dy = -r; dy <= r; dy = dy + 1) {
        for (var dx = -r; dx <= r; dx = dx + 1) {
            let dist = sqrt(f32(dx * dx + dy * dy));
            if (dist <= uniforms.radius) {
                let w = gaussian_weight(dist, sigma);
                color = color + sample_at(px + dx, py + dy) * w;
                weight_sum = weight_sum + w;
            }
        }
    }

    return color / weight_sum;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= uniforms.width || global_id.y >= uniforms.height) {
        return;
    }

    let px = i32(global_id.x);
    let py = i32(global_id.y);

    let original = sample_at(px, py);
    let blurred = blur_at(px, py);

    // Unsharp mask: sharp = original + amount * (original - blurred)
    let diff = original.rgb - blurred.rgb;
    let diff_lum = abs(luminance(diff));

    // Apply threshold
    var sharpened = original.rgb;
    if (diff_lum > uniforms.threshold) {
        sharpened = original.rgb + uniforms.amount * diff;
    }

    // Clamp to valid range
    sharpened = clamp(sharpened, vec3<f32>(0.0), vec3<f32>(1.0));

    let idx = global_id.x + global_id.y * uniforms.width;
    output[idx] = pack_rgba(vec4<f32>(sharpened, original.a));
}
"#;

/// Vignette compute shader (storage buffer format)
pub const VIGNETTE_COMPUTE_SHADER: &str = r#"
// Vignette Compute Shader (Storage Buffer Format)

struct Uniforms {
    width: u32,
    height: u32,
    amount: f32,
    radius: f32,
    softness: f32,
    roundness: f32,
    _padding: vec2<f32>,
}

@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

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

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= uniforms.width || global_id.y >= uniforms.height) {
        return;
    }

    let idx = global_id.x + global_id.y * uniforms.width;
    let color = unpack_rgba(input[idx]);

    // Calculate UV coordinates (0 to 1)
    let uv = vec2<f32>(
        f32(global_id.x) / f32(uniforms.width),
        f32(global_id.y) / f32(uniforms.height)
    );

    // Center and adjust for aspect ratio
    let center = vec2<f32>(0.5, 0.5);
    var delta = uv - center;

    // Adjust for aspect ratio and roundness
    let aspect = f32(uniforms.width) / f32(uniforms.height);
    delta.x *= mix(1.0, aspect, uniforms.roundness);

    // Calculate distance from center
    let dist = length(delta);

    // Calculate vignette factor
    let inner = uniforms.radius;
    let outer = uniforms.radius + uniforms.softness;
    let vignette = 1.0 - smoothstep(inner, outer, dist) * uniforms.amount;

    // Apply vignette
    let result = vec4<f32>(color.rgb * vignette, color.a);

    output[idx] = pack_rgba(result);
}
"#;

/// Film grain compute shader (storage buffer format)
pub const FILM_GRAIN_COMPUTE_SHADER: &str = r#"
// Film Grain Compute Shader (Storage Buffer Format)

struct Uniforms {
    width: u32,
    height: u32,
    amount: f32,
    size: f32,
    time: f32,
    color_amount: f32,
    _padding: vec2<f32>,
}

@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

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

// Simple hash function for noise
fn hash(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.13);
    p3 = p3 + dot(p3, p3.yzx + 3.333);
    return fract((p3.x + p3.y) * p3.z);
}

// Film grain noise
fn grain(uv: vec2<f32>, time: f32) -> f32 {
    let scaled = uv * uniforms.size;
    return hash(scaled + time) * 2.0 - 1.0;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= uniforms.width || global_id.y >= uniforms.height) {
        return;
    }

    let idx = global_id.x + global_id.y * uniforms.width;
    let color = unpack_rgba(input[idx]);

    let uv = vec2<f32>(f32(global_id.x), f32(global_id.y));

    // Generate grain
    let mono_grain = grain(uv, uniforms.time) * uniforms.amount;

    // Color grain (different noise for each channel)
    let r_grain = grain(uv + vec2<f32>(1.0, 0.0), uniforms.time) * uniforms.amount;
    let g_grain = grain(uv + vec2<f32>(0.0, 1.0), uniforms.time) * uniforms.amount;
    let b_grain = grain(uv + vec2<f32>(1.0, 1.0), uniforms.time) * uniforms.amount;

    // Mix mono and color grain
    let final_grain = vec3<f32>(
        mix(mono_grain, r_grain, uniforms.color_amount),
        mix(mono_grain, g_grain, uniforms.color_amount),
        mix(mono_grain, b_grain, uniforms.color_amount)
    );

    // Apply grain
    let result = vec4<f32>(clamp(color.rgb + final_grain, vec3<f32>(0.0), vec3<f32>(1.0)), color.a);

    output[idx] = pack_rgba(result);
}
"#;

/// Glow/Bloom compute shader (storage buffer format)
pub const GLOW_COMPUTE_SHADER: &str = r#"
// Glow/Bloom Compute Shader (Storage Buffer Format)

// NOTE: Use individual f32 instead of vec3<f32> to match Rust repr(C) layout
// vec3<f32> requires 16-byte alignment in WGSL, but Rust [f32; 3] only needs 4-byte
struct Uniforms {
    width: u32,
    height: u32,
    intensity: f32,
    threshold: f32,
    radius: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

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

fn luminance(color: vec3<f32>) -> f32 {
    return dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn gaussian_weight(x: f32, sigma: f32) -> f32 {
    return exp(-(x * x) / (2.0 * sigma * sigma));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= uniforms.width || global_id.y >= uniforms.height) {
        return;
    }

    let px = i32(global_id.x);
    let py = i32(global_id.y);
    let original = sample_at(px, py);

    // Blur pass to collect bright pixels
    let r = i32(uniforms.radius);
    let sigma = uniforms.radius / 3.0;
    var glow = vec3<f32>(0.0);
    var weight_sum = 0.0;

    for (var dy = -r; dy <= r; dy = dy + 2) {
        for (var dx = -r; dx <= r; dx = dx + 2) {
            let sample = sample_at(px + dx, py + dy);
            let lum = luminance(sample.rgb);

            // Only include bright pixels above threshold
            if (lum > uniforms.threshold) {
                let dist = sqrt(f32(dx * dx + dy * dy));
                let w = gaussian_weight(dist, sigma);
                let bright = sample.rgb * (lum - uniforms.threshold) / (1.0 - uniforms.threshold);
                glow = glow + bright * w;
                weight_sum = weight_sum + w;
            }
        }
    }

    if (weight_sum > 0.0) {
        glow = glow / weight_sum;
    }

    // Add glow to original
    let result = vec4<f32>(original.rgb + glow * uniforms.intensity, original.a);

    let idx = global_id.x + global_id.y * uniforms.width;
    output[idx] = pack_rgba(result);
}
"#;

/// Chromatic aberration compute shader (storage buffer format)
pub const CHROMATIC_ABERRATION_COMPUTE_SHADER: &str = r#"
// Chromatic Aberration Compute Shader (Storage Buffer Format)

struct Uniforms {
    width: u32,
    height: u32,
    amount: f32,
    angle: f32,
    center_x: f32,
    center_y: f32,
    _padding: vec2<f32>,
}

@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

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

fn sample_at_uv(uv: vec2<f32>) -> vec4<f32> {
    let x = i32(uv.x * f32(uniforms.width));
    let y = i32(uv.y * f32(uniforms.height));
    let cx = clamp(x, 0, i32(uniforms.width) - 1);
    let cy = clamp(y, 0, i32(uniforms.height) - 1);
    let idx = u32(cx) + u32(cy) * uniforms.width;
    return unpack_rgba(input[idx]);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= uniforms.width || global_id.y >= uniforms.height) {
        return;
    }

    // Calculate UV coordinates
    let uv = vec2<f32>(
        f32(global_id.x) / f32(uniforms.width),
        f32(global_id.y) / f32(uniforms.height)
    );

    // Calculate direction from center
    let center = vec2<f32>(uniforms.center_x, uniforms.center_y);
    let dir = uv - center;
    let dist = length(dir);

    // Calculate offset based on distance from center and angle
    let offset_dir = vec2<f32>(cos(uniforms.angle), sin(uniforms.angle));
    let offset = offset_dir * uniforms.amount * dist;

    // Sample each channel with different offsets
    let r = sample_at_uv(uv + offset).r;
    let g = sample_at_uv(uv).g;
    let b = sample_at_uv(uv - offset).b;
    let a = sample_at_uv(uv).a;

    let result = vec4<f32>(r, g, b, a);

    let idx = global_id.x + global_id.y * uniforms.width;
    output[idx] = pack_rgba(result);
}
"#;

// =============================================================================
// Texture-to-Texture Effect Shaders (Phase 3 zero-copy pipeline)
// Bindings: 0=input_tex texture_2d<f32>, 1=output_tex texture_storage_2d<rgba8unorm,write>,
//           2=uniforms (uniform buffer)
// =============================================================================

/// Blur texture-to-texture shader.
/// Uniforms: blur_type(u32), samples(u32), radius(f32), direction_x(f32),
///           direction_y(f32), center_x(f32), center_y(f32), strength(f32)
pub const BLUR_TEX_SHADER: &str = r#"
struct Uniforms {
    blur_type:   u32,
    samples:     u32,
    radius:      f32,
    direction_x: f32,
    direction_y: f32,
    center_x:    f32,
    center_y:    f32,
    strength:    f32,
}
@group(0) @binding(0) var input_tex:  texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> u: Uniforms;

fn tex_sample(x: i32, y: i32, dims: vec2<u32>) -> vec4<f32> {
    let cx = clamp(x, 0, i32(dims.x)-1);
    let cy = clamp(y, 0, i32(dims.y)-1);
    return textureLoad(input_tex, vec2<i32>(cx, cy), 0);
}
fn gauss_w(x: f32, sigma: f32) -> f32 { return exp(-(x*x)/(2.0*sigma*sigma)); }

fn box_blur(px: i32, py: i32, dims: vec2<u32>) -> vec4<f32> {
    let r = i32(u.radius); var c = vec4<f32>(0.0); var n = 0.0;
    for (var dy = -r; dy <= r; dy++) { for (var dx = -r; dx <= r; dx++) {
        c += tex_sample(px+dx, py+dy, dims); n += 1.0;
    }}
    return c / n;
}
fn gaussian_blur(px: i32, py: i32, dims: vec2<u32>) -> vec4<f32> {
    let r = i32(u.radius); let sigma = u.radius/3.0;
    var c = vec4<f32>(0.0); var ws = 0.0;
    for (var dy = -r; dy <= r; dy++) { for (var dx = -r; dx <= r; dx++) {
        let w = gauss_w(sqrt(f32(dx*dx+dy*dy)), sigma);
        c += tex_sample(px+dx, py+dy, dims)*w; ws += w;
    }}
    return c / ws;
}
fn directional_blur(px: i32, py: i32, dims: vec2<u32>) -> vec4<f32> {
    let s = i32(u.samples); var c = vec4<f32>(0.0);
    for (var i = 0; i < s; i++) {
        let t = (f32(i) - f32(s-1)*0.5) / f32(s);
        c += tex_sample(px+i32(u.direction_x*u.radius*t), py+i32(u.direction_y*u.radius*t), dims);
    }
    return c / f32(s);
}
fn radial_blur(px: i32, py: i32, dims: vec2<u32>) -> vec4<f32> {
    let uv = vec2<f32>(f32(px)/f32(dims.x), f32(py)/f32(dims.y));
    let dir = uv - vec2<f32>(u.center_x, u.center_y);
    let s = i32(u.samples); var c = vec4<f32>(0.0);
    for (var i = 0; i < s; i++) {
        let t = f32(i)/f32(s-1);
        let a = u.strength*length(dir)*(t-0.5)*0.1;
        let rv = vec2<f32>(dir.x*cos(a)-dir.y*sin(a), dir.x*sin(a)+dir.y*cos(a));
        let suv = vec2<f32>(u.center_x, u.center_y) + rv;
        c += tex_sample(i32(suv.x*f32(dims.x)), i32(suv.y*f32(dims.y)), dims);
    }
    return c / f32(s);
}
fn zoom_blur(px: i32, py: i32, dims: vec2<u32>) -> vec4<f32> {
    let uv = vec2<f32>(f32(px)/f32(dims.x), f32(py)/f32(dims.y));
    let dir = uv - vec2<f32>(u.center_x, u.center_y);
    let s = i32(u.samples); var c = vec4<f32>(0.0);
    for (var i = 0; i < s; i++) {
        let sc = 1.0 + u.strength*(f32(i)/f32(s-1)-0.5)*0.1;
        let suv = vec2<f32>(u.center_x, u.center_y) + dir*sc;
        c += tex_sample(i32(suv.x*f32(dims.x)), i32(suv.y*f32(dims.y)), dims);
    }
    return c / f32(s);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dims = textureDimensions(input_tex);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }
    let px = i32(gid.x); let py = i32(gid.y);
    var result: vec4<f32>;
    switch (u.blur_type) {
        case 0u: { result = box_blur(px, py, dims); }
        case 1u: { result = gaussian_blur(px, py, dims); }
        case 2u: { result = directional_blur(px, py, dims); }
        case 3u: { result = radial_blur(px, py, dims); }
        case 4u: { result = zoom_blur(px, py, dims); }
        default: { result = textureLoad(input_tex, vec2<i32>(px, py), 0); }
    }
    textureStore(output_tex, vec2<i32>(px, py), result);
}
"#;

/// Sharpen (unsharp mask) texture-to-texture shader.
/// Uniforms: amount(f32), radius(f32), threshold(f32), _pad(f32)
pub const SHARPEN_TEX_SHADER: &str = r#"
struct Uniforms { amount: f32, radius: f32, threshold: f32, _pad: f32, }
@group(0) @binding(0) var input_tex:  texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> u: Uniforms;

fn tex_sample(x: i32, y: i32, dims: vec2<u32>) -> vec4<f32> {
    return textureLoad(input_tex, vec2<i32>(clamp(x,0,i32(dims.x)-1), clamp(y,0,i32(dims.y)-1)), 0);
}
fn gauss_w(x: f32, sigma: f32) -> f32 { return exp(-(x*x)/(2.0*sigma*sigma)); }
fn luminance(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126,0.7152,0.0722)); }

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dims = textureDimensions(input_tex);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }
    let px = i32(gid.x); let py = i32(gid.y);
    let orig = tex_sample(px, py, dims);
    let r = i32(ceil(u.radius)); let sigma = u.radius/3.0;
    var blur = vec4<f32>(0.0); var ws = 0.0;
    for (var dy = -r; dy <= r; dy++) { for (var dx = -r; dx <= r; dx++) {
        let d = sqrt(f32(dx*dx+dy*dy));
        if (d <= u.radius) {
            let w = gauss_w(d, sigma);
            blur += tex_sample(px+dx, py+dy, dims)*w; ws += w;
        }
    }}
    blur /= ws;
    let diff = orig.rgb - blur.rgb;
    var sharp = orig.rgb;
    if (abs(luminance(diff)) > u.threshold) { sharp = orig.rgb + u.amount*diff; }
    textureStore(output_tex, vec2<i32>(px,py), vec4<f32>(clamp(sharp,vec3<f32>(0.0),vec3<f32>(1.0)), orig.a));
}
"#;

/// Vignette texture-to-texture shader.
/// Uniforms: amount(f32), radius(f32), softness(f32), roundness(f32)
pub const VIGNETTE_TEX_SHADER: &str = r#"
struct Uniforms { amount: f32, radius: f32, softness: f32, roundness: f32, }
@group(0) @binding(0) var input_tex:  texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> u: Uniforms;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dims = textureDimensions(input_tex);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }
    let coord = vec2<i32>(gid.xy);
    let c = textureLoad(input_tex, coord, 0);
    let uv = vec2<f32>(f32(gid.x)/f32(dims.x), f32(gid.y)/f32(dims.y));
    var delta = uv - 0.5;
    delta.x *= mix(1.0, f32(dims.x)/f32(dims.y), u.roundness);
    let vignette = 1.0 - smoothstep(u.radius, u.radius+u.softness, length(delta)) * u.amount;
    textureStore(output_tex, coord, vec4<f32>(c.rgb*vignette, c.a));
}
"#;

/// Film grain texture-to-texture shader.
/// Uniforms: amount(f32), size(f32), time(f32), color_amount(f32)
pub const FILM_GRAIN_TEX_SHADER: &str = r#"
struct Uniforms { amount: f32, size: f32, time: f32, color_amount: f32, }
@group(0) @binding(0) var input_tex:  texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> u: Uniforms;

fn hash2(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x,p.y,p.x)*0.13);
    p3 += dot(p3, p3.yzx+3.333);
    return fract((p3.x+p3.y)*p3.z);
}
fn grain(uv: vec2<f32>, t: f32) -> f32 { return hash2(uv*u.size+t)*2.0-1.0; }

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dims = textureDimensions(input_tex);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }
    let coord = vec2<i32>(gid.xy);
    let c = textureLoad(input_tex, coord, 0);
    let uv = vec2<f32>(gid.xy);
    let mg = grain(uv, u.time)*u.amount;
    let fg = vec3<f32>(
        mix(mg, grain(uv+vec2<f32>(1.0,0.0), u.time)*u.amount, u.color_amount),
        mix(mg, grain(uv+vec2<f32>(0.0,1.0), u.time)*u.amount, u.color_amount),
        mix(mg, grain(uv+vec2<f32>(1.0,1.0), u.time)*u.amount, u.color_amount),
    );
    textureStore(output_tex, coord, vec4<f32>(clamp(c.rgb+fg, vec3<f32>(0.0), vec3<f32>(1.0)), c.a));
}
"#;

/// Glow/bloom texture-to-texture shader.
/// Uniforms: intensity(f32), threshold(f32), radius(f32), _pad(f32)
pub const GLOW_TEX_SHADER: &str = r#"
struct Uniforms { intensity: f32, threshold: f32, radius: f32, _pad: f32, }
@group(0) @binding(0) var input_tex:  texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> u: Uniforms;

fn tex_sample(x: i32, y: i32, dims: vec2<u32>) -> vec4<f32> {
    return textureLoad(input_tex, vec2<i32>(clamp(x,0,i32(dims.x)-1), clamp(y,0,i32(dims.y)-1)), 0);
}
fn gauss_w(x: f32, sigma: f32) -> f32 { return exp(-(x*x)/(2.0*sigma*sigma)); }
fn luminance(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126,0.7152,0.0722)); }

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dims = textureDimensions(input_tex);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }
    let px = i32(gid.x); let py = i32(gid.y);
    let orig = tex_sample(px, py, dims);
    let r = i32(u.radius); let sigma = u.radius/3.0;
    var glow = vec3<f32>(0.0); var ws = 0.0;
    for (var dy = -r; dy <= r; dy+=2) { for (var dx = -r; dx <= r; dx+=2) {
        let s = tex_sample(px+dx, py+dy, dims);
        let lum = luminance(s.rgb);
        if (lum > u.threshold) {
            let w = gauss_w(sqrt(f32(dx*dx+dy*dy)), sigma);
            glow += s.rgb*(lum-u.threshold)/(1.0-u.threshold)*w; ws += w;
        }
    }}
    if (ws > 0.0) { glow /= ws; }
    textureStore(output_tex, vec2<i32>(px,py),
        vec4<f32>(clamp(orig.rgb+glow*u.intensity, vec3<f32>(0.0), vec3<f32>(1.0)), orig.a));
}
"#;

/// Chromatic aberration texture-to-texture shader.
/// Uniforms: amount(f32), angle(f32), center_x(f32), center_y(f32)
pub const CHROMATIC_ABERRATION_TEX_SHADER: &str = r#"
struct Uniforms { amount: f32, angle: f32, center_x: f32, center_y: f32, }
@group(0) @binding(0) var input_tex:  texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> u: Uniforms;

fn sample_uv(uv: vec2<f32>, dims: vec2<u32>) -> vec4<f32> {
    let x = clamp(i32(uv.x*f32(dims.x)), 0, i32(dims.x)-1);
    let y = clamp(i32(uv.y*f32(dims.y)), 0, i32(dims.y)-1);
    return textureLoad(input_tex, vec2<i32>(x,y), 0);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dims = textureDimensions(input_tex);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }
    let uv = vec2<f32>(f32(gid.x)/f32(dims.x), f32(gid.y)/f32(dims.y));
    let center = vec2<f32>(u.center_x, u.center_y);
    let dist = length(uv - center);
    let off = vec2<f32>(cos(u.angle), sin(u.angle)) * u.amount * dist;
    let r = sample_uv(uv+off, dims).r;
    let g = sample_uv(uv,    dims).g;
    let b = sample_uv(uv-off, dims).b;
    let a = sample_uv(uv,    dims).a;
    textureStore(output_tex, vec2<i32>(gid.xy), vec4<f32>(r,g,b,a));
}
"#;

/// Luma Key texture-to-texture shader.
/// Uniforms: threshold(f32), softness(f32), invert(f32), _pad(f32)
/// Pixels with luminance below threshold become transparent.
pub const LUMA_KEY_TEX_SHADER: &str = r#"
struct Uniforms { threshold: f32, softness: f32, invert: f32, _pad: f32, }
@group(0) @binding(0) var input_tex:  texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> u: Uniforms;

fn luma(c: vec3<f32>) -> f32 { return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)); }

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dims = textureDimensions(input_tex);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }
    let coord = vec2<i32>(gid.xy);
    let c = textureLoad(input_tex, coord, 0);
    let l = luma(c.rgb);
    let half_soft = max(u.softness * 0.5, 0.001);
    var alpha = smoothstep(u.threshold - half_soft, u.threshold + half_soft, l);
    if (u.invert > 0.5) { alpha = 1.0 - alpha; }
    textureStore(output_tex, coord, vec4<f32>(c.rgb, c.a * alpha));
}
"#;

/// Chroma Key (green/blue screen) texture-to-texture shader.
/// Uniforms: key_r, key_g, key_b, similarity, smoothness, spill, _pad0, _pad1
/// Uses BT.601 YCbCr chroma distance with spill suppression.
pub const CHROMA_KEY_TEX_SHADER: &str = r#"
struct Uniforms {
    key_r: f32, key_g: f32, key_b: f32, similarity: f32,
    smoothness: f32, spill: f32, _pad0: f32, _pad1: f32,
}
@group(0) @binding(0) var input_tex:  texture_2d<f32>;
@group(0) @binding(1) var output_tex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(2) var<uniform> u: Uniforms;

// BT.601 RGB → CbCr chroma components (range −0.5..0.5)
fn rgb_to_cbcr(c: vec3<f32>) -> vec2<f32> {
    let cb = -0.168736*c.r - 0.331264*c.g + 0.5*c.b;
    let cr =  0.5*c.r - 0.418688*c.g - 0.081312*c.b;
    return vec2<f32>(cb, cr);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
    let dims = textureDimensions(input_tex);
    if (gid.x >= dims.x || gid.y >= dims.y) { return; }
    let coord = vec2<i32>(gid.xy);
    let src = textureLoad(input_tex, coord, 0);

    let key_cbcr = rgb_to_cbcr(vec3<f32>(u.key_r, u.key_g, u.key_b));
    let pix_cbcr = rgb_to_cbcr(src.rgb);
    let dist = length(pix_cbcr - key_cbcr);

    // similarity is the keying threshold, softness controls the transition edge
    let soft = max(u.smoothness * 0.5, 0.001);
    let alpha = smoothstep(u.similarity - soft, u.similarity + soft, dist);

    // Spill suppression: desaturate pixels near key color toward luminance
    var rgb = src.rgb;
    if (u.spill > 0.001) {
        let spill_mask = clamp((1.0 - alpha) * u.spill, 0.0, 1.0);
        let lum = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
        rgb = mix(rgb, vec3<f32>(lum, lum, lum), spill_mask);
    }

    textureStore(output_tex, coord, vec4<f32>(rgb, src.a * alpha));
}
"#;

/// Transition compute shader (storage buffer format)
/// Supports 18 transition types between two frames
pub const TRANSITION_COMPUTE_SHADER: &str = r#"
// Transition Compute Shader (Storage Buffer Format)
// Supports: fade, wipe, iris, clock, slide, zoom, dissolve, pixelate, ripple, swirl, glitch, flash

struct Uniforms {
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

// Transition type constants
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

const PI: f32 = 3.14159265359;

@group(0) @binding(0) var<storage, read> from_frame: array<u32>;
@group(0) @binding(1) var<storage, read> to_frame: array<u32>;
@group(0) @binding(2) var<storage, read_write> output: array<u32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

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

fn sample_from(x: i32, y: i32) -> vec4<f32> {
    let cx = clamp(x, 0, i32(uniforms.width) - 1);
    let cy = clamp(y, 0, i32(uniforms.height) - 1);
    let idx = u32(cx) + u32(cy) * uniforms.width;
    return unpack_rgba(from_frame[idx]);
}

fn sample_to(x: i32, y: i32) -> vec4<f32> {
    let cx = clamp(x, 0, i32(uniforms.width) - 1);
    let cy = clamp(y, 0, i32(uniforms.height) - 1);
    let idx = u32(cx) + u32(cy) * uniforms.width;
    return unpack_rgba(to_frame[idx]);
}

// Hash function for noise
fn hash(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.13);
    p3 = p3 + dot(p3, p3.yzx + 3.333);
    return fract((p3.x + p3.y) * p3.z);
}

// Transition functions
fn transition_fade(from_color: vec4<f32>, to_color: vec4<f32>, progress: f32) -> vec4<f32> {
    return mix(from_color, to_color, progress);
}

fn transition_wipe(uv: vec2<f32>, from_color: vec4<f32>, to_color: vec4<f32>, progress: f32, direction: u32) -> vec4<f32> {
    var edge: f32;
    switch direction {
        case 1u: { edge = uv.x; }           // left to right
        case 2u: { edge = 1.0 - uv.x; }     // right to left
        case 3u: { edge = uv.y; }           // top to bottom
        case 4u: { edge = 1.0 - uv.y; }     // bottom to top
        default: { edge = uv.x; }
    }

    let t = smoothstep(progress - uniforms.feather, progress + uniforms.feather, edge);
    return mix(to_color, from_color, t);
}

fn transition_iris_circle(uv: vec2<f32>, from_color: vec4<f32>, to_color: vec4<f32>, progress: f32) -> vec4<f32> {
    let center = vec2<f32>(uniforms.center_x, uniforms.center_y);
    let aspect = f32(uniforms.width) / f32(uniforms.height);
    var delta = uv - center;
    delta.x *= aspect;
    let dist = length(delta);

    let radius = progress * 1.5; // Scale to cover corners
    let t = smoothstep(radius - uniforms.feather, radius + uniforms.feather, dist);
    return mix(to_color, from_color, t);
}

fn transition_iris_rectangle(uv: vec2<f32>, from_color: vec4<f32>, to_color: vec4<f32>, progress: f32) -> vec4<f32> {
    let center = vec2<f32>(uniforms.center_x, uniforms.center_y);
    let delta = abs(uv - center);
    let dist = max(delta.x, delta.y);

    let radius = progress * 0.75;
    let t = smoothstep(radius - uniforms.feather, radius + uniforms.feather, dist);
    return mix(to_color, from_color, t);
}

fn transition_clock(uv: vec2<f32>, from_color: vec4<f32>, to_color: vec4<f32>, progress: f32) -> vec4<f32> {
    let center = vec2<f32>(uniforms.center_x, uniforms.center_y);
    let delta = uv - center;
    var angle = atan2(delta.y, delta.x) + PI;
    angle = angle / (2.0 * PI);

    let t = smoothstep(progress - uniforms.feather, progress + uniforms.feather, angle);
    return mix(to_color, from_color, t);
}

fn transition_slide(px: i32, py: i32, from_color: vec4<f32>, progress: f32, direction: u32) -> vec4<f32> {
    var offset_x = 0;
    var offset_y = 0;

    switch direction {
        case 8u: { offset_x = i32(progress * f32(uniforms.width)); }  // slide left
        case 9u: { offset_x = -i32(progress * f32(uniforms.width)); } // slide right
        default: { offset_x = i32(progress * f32(uniforms.width)); }
    }

    let from_sample = sample_from(px + offset_x, py + offset_y);
    let to_sample = sample_to(px + offset_x - i32(uniforms.width), py + offset_y);

    if (offset_x > 0 && px + offset_x >= i32(uniforms.width)) {
        return to_sample;
    } else if (offset_x < 0 && px + offset_x < 0) {
        return to_sample;
    }
    return from_sample;
}

fn transition_zoom(uv: vec2<f32>, from_color: vec4<f32>, to_color: vec4<f32>, progress: f32, zoom_in: bool) -> vec4<f32> {
    let center = vec2<f32>(uniforms.center_x, uniforms.center_y);

    var scale: f32;
    if (zoom_in) {
        scale = 1.0 + progress * 2.0;
    } else {
        scale = 1.0 - progress * 0.5;
    }

    let scaled_uv = center + (uv - center) / scale;

    // Check if scaled UV is within bounds
    if (scaled_uv.x < 0.0 || scaled_uv.x > 1.0 || scaled_uv.y < 0.0 || scaled_uv.y > 1.0) {
        return to_color;
    }

    return mix(from_color, to_color, progress);
}

fn transition_dissolve(uv: vec2<f32>, from_color: vec4<f32>, to_color: vec4<f32>, progress: f32) -> vec4<f32> {
    let noise = hash(uv * 100.0);
    let t = step(noise, progress);
    return mix(from_color, to_color, t);
}

fn transition_pixelate(uv: vec2<f32>, from_color: vec4<f32>, to_color: vec4<f32>, progress: f32) -> vec4<f32> {
    // Pixel size increases then decreases
    let pixel_progress = sin(progress * PI);
    let pixel_size = max(1.0, pixel_progress * 50.0);

    let pixelated_uv = floor(uv * pixel_size) / pixel_size;

    // Crossfade
    return mix(from_color, to_color, progress);
}

fn transition_ripple(uv: vec2<f32>, from_color: vec4<f32>, to_color: vec4<f32>, progress: f32) -> vec4<f32> {
    let center = vec2<f32>(uniforms.center_x, uniforms.center_y);
    let dist = length(uv - center);

    let wave = sin(dist * 30.0 - progress * 10.0) * 0.05 * (1.0 - progress);
    let displaced_uv = uv + normalize(uv - center) * wave;

    return mix(from_color, to_color, progress);
}

fn transition_swirl(uv: vec2<f32>, from_color: vec4<f32>, to_color: vec4<f32>, progress: f32) -> vec4<f32> {
    let center = vec2<f32>(uniforms.center_x, uniforms.center_y);
    let delta = uv - center;
    let dist = length(delta);

    let swirl_amount = progress * 5.0 * (1.0 - dist);
    let angle = atan2(delta.y, delta.x) + swirl_amount;

    let swirled = center + vec2<f32>(cos(angle), sin(angle)) * dist;

    return mix(from_color, to_color, progress);
}

fn transition_glitch(uv: vec2<f32>, px: i32, py: i32, progress: f32) -> vec4<f32> {
    let glitch_intensity = sin(progress * PI) * 0.1;

    // Random horizontal displacement
    let row_noise = hash(vec2<f32>(f32(py) * 0.1, progress * 10.0));
    var glitch_offset = 0;
    if (row_noise > 0.9) {
        glitch_offset = i32((row_noise - 0.9) * 10.0 * glitch_intensity * f32(uniforms.width));
    }

    let from_sample = sample_from(px + glitch_offset, py);
    let to_sample = sample_to(px - glitch_offset, py);

    // Color channel separation for glitch effect
    let r = mix(from_sample.r, to_sample.r, progress);
    let g = mix(from_sample.g, to_sample.g, progress);
    let b = mix(from_sample.b, to_sample.b, progress);

    return vec4<f32>(r, g, b, 1.0);
}

fn transition_flash(from_color: vec4<f32>, to_color: vec4<f32>, progress: f32) -> vec4<f32> {
    let flash_intensity = sin(progress * PI);
    let white = vec4<f32>(1.0, 1.0, 1.0, 1.0);

    var result: vec4<f32>;
    if (progress < 0.5) {
        result = mix(from_color, white, flash_intensity);
    } else {
        result = mix(white, to_color, (progress - 0.5) * 2.0);
    }
    return result;
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= uniforms.width || global_id.y >= uniforms.height) {
        return;
    }

    let px = i32(global_id.x);
    let py = i32(global_id.y);
    let idx = global_id.x + global_id.y * uniforms.width;

    let uv = vec2<f32>(
        f32(global_id.x) / f32(uniforms.width),
        f32(global_id.y) / f32(uniforms.height)
    );

    let from_color = sample_from(px, py);
    let to_color = sample_to(px, py);

    var result: vec4<f32>;

    switch uniforms.transition_type {
        case TRANS_FADE: {
            result = transition_fade(from_color, to_color, uniforms.progress);
        }
        case TRANS_WIPE_LEFT, TRANS_WIPE_RIGHT, TRANS_WIPE_UP, TRANS_WIPE_DOWN: {
            result = transition_wipe(uv, from_color, to_color, uniforms.progress, uniforms.transition_type);
        }
        case TRANS_IRIS_CIRCLE: {
            result = transition_iris_circle(uv, from_color, to_color, uniforms.progress);
        }
        case TRANS_IRIS_RECTANGLE: {
            result = transition_iris_rectangle(uv, from_color, to_color, uniforms.progress);
        }
        case TRANS_CLOCK: {
            result = transition_clock(uv, from_color, to_color, uniforms.progress);
        }
        case TRANS_SLIDE_LEFT, TRANS_SLIDE_RIGHT: {
            result = transition_slide(px, py, from_color, uniforms.progress, uniforms.transition_type);
        }
        case TRANS_ZOOM_IN: {
            result = transition_zoom(uv, from_color, to_color, uniforms.progress, true);
        }
        case TRANS_ZOOM_OUT: {
            result = transition_zoom(uv, from_color, to_color, uniforms.progress, false);
        }
        case TRANS_DISSOLVE: {
            result = transition_dissolve(uv, from_color, to_color, uniforms.progress);
        }
        case TRANS_PIXELATE: {
            result = transition_pixelate(uv, from_color, to_color, uniforms.progress);
        }
        case TRANS_RIPPLE: {
            result = transition_ripple(uv, from_color, to_color, uniforms.progress);
        }
        case TRANS_SWIRL: {
            result = transition_swirl(uv, from_color, to_color, uniforms.progress);
        }
        case TRANS_GLITCH: {
            result = transition_glitch(uv, px, py, uniforms.progress);
        }
        case TRANS_FLASH: {
            result = transition_flash(from_color, to_color, uniforms.progress);
        }
        default: {
            result = transition_fade(from_color, to_color, uniforms.progress);
        }
    }

    output[idx] = pack_rgba(result);
}
"#;

/// Compositor compute shader for multi-layer compositing
/// Supports both RGBA and YUV420P pixel formats with GPU-accelerated YUV→RGB conversion
pub const COMPOSITOR_SHADER: &str = r#"
// GPU Multi-Layer Compositor Shader
// Supports: transforms, blend modes, alpha compositing, masks
// Supports: RGBA and YUV420P pixel formats (GPU-accelerated conversion)

// =============================================================================
// Constants
// =============================================================================

const MAX_LAYERS: u32 = 32u;

// Pixel format constants (must match LayerPixelFormat enum in compositor.rs)
const PIXEL_FORMAT_RGBA: u32 = 0u;
const PIXEL_FORMAT_YUV420P: u32 = 1u;

// Blend mode constants (must match BlendMode enum in compositor.rs)
const BLEND_NORMAL: u32 = 0u;
const BLEND_DISSOLVE: u32 = 1u;

// Darken Group
const BLEND_DARKEN: u32 = 2u;
const BLEND_MULTIPLY: u32 = 3u;
const BLEND_COLOR_BURN: u32 = 4u;
const BLEND_LINEAR_BURN: u32 = 5u;
const BLEND_DARKER_COLOR: u32 = 6u;

// Lighten Group
const BLEND_LIGHTEN: u32 = 7u;
const BLEND_SCREEN: u32 = 8u;
const BLEND_COLOR_DODGE: u32 = 9u;
const BLEND_LINEAR_DODGE: u32 = 10u;
const BLEND_LIGHTER_COLOR: u32 = 11u;

// Contrast Group
const BLEND_OVERLAY: u32 = 12u;
const BLEND_SOFT_LIGHT: u32 = 13u;
const BLEND_HARD_LIGHT: u32 = 14u;
const BLEND_VIVID_LIGHT: u32 = 15u;
const BLEND_LINEAR_LIGHT: u32 = 16u;
const BLEND_PIN_LIGHT: u32 = 17u;
const BLEND_HARD_MIX: u32 = 18u;

// Difference Group
const BLEND_DIFFERENCE: u32 = 19u;
const BLEND_EXCLUSION: u32 = 20u;
const BLEND_SUBTRACT: u32 = 21u;
const BLEND_DIVIDE: u32 = 22u;

// HSL Group
const BLEND_HUE: u32 = 23u;
const BLEND_SATURATION: u32 = 24u;
const BLEND_COLOR: u32 = 25u;
const BLEND_LUMINOSITY: u32 = 26u;

const PI: f32 = 3.14159265359;

// =============================================================================
// Types
// =============================================================================

struct Transform2D {
    x: f32,
    y: f32,
    scale_x: f32,
    scale_y: f32,
    rotation: f32,
    anchor_x: f32,
    anchor_y: f32,
    _padding: f32,
}

struct LayerData {
    src_offset: u32,
    src_width: u32,
    src_height: u32,
    blend_mode: u32,
    transform: Transform2D,
    opacity: f32,
    z_index: i32,
    has_mask: u32,
    mask_inverted: u32,
    pixel_format: u32,  // 0 = RGBA, 1 = YUV420P
    _padding1: u32,
    _padding2: u32,
    _padding3: u32,
}

struct Uniforms {
    output_width: u32,
    output_height: u32,
    layer_count: u32,
    bg_color: u32,
}

// =============================================================================
// Bindings
// =============================================================================

@group(0) @binding(0) var<storage, read> layers: array<LayerData, MAX_LAYERS>;
@group(0) @binding(1) var<storage, read> textures: array<u32>;
@group(0) @binding(2) var<storage, read_write> output: array<u32>;
@group(0) @binding(3) var<uniform> uniforms: Uniforms;

// =============================================================================
// Utility Functions
// =============================================================================

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

// =============================================================================
// Blend Mode Functions
// =============================================================================

fn blend_normal(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return blend;
}

fn blend_multiply(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return base * blend;
}

fn blend_screen(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return 1.0 - (1.0 - base) * (1.0 - blend);
}

fn blend_overlay(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r), 2.0 * base.r * blend.r, base.r < 0.5),
        select(1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g), 2.0 * base.g * blend.g, base.g < 0.5),
        select(1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b), 2.0 * base.b * blend.b, base.b < 0.5)
    );
}

fn blend_darken(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return min(base, blend);
}

fn blend_lighten(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return max(base, blend);
}

fn blend_color_dodge(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(min(1.0, base.r / (1.0 - blend.r)), 1.0, blend.r >= 1.0),
        select(min(1.0, base.g / (1.0 - blend.g)), 1.0, blend.g >= 1.0),
        select(min(1.0, base.b / (1.0 - blend.b)), 1.0, blend.b >= 1.0)
    );
}

fn blend_color_burn(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(max(0.0, 1.0 - (1.0 - base.r) / blend.r), 0.0, blend.r <= 0.0),
        select(max(0.0, 1.0 - (1.0 - base.g) / blend.g), 0.0, blend.g <= 0.0),
        select(max(0.0, 1.0 - (1.0 - base.b) / blend.b), 0.0, blend.b <= 0.0)
    );
}

fn blend_hard_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r), 2.0 * base.r * blend.r, blend.r < 0.5),
        select(1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g), 2.0 * base.g * blend.g, blend.g < 0.5),
        select(1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b), 2.0 * base.b * blend.b, blend.b < 0.5)
    );
}

fn soft_light_channel(base: f32, blend: f32) -> f32 {
    if (blend < 0.5) {
        return base - (1.0 - 2.0 * blend) * base * (1.0 - base);
    }
    let d = select(sqrt(base), ((16.0 * base - 12.0) * base + 4.0) * base, base <= 0.25);
    return base + (2.0 * blend - 1.0) * (d - base);
}

fn blend_soft_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        soft_light_channel(base.r, blend.r),
        soft_light_channel(base.g, blend.g),
        soft_light_channel(base.b, blend.b)
    );
}

fn blend_difference(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return abs(base - blend);
}

fn blend_exclusion(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return base + blend - 2.0 * base * blend;
}

fn blend_add(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return min(vec3<f32>(1.0), base + blend);
}

fn blend_subtract(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return max(vec3<f32>(0.0), base - blend);
}

// Additional blend modes for full Photoshop compatibility

fn blend_dissolve(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    // Dissolve is typically done with dithering at composite time
    // Here we just return blend as fallback
    return blend;
}

fn blend_linear_burn(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return max(vec3<f32>(0.0), base + blend - 1.0);
}

fn blend_darker_color(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let lum_base = dot(base, vec3<f32>(0.299, 0.587, 0.114));
    let lum_blend = dot(blend, vec3<f32>(0.299, 0.587, 0.114));
    return select(blend, base, lum_base < lum_blend);
}

fn blend_linear_dodge(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return min(vec3<f32>(1.0), base + blend);
}

fn blend_lighter_color(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let lum_base = dot(base, vec3<f32>(0.299, 0.587, 0.114));
    let lum_blend = dot(blend, vec3<f32>(0.299, 0.587, 0.114));
    return select(blend, base, lum_base > lum_blend);
}

fn vivid_light_channel(base: f32, blend: f32) -> f32 {
    if (blend <= 0.5) {
        // Color Burn
        let b = blend * 2.0;
        return select(max(0.0, 1.0 - (1.0 - base) / b), 0.0, b <= 0.0);
    } else {
        // Color Dodge
        let b = 2.0 * (blend - 0.5);
        return select(min(1.0, base / (1.0 - b)), 1.0, b >= 1.0);
    }
}

fn blend_vivid_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        vivid_light_channel(base.r, blend.r),
        vivid_light_channel(base.g, blend.g),
        vivid_light_channel(base.b, blend.b)
    );
}

fn blend_linear_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return clamp(base + 2.0 * blend - 1.0, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn pin_light_channel(base: f32, blend: f32) -> f32 {
    if (blend <= 0.5) {
        return min(base, 2.0 * blend);
    } else {
        return max(base, 2.0 * blend - 1.0);
    }
}

fn blend_pin_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        pin_light_channel(base.r, blend.r),
        pin_light_channel(base.g, blend.g),
        pin_light_channel(base.b, blend.b)
    );
}

fn blend_hard_mix(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let vivid = blend_vivid_light(base, blend);
    return vec3<f32>(
        select(0.0, 1.0, vivid.r >= 0.5),
        select(0.0, 1.0, vivid.g >= 0.5),
        select(0.0, 1.0, vivid.b >= 0.5)
    );
}

fn blend_divide(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(min(1.0, base.r / blend.r), 1.0, blend.r <= 0.0),
        select(min(1.0, base.g / blend.g), 1.0, blend.g <= 0.0),
        select(min(1.0, base.b / blend.b), 1.0, blend.b <= 0.0)
    );
}

// HSL blend modes helper functions
fn rgb_to_hsl_blend(c: vec3<f32>) -> vec3<f32> {
    let max_c = max(max(c.r, c.g), c.b);
    let min_c = min(min(c.r, c.g), c.b);
    let l = (max_c + min_c) * 0.5;

    if (max_c == min_c) {
        return vec3<f32>(0.0, 0.0, l);
    }

    let d = max_c - min_c;
    let s = select(d / (2.0 - max_c - min_c), d / (max_c + min_c), l > 0.5);

    var h = 0.0;
    if (max_c == c.r) {
        h = (c.g - c.b) / d + select(0.0, 6.0, c.g < c.b);
    } else if (max_c == c.g) {
        h = (c.b - c.r) / d + 2.0;
    } else {
        h = (c.r - c.g) / d + 4.0;
    }
    h /= 6.0;

    return vec3<f32>(h, s, l);
}

fn hue_to_rgb_blend(p: f32, q: f32, t: f32) -> f32 {
    var t_mod = t;
    if (t_mod < 0.0) { t_mod += 1.0; }
    if (t_mod > 1.0) { t_mod -= 1.0; }
    if (t_mod < 1.0/6.0) { return p + (q - p) * 6.0 * t_mod; }
    if (t_mod < 1.0/2.0) { return q; }
    if (t_mod < 2.0/3.0) { return p + (q - p) * (2.0/3.0 - t_mod) * 6.0; }
    return p;
}

fn hsl_to_rgb_blend(hsl: vec3<f32>) -> vec3<f32> {
    if (hsl.y == 0.0) {
        return vec3<f32>(hsl.z);
    }

    let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
    let p = 2.0 * hsl.z - q;

    return vec3<f32>(
        hue_to_rgb_blend(p, q, hsl.x + 1.0/3.0),
        hue_to_rgb_blend(p, q, hsl.x),
        hue_to_rgb_blend(p, q, hsl.x - 1.0/3.0)
    );
}

fn blend_hue(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let hsl_base = rgb_to_hsl_blend(base);
    let hsl_blend = rgb_to_hsl_blend(blend);
    return hsl_to_rgb_blend(vec3<f32>(hsl_blend.x, hsl_base.y, hsl_base.z));
}

fn blend_saturation(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let hsl_base = rgb_to_hsl_blend(base);
    let hsl_blend = rgb_to_hsl_blend(blend);
    return hsl_to_rgb_blend(vec3<f32>(hsl_base.x, hsl_blend.y, hsl_base.z));
}

fn blend_color_hsl(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let hsl_base = rgb_to_hsl_blend(base);
    let hsl_blend = rgb_to_hsl_blend(blend);
    return hsl_to_rgb_blend(vec3<f32>(hsl_blend.x, hsl_blend.y, hsl_base.z));
}

fn blend_luminosity(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let hsl_base = rgb_to_hsl_blend(base);
    let hsl_blend = rgb_to_hsl_blend(blend);
    return hsl_to_rgb_blend(vec3<f32>(hsl_base.x, hsl_base.y, hsl_blend.z));
}

fn apply_blend_mode(base: vec3<f32>, blend: vec3<f32>, mode: u32) -> vec3<f32> {
    switch (mode) {
        // Basic
        case BLEND_NORMAL: { return blend_normal(base, blend); }
        case BLEND_DISSOLVE: { return blend_dissolve(base, blend); }

        // Darken Group
        case BLEND_DARKEN: { return blend_darken(base, blend); }
        case BLEND_MULTIPLY: { return blend_multiply(base, blend); }
        case BLEND_COLOR_BURN: { return blend_color_burn(base, blend); }
        case BLEND_LINEAR_BURN: { return blend_linear_burn(base, blend); }
        case BLEND_DARKER_COLOR: { return blend_darker_color(base, blend); }

        // Lighten Group
        case BLEND_LIGHTEN: { return blend_lighten(base, blend); }
        case BLEND_SCREEN: { return blend_screen(base, blend); }
        case BLEND_COLOR_DODGE: { return blend_color_dodge(base, blend); }
        case BLEND_LINEAR_DODGE: { return blend_linear_dodge(base, blend); }
        case BLEND_LIGHTER_COLOR: { return blend_lighter_color(base, blend); }

        // Contrast Group
        case BLEND_OVERLAY: { return blend_overlay(base, blend); }
        case BLEND_SOFT_LIGHT: { return blend_soft_light(base, blend); }
        case BLEND_HARD_LIGHT: { return blend_hard_light(base, blend); }
        case BLEND_VIVID_LIGHT: { return blend_vivid_light(base, blend); }
        case BLEND_LINEAR_LIGHT: { return blend_linear_light(base, blend); }
        case BLEND_PIN_LIGHT: { return blend_pin_light(base, blend); }
        case BLEND_HARD_MIX: { return blend_hard_mix(base, blend); }

        // Difference Group
        case BLEND_DIFFERENCE: { return blend_difference(base, blend); }
        case BLEND_EXCLUSION: { return blend_exclusion(base, blend); }
        case BLEND_SUBTRACT: { return blend_subtract(base, blend); }
        case BLEND_DIVIDE: { return blend_divide(base, blend); }

        // HSL Group
        case BLEND_HUE: { return blend_hue(base, blend); }
        case BLEND_SATURATION: { return blend_saturation(base, blend); }
        case BLEND_COLOR: { return blend_color_hsl(base, blend); }
        case BLEND_LUMINOSITY: { return blend_luminosity(base, blend); }

        default: { return blend; }
    }
}

// =============================================================================
// Transform Functions
// =============================================================================

// Inverse transform: output coord -> source coord
fn inverse_transform(
    out_x: f32,
    out_y: f32,
    transform: Transform2D,
    src_width: f32,
    src_height: f32
) -> vec2<f32> {
    let rad = transform.rotation * PI / 180.0;
    let cos_r = cos(rad);
    let sin_r = sin(rad);

    // Anchor point in source pixels
    let ax = transform.anchor_x * src_width;
    let ay = transform.anchor_y * src_height;

    // Inverse scale
    let inv_scale_x = 1.0 / transform.scale_x;
    let inv_scale_y = 1.0 / transform.scale_y;

    // Translate to origin (relative to layer position)
    let tx = out_x - transform.x;
    let ty = out_y - transform.y;

    // Inverse rotation
    let rx = tx * cos_r + ty * sin_r;
    let ry = -tx * sin_r + ty * cos_r;

    // Inverse scale and translate to anchor
    let src_x = rx * inv_scale_x + ax;
    let src_y = ry * inv_scale_y + ay;

    return vec2<f32>(src_x, src_y);
}

// =============================================================================
// Sampling Functions
// =============================================================================

// Bilinear sampling from RGBA texture buffer
fn sample_texture_rgba(
    offset: u32,
    width: u32,
    height: u32,
    x: f32,
    y: f32
) -> vec4<f32> {
    // Bounds check
    if (x < 0.0 || x >= f32(width) || y < 0.0 || y >= f32(height)) {
        return vec4<f32>(0.0);
    }

    let x0 = u32(floor(x));
    let y0 = u32(floor(y));
    let x1 = min(x0 + 1u, width - 1u);
    let y1 = min(y0 + 1u, height - 1u);

    let fx = x - f32(x0);
    let fy = y - f32(y0);

    // Sample four corners (pixel index, not byte index)
    let idx00 = offset / 4u + y0 * width + x0;
    let idx10 = offset / 4u + y0 * width + x1;
    let idx01 = offset / 4u + y1 * width + x0;
    let idx11 = offset / 4u + y1 * width + x1;

    let c00 = unpack_rgba(textures[idx00]);
    let c10 = unpack_rgba(textures[idx10]);
    let c01 = unpack_rgba(textures[idx01]);
    let c11 = unpack_rgba(textures[idx11]);

    // Bilinear interpolation
    let c0 = mix(c00, c10, fx);
    let c1 = mix(c01, c11, fx);
    return mix(c0, c1, fy);
}

// =============================================================================
// YUV420P to RGB Conversion (GPU Hardware Accelerated)
// =============================================================================

// BT.709 YUV to RGB conversion (HD video standard)
// Uses LIMITED RANGE (TV range): Y: 16-235, UV: 16-240
// This matches the encoding in rgba_to_nv12.rs
fn yuv_to_rgb_bt709(y: f32, u: f32, v: f32) -> vec3<f32> {
    // Convert from limited range to normalized values
    // Y: 16-235 -> 0-1 (range of 219)
    // UV: 16-240 -> -0.5 to 0.5 (range of 224, centered at 128)
    let y_norm = (y - 16.0) / 219.0;
    let u_norm = (u - 128.0) / 224.0;
    let v_norm = (v - 128.0) / 224.0;

    // BT.709 conversion matrix (for limited range input)
    // These coefficients are the inverse of the encoding matrix
    let r = y_norm + 1.5748 * v_norm;
    let g = y_norm - 0.1873 * u_norm - 0.4681 * v_norm;
    let b = y_norm + 1.8556 * u_norm;

    return clamp(vec3<f32>(r, g, b), vec3<f32>(0.0), vec3<f32>(1.0));
}

// Sample a single byte from the texture buffer (for YUV planes)
fn sample_byte(byte_offset: u32) -> f32 {
    // Each u32 contains 4 bytes (RGBA packed)
    let word_idx = byte_offset / 4u;
    let byte_pos = byte_offset % 4u;
    let word = textures[word_idx];

    // Extract the correct byte
    let shift = byte_pos * 8u;
    return f32((word >> shift) & 0xFFu);
}

// Bilinear sample from Y plane (full resolution)
fn sample_y_plane(offset: u32, width: u32, height: u32, x: f32, y: f32) -> f32 {
    let x0 = u32(floor(x));
    let y0 = u32(floor(y));
    let x1 = min(x0 + 1u, width - 1u);
    let y1 = min(y0 + 1u, height - 1u);

    let fx = x - f32(x0);
    let fy = y - f32(y0);

    let y00 = sample_byte(offset + y0 * width + x0);
    let y10 = sample_byte(offset + y0 * width + x1);
    let y01 = sample_byte(offset + y1 * width + x0);
    let y11 = sample_byte(offset + y1 * width + x1);

    let y0_interp = mix(y00, y10, fx);
    let y1_interp = mix(y01, y11, fx);
    return mix(y0_interp, y1_interp, fy);
}

// Bilinear sample from U or V plane (half resolution)
fn sample_uv_plane(offset: u32, uv_width: u32, uv_height: u32, x: f32, y: f32) -> f32 {
    // UV coordinates are at half resolution
    let uv_x = x * 0.5;
    let uv_y = y * 0.5;

    let x0 = u32(floor(uv_x));
    let y0 = u32(floor(uv_y));
    let x1 = min(x0 + 1u, uv_width - 1u);
    let y1 = min(y0 + 1u, uv_height - 1u);

    let fx = uv_x - f32(x0);
    let fy = uv_y - f32(y0);

    let v00 = sample_byte(offset + y0 * uv_width + x0);
    let v10 = sample_byte(offset + y0 * uv_width + x1);
    let v01 = sample_byte(offset + y1 * uv_width + x0);
    let v11 = sample_byte(offset + y1 * uv_width + x1);

    let v0_interp = mix(v00, v10, fx);
    let v1_interp = mix(v01, v11, fx);
    return mix(v0_interp, v1_interp, fy);
}

// Sample YUV420P texture and convert to RGBA
fn sample_texture_yuv420p(
    offset: u32,
    width: u32,
    height: u32,
    x: f32,
    y: f32
) -> vec4<f32> {
    // Bounds check
    if (x < 0.0 || x >= f32(width) || y < 0.0 || y >= f32(height)) {
        return vec4<f32>(0.0);
    }

    // YUV420P layout:
    // Y plane: width × height bytes
    // U plane: (width/2) × (height/2) bytes
    // V plane: (width/2) × (height/2) bytes
    let y_size = width * height;
    let uv_width = width / 2u;
    let uv_height = height / 2u;
    let uv_size = uv_width * uv_height;

    let y_offset = offset;
    let u_offset = offset + y_size;
    let v_offset = offset + y_size + uv_size;

    // Sample Y at full resolution
    let y_val = sample_y_plane(y_offset, width, height, x, y);

    // Sample U and V at half resolution (bilinear interpolation handles upscaling)
    let u_val = sample_uv_plane(u_offset, uv_width, uv_height, x, y);
    let v_val = sample_uv_plane(v_offset, uv_width, uv_height, x, y);

    // Convert YUV to RGB using BT.709
    let rgb = yuv_to_rgb_bt709(y_val, u_val, v_val);

    return vec4<f32>(rgb, 1.0);
}

// Unified texture sampling function that handles both RGBA and YUV420P
fn sample_texture(
    offset: u32,
    width: u32,
    height: u32,
    x: f32,
    y: f32,
    pixel_format: u32
) -> vec4<f32> {
    if (pixel_format == PIXEL_FORMAT_YUV420P) {
        return sample_texture_yuv420p(offset, width, height, x, y);
    } else {
        return sample_texture_rgba(offset, width, height, x, y);
    }
}

// =============================================================================
// Compositing
// =============================================================================

// Porter-Duff source-over compositing with blend mode
fn composite_pixel(
    dst: vec4<f32>,
    src: vec4<f32>,
    blend_mode: u32,
    opacity: f32
) -> vec4<f32> {
    let src_alpha = src.a * opacity;

    if (src_alpha <= 0.0) {
        return dst;
    }

    let dst_alpha = dst.a;

    if (dst_alpha <= 0.0) {
        return vec4<f32>(src.rgb, src_alpha);
    }

    // Apply blend mode to RGB
    let blended_rgb = apply_blend_mode(dst.rgb, src.rgb, blend_mode);

    // Porter-Duff source-over
    let out_alpha = src_alpha + dst_alpha * (1.0 - src_alpha);

    if (out_alpha <= 0.0) {
        return vec4<f32>(0.0);
    }

    let out_rgb = (blended_rgb * src_alpha + dst.rgb * dst_alpha * (1.0 - src_alpha)) / out_alpha;

    return vec4<f32>(out_rgb, out_alpha);
}

// =============================================================================
// Main Entry Point
// =============================================================================

@compute @workgroup_size(16, 16)
fn composite_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let out_x = global_id.x;
    let out_y = global_id.y;

    if (out_x >= uniforms.output_width || out_y >= uniforms.output_height) {
        return;
    }

    // Start with background color
    var result = unpack_rgba(uniforms.bg_color);

    let out_xf = f32(out_x);
    let out_yf = f32(out_y);

    // Composite each layer (already sorted by z_index)
    for (var i = 0u; i < uniforms.layer_count; i = i + 1u) {
        let layer = layers[i];

        // Skip empty layers
        if (layer.src_width == 0u || layer.src_height == 0u) {
            continue;
        }

        // Transform output coord to source coord
        let src_coord = inverse_transform(
            out_xf,
            out_yf,
            layer.transform,
            f32(layer.src_width),
            f32(layer.src_height)
        );

        // Skip if outside source bounds
        if (src_coord.x < 0.0 || src_coord.x >= f32(layer.src_width) ||
            src_coord.y < 0.0 || src_coord.y >= f32(layer.src_height)) {
            continue;
        }

        // Sample source texture (handles both RGBA and YUV420P)
        var src_color = sample_texture(
            layer.src_offset,
            layer.src_width,
            layer.src_height,
            src_coord.x,
            src_coord.y,
            layer.pixel_format
        );

        // Apply mask if present (masks are always RGBA)
        if (layer.has_mask != 0u) {
            // Calculate mask offset based on pixel format
            var mask_offset: u32;
            if (layer.pixel_format == PIXEL_FORMAT_YUV420P) {
                // YUV420P: Y + U + V planes
                let y_size = layer.src_width * layer.src_height;
                let uv_size = (layer.src_width / 2u) * (layer.src_height / 2u);
                mask_offset = layer.src_offset + y_size + uv_size * 2u;
            } else {
                // RGBA: width * height * 4 bytes
                mask_offset = layer.src_offset + layer.src_width * layer.src_height * 4u;
            }
            let mask_color = sample_texture_rgba(
                mask_offset,
                layer.src_width,
                layer.src_height,
                src_coord.x,
                src_coord.y
            );
            var mask_alpha = mask_color.a;
            if (layer.mask_inverted != 0u) {
                mask_alpha = 1.0 - mask_alpha;
            }
            src_color.a = src_color.a * mask_alpha;
        }

        // Composite
        result = composite_pixel(result, src_color, layer.blend_mode, layer.opacity);
    }

    // Write output
    let out_idx = out_x + out_y * uniforms.output_width;
    output[out_idx] = pack_rgba(result);
}
"#;

#[cfg(test)]
mod tests {
    use super::*;

    fn validate_wgsl(source: &str) {
        let module = naga::front::wgsl::parse_str(source).expect("WGSL should parse");
        naga::valid::Validator::new(
            naga::valid::ValidationFlags::all(),
            naga::valid::Capabilities::default(),
        )
        .validate(&module)
        .expect("WGSL should validate");
    }

    #[test]
    fn test_common_shader_loaded() {
        assert!(!COMMON_WGSL.is_empty());
        assert!(COMMON_WGSL.contains("rgb_to_hsl"));
        assert!(COMMON_WGSL.contains("luminance"));
    }

    #[test]
    fn test_blend_modes_shader_loaded() {
        assert!(!BLEND_MODES_WGSL.is_empty());
        assert!(BLEND_MODES_WGSL.contains("blend_multiply"));
        assert!(BLEND_MODES_WGSL.contains("blend_screen"));
    }

    #[test]
    fn test_color_correction_shader_loaded() {
        assert!(!COLOR_CORRECTION_WGSL.is_empty());
        assert!(COLOR_CORRECTION_WGSL.contains("apply_exposure"));
        assert!(COLOR_CORRECTION_WGSL.contains("apply_contrast"));
    }

    #[test]
    fn test_transitions_shader_loaded() {
        assert!(!TRANSITIONS_WGSL.is_empty());
        assert!(TRANSITIONS_WGSL.contains("transition_fade"));
        assert!(TRANSITIONS_WGSL.contains("transition_wipe"));
    }

    #[test]
    fn test_effects_shader_loaded() {
        assert!(!EFFECTS_WGSL.is_empty());
        assert!(EFFECTS_WGSL.contains("vignette"));
        assert!(EFFECTS_WGSL.contains("sharpen"));
    }

    #[test]
    fn test_full_shader_generation() {
        let shader = get_color_correction_shader();
        assert!(shader.contains("rgb_to_hsl"), "missing rgb_to_hsl");
        assert!(shader.contains("cc_exposure"), "missing cc_exposure");
        assert!(shader.contains("@compute"), "missing @compute");
        assert!(shader.contains("lut_3d"), "missing lut_3d binding");
        assert!(shader.contains("curves"), "missing curves binding");
    }

    #[test]
    fn test_color_correction_shader_is_valid_wgsl() {
        validate_wgsl(&get_color_correction_shader());
    }

    #[test]
    fn test_tex_variant_shaders_present() {
        assert!(
            BLUR_TEX_SHADER.contains("texture_storage_2d"),
            "BLUR_TEX_SHADER not texture-based"
        );
        assert!(SHARPEN_TEX_SHADER.contains("texture_storage_2d"));
        assert!(VIGNETTE_TEX_SHADER.contains("texture_storage_2d"));
        assert!(FILM_GRAIN_TEX_SHADER.contains("texture_storage_2d"));
        assert!(GLOW_TEX_SHADER.contains("texture_storage_2d"));
        assert!(CHROMATIC_ABERRATION_TEX_SHADER.contains("texture_storage_2d"));
    }

    #[test]
    fn test_easing_shader_loaded() {
        assert!(!EASING_WGSL.is_empty());
        assert!(EASING_WGSL.contains("ease_in_quad"));
        assert!(EASING_WGSL.contains("ease_out_bounce"));
        assert!(EASING_WGSL.contains("cubic_bezier"));
        assert!(EASING_WGSL.contains("apply_easing"));
    }
}
