// Wave Distortion Shader
// Applies sinusoidal wave displacement to the image
//
// params[0] = amplitude (0-100, default 10) — wave height in pixels
// params[1] = frequency (0.1-50, default 5) — wave frequency
// params[2] = speed (0-10, default 1) — animation speed multiplier
// params[3] = time (0-10000, default 0) — current time for animation

struct Uniforms {
    width: u32,
    height: u32,
    param_count: u32,
    _padding: u32,
    params: array<vec4<f32>, 4>,
}

@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;

fn get_param(index: u32) -> f32 {
    return uniforms.params[index / 4u][index % 4u];
}

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

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= uniforms.width || global_id.y >= uniforms.height) {
        return;
    }

    let amplitude = get_param(0u);
    let frequency = get_param(1u);
    let speed = get_param(2u);
    let time = get_param(3u);

    let px = i32(global_id.x);
    let py = i32(global_id.y);

    // Normalized Y coordinate for wave calculation
    let ny = f32(py) / f32(uniforms.height);

    // Horizontal wave displacement
    let wave_offset = sin(ny * frequency * 6.28318 + time * speed) * amplitude;

    let color = sample_at(px + i32(wave_offset), py);

    let idx = global_id.x + global_id.y * uniforms.width;
    output[idx] = pack_rgba(color);
}
