/**
 * Media Engine Types
 *
 * Unified type definitions for the media processing architecture.
 *
 * This module provides:
 * - IMediaEngine: Unified engine interface for compatible mode
 * - IDecoder/IEncoder: Codec interfaces aligned with media-processor-rs
 * - IEffectProcessor: GPU effect processing interface
 * - Capability detection types
 *
 * Architecture:
 * ```
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                    IMediaEngine (统一接口)                       │
 * └─────────────────────────────────────────────────────────────────┘
 *                               │
 *                               ▼
 *               ┌─────────────────────────────────┐
 *               │   NativeMediaEngine             │
 *               │   (兼容模式 - NAPI)              │
 *               │   Extension Host 运行            │
 *               │   Native FFmpeg + wgpu          │
 *               └─────────────────────────────────┘
 * ```
 */

// =============================================================================
// Mode Types
// =============================================================================

export {
  // Types
  type MediaEngineMode,
  type MediaEngineState,
  type DownloadStatus,
} from './mode';

// =============================================================================
// Capability Types
// =============================================================================

export {
  // Types
  type VideoCodecId,
  type AudioCodecId,
  type VideoCodecCapability,
  type AudioCodecCapability,
  type HardwareAccelType,
  type HardwareAccelInfo,
  type MediaEngineCapabilities,
  // Constants
  COMPATIBLE_MODE_CAPABILITIES,
  // Helpers
  canDecodeVideo,
  canEncodeVideo,
  canDecodeAudio,
  canEncodeAudio,
  supportsContainer,
} from './capabilities';

// =============================================================================
// Decoder Types
// =============================================================================

export {
  // Types
  type DecoderType,
  type PixelFormat,
  type SampleFormat,
  type VideoDecoderConfig,
  type AudioDecoderConfig,
  type DecoderConfig,
  type DecodedVideoFrame,
  type DecodedAudioFrame,
  type DecodedFrame,
  type IDecoder,
  type IVideoDecoder,
  type IAudioDecoder,
  // Type Guards
  isVideoFrame,
  isAudioFrame,
  isVideoDecoder,
  isAudioDecoder,
} from './decoder';

export type { VideoFrame } from './webcodecs';

// =============================================================================
// Encoder Types
// =============================================================================

export {
  // Types
  type VideoEncoderCodec,
  type AudioEncoderCodec,
  type ContainerFormat,
  type EncoderPreset,
  type EncoderState,
  type VideoEncoderConfig,
  type AudioEncoderConfig,
  type EncoderConfig,
  type EncoderProgress,
  type EncoderResult,
  type EncoderEvent,
  type IEncoder,
  type IStreamingEncoder,
  type EncodedAudioChunk,
  type IAudioEncoder,
  // Type Guards
  isStreamingEncoder,
  isAudioEncoder,
} from './encoder';

// =============================================================================
// Effect Types
// =============================================================================

export {
  // Types
  type GpuEffectType,
  type ColorCorrectionParams,
  type BlurParams,
  type SharpenParams,
  type ChromaKeyParams,
  type LutParams,
  type CustomEffectParams,
  type VignetteEffectParams,
  type GpuEffectParams,
  type PipelineEffect,
  type EffectPipeline,
  type EffectProcessorGpuInfo,
  type EffectProcessorState,
  type IEffectProcessor,
  type IBatchEffectProcessor,
  // Type Guards
  isBatchEffectProcessor,
  // Helpers
  createColorCorrection,
  createBlur,
  createGreenScreenKey,
} from './effects';

// =============================================================================
// Muxer Types
// =============================================================================

export {
  // Types
  type MuxerState,
  type MuxerVideoConfig,
  type MuxerAudioConfig,
  type MuxerConfig,
  type MuxerProgress,
  type MuxerResult,
  type MuxerVideoChunk,
  type MuxerAudioChunk,
  type MuxerEvent,
  type IMuxer,
  // Type Guards
  isVideoChunk,
  isAudioChunk,
} from './muxer';

// =============================================================================
// Engine Types
// =============================================================================

export {
  // Types
  type Event,
  type MediaEngineError,
  type MediaEngineInitOptions,
  type IMediaEngine,
  type MediaEngineFactory,
  // Type Guards
  isMediaEngine,
} from './engine';
