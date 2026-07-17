// Particle update compute shader
//
// Updates particle positions, velocities, and lifetimes.
// Dead particles (lifetime <= 0) are respawned at the emitter.

struct Particle {
    position: vec3<f32>,
    lifetime: f32,
    velocity: vec3<f32>,
    max_lifetime: f32,
    color: vec4<f32>,
    size: f32,
    _padding: vec3<f32>,
}

struct EmitterUniforms {
    position: vec3<f32>,
    emission_rate: f32,
    direction: vec3<f32>,
    spread: f32,
    lifetime_min: f32,
    lifetime_max: f32,
    speed_min: f32,
    speed_max: f32,
    size_min: f32,
    size_max: f32,
    gravity: f32,
    drag: f32,
    color_start: vec4<f32>,
    color_end: vec4<f32>,
    delta_time: f32,
    time: f32,
    particle_count: u32,
    _padding2: u32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> emitter: EmitterUniforms;

// Simple hash for pseudo-random (Wang hash)
fn hash(seed: u32) -> u32 {
    var s = seed;
    s = (s ^ 61u) ^ (s >> 16u);
    s = s * 9u;
    s = s ^ (s >> 4u);
    s = s * 0x27d4eb2du;
    s = s ^ (s >> 15u);
    return s;
}

fn random(seed: u32) -> f32 {
    return f32(hash(seed)) / 4294967295.0;
}

fn random_range(seed: u32, min_val: f32, max_val: f32) -> f32 {
    return mix(min_val, max_val, random(seed));
}

// Generate random direction within a cone
fn random_cone_direction(seed: u32, direction: vec3<f32>, spread: f32) -> vec3<f32> {
    let cos_angle = cos(spread);
    let z = random_range(seed, cos_angle, 1.0);
    let phi = random_range(seed + 1u, 0.0, 6.28318530718);
    let r = sqrt(1.0 - z * z);

    let local = vec3<f32>(r * cos(phi), r * sin(phi), z);

    // Rotate local direction to align with emitter direction
    let up = select(vec3<f32>(0.0, 1.0, 0.0), vec3<f32>(1.0, 0.0, 0.0), abs(direction.y) > 0.999);
    let right = normalize(cross(up, direction));
    let actual_up = cross(direction, right);

    return normalize(right * local.x + actual_up * local.y + direction * local.z);
}

@compute @workgroup_size(64)
fn update_particles(@builtin(global_invocation_id) id: vec3<u32>) {
    let idx = id.x;
    if idx >= emitter.particle_count {
        return;
    }

    var p = particles[idx];
    let seed = idx * 1000u + u32(emitter.time * 1000.0);

    if p.lifetime <= 0.0 {
        // Respawn particle
        p.position = emitter.position;
        p.lifetime = random_range(seed, emitter.lifetime_min, emitter.lifetime_max);
        p.max_lifetime = p.lifetime;

        let dir = random_cone_direction(seed + 2u, emitter.direction, emitter.spread);
        let speed = random_range(seed + 4u, emitter.speed_min, emitter.speed_max);
        p.velocity = dir * speed;

        p.size = random_range(seed + 5u, emitter.size_min, emitter.size_max);
        p.color = emitter.color_start;
    } else {
        // Update physics
        let dt = emitter.delta_time;

        // Apply gravity (negative Y)
        p.velocity.y = p.velocity.y + emitter.gravity * dt;

        // Apply drag
        p.velocity = p.velocity * (1.0 - emitter.drag * dt);

        // Integrate position
        p.position = p.position + p.velocity * dt;

        // Update lifetime
        p.lifetime = p.lifetime - dt;

        // Interpolate color over lifetime
        let life_ratio = clamp(1.0 - p.lifetime / p.max_lifetime, 0.0, 1.0);
        p.color = mix(emitter.color_start, emitter.color_end, life_ratio);

        // Shrink near death
        if life_ratio > 0.8 {
            let shrink = (1.0 - life_ratio) / 0.2;
            p.size = p.size * shrink;
        }
    }

    particles[idx] = p;
}
