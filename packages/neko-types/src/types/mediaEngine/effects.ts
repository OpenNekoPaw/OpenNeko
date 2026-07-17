/**
 * Effect Processor Interface
 *
 * Defines the unified GPU effect processing interface for both modes.
 */

import type { VideoFrame } from './webcodecs';

// =============================================================================
// GPU Effect Types
// =============================================================================

/**
 * GPU effect type identifiers
 */
export type GpuEffectType =
  | 'colorCorrection'
  | 'blur'
  | 'sharpen'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'hue'
  | 'opacity'
  | 'chromaKey'
  | 'lut'
  | 'vignette'
  | 'custom';

/**
 * Color correction parameters — aligned with engine's JsEffectParams (13 fields).
 *
 * All values use engine-native ranges (NOT UI ranges).
 * Use mapBasicColorToEngine() to convert from BasicColorAdjustment (UI ranges).
 *
 * @see JsEffectParams in host-napi/index.d.ts
 * @see EffectParams in engine-kernel/src/gpu/processor.rs
 */
export interface ColorCorrectionParams {
  type: 'colorCorrection';

  // --- Basic adjustments ---
  /** Brightness (-1.0 to 1.0, 0 = no change) */
  brightness?: number;
  /** Contrast (0.0 to 2.0, 1.0 = no change) */
  contrast?: number;
  /** Saturation (0.0 to 2.0, 1.0 = no change) */
  saturation?: number;
  /** Exposure in stops (-3.0 to 3.0, 0 = no change) */
  exposure?: number;

  // --- Tone adjustments ---
  /** Gamma (0.1 to 3.0, 1.0 = no change) */
  gamma?: number;
  /** Hue shift in degrees (-180 to 180, 0 = no change) */
  hueShift?: number;
  /** Vibrance (-1.0 to 1.0, 0 = no change) */
  vibrance?: number;

  // --- White balance ---
  /** Temperature (-100 to 100, 0 = no change) */
  temperature?: number;
  /** Tint (-100 to 100, 0 = no change) */
  tint?: number;

  // --- Highlights / Shadows ---
  /** Highlights (-1.0 to 1.0, 0 = no change) */
  highlights?: number;
  /** Shadows (-1.0 to 1.0, 0 = no change) */
  shadows?: number;
  /** Whites (-1.0 to 1.0, 0 = no change) */
  whites?: number;
  /** Blacks (-1.0 to 1.0, 0 = no change) */
  blacks?: number;
}

/**
 * Blur effect parameters
 */
export interface BlurParams {
  type: 'blur';
  radius: number; // 0 to 100 pixels
  quality?: 'low' | 'medium' | 'high';
}

/**
 * Sharpen effect parameters
 */
export interface SharpenParams {
  type: 'sharpen';
  amount: number; // 0.0 to 2.0
  radius?: number; // 0.5 to 3.0
}

/**
 * Chroma key (green screen) parameters
 */
export interface ChromaKeyParams {
  type: 'chromaKey';
  keyColor: { r: number; g: number; b: number }; // 0-255
  similarity: number; // 0.0 to 1.0
  smoothness: number; // 0.0 to 1.0
  spillSuppression?: number; // 0.0 to 1.0
}

/**
 * LUT (Look-Up Table) parameters
 */
export interface LutParams {
  type: 'lut';
  lutData: Uint8Array | string; // LUT data or path to .cube file
  intensity?: number; // 0.0 to 1.0 (blend with original)
}

/**
 * Custom shader effect parameters
 */
export interface CustomEffectParams {
  type: 'custom';
  shaderId: string;
  uniforms?: Record<string, number | number[] | boolean>;
}

/**
 * Vignette effect parameters
 */
export interface VignetteEffectParams {
  type: 'vignette';
  intensity: number; // 0.0 to 1.0
  radius?: number; // 0.0 to 1.0 (default 0.5)
  softness?: number; // 0.0 to 1.0 (default 0.5)
}

/**
 * Union of all GPU effect parameters
 */
export type GpuEffectParams =
  | ColorCorrectionParams
  | BlurParams
  | SharpenParams
  | ChromaKeyParams
  | LutParams
  | CustomEffectParams
  | VignetteEffectParams;

// =============================================================================
// Effect Pipeline
// =============================================================================

/**
 * Single effect in a pipeline
 */
export interface PipelineEffect {
  /** Effect identifier */
  id: string;
  /** Effect parameters */
  params: GpuEffectParams;
  /** Whether the effect is enabled */
  enabled: boolean;
  /** Effect order (lower = earlier in pipeline) */
  order: number;
}

/**
 * Effect pipeline configuration
 */
export interface EffectPipeline {
  /** Pipeline identifier */
  id: string;
  /** Effects in the pipeline */
  effects: PipelineEffect[];
  /** Output format */
  outputFormat?: 'rgba' | 'bgra';
}

// =============================================================================
// Effect Processor Interface
// =============================================================================

/**
 * GPU info for effect processor
 */
export interface EffectProcessorGpuInfo {
  /** GPU device name */
  deviceName: string;
  /** GPU vendor */
  vendor: string;
  /** GPU backend (webgpu, webgl, wgpu) */
  backend: string;
  /** Whether the GPU is discrete */
  isDiscrete: boolean;
  /** Maximum texture size */
  maxTextureSize: number;
}

/**
 * Effect processor state
 */
export type EffectProcessorState = 'uninitialized' | 'ready' | 'processing' | 'error' | 'disposed';

/**
 * Unified effect processor interface
 *
 * Provides GPU-accelerated effect processing for video frames.
 */
export interface IEffectProcessor {
  /** Current state */
  readonly state: EffectProcessorState;

  /** GPU information */
  readonly gpuInfo: EffectProcessorGpuInfo | null;

  /** Whether the processor is ready */
  readonly isReady: boolean;

  /**
   * Initialize the effect processor
   */
  initialize(): Promise<void>;

  /**
   * Apply effects to a single frame
   * @param frame Input frame data
   * @param width Frame width
   * @param height Frame height
   * @param effects Effects to apply
   * @returns Processed frame data
   */
  processFrame(
    frame: Uint8Array | VideoFrame,
    width: number,
    height: number,
    effects: GpuEffectParams[],
  ): Promise<Uint8Array>;

  /**
   * Apply an effect pipeline to a frame
   * @param frame Input frame data
   * @param width Frame width
   * @param height Frame height
   * @param pipeline Effect pipeline
   * @returns Processed frame data
   */
  processPipeline(
    frame: Uint8Array | VideoFrame,
    width: number,
    height: number,
    pipeline: EffectPipeline,
  ): Promise<Uint8Array>;

  /**
   * Register a custom shader
   * @param id Shader identifier
   * @param shaderCode Shader source code (WGSL or GLSL)
   */
  registerCustomShader?(id: string, shaderCode: string): Promise<void>;

  /**
   * Dispose the effect processor and release GPU resources
   */
  dispose(): Promise<void>;
}

// =============================================================================
// Batch Effect Processor Interface
// =============================================================================

/**
 * Batch effect processor for processing multiple frames efficiently
 */
export interface IBatchEffectProcessor extends IEffectProcessor {
  /**
   * Process multiple frames in batch
   * @param frames Array of frame data with dimensions
   * @param effects Effects to apply to all frames
   * @returns Array of processed frame data
   */
  processFrameBatch(
    frames: Array<{ data: Uint8Array; width: number; height: number }>,
    effects: GpuEffectParams[],
  ): Promise<Uint8Array[]>;

  /**
   * Maximum batch size supported
   */
  readonly maxBatchSize: number;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an effect processor supports batch processing
 */
export function isBatchEffectProcessor(
  processor: IEffectProcessor,
): processor is IBatchEffectProcessor {
  return 'processFrameBatch' in processor && 'maxBatchSize' in processor;
}

// =============================================================================
// Effect Helpers
// =============================================================================

/**
 * Create default color correction params (engine-native ranges)
 */
export function createColorCorrection(
  overrides?: Partial<Omit<ColorCorrectionParams, 'type'>>,
): ColorCorrectionParams {
  return {
    type: 'colorCorrection',
    brightness: 0,
    contrast: 1,
    saturation: 1,
    exposure: 0,
    gamma: 1,
    hueShift: 0,
    vibrance: 0,
    temperature: 0,
    tint: 0,
    highlights: 0,
    shadows: 0,
    whites: 0,
    blacks: 0,
    ...overrides,
  };
}

/**
 * Create default blur params
 */
export function createBlur(
  radius: number,
  quality: 'low' | 'medium' | 'high' = 'medium',
): BlurParams {
  return {
    type: 'blur',
    radius,
    quality,
  };
}

/**
 * Create default chroma key params for green screen
 */
export function createGreenScreenKey(
  overrides?: Partial<Omit<ChromaKeyParams, 'type' | 'keyColor'>>,
): ChromaKeyParams {
  return {
    type: 'chromaKey',
    keyColor: { r: 0, g: 255, b: 0 },
    similarity: 0.4,
    smoothness: 0.1,
    spillSuppression: 0.5,
    ...overrides,
  };
}
