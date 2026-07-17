// =============================================================================
// Blend Mode Functions
// Photoshop-compatible blend modes
// Shared between WebGPU (browser) and wgpu (Rust)
// =============================================================================

// Normal
fn blend_normal(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return blend;
}

// =============================================================================
// Darken Modes
// =============================================================================

fn blend_darken(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return min(base, blend);
}

fn blend_multiply(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return base * blend;
}

fn blend_color_burn(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(max(0.0, 1.0 - (1.0 - base.r) / blend.r), 0.0, blend.r == 0.0),
        select(max(0.0, 1.0 - (1.0 - base.g) / blend.g), 0.0, blend.g == 0.0),
        select(max(0.0, 1.0 - (1.0 - base.b) / blend.b), 0.0, blend.b == 0.0)
    );
}

fn blend_linear_burn(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return max(vec3<f32>(0.0), base + blend - 1.0);
}

fn blend_darker_color(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let base_sum = base.r + base.g + base.b;
    let blend_sum = blend.r + blend.g + blend.b;
    return select(base, blend, blend_sum < base_sum);
}

// =============================================================================
// Lighten Modes
// =============================================================================

fn blend_lighten(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return max(base, blend);
}

fn blend_screen(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return 1.0 - (1.0 - base) * (1.0 - blend);
}

fn blend_color_dodge(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(min(1.0, base.r / (1.0 - blend.r)), 1.0, blend.r == 1.0),
        select(min(1.0, base.g / (1.0 - blend.g)), 1.0, blend.g == 1.0),
        select(min(1.0, base.b / (1.0 - blend.b)), 1.0, blend.b == 1.0)
    );
}

fn blend_linear_dodge(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return min(vec3<f32>(1.0), base + blend);
}

fn blend_lighter_color(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let base_sum = base.r + base.g + base.b;
    let blend_sum = blend.r + blend.g + blend.b;
    return select(base, blend, blend_sum > base_sum);
}

// =============================================================================
// Contrast Modes
// =============================================================================

fn blend_overlay(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r), 2.0 * base.r * blend.r, base.r < 0.5),
        select(1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g), 2.0 * base.g * blend.g, base.g < 0.5),
        select(1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b), 2.0 * base.b * blend.b, base.b < 0.5)
    );
}

fn blend_soft_light_channel(base: f32, blend: f32) -> f32 {
    if (blend < 0.5) {
        return base - (1.0 - 2.0 * blend) * base * (1.0 - base);
    }
    let d = select(sqrt(base), ((16.0 * base - 12.0) * base + 4.0) * base, base <= 0.25);
    return base + (2.0 * blend - 1.0) * (d - base);
}

fn blend_soft_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        blend_soft_light_channel(base.r, blend.r),
        blend_soft_light_channel(base.g, blend.g),
        blend_soft_light_channel(base.b, blend.b)
    );
}

fn blend_hard_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r), 2.0 * base.r * blend.r, blend.r < 0.5),
        select(1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g), 2.0 * base.g * blend.g, blend.g < 0.5),
        select(1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b), 2.0 * base.b * blend.b, blend.b < 0.5)
    );
}

fn blend_vivid_light_channel(base: f32, blend: f32) -> f32 {
    if (blend < 0.5) {
        return select(max(0.0, 1.0 - (1.0 - base) / (2.0 * blend)), 0.0, blend == 0.0);
    }
    let b = 2.0 * (blend - 0.5);
    return select(min(1.0, base / (1.0 - b)), 1.0, b == 1.0);
}

fn blend_vivid_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        blend_vivid_light_channel(base.r, blend.r),
        blend_vivid_light_channel(base.g, blend.g),
        blend_vivid_light_channel(base.b, blend.b)
    );
}

fn blend_linear_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return clamp(base + 2.0 * blend - 1.0, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn blend_pin_light(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(max(base.r, 2.0 * (blend.r - 0.5)), min(base.r, 2.0 * blend.r), blend.r < 0.5),
        select(max(base.g, 2.0 * (blend.g - 0.5)), min(base.g, 2.0 * blend.g), blend.g < 0.5),
        select(max(base.b, 2.0 * (blend.b - 0.5)), min(base.b, 2.0 * blend.b), blend.b < 0.5)
    );
}

fn blend_hard_mix(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(0.0, 1.0, base.r + blend.r >= 1.0),
        select(0.0, 1.0, base.g + blend.g >= 1.0),
        select(0.0, 1.0, base.b + blend.b >= 1.0)
    );
}

// =============================================================================
// Inversion Modes
// =============================================================================

fn blend_difference(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return abs(base - blend);
}

fn blend_exclusion(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return base + blend - 2.0 * base * blend;
}

fn blend_subtract(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return max(vec3<f32>(0.0), base - blend);
}

fn blend_divide(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(
        select(min(1.0, base.r / blend.r), 1.0, blend.r == 0.0),
        select(min(1.0, base.g / blend.g), 1.0, blend.g == 0.0),
        select(min(1.0, base.b / blend.b), 1.0, blend.b == 0.0)
    );
}

// =============================================================================
// Component Modes (require rgb_to_hsl/hsl_to_rgb from common.wgsl)
// =============================================================================

fn blend_hue(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let base_hsl = rgb_to_hsl(base);
    let blend_hsl = rgb_to_hsl(blend);
    return hsl_to_rgb(vec3<f32>(blend_hsl.x, base_hsl.y, base_hsl.z));
}

fn blend_saturation(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let base_hsl = rgb_to_hsl(base);
    let blend_hsl = rgb_to_hsl(blend);
    return hsl_to_rgb(vec3<f32>(base_hsl.x, blend_hsl.y, base_hsl.z));
}

fn blend_color(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let base_hsl = rgb_to_hsl(base);
    let blend_hsl = rgb_to_hsl(blend);
    return hsl_to_rgb(vec3<f32>(blend_hsl.x, blend_hsl.y, base_hsl.z));
}

fn blend_luminosity(base: vec3<f32>, blend: vec3<f32>) -> vec3<f32> {
    let base_hsl = rgb_to_hsl(base);
    let blend_hsl = rgb_to_hsl(blend);
    return hsl_to_rgb(vec3<f32>(base_hsl.x, base_hsl.y, blend_hsl.z));
}

// =============================================================================
// Blend with Opacity
// =============================================================================

fn apply_blend(base: vec4<f32>, blend: vec4<f32>, blended_rgb: vec3<f32>, opacity: f32) -> vec4<f32> {
    let effective_opacity = opacity * blend.a;
    let result_rgb = mix(base.rgb, blended_rgb, effective_opacity);
    let result_a = base.a + (1.0 - base.a) * effective_opacity;
    return vec4<f32>(result_rgb, result_a);
}
