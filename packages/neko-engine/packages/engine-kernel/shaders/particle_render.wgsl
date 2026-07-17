// Particle billboard rendering shader
//
// Generates camera-facing quad per particle using vertex shader instancing.
// Each particle = 2 triangles (6 vertices), instance_index = particle index.

struct CameraUniforms {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    camera_position: vec3<f32>,
    _padding: f32,
}

struct Particle {
    position: vec3<f32>,
    lifetime: f32,
    velocity: vec3<f32>,
    max_lifetime: f32,
    color: vec4<f32>,
    size: f32,
    _padding: vec3<f32>,
}

@group(0) @binding(0) var<uniform> camera: CameraUniforms;
@group(0) @binding(1) var<storage, read> particles: array<Particle>;

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) uv: vec2<f32>,
}

// Billboard quad vertices (2 triangles)
const QUAD_POSITIONS: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
    vec2<f32>(-0.5, -0.5),
    vec2<f32>( 0.5, -0.5),
    vec2<f32>( 0.5,  0.5),
    vec2<f32>(-0.5, -0.5),
    vec2<f32>( 0.5,  0.5),
    vec2<f32>(-0.5,  0.5),
);

const QUAD_UVS: array<vec2<f32>, 6> = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 0.0),
);

@vertex
fn vs_main(
    @builtin(vertex_index) vertex_index: u32,
    @builtin(instance_index) instance_index: u32,
) -> VertexOutput {
    var out: VertexOutput;

    let p = particles[instance_index];

    // Skip dead particles
    if p.lifetime <= 0.0 {
        out.position = vec4<f32>(0.0, 0.0, -2.0, 1.0); // Behind camera
        out.color = vec4<f32>(0.0);
        out.uv = vec2<f32>(0.0);
        return out;
    }

    let quad_pos = QUAD_POSITIONS[vertex_index % 6u];

    // Billboard: extract camera right and up from view matrix
    let right = vec3<f32>(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
    let up = vec3<f32>(camera.view[0][1], camera.view[1][1], camera.view[2][1]);

    let world_pos = p.position + (right * quad_pos.x + up * quad_pos.y) * p.size;
    out.position = camera.projection * camera.view * vec4<f32>(world_pos, 1.0);
    out.color = p.color;
    out.uv = QUAD_UVS[vertex_index % 6u];

    return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Soft circle shape
    let dist = length(in.uv - vec2<f32>(0.5));
    let alpha = 1.0 - smoothstep(0.3, 0.5, dist);

    return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
