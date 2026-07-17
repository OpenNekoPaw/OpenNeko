// =============================================================================
// Color Correction Functions
// Professional color grading implementations
// Shared between WebGPU (browser) and wgpu (Rust)
// =============================================================================

// =============================================================================
// Basic Adjustments
// =============================================================================

fn apply_exposure(color: vec3<f32>, stops: f32) -> vec3<f32> {
    return color * pow(2.0, stops);
}

fn apply_brightness(color: vec3<f32>, amount: f32) -> vec3<f32> {
    return color + amount;
}

fn apply_contrast(color: vec3<f32>, amount: f32) -> vec3<f32> {
    return (color - 0.5) * amount + 0.5;
}

fn apply_gamma(color: vec3<f32>, gamma: f32) -> vec3<f32> {
    return pow(max(color, vec3<f32>(0.0)), vec3<f32>(1.0 / gamma));
}

fn apply_saturation(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let gray = luminance(color);
    return mix(vec3<f32>(gray), color, amount);
}

fn apply_vibrance(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let max_c = max(max(color.r, color.g), color.b);
    let min_c = min(min(color.r, color.g), color.b);
    let sat = max_c - min_c;
    let factor = 1.0 + amount * (1.0 - sat);
    let gray = luminance(color);
    return mix(vec3<f32>(gray), color, factor);
}

fn apply_hue_shift(color: vec3<f32>, degrees: f32) -> vec3<f32> {
    var hsl = rgb_to_hsl(color);
    hsl.x = fract(hsl.x + degrees / 360.0);
    return hsl_to_rgb(hsl);
}

// =============================================================================
// Temperature and Tint
// =============================================================================

fn apply_temperature(color: vec3<f32>, temp: f32) -> vec3<f32> {
    let shift = temp / 100.0;
    return vec3<f32>(
        color.r + shift * 0.1,
        color.g,
        color.b - shift * 0.1
    );
}

fn apply_tint(color: vec3<f32>, tint: f32) -> vec3<f32> {
    let shift = tint / 100.0;
    return vec3<f32>(
        color.r,
        color.g + shift * 0.1,
        color.b
    );
}

// =============================================================================
// Shadows/Highlights
// =============================================================================

fn apply_shadows(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let lum = luminance(color);
    let shadow_mask = 1.0 - smoothstep(0.0, 0.5, lum);
    return color + amount * shadow_mask;
}

fn apply_highlights(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let lum = luminance(color);
    let highlight_mask = smoothstep(0.5, 1.0, lum);
    return color + amount * highlight_mask;
}

fn apply_whites(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let lum = luminance(color);
    let white_mask = smoothstep(0.75, 1.0, lum);
    return color + amount * white_mask;
}

fn apply_blacks(color: vec3<f32>, amount: f32) -> vec3<f32> {
    let lum = luminance(color);
    let black_mask = 1.0 - smoothstep(0.0, 0.25, lum);
    return color + amount * black_mask;
}

// =============================================================================
// Levels
// =============================================================================

fn apply_levels(
    value: f32,
    input_black: f32,
    input_white: f32,
    gamma: f32,
    output_black: f32,
    output_white: f32
) -> f32 {
    let normalized = saturate((value - input_black) / (input_white - input_black));
    let gamma_corrected = pow(normalized, 1.0 / gamma);
    return mix(output_black, output_white, gamma_corrected);
}

fn apply_levels_rgb(
    color: vec3<f32>,
    input_black: vec3<f32>,
    input_white: vec3<f32>,
    gamma: vec3<f32>,
    output_black: vec3<f32>,
    output_white: vec3<f32>
) -> vec3<f32> {
    return vec3<f32>(
        apply_levels(color.r, input_black.r, input_white.r, gamma.r, output_black.r, output_white.r),
        apply_levels(color.g, input_black.g, input_white.g, gamma.g, output_black.g, output_white.g),
        apply_levels(color.b, input_black.b, input_white.b, gamma.b, output_black.b, output_white.b)
    );
}

// =============================================================================
// HSL Per-Color Adjustments
// =============================================================================

fn get_hue_weight(hue: f32, target_hue: f32, range: f32) -> f32 {
    let diff = abs(hue - target_hue);
    let wrapped_diff = min(diff, 1.0 - diff);
    return 1.0 - smoothstep(0.0, range, wrapped_diff);
}

fn apply_hsl_adjustment(
    color: vec3<f32>,
    target_hue: f32,
    hue_shift: f32,
    sat_adjust: f32,
    lum_adjust: f32
) -> vec3<f32> {
    var hsl = rgb_to_hsl(color);
    let weight = get_hue_weight(hsl.x, target_hue, 0.1);

    hsl.x = fract(hsl.x + hue_shift * weight);
    hsl.y = saturate(hsl.y + sat_adjust * weight);
    hsl.z = saturate(hsl.z + lum_adjust * weight);

    return hsl_to_rgb(hsl);
}

// =============================================================================
// Color Wheels (3-Way Color Correction)
// =============================================================================

fn apply_color_wheel(
    color: vec3<f32>,
    shadows_color: vec3<f32>,
    shadows_brightness: f32,
    midtones_color: vec3<f32>,
    midtones_brightness: f32,
    highlights_color: vec3<f32>,
    highlights_brightness: f32
) -> vec3<f32> {
    let lum = luminance(color);

    let shadow_mask = 1.0 - smoothstep(0.0, 0.33, lum);
    let highlight_mask = smoothstep(0.66, 1.0, lum);
    let midtone_mask = 1.0 - shadow_mask - highlight_mask;

    var result = color;
    result += (shadows_color - 0.5) * 2.0 * shadow_mask;
    result += shadows_brightness * shadow_mask;
    result += (midtones_color - 0.5) * 2.0 * midtone_mask;
    result += midtones_brightness * midtone_mask;
    result += (highlights_color - 0.5) * 2.0 * highlight_mask;
    result += highlights_brightness * highlight_mask;

    return saturate3(result);
}

// =============================================================================
// Complete Color Correction Pipeline
// =============================================================================

struct ColorCorrectionParams {
    exposure: f32,
    contrast: f32,
    highlights: f32,
    shadows: f32,
    whites: f32,
    blacks: f32,
    temperature: f32,
    tint: f32,
    vibrance: f32,
    saturation: f32,
    hue_shift: f32,
    gamma: f32,
}

fn apply_color_correction(color: vec3<f32>, params: ColorCorrectionParams) -> vec3<f32> {
    var result = color;

    result = apply_exposure(result, params.exposure);
    result = apply_temperature(result, params.temperature);
    result = apply_tint(result, params.tint);
    result = apply_highlights(result, params.highlights);
    result = apply_shadows(result, params.shadows);
    result = apply_whites(result, params.whites);
    result = apply_blacks(result, params.blacks);
    result = apply_contrast(result, params.contrast);
    result = apply_gamma(result, params.gamma);
    result = apply_vibrance(result, params.vibrance);
    result = apply_saturation(result, params.saturation);
    result = apply_hue_shift(result, params.hue_shift);

    return saturate3(result);
}
