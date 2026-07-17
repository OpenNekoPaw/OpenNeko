// PBR Forward Rendering Shader (metallic-roughness workflow)
//
// Bind groups:
//   @group(0) Camera: view, projection, camera_position
//   @group(1) Model:  model_matrix, normal_matrix
//   @group(2) Material: PBR params + textures + sampler
//   @group(3) Lights: light array + count

// ============================================================
// Camera uniforms
// ============================================================
struct CameraUniforms {
    view: mat4x4<f32>,
    projection: mat4x4<f32>,
    camera_position: vec3<f32>,
    _padding: f32,
}
@group(0) @binding(0) var<uniform> camera: CameraUniforms;

// ============================================================
// Model uniforms
// ============================================================
struct ModelUniforms {
    model: mat4x4<f32>,
    // normal_matrix = transpose(inverse(model)).xyz — passed as mat3 packed in mat4
    normal_matrix_0: vec4<f32>,
    normal_matrix_1: vec4<f32>,
    normal_matrix_2: vec4<f32>,
}
@group(1) @binding(0) var<uniform> model: ModelUniforms;

// ============================================================
// Material uniforms + textures
// ============================================================
struct MaterialUniforms {
    base_color_factor: vec4<f32>,
    metallic_factor: f32,
    roughness_factor: f32,
    occlusion_strength: f32,
    _pad0: f32,
    emissive_factor: vec3<f32>,
    _pad1: f32,
}
@group(2) @binding(0) var<uniform> material: MaterialUniforms;
@group(2) @binding(1) var base_color_tex: texture_2d<f32>;
@group(2) @binding(2) var metallic_roughness_tex: texture_2d<f32>;
@group(2) @binding(3) var normal_tex: texture_2d<f32>;
@group(2) @binding(4) var material_sampler: sampler;
@group(2) @binding(5) var emissive_tex: texture_2d<f32>;
@group(2) @binding(6) var occlusion_tex: texture_2d<f32>;

// ============================================================
// Lights
// ============================================================
const MAX_LIGHTS: u32 = 16u;

// kind: 0=directional, 1=point, 2=spot
struct Light {
    position: vec3<f32>,
    kind: u32,
    direction: vec3<f32>,
    intensity: f32,
    color: vec3<f32>,
    range: f32,
    inner_cone: f32,
    outer_cone: f32,
    _padding: vec2<f32>,
}

struct LightUniforms {
    lights: array<Light, 16>,
    count: u32,
    _padding: vec3<u32>,
}
@group(3) @binding(0) var<uniform> light_data: LightUniforms;

// ============================================================
// Vertex shader
// ============================================================
struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
    @location(3) tangent: vec4<f32>,
}

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) world_position: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
}

@vertex
fn vs_main(in: VertexInput) -> VertexOutput {
    var out: VertexOutput;

    let world_pos = model.model * vec4<f32>(in.position, 1.0);
    out.world_position = world_pos.xyz;
    out.clip_position = camera.projection * camera.view * world_pos;

    // Transform normal using normal matrix
    let nm = mat3x3<f32>(
        model.normal_matrix_0.xyz,
        model.normal_matrix_1.xyz,
        model.normal_matrix_2.xyz,
    );
    out.world_normal = normalize(nm * in.normal);
    out.uv = in.uv;

    return out;
}

// ============================================================
// PBR functions
// ============================================================
const PI: f32 = 3.14159265359;

// Normal Distribution Function (GGX/Trowbridge-Reitz)
fn distribution_ggx(n_dot_h: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let denom = n_dot_h * n_dot_h * (a2 - 1.0) + 1.0;
    return a2 / (PI * denom * denom);
}

// Geometry function (Schlick-GGX)
fn geometry_schlick_ggx(n_dot_v: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    return n_dot_v / (n_dot_v * (1.0 - k) + k);
}

// Smith's geometry function
fn geometry_smith(n_dot_v: f32, n_dot_l: f32, roughness: f32) -> f32 {
    return geometry_schlick_ggx(n_dot_v, roughness) * geometry_schlick_ggx(n_dot_l, roughness);
}

// Fresnel (Schlick approximation)
fn fresnel_schlick(cos_theta: f32, f0: vec3<f32>) -> vec3<f32> {
    return f0 + (1.0 - f0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}

// ============================================================
// Fragment shader
// ============================================================
@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    // Sample material textures
    let base_color_sample = textureSample(base_color_tex, material_sampler, in.uv);
    let base_color = base_color_sample * material.base_color_factor;

    let mr_sample = textureSample(metallic_roughness_tex, material_sampler, in.uv);
    let metallic = mr_sample.b * material.metallic_factor;
    let roughness = clamp(mr_sample.g * material.roughness_factor, 0.04, 1.0);

    let n = normalize(in.world_normal);
    let v = normalize(camera.camera_position - in.world_position);
    let n_dot_v = max(dot(n, v), 0.001);

    // Dielectric F0 = 0.04, metallic F0 = base_color
    let f0 = mix(vec3<f32>(0.04), base_color.rgb, metallic);

    var lo = vec3<f32>(0.0); // Outgoing radiance

    // Iterate lights
    let light_count = min(light_data.count, MAX_LIGHTS);
    for (var i = 0u; i < light_count; i = i + 1u) {
        let light = light_data.lights[i];

        var l: vec3<f32>;
        var attenuation: f32 = 1.0;

        if light.kind == 0u {
            // Directional light
            l = normalize(-light.direction);
        } else {
            // Point / Spot light
            let light_vec = light.position - in.world_position;
            let distance = length(light_vec);
            l = normalize(light_vec);

            // Distance attenuation
            if light.range > 0.0 {
                attenuation = max(1.0 - pow(distance / light.range, 4.0), 0.0);
                attenuation = attenuation * attenuation / (distance * distance + 1.0);
            } else {
                attenuation = 1.0 / (distance * distance + 1.0);
            }

            // Spot cone attenuation
            if light.kind == 2u {
                let theta = dot(l, normalize(-light.direction));
                let epsilon = light.inner_cone - light.outer_cone;
                let spot = clamp((theta - light.outer_cone) / max(epsilon, 0.001), 0.0, 1.0);
                attenuation = attenuation * spot;
            }
        }

        let radiance = light.color * light.intensity * attenuation;

        let h = normalize(v + l);
        let n_dot_l = max(dot(n, l), 0.0);
        let n_dot_h = max(dot(n, h), 0.0);
        let h_dot_v = max(dot(h, v), 0.0);

        // Cook-Torrance BRDF
        let ndf = distribution_ggx(n_dot_h, roughness);
        let g = geometry_smith(n_dot_v, n_dot_l, roughness);
        let f = fresnel_schlick(h_dot_v, f0);

        let numerator = ndf * g * f;
        let denominator = 4.0 * n_dot_v * n_dot_l + 0.0001;
        let specular = numerator / denominator;

        // Energy conservation
        let ks = f;
        let kd = (1.0 - ks) * (1.0 - metallic);

        lo = lo + (kd * base_color.rgb / PI + specular) * radiance * n_dot_l;
    }

    // Ambient occlusion
    let ao = textureSample(occlusion_tex, material_sampler, in.uv).r;
    let ao_factor = 1.0 + material.occlusion_strength * (ao - 1.0);

    // Emissive
    let emissive = textureSample(emissive_tex, material_sampler, in.uv).rgb * material.emissive_factor;

    // Ambient (simple constant, IBL added in Step 9) + emissive
    let ambient = vec3<f32>(0.03) * base_color.rgb * ao_factor;
    let color = ambient + lo + emissive;

    // HDR output (no tone mapping here — done in post-processing)
    return vec4<f32>(color, base_color.a);
}
