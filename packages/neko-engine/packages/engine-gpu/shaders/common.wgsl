// =============================================================================
// Common WGSL Utilities
// Shared between WebGPU (browser) and wgpu (Rust)
// =============================================================================

// Constants
const PI: f32 = 3.14159265359;
const TAU: f32 = 6.28318530718;
const E: f32 = 2.71828182846;

// =============================================================================
// Math Utilities
// =============================================================================

fn saturate(x: f32) -> f32 {
    return clamp(x, 0.0, 1.0);
}

fn saturate3(x: vec3<f32>) -> vec3<f32> {
    return clamp(x, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn saturate4(x: vec4<f32>) -> vec4<f32> {
    return clamp(x, vec4<f32>(0.0), vec4<f32>(1.0));
}

fn lerp_f32(a: f32, b: f32, t: f32) -> f32 {
    return a + (b - a) * t;
}

fn lerp_vec3(a: vec3<f32>, b: vec3<f32>, t: f32) -> vec3<f32> {
    return a + (b - a) * t;
}

fn lerp_vec4(a: vec4<f32>, b: vec4<f32>, t: f32) -> vec4<f32> {
    return a + (b - a) * t;
}

fn smoothstep_manual(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = saturate((x - edge0) / (edge1 - edge0));
    return t * t * (3.0 - 2.0 * t);
}

fn smootherstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = saturate((x - edge0) / (edge1 - edge0));
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

// =============================================================================
// Color Space Conversion
// =============================================================================

fn rgb_to_hsl(rgb: vec3<f32>) -> vec3<f32> {
    let max_c = max(max(rgb.r, rgb.g), rgb.b);
    let min_c = min(min(rgb.r, rgb.g), rgb.b);
    let l = (max_c + min_c) / 2.0;

    if (max_c == min_c) {
        return vec3<f32>(0.0, 0.0, l);
    }

    let d = max_c - min_c;
    let s = select(d / (2.0 - max_c - min_c), d / (max_c + min_c), l > 0.5);

    var h: f32;
    if (max_c == rgb.r) {
        h = (rgb.g - rgb.b) / d + select(0.0, 6.0, rgb.g < rgb.b);
    } else if (max_c == rgb.g) {
        h = (rgb.b - rgb.r) / d + 2.0;
    } else {
        h = (rgb.r - rgb.g) / d + 4.0;
    }
    h /= 6.0;

    return vec3<f32>(h, s, l);
}

fn hue_to_rgb(p: f32, q: f32, t: f32) -> f32 {
    var t_mod = t;
    if (t_mod < 0.0) { t_mod += 1.0; }
    if (t_mod > 1.0) { t_mod -= 1.0; }
    if (t_mod < 1.0/6.0) { return p + (q - p) * 6.0 * t_mod; }
    if (t_mod < 1.0/2.0) { return q; }
    if (t_mod < 2.0/3.0) { return p + (q - p) * (2.0/3.0 - t_mod) * 6.0; }
    return p;
}

fn hsl_to_rgb(hsl: vec3<f32>) -> vec3<f32> {
    if (hsl.y == 0.0) {
        return vec3<f32>(hsl.z, hsl.z, hsl.z);
    }

    let q = select(hsl.z + hsl.y - hsl.z * hsl.y, hsl.z * (1.0 + hsl.y), hsl.z < 0.5);
    let p = 2.0 * hsl.z - q;

    return vec3<f32>(
        hue_to_rgb(p, q, hsl.x + 1.0/3.0),
        hue_to_rgb(p, q, hsl.x),
        hue_to_rgb(p, q, hsl.x - 1.0/3.0)
    );
}

fn rgb_to_hsv(rgb: vec3<f32>) -> vec3<f32> {
    let max_c = max(max(rgb.r, rgb.g), rgb.b);
    let min_c = min(min(rgb.r, rgb.g), rgb.b);
    let d = max_c - min_c;

    let s = select(d / max_c, 0.0, max_c == 0.0);
    let v = max_c;

    if (max_c == min_c) {
        return vec3<f32>(0.0, s, v);
    }

    var h: f32;
    if (max_c == rgb.r) {
        h = (rgb.g - rgb.b) / d + select(0.0, 6.0, rgb.g < rgb.b);
    } else if (max_c == rgb.g) {
        h = (rgb.b - rgb.r) / d + 2.0;
    } else {
        h = (rgb.r - rgb.g) / d + 4.0;
    }
    h /= 6.0;

    return vec3<f32>(h, s, v);
}

fn hsv_to_rgb(hsv: vec3<f32>) -> vec3<f32> {
    let h = hsv.x * 6.0;
    let s = hsv.y;
    let v = hsv.z;

    let i = floor(h);
    let f = h - i;
    let p = v * (1.0 - s);
    let q = v * (1.0 - s * f);
    let t = v * (1.0 - s * (1.0 - f));

    let i_mod = i32(i) % 6;
    if (i_mod == 0) { return vec3<f32>(v, t, p); }
    if (i_mod == 1) { return vec3<f32>(q, v, p); }
    if (i_mod == 2) { return vec3<f32>(p, v, t); }
    if (i_mod == 3) { return vec3<f32>(p, q, v); }
    if (i_mod == 4) { return vec3<f32>(t, p, v); }
    return vec3<f32>(v, p, q);
}

// =============================================================================
// Luminance
// =============================================================================

fn luminance(rgb: vec3<f32>) -> f32 {
    return dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn luminance_bt601(rgb: vec3<f32>) -> f32 {
    return dot(rgb, vec3<f32>(0.299, 0.587, 0.114));
}

// =============================================================================
// Coordinate Utilities
// =============================================================================

fn uv_to_pixel(uv: vec2<f32>, size: vec2<f32>) -> vec2<i32> {
    return vec2<i32>(uv * size);
}

fn pixel_to_uv(pixel: vec2<i32>, size: vec2<f32>) -> vec2<f32> {
    return (vec2<f32>(pixel) + 0.5) / size;
}

fn rotate_uv(uv: vec2<f32>, angle: f32, center: vec2<f32>) -> vec2<f32> {
    let cos_a = cos(angle);
    let sin_a = sin(angle);
    let centered = uv - center;
    return vec2<f32>(
        centered.x * cos_a - centered.y * sin_a,
        centered.x * sin_a + centered.y * cos_a
    ) + center;
}

fn scale_uv(uv: vec2<f32>, scale: vec2<f32>, center: vec2<f32>) -> vec2<f32> {
    return (uv - center) / scale + center;
}
