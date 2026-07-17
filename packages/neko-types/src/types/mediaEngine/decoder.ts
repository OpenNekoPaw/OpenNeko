/**
 * Media Decoder Interface
 *
 * Defines the unified decoder interface for both basic and compatible modes.
 * Aligned with media-processor-rs/src/decoder/traits.rs
 */

import type { MediaInfo } from '../mediaProtocol';
import type { VideoFrame } from './webcodecs';

// =============================================================================
// Decoder Types
// =============================================================================

/**
 * Decoder type
 */
export type DecoderType = 'video' | 'audio';

/**
 * Pixel format for decoded video frames
 */
export type PixelFormat = 'rgba' | 'rgb' | 'yuv420p' | 'nv12' | 'bgra';

/**
 * Sample format for decoded audio
 */
export type SampleFormat = 'u8' | 's16' | 's32' | 'f32' | 'f64';

// =============================================================================
// Decoder Configuration
// =============================================================================

/**
 * Video decoder configuration
 */
export interface VideoDecoderConfig {
  /** Media file path or URL */
  source: string;
  /** Output pixel format (default: rgba) */
  outputFormat?: PixelFormat;
  /** Whether to enable hardware acceleration */
  hardwareAcceleration?: boolean;
  /** Scale factor (0-1, for preview quality) */
  scale?: number;
  /** Target width (optional, for resizing) */
  targetWidth?: number;
  /** Target height (optional, for resizing) */
  targetHeight?: number;
  /** Enable zero-copy mode - returns VideoFrame directly instead of copying to Uint8Array (default: true) */
  zeroCopy?: boolean;
}

/**
 * Audio decoder configuration
 */
export interface AudioDecoderConfig {
  /** Media file path or URL */
  source: string;
  /** Output sample rate (default: 48000) */
  sampleRate?: number;
  /** Output channels (default: 2) */
  channels?: number;
  /** Output sample format (default: f32) */
  sampleFormat?: SampleFormat;
}

/**
 * Unified decoder configuration
 */
export type DecoderConfig = VideoDecoderConfig | AudioDecoderConfig;

// =============================================================================
// Decoded Frame Types
// =============================================================================

/**
 * Decoded video frame
 *
 * Can contain either raw pixel data (Uint8Array) or a VideoFrame object
 * depending on the decoder implementation.
 */
export interface DecodedVideoFrame {
  /** Frame type discriminator */
  type: 'video';
  /** Frame data (raw pixels or VideoFrame) */
  data: Uint8Array | VideoFrame;
  /** Frame width in pixels */
  width: number;
  /** Frame height in pixels */
  height: number;
  /** Pixel format */
  format: PixelFormat;
  /** Timestamp in seconds */
  timestamp: number;
  /** Whether this is a keyframe */
  isKeyframe: boolean;
  /** Frame duration in seconds (optional) */
  duration?: number;
}

/**
 * Decoded audio frame
 */
export interface DecodedAudioFrame {
  /** Frame type discriminator */
  type: 'audio';
  /** Audio samples (interleaved if multi-channel) */
  data: Float32Array;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of channels */
  channels: number;
  /** Number of samples per channel */
  samplesPerChannel: number;
  /** Timestamp in seconds */
  timestamp: number;
  /** Duration in seconds */
  duration: number;
}

/**
 * Unified decoded frame type
 */
export type DecodedFrame = DecodedVideoFrame | DecodedAudioFrame;

// =============================================================================
// Decoder Interface
// =============================================================================

/**
 * Unified decoder interface
 *
 * Provides a consistent API for both video and audio decoding,
 * regardless of the underlying implementation (WebCodecs, FFmpeg.wasm, or Native FFmpeg).
 */
export interface IDecoder {
  /** Decoder type (video or audio) */
  readonly type: DecoderType;

  /** Media info (available after open()) */
  readonly mediaInfo: MediaInfo | null;

  /** Whether the decoder is currently open */
  readonly isOpen: boolean;

  /** Current position in seconds */
  readonly position: number;

  /**
   * Open the media file and initialize the decoder
   * @returns Media information
   */
  open(): Promise<MediaInfo>;

  /**
   * Seek to a specific time position
   * @param time Time in seconds
   */
  seek(time: number): Promise<void>;

  /**
   * Decode the next frame
   * @returns Decoded frame or null if end of stream
   */
  decodeNext(): Promise<DecodedFrame | null>;

  /**
   * Decode frame at a specific time
   * @param time Time in seconds
   * @returns Decoded frame or null if not found
   */
  decodeAt(time: number): Promise<DecodedFrame | null>;

  /**
   * Decode a range of frames (async generator)
   * @param startTime Start time in seconds
   * @param duration Duration in seconds
   * @param fps Target frame rate (for video) or ignored (for audio)
   */
  decodeRange(
    startTime: number,
    duration: number,
    fps?: number,
  ): AsyncGenerator<DecodedFrame, void, undefined>;

  /**
   * Close the decoder and release resources
   */
  close(): Promise<void>;
}

// =============================================================================
// Video Decoder Interface (specialized)
// =============================================================================

/**
 * Video decoder interface with video-specific methods
 */
export interface IVideoDecoder extends IDecoder {
  readonly type: 'video';

  /**
   * Decode the next video frame
   */
  decodeNext(): Promise<DecodedVideoFrame | null>;

  /**
   * Decode video frame at a specific time
   */
  decodeAt(time: number): Promise<DecodedVideoFrame | null>;

  /**
   * Decode a range of video frames
   */
  decodeRange(
    startTime: number,
    duration: number,
    fps: number,
  ): AsyncGenerator<DecodedVideoFrame, void, undefined>;

  /**
   * Extract a thumbnail at a specific time
   * @param time Time in seconds
   * @param maxWidth Maximum thumbnail width
   * @param maxHeight Maximum thumbnail height
   */
  extractThumbnail?(time: number, maxWidth: number, maxHeight: number): Promise<DecodedVideoFrame>;
}

// =============================================================================
// Audio Decoder Interface (specialized)
// =============================================================================

/**
 * Audio decoder interface with audio-specific methods
 */
export interface IAudioDecoder extends IDecoder {
  readonly type: 'audio';

  /**
   * Decode the next audio frame
   */
  decodeNext(): Promise<DecodedAudioFrame | null>;

  /**
   * Decode audio at a specific time
   */
  decodeAt(time: number): Promise<DecodedAudioFrame | null>;

  /**
   * Decode a range of audio
   */
  decodeRange(
    startTime: number,
    duration: number,
  ): AsyncGenerator<DecodedAudioFrame, void, undefined>;

  /**
   * Decode entire audio segment as a single buffer
   * @param startTime Start time in seconds
   * @param duration Duration in seconds
   */
  decodeSegment?(startTime: number, duration: number): Promise<DecodedAudioFrame>;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a decoded frame is a video frame
 */
export function isVideoFrame(frame: DecodedFrame): frame is DecodedVideoFrame {
  return frame.type === 'video';
}

/**
 * Check if a decoded frame is an audio frame
 */
export function isAudioFrame(frame: DecodedFrame): frame is DecodedAudioFrame {
  return frame.type === 'audio';
}

/**
 * Check if a decoder is a video decoder
 */
export function isVideoDecoder(decoder: IDecoder): decoder is IVideoDecoder {
  return decoder.type === 'video';
}

/**
 * Check if a decoder is an audio decoder
 */
export function isAudioDecoder(decoder: IDecoder): decoder is IAudioDecoder {
  return decoder.type === 'audio';
}
