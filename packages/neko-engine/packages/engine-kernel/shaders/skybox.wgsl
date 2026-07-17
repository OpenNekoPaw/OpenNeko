// Skybox rendering shader
//
// Uses a fullscreen triangle with inverse view-projection to sample cubemap.
// Renders at depth = 1.0 (far plane) behind all scene geometry.

struct SkyboxUniforms {
    view_projection_inverse: mat4x4<f32>,
    view: mat4x4<f32>,
}
@group(0) @binding(0) var<uniform> skybox_uniforms: SkyboxUniforms;
@group(0) @binding(1) var skybox_texture: texture_cube<f32>;
@group(0) @binding(2) var skybox_sampler: sampler;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) world_dir: vec3<f32>,
}

// Fullscreen triangle (no vertex buffer needed)
@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
    var out: VertexOutput;

    // Generate fullscreen triangle vertices
    let x = f32(i32(vertex_index & 1u) * 4 - 1);
    let y = f32(i32(vertex_index >> 1u) * 4 - 1);

    out.position = vec4<f32>(x, y, 1.0, 1.0); // z=1.0 = far plane

    // Reconstruct world direction from clip space
    let clip_pos = vec4<f32>(x, y, 1.0, 1.0);
    let world_pos = skybox_uniforms.view_projection_inverse * clip_pos;
    out.world_dir = normalize(world_pos.xyz / world_pos.w);

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let color = textureSample(skybox_texture, skybox_sampler, in.world_dir);

    // Procedural gradient fallback (when cubemap is empty/default)
    let up = normalize(in.world_dir);
    let sky_factor = up.y * 0.5 + 0.5; // 0 at bottom, 1 at top

    let ground_color = vec3<f32>(0.15, 0.12, 0.10);
    let horizon_color = vec3<f32>(0.4, 0.45, 0.5);
    let sky_color = vec3<f32>(0.2, 0.35, 0.6);

    var gradient: vec3<f32>;
    if sky_factor < 0.5 {
        gradient = mix(ground_color, horizon_color, sky_factor * 2.0);
    } else {
        gradient = mix(horizon_color, sky_color, (sky_factor - 0.5) * 2.0);
    }

    // Blend cubemap sample with procedural gradient
    // When cubemap is uninitialized (all zeros), gradient dominates
    let cubemap_weight = max(max(color.r, color.g), color.b);
    let final_color = mix(gradient, color.rgb, clamp(cubemap_weight, 0.0, 1.0));

    return vec4<f32>(final_color, 1.0);
}
