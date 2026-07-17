// RGB Channel Split Shader
// Offsets R and B channels in opposite directions
//
// params[0] = offset (0-50, default 5) — pixel offset amount
// params[1] = angle (0-6.28, default 0) — direction angle in radians

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

    let offset = get_param(0u);
    let angle = get_param(1u);

    let dir = vec2<f32>(cos(angle), sin(angle));
    let off_x = i32(dir.x * offset);
    let off_y = i32(dir.y * offset);

    let px = i32(global_id.x);
    let py = i32(global_id.y);

    // Sample R channel with positive offset
    let r = sample_at(px + off_x, py + off_y).r;
    // Sample G channel at original position
    let g = sample_at(px, py).g;
    // Sample B channel with negative offset
    let b = sample_at(px - off_x, py - off_y).b;
    let a = sample_at(px, py).a;

    let idx = global_id.x + global_id.y * uniforms.width;
    output[idx] = pack_rgba(vec4<f32>(r, g, b, a));
}
