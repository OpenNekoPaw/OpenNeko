// =============================================================================
// Easing Functions for GPU Animation
// Shared between WebGPU (browser) and wgpu (Rust)
// =============================================================================

// Constants
const PI: f32 = 3.14159265359;
const C1: f32 = 1.70158;
const C2: f32 = 2.5949095;  // C1 * 1.525
const C3: f32 = 2.70158;    // C1 + 1
const C4: f32 = 2.0943951;  // (2 * PI) / 3
const C5: f32 = 1.3962634;  // (2 * PI) / 4.5

// =============================================================================
// Linear
// =============================================================================

fn ease_linear(t: f32) -> f32 {
    return t;
}

// =============================================================================
// Quad
// =============================================================================

fn ease_in_quad(t: f32) -> f32 {
    return t * t;
}

fn ease_out_quad(t: f32) -> f32 {
    return t * (2.0 - t);
}

fn ease_in_out_quad(t: f32) -> f32 {
    if (t < 0.5) {
        return 2.0 * t * t;
    }
    return -1.0 + (4.0 - 2.0 * t) * t;
}

// =============================================================================
// Cubic
// =============================================================================

fn ease_in_cubic(t: f32) -> f32 {
    return t * t * t;
}

fn ease_out_cubic(t: f32) -> f32 {
    let t1 = t - 1.0;
    return t1 * t1 * t1 + 1.0;
}

fn ease_in_out_cubic(t: f32) -> f32 {
    if (t < 0.5) {
        return 4.0 * t * t * t;
    }
    let t1 = t - 1.0;
    return (t1) * (2.0 * t - 2.0) * (2.0 * t - 2.0) + 1.0;
}

// =============================================================================
// Quart
// =============================================================================

fn ease_in_quart(t: f32) -> f32 {
    return t * t * t * t;
}

fn ease_out_quart(t: f32) -> f32 {
    let t1 = t - 1.0;
    return 1.0 - t1 * t1 * t1 * t1;
}

fn ease_in_out_quart(t: f32) -> f32 {
    if (t < 0.5) {
        return 8.0 * t * t * t * t;
    }
    let t1 = t - 1.0;
    return 1.0 - 8.0 * t1 * t1 * t1 * t1;
}

// =============================================================================
// Quint
// =============================================================================

fn ease_in_quint(t: f32) -> f32 {
    return t * t * t * t * t;
}

fn ease_out_quint(t: f32) -> f32 {
    let t1 = t - 1.0;
    return 1.0 + t1 * t1 * t1 * t1 * t1;
}

fn ease_in_out_quint(t: f32) -> f32 {
    if (t < 0.5) {
        return 16.0 * t * t * t * t * t;
    }
    let t1 = t - 1.0;
    return 1.0 + 16.0 * t1 * t1 * t1 * t1 * t1;
}

// =============================================================================
// Sine
// =============================================================================

fn ease_in_sine(t: f32) -> f32 {
    return 1.0 - cos(t * PI / 2.0);
}

fn ease_out_sine(t: f32) -> f32 {
    return sin(t * PI / 2.0);
}

fn ease_in_out_sine(t: f32) -> f32 {
    return -(cos(PI * t) - 1.0) / 2.0;
}

// =============================================================================
// Expo
// =============================================================================

fn ease_in_expo(t: f32) -> f32 {
    if (t == 0.0) {
        return 0.0;
    }
    return pow(2.0, 10.0 * t - 10.0);
}

fn ease_out_expo(t: f32) -> f32 {
    if (t == 1.0) {
        return 1.0;
    }
    return 1.0 - pow(2.0, -10.0 * t);
}

fn ease_in_out_expo(t: f32) -> f32 {
    if (t == 0.0) {
        return 0.0;
    }
    if (t == 1.0) {
        return 1.0;
    }
    if (t < 0.5) {
        return pow(2.0, 20.0 * t - 10.0) / 2.0;
    }
    return (2.0 - pow(2.0, -20.0 * t + 10.0)) / 2.0;
}

// =============================================================================
// Circ
// =============================================================================

fn ease_in_circ(t: f32) -> f32 {
    return 1.0 - sqrt(1.0 - t * t);
}

fn ease_out_circ(t: f32) -> f32 {
    let t1 = t - 1.0;
    return sqrt(1.0 - t1 * t1);
}

fn ease_in_out_circ(t: f32) -> f32 {
    if (t < 0.5) {
        return (1.0 - sqrt(1.0 - 4.0 * t * t)) / 2.0;
    }
    let t1 = -2.0 * t + 2.0;
    return (sqrt(1.0 - t1 * t1) + 1.0) / 2.0;
}

// =============================================================================
// Back
// =============================================================================

fn ease_in_back(t: f32) -> f32 {
    return C3 * t * t * t - C1 * t * t;
}

fn ease_out_back(t: f32) -> f32 {
    let t1 = t - 1.0;
    return 1.0 + C3 * t1 * t1 * t1 + C1 * t1 * t1;
}

fn ease_in_out_back(t: f32) -> f32 {
    if (t < 0.5) {
        let t2 = 2.0 * t;
        return (t2 * t2 * ((C2 + 1.0) * t2 - C2)) / 2.0;
    }
    let t2 = 2.0 * t - 2.0;
    return (t2 * t2 * ((C2 + 1.0) * t2 + C2) + 2.0) / 2.0;
}

// =============================================================================
// Elastic
// =============================================================================

fn ease_in_elastic(t: f32) -> f32 {
    if (t == 0.0) {
        return 0.0;
    }
    if (t == 1.0) {
        return 1.0;
    }
    return -pow(2.0, 10.0 * t - 10.0) * sin((t * 10.0 - 10.75) * C4);
}

fn ease_out_elastic(t: f32) -> f32 {
    if (t == 0.0) {
        return 0.0;
    }
    if (t == 1.0) {
        return 1.0;
    }
    return pow(2.0, -10.0 * t) * sin((t * 10.0 - 0.75) * C4) + 1.0;
}

fn ease_in_out_elastic(t: f32) -> f32 {
    if (t == 0.0) {
        return 0.0;
    }
    if (t == 1.0) {
        return 1.0;
    }
    if (t < 0.5) {
        return -(pow(2.0, 20.0 * t - 10.0) * sin((20.0 * t - 11.125) * C5)) / 2.0;
    }
    return (pow(2.0, -20.0 * t + 10.0) * sin((20.0 * t - 11.125) * C5)) / 2.0 + 1.0;
}

// =============================================================================
// Bounce
// =============================================================================

fn ease_out_bounce(t: f32) -> f32 {
    let n1 = 7.5625;
    let d1 = 2.75;

    if (t < 1.0 / d1) {
        return n1 * t * t;
    } else if (t < 2.0 / d1) {
        let t1 = t - 1.5 / d1;
        return n1 * t1 * t1 + 0.75;
    } else if (t < 2.5 / d1) {
        let t1 = t - 2.25 / d1;
        return n1 * t1 * t1 + 0.9375;
    }
    let t1 = t - 2.625 / d1;
    return n1 * t1 * t1 + 0.984375;
}

fn ease_in_bounce(t: f32) -> f32 {
    return 1.0 - ease_out_bounce(1.0 - t);
}

fn ease_in_out_bounce(t: f32) -> f32 {
    if (t < 0.5) {
        return (1.0 - ease_out_bounce(1.0 - 2.0 * t)) / 2.0;
    }
    return (1.0 + ease_out_bounce(2.0 * t - 1.0)) / 2.0;
}

// =============================================================================
// Cubic Bezier
// =============================================================================

fn cubic_bezier(t: f32, p1x: f32, p1y: f32, p2x: f32, p2y: f32) -> f32 {
    // Newton-Raphson iteration to find t for x
    var guess = t;
    for (var i = 0; i < 8; i++) {
        let current_x = bezier_sample(guess, p1x, p2x);
        let current_slope = bezier_slope(guess, p1x, p2x);
        if (abs(current_slope) < 0.0001) {
            break;
        }
        guess = guess - (current_x - t) / current_slope;
    }
    return bezier_sample(guess, p1y, p2y);
}

fn bezier_sample(t: f32, p1: f32, p2: f32) -> f32 {
    // B(t) = 3(1-t)²t*P1 + 3(1-t)t²*P2 + t³
    let t2 = t * t;
    let t3 = t2 * t;
    let mt = 1.0 - t;
    let mt2 = mt * mt;
    return 3.0 * mt2 * t * p1 + 3.0 * mt * t2 * p2 + t3;
}

fn bezier_slope(t: f32, p1: f32, p2: f32) -> f32 {
    // B'(t) = 3(1-t)²*P1 + 6(1-t)t*(P2-P1) + 3t²*(1-P2)
    let t2 = t * t;
    let mt = 1.0 - t;
    let mt2 = mt * mt;
    return 3.0 * mt2 * p1 + 6.0 * mt * t * (p2 - p1) + 3.0 * t2 * (1.0 - p2);
}

// =============================================================================
// Easing Selector
// =============================================================================

// Easing type constants
const EASE_LINEAR: u32 = 0u;
const EASE_IN_QUAD: u32 = 1u;
const EASE_OUT_QUAD: u32 = 2u;
const EASE_IN_OUT_QUAD: u32 = 3u;
const EASE_IN_CUBIC: u32 = 4u;
const EASE_OUT_CUBIC: u32 = 5u;
const EASE_IN_OUT_CUBIC: u32 = 6u;
const EASE_IN_QUART: u32 = 7u;
const EASE_OUT_QUART: u32 = 8u;
const EASE_IN_OUT_QUART: u32 = 9u;
const EASE_IN_QUINT: u32 = 10u;
const EASE_OUT_QUINT: u32 = 11u;
const EASE_IN_OUT_QUINT: u32 = 12u;
const EASE_IN_SINE: u32 = 13u;
const EASE_OUT_SINE: u32 = 14u;
const EASE_IN_OUT_SINE: u32 = 15u;
const EASE_IN_EXPO: u32 = 16u;
const EASE_OUT_EXPO: u32 = 17u;
const EASE_IN_OUT_EXPO: u32 = 18u;
const EASE_IN_CIRC: u32 = 19u;
const EASE_OUT_CIRC: u32 = 20u;
const EASE_IN_OUT_CIRC: u32 = 21u;
const EASE_IN_BACK: u32 = 22u;
const EASE_OUT_BACK: u32 = 23u;
const EASE_IN_OUT_BACK: u32 = 24u;
const EASE_IN_ELASTIC: u32 = 25u;
const EASE_OUT_ELASTIC: u32 = 26u;
const EASE_IN_OUT_ELASTIC: u32 = 27u;
const EASE_IN_BOUNCE: u32 = 28u;
const EASE_OUT_BOUNCE: u32 = 29u;
const EASE_IN_OUT_BOUNCE: u32 = 30u;

fn apply_easing(t: f32, easing_type: u32) -> f32 {
    switch (easing_type) {
        case EASE_LINEAR: { return ease_linear(t); }
        case EASE_IN_QUAD: { return ease_in_quad(t); }
        case EASE_OUT_QUAD: { return ease_out_quad(t); }
        case EASE_IN_OUT_QUAD: { return ease_in_out_quad(t); }
        case EASE_IN_CUBIC: { return ease_in_cubic(t); }
        case EASE_OUT_CUBIC: { return ease_out_cubic(t); }
        case EASE_IN_OUT_CUBIC: { return ease_in_out_cubic(t); }
        case EASE_IN_QUART: { return ease_in_quart(t); }
        case EASE_OUT_QUART: { return ease_out_quart(t); }
        case EASE_IN_OUT_QUART: { return ease_in_out_quart(t); }
        case EASE_IN_QUINT: { return ease_in_quint(t); }
        case EASE_OUT_QUINT: { return ease_out_quint(t); }
        case EASE_IN_OUT_QUINT: { return ease_in_out_quint(t); }
        case EASE_IN_SINE: { return ease_in_sine(t); }
        case EASE_OUT_SINE: { return ease_out_sine(t); }
        case EASE_IN_OUT_SINE: { return ease_in_out_sine(t); }
        case EASE_IN_EXPO: { return ease_in_expo(t); }
        case EASE_OUT_EXPO: { return ease_out_expo(t); }
        case EASE_IN_OUT_EXPO: { return ease_in_out_expo(t); }
        case EASE_IN_CIRC: { return ease_in_circ(t); }
        case EASE_OUT_CIRC: { return ease_out_circ(t); }
        case EASE_IN_OUT_CIRC: { return ease_in_out_circ(t); }
        case EASE_IN_BACK: { return ease_in_back(t); }
        case EASE_OUT_BACK: { return ease_out_back(t); }
        case EASE_IN_OUT_BACK: { return ease_in_out_back(t); }
        case EASE_IN_ELASTIC: { return ease_in_elastic(t); }
        case EASE_OUT_ELASTIC: { return ease_out_elastic(t); }
        case EASE_IN_OUT_ELASTIC: { return ease_in_out_elastic(t); }
        case EASE_IN_BOUNCE: { return ease_in_bounce(t); }
        case EASE_OUT_BOUNCE: { return ease_out_bounce(t); }
        case EASE_IN_OUT_BOUNCE: { return ease_in_out_bounce(t); }
        default: { return t; }
    }
}

// =============================================================================
// Interpolation Helpers
// =============================================================================

fn lerp_with_easing(a: f32, b: f32, t: f32, easing_type: u32) -> f32 {
    let eased_t = apply_easing(t, easing_type);
    return a + (b - a) * eased_t;
}

fn lerp_vec2_with_easing(a: vec2<f32>, b: vec2<f32>, t: f32, easing_type: u32) -> vec2<f32> {
    let eased_t = apply_easing(t, easing_type);
    return a + (b - a) * eased_t;
}

fn lerp_vec3_with_easing(a: vec3<f32>, b: vec3<f32>, t: f32, easing_type: u32) -> vec3<f32> {
    let eased_t = apply_easing(t, easing_type);
    return a + (b - a) * eased_t;
}

fn lerp_vec4_with_easing(a: vec4<f32>, b: vec4<f32>, t: f32, easing_type: u32) -> vec4<f32> {
    let eased_t = apply_easing(t, easing_type);
    return a + (b - a) * eased_t;
}
