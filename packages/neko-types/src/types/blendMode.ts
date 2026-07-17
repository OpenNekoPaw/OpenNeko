// =============================================================================
// Blend Modes — Aligned with Engine (gpu/compositor.rs)
//
// Authority: packages/neko-proto/timeline.proto → BlendMode
// Engine supports exactly 27 blend modes matching Photoshop/Web standards.
// =============================================================================

/**
 * Blend mode types matching the engine's BlendMode enum (27 modes).
 * Organized by group: Basic, Darken, Lighten, Contrast, Difference, HSL.
 */
export type BlendModeType =
  // Basic
  | 'normal'
  | 'dissolve'
  // Darken Group
  | 'darken'
  | 'multiply'
  | 'colorBurn'
  | 'linearBurn'
  | 'darkerColor'
  // Lighten Group
  | 'lighten'
  | 'screen'
  | 'colorDodge'
  | 'linearDodge'
  | 'lighterColor'
  // Contrast Group
  | 'overlay'
  | 'softLight'
  | 'hardLight'
  | 'vividLight'
  | 'linearLight'
  | 'pinLight'
  | 'hardMix'
  // Difference Group
  | 'difference'
  | 'exclusion'
  | 'subtract'
  | 'divide'
  // HSL Group
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

/**
 * CSS/WebGL-compatible blend mode subset (12 modes, kebab-case).
 * Used by 2D canvas renderers (neko-sketch WebGL compositor).
 * Distinct from BlendModeType which uses camelCase for the Rust engine protocol.
 */
export type SketchBlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';
