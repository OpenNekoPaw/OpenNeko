// =============================================================================
// Easing Types — Aligned with Engine (animation/easing.rs)
//
// Authority: packages/neko-proto/timeline.proto → EasingType
// Engine supports 30 named easing types + CubicBezier(x1,y1,x2,y2).
// =============================================================================

/**
 * Easing function types matching the engine's EasingType enum.
 *
 * 30 named types organized by curve family:
 * - Linear (1)
 * - Quad (3): ease-in/out/in-out
 * - Cubic (3)
 * - Quart (3)
 * - Quint (3)
 * - Sine (3)
 * - Expo (3)
 * - Circ (3)
 * - Back (3)
 * - Elastic (3)
 * - Bounce (3)
 * - CubicBezier (custom)
 *
 * Plus UI shorthand aliases.
 */
export type EasingType =
  // Linear
  | 'linear'
  // Quad
  | 'ease-in-quad'
  | 'ease-out-quad'
  | 'ease-in-out-quad'
  // Cubic
  | 'ease-in-cubic'
  | 'ease-out-cubic'
  | 'ease-in-out-cubic'
  // Quart
  | 'ease-in-quart'
  | 'ease-out-quart'
  | 'ease-in-out-quart'
  // Quint
  | 'ease-in-quint'
  | 'ease-out-quint'
  | 'ease-in-out-quint'
  // Sine
  | 'ease-in-sine'
  | 'ease-out-sine'
  | 'ease-in-out-sine'
  // Expo
  | 'ease-in-expo'
  | 'ease-out-expo'
  | 'ease-in-out-expo'
  // Circ
  | 'ease-in-circ'
  | 'ease-out-circ'
  | 'ease-in-out-circ'
  // Back
  | 'ease-in-back'
  | 'ease-out-back'
  | 'ease-in-out-back'
  // Elastic
  | 'ease-in-elastic'
  | 'ease-out-elastic'
  | 'ease-in-out-elastic'
  // Bounce
  | 'ease-in-bounce'
  | 'ease-out-bounce'
  | 'ease-in-out-bounce'
  // Custom cubic bezier
  | 'bezier'
  // UI shorthand aliases (mapped to engine equivalents)
  | 'ease-in' // → ease-in-quad
  | 'ease-out' // → ease-out-quad
  | 'ease-in-out'; // → ease-in-out-quad

/**
 * Cubic bezier control points for custom easing.
 * Used when EasingType is 'bezier'.
 * Matches engine's CubicBezier(x1, y1, x2, y2).
 */
export interface CubicBezierParams {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
