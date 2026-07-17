/**
 * Animation Utilities
 * 动画工具函数
 *
 * UI-layer animation helpers for keyframe interpolation and transform computation.
 * Rendering-time animation is handled by neko-engine (animation/easing.rs, keyframe.rs).
 * These functions are for UI state queries (e.g., PropertyPanel keyframe indicators,
 * PreviewPanel composite transform overlay).
 */

import type {
  EasingType,
  AnimationKeyframe,
  AnimatableProperty,
  ElementTransform,
  ComputedTransform,
} from '../types/animation';

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

// =============================================================================
// Bezier Interpolation (internal)
// =============================================================================

/**
 * Cubic bezier interpolation
 * 三次贝塞尔插值
 */
function cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

// =============================================================================
// Keyframe Value Calculation
// =============================================================================

/**
 * Binary search to find the pair of keyframes surrounding a given time
 * 二分查找包围给定时间的关键帧对
 *
 * @param sortedKeyframes - Pre-sorted array of keyframes
 * @param time - Time to search for
 * @returns Index of the keyframe before the given time, or -1 if before all keyframes
 */
function findKeyframeIndex(sortedKeyframes: AnimationKeyframe[], time: number): number {
  if (sortedKeyframes.length === 0) return -1;

  if (time <= sortedKeyframes[0]!.time) return -1;
  if (time >= sortedKeyframes[sortedKeyframes.length - 1]!.time) return sortedKeyframes.length - 1;

  let left = 0;
  let right = sortedKeyframes.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);

    if (
      sortedKeyframes[mid]!.time <= time &&
      (mid === sortedKeyframes.length - 1 || sortedKeyframes[mid + 1]!.time > time)
    ) {
      return mid;
    }

    if (sortedKeyframes[mid]!.time > time) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }

  return left - 1;
}

/**
 * Check if keyframes array is already sorted
 * 检查关键帧数组是否已排序
 */
function isSorted(keyframes: AnimationKeyframe[]): boolean {
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i]!.time > keyframes[i + 1]!.time) {
      return false;
    }
  }
  return true;
}

/**
 * Get the animated value of a property at a specific time
 * 获取属性在指定时间的动画值
 *
 * @param property - The animatable property
 * @param localTime - Time relative to element start (in seconds)
 * @returns The interpolated value at the given time
 */
function getAnimatedValue(property: AnimatableProperty, localTime: number): number {
  // Guard against undefined/null property
  if (!property) {
    return 0;
  }

  const { baseValue, keyframes } = property;

  // No keyframes - return base value
  if (!keyframes || keyframes.length === 0) {
    return baseValue;
  }

  // Only sort if needed (preserve original array if possible)
  const sorted = isSorted(keyframes) ? keyframes : [...keyframes].sort((a, b) => a.time - b.time);

  // Before first keyframe
  if (localTime <= sorted[0]!.time) {
    return sorted[0]!.value;
  }

  // After last keyframe
  if (localTime >= sorted[sorted.length - 1]!.time) {
    return sorted[sorted.length - 1]!.value;
  }

  // Binary search for surrounding keyframes (O(log n) instead of O(n))
  const prevIndex = findKeyframeIndex(sorted, localTime);
  const prevFrame = sorted[prevIndex]!;
  const nextFrame = sorted[prevIndex + 1]!;

  // Calculate interpolation progress
  const duration = nextFrame.time - prevFrame.time;
  const progress = duration > 0 ? (localTime - prevFrame.time) / duration : 0;

  // Apply bezier or standard easing
  if (prevFrame.easing === 'bezier' && prevFrame.bezierOut && nextFrame.bezierIn) {
    return cubicBezier(
      progress,
      prevFrame.value,
      prevFrame.value + prevFrame.bezierOut.y,
      nextFrame.value + nextFrame.bezierIn.y,
      nextFrame.value,
    );
  } else {
    const easedProgress = applyEasing(progress, prevFrame.easing);
    return prevFrame.value + (nextFrame.value - prevFrame.value) * easedProgress;
  }
}

/**
 * Get element transform at a specific local time
 * 获取元素在指定局部时间的变换
 *
 * @param transform - Element transform with animatable properties
 * @param localTime - Time relative to element start (in seconds)
 * @returns Computed transform values
 */
export function getComputedTransform(
  transform: ElementTransform | undefined,
  localTime: number,
): ComputedTransform {
  // Default transform when none provided
  if (!transform) {
    return {
      x: 0.5,
      y: 0.5,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      opacity: 1,
      anchorX: 0.5,
      anchorY: 0.5,
    };
  }

  // Compute animated values for each property
  return {
    x: getAnimatedValue(transform.x, localTime),
    y: getAnimatedValue(transform.y, localTime),
    scaleX: getAnimatedValue(transform.scaleX, localTime),
    scaleY: getAnimatedValue(transform.scaleY, localTime),
    rotation: getAnimatedValue(transform.rotation, localTime),
    opacity: getAnimatedValue(transform.opacity, localTime),
    anchorX: transform.anchorX,
    anchorY: transform.anchorY,
  };
}

// =============================================================================
// Keyframe Query (UI state)
// =============================================================================

/**
 * Get keyframe at specific time (within tolerance)
 * 获取指定时间的关键帧（在容差范围内）
 */
export function getKeyframeAtTime(
  property: AnimatableProperty,
  time: number,
  tolerance: number = 0.01,
): AnimationKeyframe | undefined {
  if (!property || !property.keyframes) {
    return undefined;
  }

  return property.keyframes.find((kf) => Math.abs(kf.time - time) <= tolerance);
}
