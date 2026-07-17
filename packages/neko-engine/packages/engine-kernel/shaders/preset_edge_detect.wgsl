// Edge Detection Shader (Sobel)
// Detects edges using Sobel operator
//
// params[0] = threshold (0-1, default 0.1)
// params[1] = strength (0-3, default 1.0)

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

fn luminance(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    if (global_id.x >= uniforms.width || global_id.y >= uniforms.height) {
        return;
    }

    let threshold = get_param(0u);
    let strength = get_param(1u);

    let px = i32(global_id.x);
    let py = i32(global_id.y);

    // Sample 3x3 neighborhood luminance
    let tl = luminance(sample_at(px - 1, py - 1).rgb);
    let tc = luminance(sample_at(px,     py - 1).rgb);
    let tr = luminance(sample_at(px + 1, py - 1).rgb);
    let ml = luminance(sample_at(px - 1, py    ).rgb);
    let mr = luminance(sample_at(px + 1, py    ).rgb);
    let bl = luminance(sample_at(px - 1, py + 1).rgb);
    let bc = luminance(sample_at(px,     py + 1).rgb);
    let br = luminance(sample_at(px + 1, py + 1).rgb);

    // Sobel X: [-1 0 1; -2 0 2; -1 0 1]
    let gx = -tl + tr - 2.0 * ml + 2.0 * mr - bl + br;

    // Sobel Y: [-1 -2 -1; 0 0 0; 1 2 1]
    let gy = -tl - 2.0 * tc - tr + bl + 2.0 * bc + br;

    var edge = sqrt(gx * gx + gy * gy) * strength;

    // Apply threshold
    if (edge < threshold) {
        edge = 0.0;
    }

    edge = clamp(edge, 0.0, 1.0);

    let original = sample_at(px, py);
    let result = vec4<f32>(vec3<f32>(edge), original.a);

    let idx = global_id.x + global_id.y * uniforms.width;
    output[idx] = pack_rgba(result);
}
