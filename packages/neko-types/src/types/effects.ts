// =============================================================================
// Effects (视频特效)
// =============================================================================

/** Effect category */
export type EffectCategory =
  'blur' | 'sharpen' | 'distort' | 'stylize' | 'color' | 'generate' | 'keying' | 'utility';

/** Effect parameter type */
export type EffectParameterType =
  'number' | 'boolean' | 'color' | 'select' | 'point' | 'angle' | 'range';

/** Effect parameter value */
export type EffectParameterValue = number | boolean | string | [number, number];

/** Effect parameter keyframe for animated parameters */
export interface EffectParameterKeyframe {
  /** Unique identifier */
  id: string;
  /** Time offset relative to element startTime (seconds) */
  time: number;
  /** Parameter value at this keyframe */
  value: EffectParameterValue;
  /** Easing function to next keyframe */
  easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

/** Animatable effect parameter with optional keyframes */
export interface AnimatableEffectParameter {
  /** Base value when no keyframes exist */
  baseValue: EffectParameterValue;
  /** Keyframes sorted by time */
  keyframes: EffectParameterKeyframe[];
}

/** Effect instance applied to an element */
export interface EffectInstance {
  /** Unique instance ID */
  id: string;
  /** Effect type identifier */
  type: string;
  /** Whether effect is enabled */
  enabled: boolean;
  /** Effect parameters (static values) */
  parameters: Record<string, EffectParameterValue>;
  /** Animated effect parameters (with keyframes) */
  animatedParameters?: Record<string, AnimatableEffectParameter>;
  /** Effect order/priority (lower = applied first) */
  order: number;
}

// Legacy type aliases for backwards compatibility
export type EffectType =
  | 'blur'
  | 'gaussian-blur'
  | 'motion-blur'
  | 'radial-blur'
  | 'sharpen'
  | 'noise'
  | 'glow'
  | 'chromaKey'
  | 'chroma-key'
  | 'lumaKey'
  | 'luma-key'
  | 'chromaticAberration'
  | 'chromatic-aberration'
  | 'filmGrain'
  | 'vignette';
