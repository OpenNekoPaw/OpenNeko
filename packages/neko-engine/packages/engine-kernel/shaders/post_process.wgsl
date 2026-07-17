// Post-processing shader: tone mapping + color grading
//
// Applied as a fullscreen pass after PBR rendering.
// Converts HDR Rgba16Float -> tone-mapped output.

struct PostProcessUniforms {
    exposure: f32,
    bloom_intensity: f32,
    bloom_threshold: f32,
    vignette_intensity: f32,
    contrast: f32,
    saturation: f32,
    gamma: f32,
    tone_mapping_mode: u32,  // 0=none, 1=reinhard, 2=aces, 3=uncharted2
    resolution: vec2<f32>,
    _padding: vec2<f32>,
}

@group(0) @binding(0) var input_texture: texture_2d<f32>;
@group(0) @binding(1) var input_sampler: sampler;
@group(0) @binding(2) var<uniform> params: PostProcessUniforms;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

// Fullscreen triangle
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;
    let x = f32(i32(vertex_index & 1u) * 4 - 1);
    let y = f32(i32(vertex_index >> 1u) * 4 - 1);
    out.position = vec4<f32>(x, y, 0.0, 1.0);
    out.uv = vec2<f32>(x * 0.5 + 0.5, 1.0 - (y * 0.5 + 0.5));
    return out;
}

// ============================================================
// Tone mapping operators
// ============================================================

fn tone_map_reinhard(color: vec3<f32>) -> vec3<f32> {
    return color / (color + vec3<f32>(1.0));
}

fn tone_map_aces(color: vec3<f32>) -> vec3<f32> {
    // Narkowicz 2015, "ACES Filmic Tone Mapping Curve"
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((color * (a * color + b)) / (color * (c * color + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn uncharted2_partial(x: vec3<f32>) -> vec3<f32> {
    let a = 0.15;
    let b = 0.50;
    let c = 0.10;
    let d = 0.20;
    let e = 0.02;
    let f = 0.30;
    return ((x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f)) - e / f;
}

fn tone_map_uncharted2(color: vec3<f32>) -> vec3<f32> {
    let exposure_bias = 2.0;
    let curr = uncharted2_partial(color * exposure_bias);
    let w = vec3<f32>(11.2);
    let white_scale = vec3<f32>(1.0) / uncharted2_partial(w);
    return curr * white_scale;
}

// ============================================================
// Color grading
// ============================================================

fn luminance(color: vec3<f32>) -> f32 {
    return dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn apply_contrast(color: vec3<f32>, contrast: f32) -> vec3<f32> {
    let midpoint = vec3<f32>(0.5);
    return midpoint + (color - midpoint) * (1.0 + contrast);
}

fn apply_saturation(color: vec3<f32>, saturation: f32) -> vec3<f32> {
    let lum = luminance(color);
    return mix(vec3<f32>(lum), color, 1.0 + saturation);
}

fn apply_vignette(color: vec3<f32>, uv: vec2<f32>, intensity: f32) -> vec3<f32> {
    let center = uv - vec2<f32>(0.5);
    let dist = length(center);
    let vignette = 1.0 - smoothstep(0.3, 0.8, dist) * intensity;
    return color * vignette;
}

// ============================================================
// Fragment shader
// ============================================================

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    var color = textureSample(input_texture, input_sampler, in.uv).rgb;

    // Exposure adjustment
    color = color * params.exposure;

    // Tone mapping
    switch params.tone_mapping_mode {
        case 1u: { color = tone_map_reinhard(color); }
        case 2u: { color = tone_map_aces(color); }
        case 3u: { color = tone_map_uncharted2(color); }
        default: {} // No tone mapping
    }

    // Color grading (after tone mapping, in [0,1] range)
    color = apply_contrast(color, params.contrast);
    color = apply_saturation(color, params.saturation);

    // Vignette
    if params.vignette_intensity > 0.0 {
        color = apply_vignette(color, in.uv, params.vignette_intensity);
    }

    // Gamma correction
    color = pow(max(color, vec3<f32>(0.0)), vec3<f32>(1.0 / params.gamma));

    return vec4<f32>(clamp(color, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
}
