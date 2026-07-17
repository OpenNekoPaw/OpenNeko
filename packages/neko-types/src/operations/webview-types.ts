// =============================================================================
// WebviewElement — TimelineElement + UI-only fields
//
// These fields exist in the webview Store and are never serialized to the engine.
// Used in operations/ to avoid `as any` when accessing UI-extended element state.
// =============================================================================

import type { TimelineElement } from '../types/element';
import type { Keyframe } from '../types/keyframe';
import type { MaskInstance } from '../types/mask';
import type { ShapeInstance } from '../types/shape';

/**
 * A keyframe-animatable property track.
 * Used by animTransform (transform/audio property animations in the webview).
 */
export interface AnimatablePropertyTrack {
  baseValue: number;
  keyframes: Keyframe[];
}

/**
 * WebviewElement — TimelineElement extended with UI-only fields.
 *
 * Represents the element shape as it exists in the webview Store,
 * where engine fields and UI-only state coexist.
 *
 * Key design choices:
 * - Intersection type (not subclass) preserves discriminated-union narrowing on `type`
 * - Never sent to the engine; only used within the operations/ module
 */
export type WebviewElement = TimelineElement & {
  /** Per-property animated tracks, keyed by AnimatablePropertyName (e.g. "x", "y") */
  animTransform?: Record<string, AnimatablePropertyTrack>;
  /** Mask instances — pending engine support */
  masks?: MaskInstance[];
  /** Shape instances — ShapeElement webview extension */
  shapes?: ShapeInstance[];
};
