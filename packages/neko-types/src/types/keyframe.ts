/**
 * Shared keyframe operation primitives.
 *
 * This host-agnostic contract is consumed by @neko/shared operations. Feature
 * Webviews can project these values into richer package-local editor state.
 */
// =============================================================================
// Keyframes (关键帧轨道)
// =============================================================================

import { EasingType } from './easing';

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
