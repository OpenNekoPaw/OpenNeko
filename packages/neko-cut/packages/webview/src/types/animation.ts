/**
 * Animation Types - Keyframe animation system
 * 关键帧动画系统类型定义
 *
 * Canonical source for UI animation types.
 * Only EasingType is re-exported from @neko/shared (engine type).
 */

// =============================================================================
// Engine Type Re-export (not migrated)
// =============================================================================

export type { EasingType } from '@neko/shared';

import type { EasingType } from '@neko/shared';

// =============================================================================
// Animation Core Types (migrated from neko-types)
// =============================================================================

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

// =============================================================================
// Webview-Specific Extensions: i18n Keys
// =============================================================================

/**
 * Easing type translation keys for i18n
 * 缓动类型的翻译键
 */
export const EASING_TYPE_I18N_KEYS: Record<EasingType, string> = {
  linear: 'animation.easing.linear',
  // Short aliases
  'ease-in': 'animation.easing.easeIn',
  'ease-out': 'animation.easing.easeOut',
  'ease-in-out': 'animation.easing.easeInOut',
  // Quad
  'ease-in-quad': 'animation.easing.easeInQuad',
  'ease-out-quad': 'animation.easing.easeOutQuad',
  'ease-in-out-quad': 'animation.easing.easeInOutQuad',
  // Cubic
  'ease-in-cubic': 'animation.easing.easeInCubic',
  'ease-out-cubic': 'animation.easing.easeOutCubic',
  'ease-in-out-cubic': 'animation.easing.easeInOutCubic',
  // Quart
  'ease-in-quart': 'animation.easing.easeInQuart',
  'ease-out-quart': 'animation.easing.easeOutQuart',
  'ease-in-out-quart': 'animation.easing.easeInOutQuart',
  // Quint
  'ease-in-quint': 'animation.easing.easeInQuint',
  'ease-out-quint': 'animation.easing.easeOutQuint',
  'ease-in-out-quint': 'animation.easing.easeInOutQuint',
  // Sine
  'ease-in-sine': 'animation.easing.easeInSine',
  'ease-out-sine': 'animation.easing.easeOutSine',
  'ease-in-out-sine': 'animation.easing.easeInOutSine',
  // Expo
  'ease-in-expo': 'animation.easing.easeInExpo',
  'ease-out-expo': 'animation.easing.easeOutExpo',
  'ease-in-out-expo': 'animation.easing.easeInOutExpo',
  // Circ
  'ease-in-circ': 'animation.easing.easeInCirc',
  'ease-out-circ': 'animation.easing.easeOutCirc',
  'ease-in-out-circ': 'animation.easing.easeInOutCirc',
  // Back
  'ease-in-back': 'animation.easing.easeInBack',
  'ease-out-back': 'animation.easing.easeOutBack',
  'ease-in-out-back': 'animation.easing.easeInOutBack',
  // Elastic
  'ease-in-elastic': 'animation.easing.easeInElastic',
  'ease-out-elastic': 'animation.easing.easeOutElastic',
  'ease-in-out-elastic': 'animation.easing.easeInOutElastic',
  // Bounce
  'ease-in-bounce': 'animation.easing.easeInBounce',
  'ease-out-bounce': 'animation.easing.easeOutBounce',
  'ease-in-out-bounce': 'animation.easing.easeInOutBounce',
  // Bezier
  bezier: 'animation.easing.bezier',
};

/**
 * Property name translation keys for i18n
 * 属性名称的翻译键
 */
export const ANIMATABLE_PROPERTY_I18N_KEYS: Record<AnimatablePropertyName, string> = {
  x: 'animation.property.positionX',
  y: 'animation.property.positionY',
  scaleX: 'animation.property.scaleX',
  scaleY: 'animation.property.scaleY',
  scale: 'animation.property.scale',
  rotation: 'animation.property.rotation',
  opacity: 'animation.property.opacity',
  anchorX: 'animation.property.anchorX',
  anchorY: 'animation.property.anchorY',
};

// =============================================================================
// Webview-Specific Extensions: Factory Functions
// =============================================================================

/**
 * Create a keyframe with default values
 * 创建具有默认值的关键帧
 */
export function createKeyframe(
  time: number,
  value: number,
  easing: EasingType = 'linear',
): AnimationKeyframe {
  return {
    id: `kf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    time,
    value,
    easing,
  };
}

// =============================================================================
// Webview-Specific Extensions: Keyframe Selection
// =============================================================================

/**
 * Keyframe selection reference
 * 关键帧选择引用
 */
export interface KeyframeSelection {
  trackId: string;
  elementId: string;
  propertyName: AnimatablePropertyName;
  keyframeId: string;
}
