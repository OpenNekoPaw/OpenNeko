/**
 * Media Engine Interface
 *
 * Defines the unified media engine interface for
 * compatible mode (Native FFmpeg + wgpu).
 */

import type { MediaInfo } from '../mediaProtocol';
import type { MediaEngineCapabilities } from './capabilities';
import type { IDecoder, VideoDecoderConfig, AudioDecoderConfig } from './decoder';
import type { IEncoder, EncoderConfig } from './encoder';
import type { IEffectProcessor } from './effects';
import type { MediaEngineMode, MediaEngineState } from './mode';

// =============================================================================
// Engine Events
// =============================================================================

/**
 * Event emitter interface (compatible with both VSCode and DOM events)
 */
export interface Event<T> {
  (listener: (data: T) => void): { dispose: () => void };
}

/**
 * Media engine error
 */
export interface MediaEngineError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Original error (if any) */
  cause?: Error;
  /** Whether the error is recoverable */
  recoverable: boolean;
}

// =============================================================================
// Engine Initialization
// =============================================================================

/**
 * Media engine initialization options
 */
export interface MediaEngineInitOptions {
  /** Preferred mode (default: auto-detect) */
  preferredMode?: MediaEngineMode;
  /** Whether to allow fallback to other mode on failure */
  allowFallback?: boolean;
  /** Hardware acceleration preference */
  hardwareAcceleration?: 'prefer' | 'require' | 'disable';
  /** GPU device preference (for multi-GPU systems) */
  gpuDeviceIndex?: number;
  /** Maximum memory usage in bytes (for buffer pools) */
  maxMemoryUsage?: number;
}

// =============================================================================
// Media Engine Interface
// =============================================================================

/**
 * Unified media engine interface
 *
 * This is the main abstraction that hides the complexity of different
 * media processing backends. Upper-layer code should only depend on
 * this interface, not on specific implementations.
 *
 * Implementation:
 * - NativeMediaEngine: Compatible mode (Extension Host, Native FFmpeg + wgpu)
 */
export interface IMediaEngine {
  // =========================================================================
  // Properties
  // =========================================================================

  /** Engine name (e.g., 'WebMediaEngine', 'NativeMediaEngine') */
  readonly name: string;

  /** Current runtime mode */
  readonly mode: MediaEngineMode;

  /** Current engine state */
  readonly state: MediaEngineState;

  /** Engine capabilities */
  readonly capabilities: MediaEngineCapabilities;

  /** Whether the engine is ready for use */
  readonly isReady: boolean;

  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Initialize the media engine
   * @param options Initialization options
   */
  initialize(options?: MediaEngineInitOptions): Promise<void>;

  /**
   * Dispose the engine and release all resources
   */
  dispose(): Promise<void>;

  // =========================================================================
  // Decoder Factory
  // =========================================================================

  /**
   * Create a video decoder
   * @param config Decoder configuration
   */
  createVideoDecoder(config: VideoDecoderConfig): Promise<IDecoder>;

  /**
   * Create an audio decoder
   * @param config Decoder configuration
   */
  createAudioDecoder(config: AudioDecoderConfig): Promise<IDecoder>;

  /**
   * Check if a codec can be decoded
   * @param codec Codec identifier (e.g., 'h264', 'aac')
   * @param container Optional container format
   */
  canDecode(codec: string, container?: string): boolean;

  // =========================================================================
  // Encoder Factory
  // =========================================================================

  /**
   * Create an encoder
   * @param config Encoder configuration
   */
  createEncoder(config: EncoderConfig): Promise<IEncoder>;

  /**
   * Check if a codec can be encoded
   * @param codec Codec identifier
   * @param container Optional container format
   */
  canEncode(codec: string, container?: string): boolean;

  // =========================================================================
  // Effect Processor
  // =========================================================================

  /**
   * Get the effect processor instance
   * (lazily initialized on first call)
   */
  getEffectProcessor(): Promise<IEffectProcessor>;

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Probe media file information
   * @param source File path or URL
   */
  probeMedia(source: string): Promise<MediaInfo>;

  /**
   * Check if a media file can be processed by this engine
   * @param mediaInfo Media information
   */
  canProcess(mediaInfo: MediaInfo): boolean;

  // =========================================================================
  // Events
  // =========================================================================

  /** State change event */
  onStateChange: Event<MediaEngineState>;

  /** Error event */
  onError: Event<MediaEngineError>;
}

// =============================================================================
// Engine Factory
// =============================================================================

/**
 * Media engine factory function type
 */
export type MediaEngineFactory = (options?: MediaEngineInitOptions) => Promise<IMediaEngine>;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an object implements IMediaEngine
 */
export function isMediaEngine(obj: unknown): obj is IMediaEngine {
  if (!obj || typeof obj !== 'object') return false;
  const engine = obj as IMediaEngine;
  return (
    typeof engine.name === 'string' &&
    typeof engine.mode === 'string' &&
    typeof engine.state === 'string' &&
    typeof engine.initialize === 'function' &&
    typeof engine.dispose === 'function' &&
    typeof engine.createVideoDecoder === 'function' &&
    typeof engine.createAudioDecoder === 'function' &&
    typeof engine.createEncoder === 'function'
  );
}
