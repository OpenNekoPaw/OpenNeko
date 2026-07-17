// =============================================================================
// Video Effects/Filters
// Blur, sharpen, vignette, distortion, etc.
// Shared between WebGPU (browser) and wgpu (Rust)
// =============================================================================

// =============================================================================
// Blur Effects
// =============================================================================

// Box blur (simple average)
fn blur_box_sample(
    tex: texture_2d<f32>,
    tex_sampler: sampler,
    uv: vec2<f32>,
    texel_size: vec2<f32>,
    radius: i32
) -> vec4<f32> {
    var color = vec4<f32>(0.0);
    var count = 0.0;

    for (var x = -radius; x <= radius; x++) {
        for (var y = -radius; y <= radius; y++) {
            let offset = vec2<f32>(f32(x), f32(y)) * texel_size;
            color += textureSample(tex, tex_sampler, uv + offset);
            count += 1.0;
        }
    }

    return color / count;
}

// Directional blur (motion blur)
fn blur_directional_sample(
    tex: texture_2d<f32>,
    tex_sampler: sampler,
    uv: vec2<f32>,
    direction: vec2<f32>,
    samples: i32
) -> vec4<f32> {
    var color = vec4<f32>(0.0);
    let step_size = direction / f32(samples);

    for (var i = -samples; i <= samples; i++) {
        let offset = step_size * f32(i);
        color += textureSample(tex, tex_sampler, uv + offset);
    }

    return color / f32(samples * 2 + 1);
}

// Radial blur
fn blur_radial_sample(
    tex: texture_2d<f32>,
    tex_sampler: sampler,
    uv: vec2<f32>,
    center: vec2<f32>,
    strength: f32,
    samples: i32
) -> vec4<f32> {
    var color = vec4<f32>(0.0);
    let direction = uv - center;

    for (var i = 0; i < samples; i++) {
        let scale = 1.0 - strength * (f32(i) / f32(samples));
        let sample_uv = center + direction * scale;
        color += textureSample(tex, tex_sampler, sample_uv);
    }

    return color / f32(samples);
}

// Zoom blur
fn blur_zoom_sample(
    tex: texture_2d<f32>,
    tex_sampler: sampler,
    uv: vec2<f32>,
    center: vec2<f32>,
    strength: f32,
    samples: i32
) -> vec4<f32> {
    var color = vec4<f32>(0.0);

    for (var i = 0; i < samples; i++) {
        let scale = 1.0 + strength * (f32(i) / f32(samples));
        let sample_uv = center + (uv - center) * scale;
        color += textureSample(tex, tex_sampler, sample_uv);
    }

    return color / f32(samples);
}

// =============================================================================
// Sharpen
// =============================================================================

fn sharpen(
    tex: texture_2d<f32>,
    tex_sampler: sampler,
    uv: vec2<f32>,
    texel_size: vec2<f32>,
    amount: f32
) -> vec4<f32> {
    let center = textureSample(tex, tex_sampler, uv);
    let top = textureSample(tex, tex_sampler, uv + vec2<f32>(0.0, -texel_size.y));
    let bottom = textureSample(tex, tex_sampler, uv + vec2<f32>(0.0, texel_size.y));
    let left = textureSample(tex, tex_sampler, uv + vec2<f32>(-texel_size.x, 0.0));
    let right = textureSample(tex, tex_sampler, uv + vec2<f32>(texel_size.x, 0.0));

    let edge = center * 5.0 - top - bottom - left - right;
    return center + edge * amount;
}

// =============================================================================
// Vignette
// =============================================================================

fn vignette(uv: vec2<f32>, amount: f32, radius: f32, softness: f32) -> f32 {
    let center = vec2<f32>(0.5, 0.5);
    let dist = distance(uv, center);
    let vig = smoothstep(radius, radius - softness, dist);
    return mix(1.0, vig, amount);
}

fn vignette_color(color: vec4<f32>, uv: vec2<f32>, amount: f32, radius: f32, softness: f32) -> vec4<f32> {
    let vig = vignette(uv, amount, radius, softness);
    return vec4<f32>(color.rgb * vig, color.a);
}

// =============================================================================
// Film Grain
// =============================================================================

fn film_grain_noise(uv: vec2<f32>, time: f32) -> f32 {
    let noise = fract(sin(dot(uv + time, vec2<f32>(12.9898, 78.233))) * 43758.5453);
    return noise;
}

fn apply_film_grain(color: vec4<f32>, uv: vec2<f32>, time: f32, amount: f32) -> vec4<f32> {
    let noise = film_grain_noise(uv * 100.0, time);
    let grain = (noise - 0.5) * amount;
    return vec4<f32>(color.rgb + grain, color.a);
}

// =============================================================================
// Glow / Bloom
// =============================================================================

fn extract_bright(color: vec4<f32>, threshold: f32) -> vec4<f32> {
    let brightness = luminance(color.rgb);
    let contribution = max(0.0, brightness - threshold);
    return color * (contribution / max(brightness, 0.001));
}

fn apply_glow(original: vec4<f32>, blurred_bright: vec4<f32>, intensity: f32) -> vec4<f32> {
    return original + blurred_bright * intensity;
}

// =============================================================================
// Chromatic Aberration
// =============================================================================

fn chromatic_aberration(
    tex: texture_2d<f32>,
    tex_sampler: sampler,
    uv: vec2<f32>,
    center: vec2<f32>,
    amount: f32
) -> vec4<f32> {
    let direction = normalize(uv - center);
    let dist = distance(uv, center);
    let offset = direction * dist * amount;

    let r = textureSample(tex, tex_sampler, uv + offset).r;
    let g = textureSample(tex, tex_sampler, uv).g;
    let b = textureSample(tex, tex_sampler, uv - offset).b;
    let a = textureSample(tex, tex_sampler, uv).a;

    return vec4<f32>(r, g, b, a);
}

// =============================================================================
// Distortion Effects
// =============================================================================

fn barrel_distortion(uv: vec2<f32>, amount: f32) -> vec2<f32> {
    let centered = uv - 0.5;
    let dist = length(centered);
    let distorted = centered * (1.0 + amount * dist * dist);
    return distorted + 0.5;
}

fn pincushion_distortion(uv: vec2<f32>, amount: f32) -> vec2<f32> {
    let centered = uv - 0.5;
    let dist = length(centered);
    let distorted = centered * (1.0 - amount * dist * dist);
    return distorted + 0.5;
}

fn wave_distortion(uv: vec2<f32>, frequency: f32, amplitude: f32, time: f32) -> vec2<f32> {
    var result = uv;
    result.x += sin(uv.y * frequency + time) * amplitude;
    result.y += sin(uv.x * frequency + time) * amplitude;
    return result;
}

fn twirl_distortion(uv: vec2<f32>, center: vec2<f32>, angle: f32, radius: f32) -> vec2<f32> {
    let diff = uv - center;
    let dist = length(diff);

    if (dist < radius) {
        let percent = (radius - dist) / radius;
        let theta = percent * percent * angle;
        let cos_t = cos(theta);
        let sin_t = sin(theta);
        return vec2<f32>(
            diff.x * cos_t - diff.y * sin_t,
            diff.x * sin_t + diff.y * cos_t
        ) + center;
    }

    return uv;
}

// =============================================================================
// Pixelate / Mosaic
// =============================================================================

fn pixelate(uv: vec2<f32>, pixel_size: vec2<f32>) -> vec2<f32> {
    return floor(uv / pixel_size) * pixel_size + pixel_size * 0.5;
}

// =============================================================================
// Edge Detection
// =============================================================================

fn sobel_edge(
    tex: texture_2d<f32>,
    tex_sampler: sampler,
    uv: vec2<f32>,
    texel_size: vec2<f32>
) -> f32 {
    let tl = luminance(textureSample(tex, tex_sampler, uv + vec2<f32>(-1.0, -1.0) * texel_size).rgb);
    let t  = luminance(textureSample(tex, tex_sampler, uv + vec2<f32>( 0.0, -1.0) * texel_size).rgb);
    let tr = luminance(textureSample(tex, tex_sampler, uv + vec2<f32>( 1.0, -1.0) * texel_size).rgb);
    let l  = luminance(textureSample(tex, tex_sampler, uv + vec2<f32>(-1.0,  0.0) * texel_size).rgb);
    let r  = luminance(textureSample(tex, tex_sampler, uv + vec2<f32>( 1.0,  0.0) * texel_size).rgb);
    let bl = luminance(textureSample(tex, tex_sampler, uv + vec2<f32>(-1.0,  1.0) * texel_size).rgb);
    let b  = luminance(textureSample(tex, tex_sampler, uv + vec2<f32>( 0.0,  1.0) * texel_size).rgb);
    let br = luminance(textureSample(tex, tex_sampler, uv + vec2<f32>( 1.0,  1.0) * texel_size).rgb);

    let gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
    let gy = -tl - 2.0*t - tr + bl + 2.0*b + br;

    return sqrt(gx*gx + gy*gy);
}

// =============================================================================
// Posterize
// =============================================================================

fn posterize(color: vec3<f32>, levels: f32) -> vec3<f32> {
    return floor(color * levels) / levels;
}
