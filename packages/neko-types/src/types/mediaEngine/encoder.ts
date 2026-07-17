/**
 * Media Encoder Interface
 *
 * Defines the unified encoder interface for both basic and compatible modes.
 */

import type { VideoFrame } from './webcodecs';

// =============================================================================
// Encoder Types
// =============================================================================

/**
 * Video codec for encoding
 */
export type VideoEncoderCodec = 'h264' | 'h265' | 'vp8' | 'vp9' | 'av1' | 'prores';

/**
 * Audio codec for encoding
 */
export type AudioEncoderCodec = 'aac' | 'mp3' | 'opus' | 'flac' | 'pcm';

/**
 * Container format for output
 */
export type ContainerFormat = 'mp4' | 'webm' | 'mkv' | 'mov' | 'mxf';

/**
 * Encoder preset (speed vs quality tradeoff)
 */
export type EncoderPreset = 'ultrafast' | 'fast' | 'medium' | 'slow' | 'veryslow';

/**
 * Encoder state
 */
export type EncoderState =
  'idle' | 'initializing' | 'encoding' | 'finalizing' | 'completed' | 'error' | 'cancelled';

// =============================================================================
// Encoder Configuration
// =============================================================================

/**
 * Video encoder configuration
 */
export interface VideoEncoderConfig {
  /** Video codec */
  codec: VideoEncoderCodec;
  /** Output width */
  width: number;
  /** Output height */
  height: number;
  /** Frame rate */
  fps: number;
  /** Bitrate in bps (optional, uses codec default if not specified) */
  bitrate?: number;
  /** Encoder preset */
  preset?: EncoderPreset;
  /** Codec profile (e.g., 'main', 'high' for H.264) */
  profile?: string;
  /** Whether to enable hardware acceleration */
  hardwareAcceleration?: boolean;
  /** GOP size (keyframe interval) */
  gopSize?: number;
  /** Maximum B-frames */
  maxBFrames?: number;
  /** CRF value for quality-based encoding (0-51, lower is better) */
  crf?: number;
}

/**
 * Audio encoder configuration
 */
export interface AudioEncoderConfig {
  /** Audio codec */
  codec: AudioEncoderCodec;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Bitrate in bps (optional) */
  bitrate?: number;
}

/**
 * Full encoder configuration
 */
export interface EncoderConfig {
  /** Output file path */
  outputPath: string;
  /** Container format */
  container: ContainerFormat;
  /** Video encoder config (optional, for audio-only export) */
  video?: VideoEncoderConfig;
  /** Audio encoder config (optional, for video-only export) */
  audio?: AudioEncoderConfig;
  /** Total expected frames (for progress calculation) */
  totalFrames?: number;
  /** Total expected duration in seconds */
  totalDuration?: number;
  /** Metadata to embed */
  metadata?: Record<string, string>;
}

// =============================================================================
// Encoder Progress and Result
// =============================================================================

/**
 * Encoder progress information
 */
export interface EncoderProgress {
  /** Number of encoded frames */
  encodedFrames: number;
  /** Total frames (if known) */
  totalFrames?: number;
  /** Progress percentage (0-100) */
  percent: number;
  /** Current encoding FPS */
  currentFps: number;
  /** Elapsed time in milliseconds */
  elapsedMs: number;
  /** Estimated remaining time in milliseconds */
  estimatedRemainingMs?: number;
  /** Current output file size in bytes */
  currentSize: number;
}

/**
 * Encoder result
 */
export interface EncoderResult {
  /** Whether encoding succeeded */
  success: boolean;
  /** Output file path (if success) */
  outputPath?: string;
  /** Output file size in bytes (if success) */
  fileSize?: number;
  /** Total encoding time in milliseconds */
  totalTimeMs?: number;
  /** Average encoding FPS */
  averageFps?: number;
  /** Error message (if failed) */
  error?: string;
  /** Error code (if failed) */
  errorCode?: string;
}

// =============================================================================
// Encoder Interface
// =============================================================================

/**
 * Event type for encoder events
 */
export interface EncoderEvent<T> {
  (listener: (data: T) => void): { dispose: () => void };
}

/**
 * Unified encoder interface
 *
 * Provides a consistent API for video/audio encoding,
 * regardless of the underlying implementation (WebCodecs or Native FFmpeg).
 */
export interface IEncoder {
  /** Current encoder state */
  readonly state: EncoderState;

  /** Encoder configuration */
  readonly config: EncoderConfig | null;

  /** Whether the encoder is ready to accept frames */
  readonly isReady: boolean;

  /**
   * Initialize the encoder with configuration
   * @param config Encoder configuration
   */
  initialize(config: EncoderConfig): Promise<void>;

  /**
   * Encode a video frame
   * @param frame Frame data (raw pixels or VideoFrame)
   * @param timestamp Timestamp in microseconds
   */
  encodeVideoFrame(frame: Uint8Array | VideoFrame, timestamp: number): Promise<void>;

  /**
   * Encode audio samples
   * @param samples Audio samples (Float32Array, interleaved if multi-channel)
   * @param timestamp Timestamp in microseconds
   */
  encodeAudioSamples?(samples: Float32Array, timestamp: number): Promise<void>;

  /**
   * Finalize encoding and write output file
   * @returns Encoder result
   */
  finalize(): Promise<EncoderResult>;

  /**
   * Cancel encoding
   */
  cancel(): Promise<void>;

  /**
   * Progress event
   */
  onProgress: EncoderEvent<EncoderProgress>;

  /**
   * State change event
   */
  onStateChange: EncoderEvent<EncoderState>;

  /**
   * Error event
   */
  onError: EncoderEvent<Error>;
}

// =============================================================================
// Streaming Encoder Interface
// =============================================================================

/**
 * Streaming encoder interface for real-time encoding
 *
 * Extends IEncoder with backpressure control for streaming scenarios.
 */
export interface IStreamingEncoder extends IEncoder {
  /**
   * Check if the encoder can accept more frames
   * (for backpressure control)
   */
  readonly canAcceptFrame: boolean;

  /**
   * Number of pending frames in the encoder queue
   */
  readonly pendingFrames: number;

  /**
   * Maximum queue size before backpressure kicks in
   */
  readonly maxQueueSize: number;

  /**
   * Wait until the encoder can accept more frames
   * @param signal Abort signal for cancellation
   */
  waitForCapacity(signal?: AbortSignal): Promise<void>;

  /**
   * Backpressure event (fired when queue is full)
   */
  onBackpressure: EncoderEvent<{ shouldPause: boolean; pendingFrames: number }>;
}

// =============================================================================
// Audio Encoder Interface
// =============================================================================

/**
 * Encoded audio chunk
 */
export interface EncodedAudioChunk {
  /** Encoded audio data */
  data: Uint8Array;
  /** Timestamp in microseconds */
  timestamp: number;
  /** Duration in microseconds */
  duration: number;
  /** Whether this is a keyframe */
  isKeyframe: boolean;
}

/**
 * Audio encoder interface
 *
 * Provides a consistent API for audio encoding using FFmpeg.wasm
 */
export interface IAudioEncoder {
  /** Current encoder state */
  readonly state: EncoderState;

  /** Whether the encoder is ready to accept samples */
  readonly isReady: boolean;

  /**
   * Initialize the encoder with configuration
   * @param config Audio encoder configuration
   */
  initialize(config: AudioEncoderConfig): Promise<void>;

  /**
   * Encode audio samples
   * @param samples Audio samples (Float32Array, interleaved if multi-channel)
   * @param timestamp Timestamp in microseconds
   */
  encode(samples: Float32Array, timestamp: number): Promise<void>;

  /**
   * Finalize encoding and return all encoded chunks
   * @returns Array of encoded audio chunks
   */
  finalize(): Promise<EncodedAudioChunk[]>;

  /**
   * Cancel encoding
   */
  cancel(): Promise<void>;

  /**
   * Get encoded chunks (clears internal buffer)
   * @returns Array of encoded audio chunks
   */
  getEncodedChunks(): EncodedAudioChunk[];

  /**
   * Progress event
   */
  onProgress: EncoderEvent<EncoderProgress>;

  /**
   * State change event
   */
  onStateChange: EncoderEvent<EncoderState>;

  /**
   * Error event
   */
  onError: EncoderEvent<Error>;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if an encoder supports streaming
 */
export function isStreamingEncoder(encoder: IEncoder): encoder is IStreamingEncoder {
  return 'canAcceptFrame' in encoder && 'waitForCapacity' in encoder;
}

/**
 * Check if an encoder is an audio encoder
 */
export function isAudioEncoder(encoder: unknown): encoder is IAudioEncoder {
  return (
    typeof encoder === 'object' &&
    encoder !== null &&
    'encode' in encoder &&
    'getEncodedChunks' in encoder &&
    !('encodeVideoFrame' in encoder)
  );
}
