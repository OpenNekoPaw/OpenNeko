/**
 * Shared color correction primitives.
 *
 * These host-agnostic types feed @neko/shared color mapping and operation
 * contracts. Feature Webviews may expose richer editor UI around them.
 */
// =============================================================================
// Color Correction
// =============================================================================

/** Basic color adjustment parameters */
export interface BasicColorAdjustment {
  /** Brightness adjustment (-100 to 100, 0 = no change) */
  brightness: number;
  /** Exposure (-5 to +5, 0 = no change) */
  exposure: number;
  /** Contrast (-100 to +100, 0 = no change) */
  contrast: number;
  /** Highlights (-100 to +100, 0 = no change) */
  highlights: number;
  /** Shadows (-100 to +100, 0 = no change) */
  shadows: number;
  /** Whites (-100 to +100, 0 = no change) */
  whites: number;
  /** Blacks (-100 to +100, 0 = no change) */
  blacks: number;
  /** Temperature (-100 to +100, 0 = no change) */
  temperature: number;
  /** Tint (-100 to +100, 0 = no change) */
  tint: number;
  /** Saturation (-100 to +100, 0 = no change) */
  saturation: number;
  /** Vibrance (-100 to +100, 0 = no change) */
  vibrance: number;
  /** Clarity (-100 to +100, 0 = no change) */
  clarity: number;
  /** Dehaze (-100 to +100, 0 = no change) */
  dehaze: number;
  /** Gamma correction (0.1 to 3.0, 1.0 = no change) */
  gamma: number;
  /** Hue shift in degrees (-180 to 180, 0 = no change) */
  hueShift: number;
}

export const DEFAULT_BASIC_COLOR_ADJUSTMENT: BasicColorAdjustment = {
  brightness: 0,
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  temperature: 0,
  tint: 0,
  saturation: 0,
  vibrance: 0,
  clarity: 0,
  dehaze: 0,
  gamma: 1,
  hueShift: 0,
};

// -----------------------------------------------------------------------------
// Curve Adjustment (曲线调整)
// -----------------------------------------------------------------------------

/** A point on a curve */
export interface CurvePoint {
  /** X position (0-1) */
  x: number;
  /** Y position (0-1) */
  y: number;
}

/** Curve channel types */
export type CurveChannel = 'rgb' | 'red' | 'green' | 'blue' | 'luma';

/** Curve adjustment for a single channel */
export interface CurveAdjustment {
  /** Curve points (sorted by x) */
  points: CurvePoint[];
  /** Whether this curve is enabled */
  enabled: boolean;
}

/** All curves for color grading */
export interface CurvesAdjustment {
  /** Master RGB curve */
  rgb: CurveAdjustment;
  /** Red channel curve */
  red: CurveAdjustment;
  /** Green channel curve */
  green: CurveAdjustment;
  /** Blue channel curve */
  blue: CurveAdjustment;
  /** Luminance curve */
  luma: CurveAdjustment;
}

export const DEFAULT_CURVE: CurveAdjustment = {
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  enabled: true,
};

export const DEFAULT_CURVES_ADJUSTMENT: CurvesAdjustment = {
  rgb: { ...DEFAULT_CURVE },
  red: { ...DEFAULT_CURVE, enabled: false },
  green: { ...DEFAULT_CURVE, enabled: false },
  blue: { ...DEFAULT_CURVE, enabled: false },
  luma: { ...DEFAULT_CURVE, enabled: false },
};

// -----------------------------------------------------------------------------
// HSL Adjustment (HSL 调整)
// -----------------------------------------------------------------------------

/** HSL color ranges for selective color adjustment */
export type HSLColorRange =
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'cyan'
  | 'blue'
  | 'purple'
  | 'magenta';

/** HSL adjustment for a specific color range */
export interface HSLRangeAdjustment {
  /** Hue shift (-180 to +180) */
  hue: number;
  /** Saturation adjustment (-100 to +100) */
  saturation: number;
  /** Luminance adjustment (-100 to +100) */
  luminance: number;
}

/** Complete HSL adjustment with all color ranges */
export type HSLAdjustment = Record<HSLColorRange, HSLRangeAdjustment>;

export const DEFAULT_HSL_RANGE: HSLRangeAdjustment = { hue: 0, saturation: 0, luminance: 0 };

export const DEFAULT_HSL_ADJUSTMENT: HSLAdjustment = {
  red: { ...DEFAULT_HSL_RANGE },
  orange: { ...DEFAULT_HSL_RANGE },
  yellow: { ...DEFAULT_HSL_RANGE },
  green: { ...DEFAULT_HSL_RANGE },
  cyan: { ...DEFAULT_HSL_RANGE },
  blue: { ...DEFAULT_HSL_RANGE },
  purple: { ...DEFAULT_HSL_RANGE },
  magenta: { ...DEFAULT_HSL_RANGE },
};

// -----------------------------------------------------------------------------
// LUT (Look-Up Table)
// -----------------------------------------------------------------------------

/** LUT adjustment settings */
export interface LUTAdjustment {
  /** Whether LUT is enabled */
  enabled: boolean;
  /** LUT data reference (id or filename) */
  lutId: string | null;
  /** LUT intensity/strength (0-100) */
  intensity: number;
}

export const DEFAULT_LUT_ADJUSTMENT: LUTAdjustment = {
  enabled: false,
  lutId: null,
  intensity: 100,
};

/** Vignette effect parameters */
export interface VignetteParams {
  /** Whether vignette is enabled */
  enabled: boolean;
  /** Vignette amount (-100 to 100, negative = darken, positive = lighten) */
  amount: number;
  /** Midpoint position (0 to 100, default 50) */
  midpoint: number;
  /** Roundness (-100 to 100, 0 = circle) */
  roundness: number;
  /** Feather amount (0 to 100, default 50) */
  feather: number;
}

export const DEFAULT_VIGNETTE_PARAMS: VignetteParams = {
  enabled: false,
  amount: 0,
  midpoint: 50,
  roundness: 0,
  feather: 50,
};

/** Single color wheel value (HSL offset) */
export interface ColorWheelValue {
  /** Hue offset (-180 to 180 degrees) */
  hue: number;
  /** Saturation multiplier (0 to 200, 100 = no change) */
  saturation: number;
  /** Luminance offset (-100 to 100) */
  luminance: number;
}

export const DEFAULT_COLOR_WHEEL_VALUE: ColorWheelValue = {
  hue: 0,
  saturation: 100,
  luminance: 0,
};

/** Three-way color wheel (shadows, midtones, highlights) */
export interface ColorWheelsParams {
  /** Shadows color adjustment */
  shadows: ColorWheelValue;
  /** Midtones color adjustment */
  midtones: ColorWheelValue;
  /** Highlights color adjustment */
  highlights: ColorWheelValue;
  /** Global color adjustment */
  global: ColorWheelValue;
}

export const DEFAULT_COLOR_WHEELS_PARAMS: ColorWheelsParams = {
  shadows: { ...DEFAULT_COLOR_WHEEL_VALUE },
  midtones: { ...DEFAULT_COLOR_WHEEL_VALUE },
  highlights: { ...DEFAULT_COLOR_WHEEL_VALUE },
  global: { ...DEFAULT_COLOR_WHEEL_VALUE },
};

/** Complete color correction settings */
export interface ColorCorrection {
  /** Whether color correction is enabled */
  enabled: boolean;
  /** Basic adjustments */
  basic: BasicColorAdjustment;
  /** Curves adjustments */
  curves: CurvesAdjustment;
  /** Color wheels adjustments */
  colorWheels: ColorWheelsParams;
  /** HSL adjustments */
  hsl: HSLAdjustment;
  /** LUT settings */
  lut: LUTAdjustment;
  /** Vignette settings */
  vignette: VignetteParams;
}

export const DEFAULT_COLOR_CORRECTION: ColorCorrection = {
  enabled: false,
  basic: DEFAULT_BASIC_COLOR_ADJUSTMENT,
  curves: DEFAULT_CURVES_ADJUSTMENT,
  colorWheels: DEFAULT_COLOR_WHEELS_PARAMS,
  hsl: DEFAULT_HSL_ADJUSTMENT,
  lut: DEFAULT_LUT_ADJUSTMENT,
  vignette: DEFAULT_VIGNETTE_PARAMS,
};
