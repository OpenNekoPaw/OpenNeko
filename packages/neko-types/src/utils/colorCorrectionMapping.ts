/**
 * Color Correction Mapping — UI ranges ↔ Engine ranges
 *
 * Converts between BasicColorAdjustment (UI-friendly integer ranges)
 * and ColorCorrectionParams (engine-native float ranges).
 *
 * Key semantic differences:
 * - brightness:  UI -100~100 → Engine -1.0~1.0 (÷100)
 * - contrast:    UI -100~100 (0=no change) → Engine 0.0~2.0 (1.0=no change)
 * - saturation:  UI -100~100 (0=no change) → Engine 0.0~2.0 (1.0=no change)
 * - exposure:    UI -5~5 → Engine -3.0~3.0 (clamped)
 * - vibrance:    UI -100~100 → Engine -1.0~1.0 (÷100)
 * - highlights/shadows/whites/blacks: UI -100~100 → Engine -1.0~1.0 (÷100)
 * - gamma:       UI 0.1~3.0 → Engine 0.1~3.0 (direct)
 * - hueShift:    UI -180~180 → Engine -180~180 (direct)
 * - temperature: UI -100~100 → Engine -100~100 (direct)
 * - tint:        UI -100~100 → Engine -100~100 (direct)
 *
 * @see BasicColorAdjustment in types/colorCorrection.ts
 * @see ColorCorrectionParams in types/mediaEngine/effects.ts
 * @see JsEffectParams in host-napi/index.d.ts
 */

import type { BasicColorAdjustment } from '../types/colorCorrection';
import type { ColorCorrectionParams } from '../types/mediaEngine/effects';

/**
 * Convert BasicColorAdjustment (UI ranges) to ColorCorrectionParams (engine ranges).
 *
 * Ignores UI-only fields that the engine doesn't support (clarity, dehaze).
 */
export function mapBasicColorToEngine(basic: BasicColorAdjustment): ColorCorrectionParams {
  return {
    type: 'colorCorrection',
    brightness: clamp(basic.brightness / 100, -1.0, 1.0),
    contrast: clamp(basic.contrast / 100 + 1.0, 0.0, 2.0),
    saturation: clamp(basic.saturation / 100 + 1.0, 0.0, 2.0),
    exposure: clamp(basic.exposure, -3.0, 3.0),
    gamma: clamp(basic.gamma, 0.1, 3.0),
    hueShift: clamp(basic.hueShift, -180, 180),
    vibrance: clamp(basic.vibrance / 100, -1.0, 1.0),
    temperature: clamp(basic.temperature, -100, 100),
    tint: clamp(basic.tint, -100, 100),
    highlights: clamp(basic.highlights / 100, -1.0, 1.0),
    shadows: clamp(basic.shadows / 100, -1.0, 1.0),
    whites: clamp(basic.whites / 100, -1.0, 1.0),
    blacks: clamp(basic.blacks / 100, -1.0, 1.0),
  };
}

/**
 * Convert ColorCorrectionParams (engine ranges) back to BasicColorAdjustment (UI ranges).
 *
 * UI-only fields (clarity, dehaze) are set to 0.
 */
export function mapEngineColorToBasic(params: ColorCorrectionParams): BasicColorAdjustment {
  return {
    brightness: Math.round((params.brightness ?? 0) * 100),
    contrast: Math.round(((params.contrast ?? 1) - 1.0) * 100),
    saturation: Math.round(((params.saturation ?? 1) - 1.0) * 100),
    exposure: params.exposure ?? 0,
    gamma: params.gamma ?? 1,
    hueShift: params.hueShift ?? 0,
    vibrance: Math.round((params.vibrance ?? 0) * 100),
    temperature: params.temperature ?? 0,
    tint: params.tint ?? 0,
    highlights: Math.round((params.highlights ?? 0) * 100),
    shadows: Math.round((params.shadows ?? 0) * 100),
    whites: Math.round((params.whites ?? 0) * 100),
    blacks: Math.round((params.blacks ?? 0) * 100),
    // UI-only fields — engine doesn't support these
    clarity: 0,
    dehaze: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
