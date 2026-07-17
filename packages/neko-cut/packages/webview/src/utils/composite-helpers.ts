/**
 * Composite Helpers — Convert UI mask/effect/transition data to CompositeLayerConfig format
 *
 * Bridges the gap between webview-local types (MaskInstance, EffectInstance)
 * and the engine-compatible composite types (CompositeMask, CompositeEffect, CompositeTransition).
 */

import type {
  CompositeMask,
  CompositeMaskShape,
  CompositeEffect,
  CompositeLayerConfig,
} from '@neko/shared';
import type { MaskInstance, MaskShape } from '../types/mask';
import { getComputedMaskAtTime } from '../types/mask';
import type {
  ColorCorrection,
  ColorWheelValue,
  HSLColorRange,
  CurvePoint,
  CurvesAdjustment,
} from '../types/colorCorrection';
import {
  DEFAULT_BASIC_COLOR_ADJUSTMENT,
  DEFAULT_COLOR_WHEEL_VALUE,
  DEFAULT_COLOR_WHEELS_PARAMS,
  DEFAULT_HSL_RANGE,
} from '../types/colorCorrection';
import type { EffectInstance } from '@neko/shared';

/**
 * Convert MaskInstance[] to CompositeMask[] for engine rendering.
 * Evaluates mask animations at the given local time and converts
 * shapes to the engine-compatible geometry format.
 */
export function buildCompositeMasks(masks: MaskInstance[], localTime: number): CompositeMask[] {
  return masks
    .filter((m) => m.enabled)
    .sort((a, b) => a.order - b.order)
    .map((mask) => {
      const computed = getComputedMaskAtTime(mask, localTime);
      return {
        shape: convertMaskShape(computed.shape),
        inverted: mask.inverted,
        feather: computed.feather,
        expansion: computed.expansion,
        opacity: computed.opacity,
        blendMode: mask.blendMode,
      };
    });
}

/**
 * Detect and apply transitions between adjacent layers on the same track.
 *
 * When element A has transitionOut and element B has transitionIn,
 * the overlap region creates a transition. This function annotates
 * the affected layers with CompositeTransition data.
 *
 * @param layers - Mutable layers array (modified in place)
 * @param trackElements - Elements sorted by startTime within each track
 * @param time - Current timeline time
 */
export function applyTransitions(
  layers: CompositeLayerConfig[],
  trackElements: Array<{
    elements: Array<{
      id: string;
      startTime: number;
      duration: number;
      transitionIn?: { type: string; duration: number; easing?: string };
      transitionOut?: { type: string; duration: number; easing?: string };
    }>;
  }>,
  time: number,
): void {
  // Build elementId → layer index map for O(1) lookup
  const idToLayerIdx = new Map<string, number>();
  layers.forEach((l, idx) => {
    if (l.elementId) idToLayerIdx.set(l.elementId, idx);
  });

  // Track-level: check adjacent pairs for transition overlap
  for (const track of trackElements) {
    for (let i = 0; i < track.elements.length - 1; i++) {
      const elemA = track.elements[i];
      const elemB = track.elements[i + 1];
      if (!elemA || !elemB) continue;

      const transOut = elemA.transitionOut;
      const transIn = elemB.transitionIn;

      // Use the transition that exists (prefer outgoing)
      const trans = transOut ?? transIn;
      if (!trans) continue;

      const transitionDuration = trans.duration;
      const overlapStart = elemB.startTime;
      const overlapEnd = overlapStart + transitionDuration;

      // Check if current time is within the transition window
      if (time < overlapStart || time >= overlapEnd) continue;

      const progress = (time - overlapStart) / transitionDuration;

      // Find the corresponding layers by element ID
      const layerAIdx = idToLayerIdx.get(elemA.id);
      const layerBIdx = idToLayerIdx.get(elemB.id);

      if (layerAIdx !== undefined && layerBIdx !== undefined) {
        const layerA = layers[layerAIdx];
        if (layerA) {
          layerA.transition = {
            type: trans.type,
            progress,
            pairedLayerIndex: layerBIdx,
            easing: trans.easing ?? 'linear',
          };
        }
      }
    }
  }
}

/**
 * Convert webview MaskShape to engine CompositeMaskShape.
 * Maps between the UI shape types and the engine-compatible geometry format.
 */
function convertMaskShape(shape: MaskShape): CompositeMaskShape {
  switch (shape.type) {
    case 'rectangle':
      return {
        type: 'rectangle',
        centerX: shape.centerX,
        centerY: shape.centerY,
        width: shape.width,
        height: shape.height,
        rotation: shape.rotation,
        cornerRadius: shape.cornerRadius,
      };
    case 'ellipse':
      return {
        type: 'ellipse',
        centerX: shape.centerX,
        centerY: shape.centerY,
        width: shape.width,
        height: shape.height,
        rotation: shape.rotation,
      };
    case 'polygon':
      return {
        type: 'polygon',
        points: shape.points.map((p) => ({ x: p.x, y: p.y })),
      };
    case 'bezier':
      return {
        type: 'bezier',
        controlPoints: shape.points.map((p) => ({
          position: { x: p.anchor.x, y: p.anchor.y },
          handleIn: { x: p.handleIn.x, y: p.handleIn.y },
          handleOut: { x: p.handleOut.x, y: p.handleOut.y },
        })),
        closed: shape.closed,
      };
  }
}

// =============================================================================
// Color Wheel Helpers
// =============================================================================

/**
 * Convert a ColorWheelValue (hue/saturation/luminance) to RGB color for the shader.
 * The shader expects RGB where 0.5 = neutral (no color shift).
 * hue: -180..180 degrees, saturation: 0..200 (100=neutral), luminance: -100..100
 */
function colorWheelToRgb(v: ColorWheelValue): [number, number, number] {
  const def = DEFAULT_COLOR_WHEEL_VALUE;
  // If at default, return neutral (0.5, 0.5, 0.5)
  if (v.hue === def.hue && v.saturation === def.saturation) {
    return [0.5, 0.5, 0.5];
  }

  // Convert hue (degrees) to 0-1 range, saturation to 0-1 intensity
  const h = (((v.hue % 360) + 360) % 360) / 360;
  const s = Math.max(0, v.saturation - 100) / 100; // 100=neutral→0, 200→1.0

  // HSL to RGB with L=0.5 (pure color), then scale by saturation and bias to 0.5-centered
  const q = 0.5 + 0.5 * s;
  const p = 2 * 0.5 - q;

  const hueToRgb = (t: number): number => {
    let t1 = t;
    if (t1 < 0) t1 += 1;
    if (t1 > 1) t1 -= 1;
    if (t1 < 1 / 6) return p + (q - p) * 6 * t1;
    if (t1 < 1 / 2) return q;
    if (t1 < 2 / 3) return p + (q - p) * (2 / 3 - t1) * 6;
    return p;
  };

  return [hueToRgb(h + 1 / 3), hueToRgb(h), hueToRgb(h - 1 / 3)];
}

/** Check if a ColorWheelValue is at identity (no change) */
function isColorWheelIdentity(v: ColorWheelValue): boolean {
  const def = DEFAULT_COLOR_WHEEL_VALUE;
  return v.hue === def.hue && v.saturation === def.saturation && v.luminance === def.luminance;
}

/** Check if all color wheels are at identity */
function isColorWheelsIdentity(cw: typeof DEFAULT_COLOR_WHEELS_PARAMS): boolean {
  return (
    isColorWheelIdentity(cw.shadows) &&
    isColorWheelIdentity(cw.midtones) &&
    isColorWheelIdentity(cw.highlights) &&
    isColorWheelIdentity(cw.global)
  );
}

// =============================================================================
// Curves Helpers
// =============================================================================

const CURVE_LUT_SIZE = 256;

/**
 * Evaluate a Catmull-Rom spline curve at evenly spaced x positions,
 * producing a 256-entry LUT (0.0..1.0 output for each 0..255 input).
 */
function evaluateCurveToLUT(points: CurvePoint[]): number[] {
  if (points.length < 2) {
    // Identity curve
    return Array.from({ length: CURVE_LUT_SIZE }, (_, i) => i / (CURVE_LUT_SIZE - 1));
  }

  const sorted = [...points].sort((a, b) => a.x - b.x);
  const lut = new Array<number>(CURVE_LUT_SIZE);

  for (let i = 0; i < CURVE_LUT_SIZE; i++) {
    const x = i / (CURVE_LUT_SIZE - 1);

    // Find surrounding segment
    if (x <= sorted[0].x) {
      lut[i] = sorted[0].y;
      continue;
    }
    if (x >= sorted[sorted.length - 1].x) {
      lut[i] = sorted[sorted.length - 1].y;
      continue;
    }

    // Find segment index
    let seg = 0;
    for (let j = 0; j < sorted.length - 1; j++) {
      if (sorted[j].x <= x && sorted[j + 1].x > x) {
        seg = j;
        break;
      }
    }

    // Catmull-Rom interpolation using 4 control points
    const p0 = sorted[Math.max(0, seg - 1)];
    const p1 = sorted[seg];
    const p2 = sorted[seg + 1];
    const p3 = sorted[Math.min(sorted.length - 1, seg + 2)];

    const dx = p2.x - p1.x;
    const t = dx > 0 ? (x - p1.x) / dx : 0;
    const t2 = t * t;
    const t3 = t2 * t;

    // Catmull-Rom basis (tau = 0.5)
    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

    lut[i] = Math.max(0, Math.min(1, y));
  }

  return lut;
}

/** Check if a curve is identity (just 2 corner points, no modification) */
function isCurveIdentity(points: CurvePoint[]): boolean {
  if (points.length !== 2) return false;
  const sorted = [...points].sort((a, b) => a.x - b.x);
  return (
    Math.abs(sorted[0].x) < 0.01 &&
    Math.abs(sorted[0].y) < 0.01 &&
    Math.abs(sorted[1].x - 1) < 0.01 &&
    Math.abs(sorted[1].y - 1) < 0.01
  );
}

/** Check if all curves are at identity (no modification) */
function isCurvesIdentity(curves: CurvesAdjustment): boolean {
  if (curves.rgb.enabled && !isCurveIdentity(curves.rgb.points)) return false;
  if (curves.red.enabled && !isCurveIdentity(curves.red.points)) return false;
  if (curves.green.enabled && !isCurveIdentity(curves.green.points)) return false;
  if (curves.blue.enabled && !isCurveIdentity(curves.blue.points)) return false;
  if (curves.luma.enabled && !isCurveIdentity(curves.luma.points)) return false;
  return true;
}

// =============================================================================
// HSL Helpers
// =============================================================================

/** Target hue (0-1, normalized) for each HSL color range — matches shader get_hue_weight */
const HSL_TARGET_HUES: Record<HSLColorRange, number> = {
  red: 0.0,
  orange: 1.0 / 12.0, // 30°
  yellow: 1.0 / 6.0, // 60°
  green: 2.0 / 6.0, // 120°
  cyan: 3.0 / 6.0, // 180°
  blue: 4.0 / 6.0, // 240°
  purple: 5.0 / 6.0, // 300°
  magenta: 11.0 / 12.0, // 330°
};

/** Check if all HSL ranges are at identity */
function isHSLIdentity(hsl: ColorCorrection['hsl']): boolean {
  const def = DEFAULT_HSL_RANGE;
  for (const range of Object.values(hsl)) {
    if (
      range.hue !== def.hue ||
      range.saturation !== def.saturation ||
      range.luminance !== def.luminance
    ) {
      return false;
    }
  }
  return true;
}

// =============================================================================
// Color Correction → CompositeEffect
// =============================================================================

/**
 * Convert ColorCorrection parameters to a CompositeEffect for engine rendering.
 * Maps UI ranges to engine ranges. Returns null if all values are at identity.
 *
 * Supported:
 * - Basic adjustments (13 params) → engine ColorCorrectionParams
 * - Color wheels (shadows/midtones/highlights) → engine apply_color_wheel shader
 * - HSL per-color (8 ranges × 3 params) → engine apply_hsl_adjustment shader
 *
 */
export function colorCorrectionToCompositeEffect(cc: ColorCorrection): CompositeEffect | null {
  if (!cc.enabled) return null;

  const b = cc.basic;
  const def = DEFAULT_BASIC_COLOR_ADJUSTMENT;

  // Check if all basic params are at default (identity)
  const isBasicIdentity =
    b.brightness === def.brightness &&
    b.exposure === def.exposure &&
    b.contrast === def.contrast &&
    b.highlights === def.highlights &&
    b.shadows === def.shadows &&
    b.whites === def.whites &&
    b.blacks === def.blacks &&
    b.temperature === def.temperature &&
    b.tint === def.tint &&
    b.saturation === def.saturation &&
    b.vibrance === def.vibrance &&
    b.gamma === def.gamma &&
    b.hueShift === def.hueShift;

  const cwIdentity = isColorWheelsIdentity(cc.colorWheels);
  const hslIdentity = isHSLIdentity(cc.hsl);
  const curvesIdentity = isCurvesIdentity(cc.curves);
  const lutActive = cc.lut.enabled && cc.lut.lutId !== null;

  // All at identity — no effect needed
  if (isBasicIdentity && cwIdentity && hslIdentity && curvesIdentity && !lutActive) return null;

  // Build parameters
  const parameters: Record<string, number | string | boolean> = {
    // Basic: Map UI ranges to engine ranges
    brightness: b.brightness / 100, // -100..100 → -1.0..1.0
    exposure: b.exposure, // -5..5 → -5.0..5.0 (already engine range)
    contrast: 1.0 + b.contrast / 100, // -100..100 → 0.0..2.0 (1.0 = no change)
    highlights: b.highlights / 100, // -100..100 → -1.0..1.0
    shadows: b.shadows / 100, // -100..100 → -1.0..1.0
    whites: b.whites / 100, // -100..100 → -1.0..1.0
    blacks: b.blacks / 100, // -100..100 → -1.0..1.0
    temperature: b.temperature / 100, // -100..100 → -1.0..1.0
    tint: b.tint / 100, // -100..100 → -1.0..1.0
    saturation: 1.0 + b.saturation / 100, // -100..100 → 0.0..2.0 (1.0 = no change)
    vibrance: b.vibrance / 100, // -100..100 → -1.0..1.0
    gamma: b.gamma, // 0.1..3.0 → 0.1..3.0 (already engine range)
    hueShift: b.hueShift, // -180..180 → -180..180 (already engine range)
  };

  // Color Wheels: Convert HSL wheel values to RGB color + brightness for shader
  if (!cwIdentity) {
    // Apply global wheel by blending into each sub-wheel
    const cw = cc.colorWheels;
    const wheels = [
      { prefix: 'cw_shadows', value: cw.shadows },
      { prefix: 'cw_midtones', value: cw.midtones },
      { prefix: 'cw_highlights', value: cw.highlights },
    ] as const;

    for (const { prefix, value } of wheels) {
      // Combine with global: add global's hue/sat offsets
      const combined: ColorWheelValue = {
        hue: value.hue + cw.global.hue,
        saturation: value.saturation + (cw.global.saturation - 100), // global sat offset
        luminance: value.luminance + cw.global.luminance,
      };

      const [r, g, b2] = colorWheelToRgb(combined);
      parameters[`${prefix}_r`] = r;
      parameters[`${prefix}_g`] = g;
      parameters[`${prefix}_b`] = b2;
      parameters[`${prefix}_brightness`] = combined.luminance / 100; // -100..100 → -1.0..1.0
    }

    parameters['cw_enabled'] = true;
  }

  // HSL per-color adjustments: 8 ranges × (target_hue, hue_shift, sat_adjust, lum_adjust)
  if (!hslIdentity) {
    const ranges = Object.entries(cc.hsl) as [HSLColorRange, typeof DEFAULT_HSL_RANGE][];
    let hslCount = 0;
    for (const [range, adj] of ranges) {
      if (adj.hue === 0 && adj.saturation === 0 && adj.luminance === 0) continue;
      parameters[`hsl_${hslCount}_target`] = HSL_TARGET_HUES[range];
      parameters[`hsl_${hslCount}_hue`] = adj.hue / 360; // -180..180 → -0.5..0.5
      parameters[`hsl_${hslCount}_sat`] = adj.saturation / 100; // -100..100 → -1.0..1.0
      parameters[`hsl_${hslCount}_lum`] = adj.luminance / 100; // -100..100 → -1.0..1.0
      hslCount++;
    }
    parameters['hsl_count'] = hslCount;
  }

  // Curves: evaluate spline → 256-entry LUT per enabled channel, encode as JSON string
  if (!curvesIdentity) {
    const c = cc.curves;
    if (c.rgb.enabled && !isCurveIdentity(c.rgb.points)) {
      parameters['curve_rgb'] = JSON.stringify(evaluateCurveToLUT(c.rgb.points));
    }
    if (c.red.enabled && !isCurveIdentity(c.red.points)) {
      parameters['curve_r'] = JSON.stringify(evaluateCurveToLUT(c.red.points));
    }
    if (c.green.enabled && !isCurveIdentity(c.green.points)) {
      parameters['curve_g'] = JSON.stringify(evaluateCurveToLUT(c.green.points));
    }
    if (c.blue.enabled && !isCurveIdentity(c.blue.points)) {
      parameters['curve_b'] = JSON.stringify(evaluateCurveToLUT(c.blue.points));
    }
    if (c.luma.enabled && !isCurveIdentity(c.luma.points)) {
      parameters['curve_luma'] = JSON.stringify(evaluateCurveToLUT(c.luma.points));
    }
    parameters['curves_enabled'] = true;
  }

  // LUT: forward lutId and intensity for engine lookup
  if (lutActive) {
    parameters['lut_id'] = cc.lut.lutId!;
    parameters['lut_intensity'] = cc.lut.intensity / 100; // 0-100 → 0.0-1.0
  }

  return {
    type: 'color-correction',
    parameters,
    order: -1, // Apply before user effects (lowest priority)
  };
}

/** Well-known ID for the auto-generated color-correction effect */
const COLOR_CORRECTION_EFFECT_ID = '__color-correction__';

/**
 * Convert ColorCorrection to an EffectInstance for the element.effects array.
 * This allows color correction to flow through the streaming path (element.update → engine).
 * Returns null if correction is disabled or at identity.
 */
function colorCorrectionToEffectInstance(cc: ColorCorrection): EffectInstance | null {
  const composite = colorCorrectionToCompositeEffect(cc);
  if (!composite) return null;

  return {
    id: COLOR_CORRECTION_EFFECT_ID,
    type: composite.type,
    enabled: true,
    parameters: composite.parameters,
    order: composite.order,
  };
}

/**
 * Merge a color-correction effect into an existing effects array.
 * Replaces any existing color-correction effect, or adds a new one.
 * Returns a new array (does not mutate input).
 */
export function mergeColorCorrectionEffect(
  effects: EffectInstance[],
  cc: ColorCorrection,
): EffectInstance[] {
  const filtered = effects.filter((e) => e.id !== COLOR_CORRECTION_EFFECT_ID);
  const ccEffect = colorCorrectionToEffectInstance(cc);
  if (ccEffect) {
    return [ccEffect, ...filtered];
  }
  return filtered;
}
