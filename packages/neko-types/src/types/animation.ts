/**
 * Shared animation/keyframe primitives.
 *
 * This host-agnostic contract is still used by @neko/shared operations.
 * Feature Webviews may keep package-local UI helpers, but L0 shared types must
 * not depend on Webview packages.
 */
// =============================================================================
// Animatable Property System (关键帧动画系统)
// =============================================================================

import { EasingType } from './easing';

/**
 * Bezier handle for custom easing curves
 * 贝塞尔曲线控制点（用于自定义缓动）
 */
export interface BezierHandle {
  /** Time offset relative to keyframe */
  x: number;
  /** Value offset relative to keyframe value */
  y: number;
}

/**
 * Single keyframe with easing
 * 单个关键帧（带缓动）
 */
export interface AnimationKeyframe {
  /** Unique identifier */
  id: string;
  /** Time offset relative to element startTime (seconds) */
  time: number;
  /** Property value at this keyframe */
  value: number;
  /** Easing function to next keyframe */
  easing: EasingType;
  /** Bezier in handle (for bezier easing) */
  bezierIn?: BezierHandle;
  /** Bezier out handle (for bezier easing) */
  bezierOut?: BezierHandle;
}

/**
 * Animatable property with base value and keyframes
 * 可动画属性（包含基础值和关键帧）
 */
export interface AnimatableProperty {
  /** Base value when no keyframes exist */
  baseValue: number;
  /** Keyframes sorted by time */
  keyframes: AnimationKeyframe[];
}

/**
 * Names of animatable properties
 * 可动画属性名称
 */
export type AnimatablePropertyName =
  'x' | 'y' | 'scaleX' | 'scaleY' | 'scale' | 'rotation' | 'opacity' | 'anchorX' | 'anchorY';

/**
 * Element transform with animatable properties
 * 元素变换（支持关键帧动画）
 */
export interface ElementTransform {
  /** Position X (0-1 relative coordinate, 0.5 = center) */
  x: AnimatableProperty;
  /** Position Y (0-1 relative coordinate, 0.5 = center) */
  y: AnimatableProperty;
  /** Scale X (1 = 100%) */
  scaleX: AnimatableProperty;
  /** Scale Y (1 = 100%) */
  scaleY: AnimatableProperty;
  /** Rotation in degrees */
  rotation: AnimatableProperty;
  /** Opacity (0-1) */
  opacity: AnimatableProperty;
  /** Anchor point X (0-1, static) */
  anchorX: number;
  /** Anchor point Y (0-1, static) */
  anchorY: number;
}

/**
 * Computed transform values at a specific time
 * 某一时刻的计算变换值
 */
export interface ComputedTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  anchorX: number;
  anchorY: number;
}

/**
 * Create default animatable property
 */
export function createAnimatableProperty(baseValue: number): AnimatableProperty {
  return { baseValue, keyframes: [] };
}

/**
 * Create default element transform
 */
export function createDefaultElementTransform(): ElementTransform {
  return {
    x: createAnimatableProperty(0.5),
    y: createAnimatableProperty(0.5),
    scaleX: createAnimatableProperty(1),
    scaleY: createAnimatableProperty(1),
    rotation: createAnimatableProperty(0),
    opacity: createAnimatableProperty(1),
    anchorX: 0.5,
    anchorY: 0.5,
  };
}
