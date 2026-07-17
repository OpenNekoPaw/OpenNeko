// =============================================================================
// Transform — Aligned with Engine (domain/transform.rs)
//
// Authority: packages/neko-proto/timeline.proto → Transform
// Engine fields: x, y, scaleX, scaleY, rotation, anchorX, anchorY
// NOTE: opacity is NOT part of Transform in the engine; it's a separate
//       field on Element. See Element.opacity.
// =============================================================================

import type { EngineTransform } from '../generated/timeline.engine';

// Compile-time drift detection: ensure EngineTransform keys ⊆ Transform keys
type _Drift = Exclude<keyof EngineTransform, keyof Transform>;
type _AssertNoDrift = _Drift extends never
  ? true
  : { error: 'EngineTransform has new fields not in Transform'; fields: _Drift };
const _checkTransform: _AssertNoDrift = true;
void _checkTransform;

/**
 * 2D Transform aligned with engine's Transform struct.
 *
 * Coordinate semantics:
 * - x, y: position (pixels or normalized, context-dependent)
 * - scaleX, scaleY: scale factors (1.0 = 100%)
 * - rotation: degrees
 * - anchorX, anchorY: anchor point (0.0-1.0 normalized)
 *
 * Engine default: {x:0, y:0, scaleX:1, scaleY:1, rotation:0, anchorX:0, anchorY:0}
 */
export interface Transform {
  /** Position X (pixels or normalized, depends on context) */
  x: number;
  /** Position Y (pixels or normalized, depends on context) */
  y: number;
  /** Scale X (1.0 = 100%) */
  scaleX: number;
  /** Scale Y (1.0 = 100%) */
  scaleY: number;
  /** Rotation in degrees */
  rotation: number;
  /** Anchor point X (0.0 = left, 0.5 = center, 1.0 = right) */
  anchorX: number;
  /** Anchor point Y (0.0 = top, 0.5 = center, 1.0 = bottom) */
  anchorY: number;
}

/**
 * Engine-aligned default transform.
 * Matches Rust Transform::default() exactly.
 */
export const ENGINE_DEFAULT_TRANSFORM: Transform = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0,
  anchorY: 0,
};

/**
 * Centered transform using normalized coordinates.
 * Matches Rust Transform::centered() — element placed at canvas center.
 *
 * Used by TS-side code that works in normalized coordinate space (0-1),
 * where (0.5, 0.5) = canvas center. The JviProjectLoader converts to
 * pixel coordinates before sending to the engine.
 */
export const CENTERED_TRANSFORM: Transform = {
  x: 0.5,
  y: 0.5,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};
