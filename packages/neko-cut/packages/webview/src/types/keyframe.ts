/**
 * Keyframe Types - Keyframe track system
 * 关键帧轨道类型定义
 *
 * Canonical source for UI keyframe types.
 * Only EasingType is imported from @neko/shared (engine type).
 */

import type { EasingType } from '@neko/shared';

// =============================================================================
// Keyframe Core Types (migrated from neko-types)
// =============================================================================

/** Keyframeable property types */
export type KeyframeableProperty =
  | 'opacity'
  | 'x'
  | 'y'
  | 'scaleX'
  | 'scaleY'
  | 'rotation'
  | 'volume'
  | 'exposure'
  | 'contrast'
  | 'saturation';

/** Single keyframe */
export interface Keyframe {
  /** Time offset from element start (seconds) */
  time: number;
  /** Value at this keyframe */
  value: number;
  /** Easing function to next keyframe */
  easing: EasingType;
  /** Bezier control points for custom easing */
  bezierHandles?: {
    outX: number;
    outY: number;
    inX: number;
    inY: number;
  };
}

/** Keyframe track for a specific property */
export interface KeyframeTrack {
  /** Property being animated */
  property: KeyframeableProperty;
  /** Keyframes sorted by time */
  keyframes: Keyframe[];
}
