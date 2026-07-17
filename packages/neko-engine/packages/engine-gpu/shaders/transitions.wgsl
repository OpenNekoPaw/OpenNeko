// =============================================================================
// Video Transitions
// Wipe, slide, zoom, blur, distortion transitions
// Shared between WebGPU (browser) and wgpu (Rust)
// =============================================================================

// =============================================================================
// Transition Utilities
// =============================================================================

fn apply_feather(value: f32, feather: f32) -> f32 {
    if (feather <= 0.0) {
        return step(0.5, value);
    }
    return smoothstep(0.5 - feather * 0.5, 0.5 + feather * 0.5, value);
}

// =============================================================================
// Basic Transitions
// =============================================================================

fn transition_fade(from_color: vec4<f32>, to_color: vec4<f32>, progress: f32) -> vec4<f32> {
    return mix(from_color, to_color, progress);
}

// =============================================================================
// Wipe Transitions
// =============================================================================

fn transition_wipe_left(uv: vec2<f32>, progress: f32, feather: f32) -> f32 {
    let edge = progress * (1.0 + feather) - feather * 0.5;
    return apply_feather(edge - uv.x + 0.5, feather);
}

fn transition_wipe_right(uv: vec2<f32>, progress: f32, feather: f32) -> f32 {
    let edge = progress * (1.0 + feather) - feather * 0.5;
    return apply_feather(uv.x - (1.0 - edge) + 0.5, feather);
}

fn transition_wipe_up(uv: vec2<f32>, progress: f32, feather: f32) -> f32 {
    let edge = progress * (1.0 + feather) - feather * 0.5;
    return apply_feather(uv.y - (1.0 - edge) + 0.5, feather);
}

fn transition_wipe_down(uv: vec2<f32>, progress: f32, feather: f32) -> f32 {
    let edge = progress * (1.0 + feather) - feather * 0.5;
    return apply_feather(edge - uv.y + 0.5, feather);
}

fn transition_wipe_diagonal(uv: vec2<f32>, progress: f32, feather: f32, angle: f32) -> f32 {
    let cos_a = cos(angle);
    let sin_a = sin(angle);
    let rotated = uv.x * cos_a + uv.y * sin_a;
    let edge = progress * 2.0 - 0.5;
    return apply_feather(edge - rotated + 0.5, feather);
}

// =============================================================================
// Iris Transitions
// =============================================================================

fn transition_iris_circle(uv: vec2<f32>, progress: f32, feather: f32, center: vec2<f32>) -> f32 {
    let dist = distance(uv, center);
    let max_dist = distance(vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 1.0)) * 0.5;
    let radius = progress * max_dist * 1.5;
    return apply_feather((radius - dist) / max_dist + 0.5, feather);
}

fn transition_iris_rectangle(uv: vec2<f32>, progress: f32, feather: f32, center: vec2<f32>) -> f32 {
    let diff = abs(uv - center);
    let dist = max(diff.x, diff.y);
    let radius = progress * 1.0;
    return apply_feather((radius - dist) + 0.5, feather);
}

// =============================================================================
// Clock Wipe
// =============================================================================

fn transition_clock(uv: vec2<f32>, progress: f32, feather: f32, center: vec2<f32>, clockwise: bool) -> f32 {
    let diff = uv - center;
    var angle = atan2(diff.y, diff.x);
    angle = (angle + PI) / TAU;

    if (!clockwise) {
        angle = 1.0 - angle;
    }

    return apply_feather(progress - angle + 0.5, feather);
}

// =============================================================================
// Slide/Push Transitions
// =============================================================================

fn transition_slide_uv(uv: vec2<f32>, progress: f32, direction: vec2<f32>) -> vec2<f32> {
    return uv + direction * progress;
}

fn transition_push(
    uv: vec2<f32>,
    progress: f32,
    direction: vec2<f32>,
    from_tex: texture_2d<f32>,
    to_tex: texture_2d<f32>,
    tex_sampler: sampler
) -> vec4<f32> {
    let from_uv = uv + direction * progress;
    let to_uv = uv + direction * (progress - 1.0);

    let from_valid = all(from_uv >= vec2<f32>(0.0)) && all(from_uv <= vec2<f32>(1.0));
    let to_valid = all(to_uv >= vec2<f32>(0.0)) && all(to_uv <= vec2<f32>(1.0));

    if (to_valid) {
        return textureSample(to_tex, tex_sampler, to_uv);
    } else if (from_valid) {
        return textureSample(from_tex, tex_sampler, from_uv);
    }
    return vec4<f32>(0.0);
}

// =============================================================================
// Zoom Transitions
// =============================================================================

fn transition_zoom_in(uv: vec2<f32>, progress: f32, center: vec2<f32>) -> vec2<f32> {
    let scale = 1.0 + progress * 2.0;
    return (uv - center) / scale + center;
}

fn transition_zoom_out(uv: vec2<f32>, progress: f32, center: vec2<f32>) -> vec2<f32> {
    let scale = 1.0 / (1.0 + (1.0 - progress) * 2.0);
    return (uv - center) / scale + center;
}

// =============================================================================
// Distortion Transitions
// =============================================================================

fn transition_pixelate(uv: vec2<f32>, progress: f32, max_pixels: f32) -> vec2<f32> {
    let pixels = mix(1.0, max_pixels, sin(progress * PI));
    return floor(uv * pixels) / pixels;
}

fn transition_ripple(uv: vec2<f32>, progress: f32, center: vec2<f32>, frequency: f32, amplitude: f32) -> vec2<f32> {
    let dist = distance(uv, center);
    let wave = sin(dist * frequency - progress * TAU) * amplitude;
    let wave_strength = sin(progress * PI);
    let direction = normalize(uv - center);
    return uv + direction * wave * wave_strength;
}

fn transition_swirl(uv: vec2<f32>, progress: f32, center: vec2<f32>, max_angle: f32) -> vec2<f32> {
    let diff = uv - center;
    let dist = length(diff);
    let angle = max_angle * sin(progress * PI) * (1.0 - dist);
    let cos_a = cos(angle);
    let sin_a = sin(angle);
    return vec2<f32>(
        diff.x * cos_a - diff.y * sin_a,
        diff.x * sin_a + diff.y * cos_a
    ) + center;
}

// =============================================================================
// Stylized Transitions
// =============================================================================

fn transition_glitch(uv: vec2<f32>, progress: f32, intensity: f32, seed: f32) -> vec2<f32> {
    let glitch_strength = sin(progress * PI) * intensity;
    let noise = fract(sin(dot(vec2<f32>(floor(uv.y * 20.0), seed), vec2<f32>(12.9898, 78.233))) * 43758.5453);

    var result = uv;
    if (noise > 0.8) {
        result.x += (noise - 0.5) * glitch_strength * 0.1;
    }
    return result;
}

fn transition_flash(from_color: vec4<f32>, to_color: vec4<f32>, progress: f32, flash_color: vec3<f32>) -> vec4<f32> {
    let flash_intensity = sin(progress * PI);
    let base = mix(from_color, to_color, progress);
    return vec4<f32>(mix(base.rgb, flash_color, flash_intensity * 0.5), base.a);
}

// =============================================================================
// 3D Transitions (2D approximations)
// =============================================================================

fn transition_flip_horizontal(uv: vec2<f32>, progress: f32) -> vec2<f32> {
    let scale = abs(cos(progress * PI));
    let flip = progress > 0.5;
    var result_uv = uv;
    result_uv.x = (result_uv.x - 0.5) / max(scale, 0.001) + 0.5;
    if (flip) {
        result_uv.x = 1.0 - result_uv.x;
    }
    return result_uv;
}

fn transition_flip_vertical(uv: vec2<f32>, progress: f32) -> vec2<f32> {
    let scale = abs(cos(progress * PI));
    let flip = progress > 0.5;
    var result_uv = uv;
    result_uv.y = (result_uv.y - 0.5) / max(scale, 0.001) + 0.5;
    if (flip) {
        result_uv.y = 1.0 - result_uv.y;
    }
    return result_uv;
}

// =============================================================================
// Transition Mixer
// =============================================================================

fn mix_transition(from_color: vec4<f32>, to_color: vec4<f32>, mix_factor: f32) -> vec4<f32> {
    return mix(from_color, to_color, saturate(mix_factor));
}
