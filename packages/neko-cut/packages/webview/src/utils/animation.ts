/**
 * Animation Utilities
 * 动画工具函数
 *
 * Rendering-time animation is handled by neko-engine. This Webview helper only
 * projects easing used by the retained lightweight speed mapping.
 */

import type { EasingType } from '../types/animation';

// =============================================================================
// Easing Functions (internal — rendering uses engine's animation/easing.rs)
// =============================================================================

/** Bounce easing helper — matches Rust Easing::bounce_out exactly */
function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) {
    return n1 * t * t;
  } else if (t < 2 / d1) {
    const t1 = t - 1.5 / d1;
    return n1 * t1 * t1 + 0.75;
  } else if (t < 2.5 / d1) {
    const t1 = t - 2.25 / d1;
    return n1 * t1 * t1 + 0.9375;
  } else {
    const t1 = t - 2.625 / d1;
    return n1 * t1 * t1 + 0.984375;
  }
}

/**
 * Easing function implementations — aligned with engine's 30 types + CubicBezier.
 * Implementations match Rust animation/easing.rs exactly.
 */
const easingFunctions: Record<EasingType, (t: number) => number> = {
  // Linear
  linear: (t) => t,

  // Short aliases (map to Quad)
  'ease-in': (t) => t * t,
  'ease-out': (t) => t * (2 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),

  // Quad
  'ease-in-quad': (t) => t * t,
  'ease-out-quad': (t) => t * (2 - t),
  'ease-in-out-quad': (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),

  // Cubic
  'ease-in-cubic': (t) => t * t * t,
  'ease-out-cubic': (t) => {
    const t1 = t - 1;
    return t1 * t1 * t1 + 1;
  },
  'ease-in-out-cubic': (t) => (t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1),

  // Quart
  'ease-in-quart': (t) => t * t * t * t,
  'ease-out-quart': (t) => {
    const t1 = t - 1;
    return 1 - t1 * t1 * t1 * t1;
  },
  'ease-in-out-quart': (t) => {
    if (t < 0.5) return 8 * t * t * t * t;
    const t1 = t - 1;
    return 1 - 8 * t1 * t1 * t1 * t1;
  },

  // Quint
  'ease-in-quint': (t) => t * t * t * t * t,
  'ease-out-quint': (t) => {
    const t1 = t - 1;
    return t1 * t1 * t1 * t1 * t1 + 1;
  },
  'ease-in-out-quint': (t) => {
    if (t < 0.5) return 16 * t * t * t * t * t;
    const t1 = 2 * t - 2;
    return (t1 * t1 * t1 * t1 * t1 + 2) / 2;
  },

  // Sine
  'ease-in-sine': (t) => 1 - Math.cos((t * Math.PI) / 2),
  'ease-out-sine': (t) => Math.sin((t * Math.PI) / 2),
  'ease-in-out-sine': (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  // Expo
  'ease-in-expo': (t) => (t === 0 ? 0 : Math.pow(2, 10 * (t - 1))),
  'ease-out-expo': (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  'ease-in-out-expo': (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
  },

  // Circ
  'ease-in-circ': (t) => 1 - Math.sqrt(1 - t * t),
  'ease-out-circ': (t) => Math.sqrt(1 - (t - 1) * (t - 1)),
  'ease-in-out-circ': (t) => {
    if (t < 0.5) return (1 - Math.sqrt(1 - 4 * t * t)) / 2;
    const t1 = -2 * t + 2;
    return (Math.sqrt(1 - t1 * t1) + 1) / 2;
  },

  // Back
  'ease-in-back': (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  'ease-out-back': (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const t1 = t - 1;
    return 1 + c3 * t1 * t1 * t1 + c1 * t1 * t1;
  },
  'ease-in-out-back': (t) => {
    const c1 = 1.70158;
    const c2 = c1 * 1.525;
    if (t < 0.5) return (4 * t * t * ((c2 + 1) * 2 * t - c2)) / 2;
    const t1 = 2 * t - 2;
    return (t1 * t1 * ((c2 + 1) * t1 + c2) + 2) / 2;
  },

  // Elastic
  'ease-in-elastic': (t) => {
    const c4 = (2 * Math.PI) / 3;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
  },
  'ease-out-elastic': (t) => {
    const c4 = (2 * Math.PI) / 3;
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  'ease-in-out-elastic': (t) => {
    const c5 = (2 * Math.PI) / 4.5;
    if (t === 0) return 0;
    if (t === 1) return 1;
    if (t < 0.5) return (-Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2;
    return (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
  },

  // Bounce
  'ease-in-bounce': (t) => 1 - bounceOut(1 - t),
  'ease-out-bounce': (t) => bounceOut(t),
  'ease-in-out-bounce': (t) => {
    return t < 0.5 ? (1 - bounceOut(1 - 2 * t)) / 2 : (1 + bounceOut(2 * t - 1)) / 2;
  },

  // Bezier is handled separately via CubicBezierParams
  bezier: (t) => t,
};

/**
 * Apply easing to a progress value
 * 对进度值应用缓动
 */
export function applyEasing(progress: number, easing: EasingType): number {
  const fn = easingFunctions[easing];
  return fn ? fn(progress) : progress;
}
