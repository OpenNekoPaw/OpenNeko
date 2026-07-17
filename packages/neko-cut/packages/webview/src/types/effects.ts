/**
 * Video Effects Types
 * 视频特效类型定义
 *
 * Core types are imported from @neko/shared for Single Source of Truth.
 * This file extends with webview-specific utilities (effect definitions, presets, animation).
 */

// =============================================================================
// Re-export Core Types from Shared
// =============================================================================

export type {
  EffectCategory,
  EffectParameterType,
  EffectParameterValue,
  EffectParameterKeyframe,
  AnimatableEffectParameter,
  EffectInstance,
} from '@neko/shared';

import type {
  EffectCategory,
  EffectParameterType,
  EffectParameterValue,
  EffectParameterKeyframe,
  AnimatableEffectParameter,
  EffectInstance,
} from '@neko/shared';
import type { EffectCapability } from '@neko/neko-client';

// =============================================================================
// Webview-Specific Extensions: Effect Parameter Definitions
// =============================================================================

/**
 * Effect parameter definition
 * 特效参数定义
 */
export interface EffectParameterDef {
  /** Parameter key */
  key: string;
  /** Display name (i18n key) */
  nameKey: string;
  /** Parameter type */
  type: EffectParameterType;
  /** Default value */
  defaultValue: unknown;
  /** Min value (for number type) */
  min?: number;
  /** Max value (for number type) */
  max?: number;
  /** Step value (for number type) */
  step?: number;
  /** Select options (for select type) */
  options?: Array<{ value: string | number; labelKey: string }>;
  /** Whether this parameter is animatable */
  animatable?: boolean;
  /** Unit label (e.g., 'px', '%', '°') */
  unit?: string;
}

// =============================================================================
// Webview-Specific Extensions: Effect Definition
// =============================================================================

/**
 * Effect definition (metadata about an effect type)
 * 特效定义（特效类型的元数据）
 */
export interface EffectDefinition {
  /** Effect type identifier */
  type: string;
  /** Display name (i18n key) */
  nameKey: string;
  /** Description (i18n key) */
  descriptionKey?: string;
  /** Effect category */
  category: EffectCategory;
  /** Parameter definitions */
  parameters: EffectParameterDef[];
  /** Icon name */
  icon?: string;
  /** Whether effect supports GPU acceleration */
  gpuAccelerated?: boolean;
}

// =============================================================================
// Webview-Specific Extensions: Built-in Effects
// =============================================================================

/**
 * Gaussian Blur effect parameters
 * 高斯模糊参数
 */
export interface GaussianBlurParams {
  /** Blur radius in pixels (0-100) */
  radius: number;
  /** Blur direction: both, horizontal, vertical */
  direction: 'both' | 'horizontal' | 'vertical';
}

/**
 * Motion Blur effect parameters
 * 运动模糊参数
 */
export interface MotionBlurParams {
  /** Blur angle in degrees (0-360) */
  angle: number;
  /** Blur distance in pixels (0-100) */
  distance: number;
}

/**
 * Radial Blur effect parameters
 * 径向模糊参数
 */
export interface RadialBlurParams {
  /** Center X (0-100%) */
  centerX: number;
  /** Center Y (0-100%) */
  centerY: number;
  /** Blur amount (0-100) */
  amount: number;
  /** Blur type: spin or zoom */
  type: 'spin' | 'zoom';
}

/**
 * Sharpen effect parameters
 * 锐化参数
 */
export interface SharpenParams {
  /** Sharpen amount (0-100) */
  amount: number;
  /** Radius (0.1-10) */
  radius: number;
  /** Threshold (0-255) */
  threshold: number;
}

/**
 * Noise effect parameters
 * 噪点参数
 */
export interface NoiseParams {
  /** Noise amount (0-100) */
  amount: number;
  /** Noise type */
  type: 'uniform' | 'gaussian' | 'film';
  /** Color noise vs monochrome */
  colorNoise: boolean;
}

/**
 * Glow effect parameters
 * 发光参数
 */
export interface GlowParams {
  /** Glow radius (0-100) */
  radius: number;
  /** Glow intensity (0-100) */
  intensity: number;
  /** Threshold (0-255) */
  threshold: number;
  /** Glow color */
  color: string;
}

/**
 * Vignette effect parameters (for visual effects, not color correction)
 * 暗角特效参数（用于视觉特效，非色彩校正）
 *
 * Note: This is distinct from VignetteParams in @neko/shared which is
 * used for color correction. This effect version has center position control.
 */
export interface VignetteEffectParams {
  /** Vignette amount (0-100) */
  amount: number;
  /** Softness (0-100) */
  softness: number;
  /** Roundness (0-100) */
  roundness: number;
  /** Center X (0-100%) */
  centerX: number;
  /** Center Y (0-100%) */
  centerY: number;
}

/**
 * Chromatic Aberration effect parameters
 * 色差参数
 */
export interface ChromaticAberrationParams {
  /** Red channel offset X */
  redOffsetX: number;
  /** Red channel offset Y */
  redOffsetY: number;
  /** Blue channel offset X */
  blueOffsetX: number;
  /** Blue channel offset Y */
  blueOffsetY: number;
}

/**
 * Chroma Key (Green Screen) parameters
 * 色度键（绿幕）参数
 */
export interface ChromaKeyParams {
  /** Key color */
  keyColor: string;
  /** Similarity threshold (0-100) */
  similarity: number;
  /** Smoothness (0-100) */
  smoothness: number;
  /** Spill suppression (0-100) */
  spillSuppression: number;
}

// =============================================================================
// Effect Definitions Registry
// =============================================================================

/**
 * Built-in effect definitions
 * 内置特效定义
 */
export const BUILT_IN_EFFECTS: EffectDefinition[] = [
  // Blur Effects
  {
    type: 'gaussian-blur',
    nameKey: 'effects.gaussianBlur',
    category: 'blur',
    gpuAccelerated: true,
    parameters: [
      {
        key: 'radius',
        nameKey: 'effects.params.radius',
        type: 'number',
        defaultValue: 10,
        min: 0,
        max: 100,
        step: 0.1,
        animatable: true,
        unit: 'px',
      },
      {
        key: 'direction',
        nameKey: 'effects.params.direction',
        type: 'select',
        defaultValue: 'both',
        options: [
          { value: 'both', labelKey: 'effects.params.directionBoth' },
          { value: 'horizontal', labelKey: 'effects.params.directionHorizontal' },
          { value: 'vertical', labelKey: 'effects.params.directionVertical' },
        ],
      },
    ],
  },
  {
    type: 'motion-blur',
    nameKey: 'effects.motionBlur',
    category: 'blur',
    gpuAccelerated: true,
    parameters: [
      {
        key: 'angle',
        nameKey: 'effects.params.angle',
        type: 'angle',
        defaultValue: 0,
        min: 0,
        max: 360,
        step: 1,
        animatable: true,
        unit: '°',
      },
      {
        key: 'distance',
        nameKey: 'effects.params.distance',
        type: 'number',
        defaultValue: 20,
        min: 0,
        max: 100,
        step: 1,
        animatable: true,
        unit: 'px',
      },
    ],
  },
  {
    type: 'radial-blur',
    nameKey: 'effects.radialBlur',
    category: 'blur',
    gpuAccelerated: true,
    parameters: [
      {
        key: 'centerX',
        nameKey: 'effects.params.centerX',
        type: 'number',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
        animatable: true,
        unit: '%',
      },
      {
        key: 'centerY',
        nameKey: 'effects.params.centerY',
        type: 'number',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
        animatable: true,
        unit: '%',
      },
      {
        key: 'amount',
        nameKey: 'effects.params.amount',
        type: 'number',
        defaultValue: 20,
        min: 0,
        max: 100,
        step: 1,
        animatable: true,
      },
      {
        key: 'type',
        nameKey: 'effects.params.blurType',
        type: 'select',
        defaultValue: 'zoom',
        options: [
          { value: 'spin', labelKey: 'effects.params.blurTypeSpin' },
          { value: 'zoom', labelKey: 'effects.params.blurTypeZoom' },
        ],
      },
    ],
  },

  // Sharpen Effects
  {
    type: 'sharpen',
    nameKey: 'effects.sharpen',
    category: 'sharpen',
    gpuAccelerated: true,
    parameters: [
      {
        key: 'amount',
        nameKey: 'effects.params.amount',
        type: 'number',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
        animatable: true,
      },
      {
        key: 'radius',
        nameKey: 'effects.params.radius',
        type: 'number',
        defaultValue: 1,
        min: 0.1,
        max: 10,
        step: 0.1,
        unit: 'px',
      },
      {
        key: 'threshold',
        nameKey: 'effects.params.threshold',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 255,
        step: 1,
      },
    ],
  },

  // Stylize Effects
  {
    type: 'noise',
    nameKey: 'effects.noise',
    category: 'stylize',
    parameters: [
      {
        key: 'amount',
        nameKey: 'effects.params.amount',
        type: 'number',
        defaultValue: 10,
        min: 0,
        max: 100,
        step: 1,
        animatable: true,
      },
      {
        key: 'type',
        nameKey: 'effects.params.noiseType',
        type: 'select',
        defaultValue: 'gaussian',
        options: [
          { value: 'uniform', labelKey: 'effects.params.noiseUniform' },
          { value: 'gaussian', labelKey: 'effects.params.noiseGaussian' },
          { value: 'film', labelKey: 'effects.params.noiseFilm' },
        ],
      },
      {
        key: 'colorNoise',
        nameKey: 'effects.params.colorNoise',
        type: 'boolean',
        defaultValue: false,
      },
    ],
  },
  {
    type: 'glow',
    nameKey: 'effects.glow',
    category: 'stylize',
    gpuAccelerated: true,
    parameters: [
      {
        key: 'radius',
        nameKey: 'effects.params.radius',
        type: 'number',
        defaultValue: 20,
        min: 0,
        max: 100,
        step: 1,
        animatable: true,
        unit: 'px',
      },
      {
        key: 'intensity',
        nameKey: 'effects.params.intensity',
        type: 'number',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
        animatable: true,
      },
      {
        key: 'threshold',
        nameKey: 'effects.params.threshold',
        type: 'number',
        defaultValue: 128,
        min: 0,
        max: 255,
        step: 1,
      },
      {
        key: 'color',
        nameKey: 'effects.params.color',
        type: 'color',
        defaultValue: '#ffffff',
      },
    ],
  },
  {
    type: 'vignette',
    nameKey: 'effects.vignette',
    category: 'stylize',
    gpuAccelerated: true,
    parameters: [
      {
        key: 'amount',
        nameKey: 'effects.params.amount',
        type: 'number',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
        animatable: true,
      },
      {
        key: 'softness',
        nameKey: 'effects.params.softness',
        type: 'number',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: 'roundness',
        nameKey: 'effects.params.roundness',
        type: 'number',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
      },
    ],
  },
  {
    type: 'chromatic-aberration',
    nameKey: 'effects.chromaticAberration',
    category: 'stylize',
    gpuAccelerated: true,
    parameters: [
      {
        key: 'redOffsetX',
        nameKey: 'effects.params.redOffsetX',
        type: 'number',
        defaultValue: 2,
        min: -20,
        max: 20,
        step: 0.5,
        animatable: true,
        unit: 'px',
      },
      {
        key: 'redOffsetY',
        nameKey: 'effects.params.redOffsetY',
        type: 'number',
        defaultValue: 0,
        min: -20,
        max: 20,
        step: 0.5,
        animatable: true,
        unit: 'px',
      },
      {
        key: 'blueOffsetX',
        nameKey: 'effects.params.blueOffsetX',
        type: 'number',
        defaultValue: -2,
        min: -20,
        max: 20,
        step: 0.5,
        animatable: true,
        unit: 'px',
      },
      {
        key: 'blueOffsetY',
        nameKey: 'effects.params.blueOffsetY',
        type: 'number',
        defaultValue: 0,
        min: -20,
        max: 20,
        step: 0.5,
        animatable: true,
        unit: 'px',
      },
    ],
  },

  // Keying Effects
  {
    type: 'chroma-key',
    nameKey: 'effects.chromaKey',
    category: 'keying',
    gpuAccelerated: true,
    parameters: [
      {
        key: 'keyColor',
        nameKey: 'effects.params.keyColor',
        type: 'color',
        defaultValue: '#00ff00',
      },
      {
        key: 'similarity',
        nameKey: 'effects.params.similarity',
        type: 'number',
        defaultValue: 40,
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: 'smoothness',
        nameKey: 'effects.params.smoothness',
        type: 'number',
        defaultValue: 10,
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: 'spillSuppression',
        nameKey: 'effects.params.spillSuppression',
        type: 'number',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
      },
    ],
  },
  {
    type: 'luma-key',
    nameKey: 'effects.lumaKey',
    category: 'keying',
    gpuAccelerated: true,
    parameters: [
      {
        key: 'threshold',
        nameKey: 'effects.params.threshold',
        type: 'number',
        defaultValue: 50,
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: 'softness',
        nameKey: 'effects.params.softness',
        type: 'number',
        defaultValue: 10,
        min: 0,
        max: 100,
        step: 1,
      },
      {
        key: 'invert',
        nameKey: 'effects.params.invert',
        type: 'boolean',
        defaultValue: false,
      },
    ],
  },
];

// =============================================================================
// Webview-Specific Extensions: Factory Functions
// =============================================================================

/**
 * Get effect definition by type
 */
export function getEffectDefinition(type: string): EffectDefinition | undefined {
  return BUILT_IN_EFFECTS.find((e) => e.type === type);
}

/**
 * Get effects by category
 */
export function getEffectsByCategory(category: EffectCategory): EffectDefinition[] {
  return BUILT_IN_EFFECTS.filter((e) => e.category === category);
}

/**
 * Build webview effect definitions from engine-discovered shader capabilities.
 */
export function buildEffectDefinitionsFromCapabilities(
  capabilities: readonly EffectCapability[],
): EffectDefinition[] {
  const engineDefinitions = capabilities
    .filter((capability) => capability.kind === 'shader')
    .map(effectDefinitionFromCapability)
    .filter((definition): definition is EffectDefinition => Boolean(definition));

  if (engineDefinitions.length === 0) {
    return BUILT_IN_EFFECTS;
  }

  const definitions = new Map<string, EffectDefinition>();
  for (const definition of BUILT_IN_EFFECTS) {
    definitions.set(definition.type, definition);
  }
  for (const definition of engineDefinitions) {
    definitions.set(definition.type, definition);
  }

  return Array.from(definitions.values());
}

function effectDefinitionFromCapability(capability: EffectCapability): EffectDefinition | null {
  const category = toEffectCategory(capability.category);
  if (!category) return null;

  return {
    type: capability.id,
    nameKey: capability.nameKey ?? `effects.${capability.id}`,
    descriptionKey: capability.description,
    category,
    gpuAccelerated: capability.gpuAccelerated ?? capability.kind === 'shader',
    parameters: capability.params.map((param) => ({
      key: param.name,
      nameKey: param.labelKey ?? `effects.params.${param.name}`,
      type: toEffectParameterType(param.type),
      defaultValue: param.default ?? defaultValueForParameterType(param.type),
      min: param.min,
      max: param.max,
      step: param.step,
      unit: param.unit,
      options: param.options?.map((option) => ({
        value: option.value as string | number,
        labelKey: option.labelKey ?? option.label ?? String(option.value),
      })),
      animatable: param.animatable,
    })),
  };
}

function toEffectCategory(category: string | undefined): EffectCategory | null {
  if (
    category === 'blur' ||
    category === 'sharpen' ||
    category === 'distort' ||
    category === 'stylize' ||
    category === 'color' ||
    category === 'generate' ||
    category === 'keying' ||
    category === 'utility'
  ) {
    return category;
  }

  return 'utility';
}

function toEffectParameterType(paramType: string): EffectParameterType {
  if (
    paramType === 'number' ||
    paramType === 'boolean' ||
    paramType === 'color' ||
    paramType === 'select' ||
    paramType === 'angle' ||
    paramType === 'point' ||
    paramType === 'range'
  ) {
    return paramType;
  }

  return 'number';
}

function defaultValueForParameterType(paramType: string): EffectParameterValue {
  if (paramType === 'boolean') return false;
  if (paramType === 'point') return [0, 0];
  if (paramType === 'color') return '#ffffff';
  if (paramType === 'select') return '';
  return 0;
}

/**
 * Create a new effect instance with default values
 */
export function createEffectInstance(type: string): EffectInstance | null {
  const definition = getEffectDefinition(type);
  if (!definition) return null;

  const parameters: Record<string, EffectParameterValue> = {};
  for (const param of definition.parameters) {
    parameters[param.key] = param.defaultValue as EffectParameterValue;
  }

  return {
    id: `effect-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type,
    enabled: true,
    parameters,
    order: 0,
  };
}

/**
 * Clone an effect instance
 */
export function cloneEffectInstance(effect: EffectInstance): EffectInstance {
  return {
    ...effect,
    id: `effect-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    parameters: { ...effect.parameters },
    animatedParameters: effect.animatedParameters
      ? Object.fromEntries(
          Object.entries(effect.animatedParameters).map(([key, param]) => [
            key,
            {
              baseValue: param.baseValue,
              keyframes: param.keyframes.map((kf) => ({ ...kf })),
            },
          ]),
        )
      : undefined,
  };
}

// =============================================================================
// Webview-Specific Extensions: Effect Parameter Animation Utilities
// =============================================================================

/**
 * Easing function implementations for effect parameters
 * 特效参数缓动函数实现
 */
const effectEasingFunctions: Record<EffectParameterKeyframe['easing'], (t: number) => number> = {
  linear: (t) => t,
  'ease-in': (t) => t * t,
  'ease-out': (t) => t * (2 - t),
  'ease-in-out': (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};

/**
 * Get animated effect parameter value at a specific time
 * 获取特效参数在指定时间的动画值
 *
 * @param param - The animatable effect parameter
 * @param localTime - Time relative to element start (in seconds)
 * @returns The interpolated value at the given time
 */
export function getAnimatedEffectParameterValue(
  param: AnimatableEffectParameter,
  localTime: number,
): EffectParameterValue {
  const { baseValue, keyframes } = param;

  // No keyframes - return base value
  if (!keyframes || keyframes.length === 0) {
    return baseValue;
  }

  // Sort keyframes by time
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  // Before first keyframe
  if (localTime <= sorted[0].time) {
    return sorted[0].value;
  }

  // After last keyframe
  if (localTime >= sorted[sorted.length - 1].time) {
    return sorted[sorted.length - 1].value;
  }

  // Find surrounding keyframes
  let prevIndex = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i].time <= localTime && sorted[i + 1].time > localTime) {
      prevIndex = i;
      break;
    }
  }

  const prevFrame = sorted[prevIndex];
  const nextFrame = sorted[prevIndex + 1];

  // Calculate interpolation progress
  const duration = nextFrame.time - prevFrame.time;
  const progress = duration > 0 ? (localTime - prevFrame.time) / duration : 0;

  // Apply easing
  const easedProgress = effectEasingFunctions[prevFrame.easing](progress);

  // Interpolate based on value type
  if (typeof prevFrame.value === 'number' && typeof nextFrame.value === 'number') {
    return prevFrame.value + (nextFrame.value - prevFrame.value) * easedProgress;
  }

  // For non-numeric values, use step interpolation (no blending)
  return easedProgress < 0.5 ? prevFrame.value : nextFrame.value;
}

/**
 * Get all effect parameter values at a specific time
 * 获取所有特效参数在指定时间的值
 *
 * @param effect - The effect instance
 * @param localTime - Time relative to element start (in seconds)
 * @returns Computed parameter values
 */
export function getEffectParametersAtTime(
  effect: EffectInstance,
  localTime: number,
): Record<string, EffectParameterValue> {
  const result: Record<string, EffectParameterValue> = { ...effect.parameters };

  // Override with animated values
  if (effect.animatedParameters) {
    for (const [key, animParam] of Object.entries(effect.animatedParameters)) {
      if (animParam.keyframes.length > 0) {
        result[key] = getAnimatedEffectParameterValue(animParam, localTime);
      }
    }
  }

  return result;
}

/**
 * Create an animatable parameter from a static value
 * 从静态值创建可动画参数
 */
export function createAnimatableEffectParameter(
  baseValue: EffectParameterValue,
): AnimatableEffectParameter {
  return {
    baseValue,
    keyframes: [],
  };
}

/**
 * Add a keyframe to an animatable effect parameter
 * 向可动画特效参数添加关键帧
 */
export function addEffectParameterKeyframe(
  param: AnimatableEffectParameter,
  time: number,
  value: EffectParameterValue,
  easing: EffectParameterKeyframe['easing'] = 'linear',
): AnimatableEffectParameter {
  const newKeyframe: EffectParameterKeyframe = {
    id: `efx-kf-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    time,
    value,
    easing,
  };

  // Insert in sorted order
  const keyframes = [...param.keyframes];
  const insertIndex = keyframes.findIndex((kf) => kf.time > time);
  if (insertIndex === -1) {
    keyframes.push(newKeyframe);
  } else {
    keyframes.splice(insertIndex, 0, newKeyframe);
  }

  return {
    ...param,
    keyframes,
  };
}

/**
 * Remove a keyframe from an animatable effect parameter
 * 从可动画特效参数删除关键帧
 */
export function removeEffectParameterKeyframe(
  param: AnimatableEffectParameter,
  keyframeId: string,
): AnimatableEffectParameter {
  return {
    ...param,
    keyframes: param.keyframes.filter((kf) => kf.id !== keyframeId),
  };
}

/**
 * Check if an effect has any animated parameters
 * 检查特效是否有任何动画参数
 */
export function hasAnimatedParameters(effect: EffectInstance): boolean {
  if (!effect.animatedParameters) return false;
  return Object.values(effect.animatedParameters).some((param) => param.keyframes.length > 0);
}

/**
 * Get all keyframe times from an effect instance
 * 获取特效实例中所有关键帧时间
 */
export function getEffectKeyframeTimes(effect: EffectInstance): number[] {
  if (!effect.animatedParameters) return [];

  const times = new Set<number>();
  for (const param of Object.values(effect.animatedParameters)) {
    for (const kf of param.keyframes) {
      times.add(kf.time);
    }
  }

  return Array.from(times).sort((a, b) => a - b);
}
