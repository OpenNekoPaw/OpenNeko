/**
 * Muxer Types
 *
 * Defines the unified muxer interface for MP4 and WebM container formats.
 */

// =============================================================================
// Muxer State
// =============================================================================

/**
 * Muxer state
 */
export type MuxerState =
  | 'idle'
  | 'initializing'
  | 'muxing'
  | 'finalizing'
  | 'completed'
  | 'error'
  | 'cancelled';

// =============================================================================
// Muxer Configuration
// =============================================================================

/**
 * Muxer video configuration
 */
export interface MuxerVideoConfig {
  /** Video codec */
  codec: 'h264' | 'h265' | 'vp8' | 'vp9' | 'av1';
  /** Video width */
  width: number;
  /** Video height */
  height: number;
  /** Frame rate */
  fps: number;
}

/**
 * Muxer audio configuration
 */
export interface MuxerAudioConfig {
  /** Audio codec */
  codec: 'aac' | 'opus';
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of channels */
  channels: number;
}

/**
 * Muxer configuration
 */
export interface MuxerConfig {
  /** Output format */
  format: 'mp4' | 'webm';
  /** Video configuration */
  video: MuxerVideoConfig;
  /** Audio configuration (optional) */
  audio?: MuxerAudioConfig;
  /** Enable fast start (moov atom at beginning for MP4) */
  fastStart?: boolean | 'in-memory' | 'fragmented';
  /** First timestamp behavior */
  firstTimestampBehavior?: 'strict' | 'offset' | 'cross-track-offset';
}

// =============================================================================
// Muxer Progress and Result
// =============================================================================

/**
 * Muxer progress information
 */
export interface MuxerProgress {
  /** Number of video frames processed */
  videoFrames: number;
  /** Number of audio chunks processed */
  audioChunks: number;
  /** Current output size in bytes */
  currentSize: number;
  /** Processed duration in seconds */
  processedDuration: number;
}

/**
 * Muxer result
 */
export interface MuxerResult {
  /** Whether muxing succeeded */
  success: boolean;
  /** Output blob (if success) */
  blob?: Blob;
  /** Output file size in bytes (if success) */
  fileSize?: number;
  /** Total duration in seconds (if success) */
  duration?: number;
  /** Error message (if failed) */
  error?: string;
}

// =============================================================================
// Encoded Chunks
// =============================================================================

/**
 * Encoded video chunk for muxer
 */
export interface MuxerVideoChunk {
  /** Encoded video data */
  data: Uint8Array;
  /** Timestamp in microseconds */
  timestamp: number;
  /** Chunk type */
  type: 'key' | 'delta';
  /** Duration in microseconds */
  duration?: number;
  /** Composition time offset (for B-frames) */
  compositionTimeOffset?: number;
}

/**
 * Encoded audio chunk for muxer
 */
export interface MuxerAudioChunk {
  /** Encoded audio data */
  data: Uint8Array;
  /** Timestamp in microseconds */
  timestamp: number;
  /** Duration in microseconds */
  duration: number;
  /** Whether this is a keyframe */
  isKeyframe: boolean;
}

// =============================================================================
// Muxer Interface
// =============================================================================

/**
 * Muxer event type
 */
export interface MuxerEvent<T> {
  (listener: (data: T) => void): { dispose: () => void };
}

/**
 * Unified muxer interface
 *
 * Provides a consistent API for container muxing,
 * supporting both MP4 and WebM formats.
 */
export interface IMuxer {
  /** Current muxer state */
  readonly state: MuxerState;

  /** Whether the muxer is ready to accept chunks */
  readonly isReady: boolean;

  /**
   * Initialize the muxer with configuration
   * @param config Muxer configuration
   */
  initialize(config: MuxerConfig): Promise<void>;

  /**
   * Add a video chunk
   * @param chunk Encoded video chunk
   */
  addVideoChunk(chunk: MuxerVideoChunk): void;

  /**
   * Add an audio chunk
   * @param chunk Encoded audio chunk
   */
  addAudioChunk(chunk: MuxerAudioChunk): void;

  /**
   * Finalize muxing and return result
   * @returns Muxer result with output blob
   */
  finalize(): Promise<MuxerResult>;

  /**
   * Cancel muxing
   */
  cancel(): void;

  /**
   * Dispose resources
   */
  dispose(): void;

  /**
   * Progress event
   */
  onProgress: MuxerEvent<MuxerProgress>;
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a chunk is a video chunk
 */
export function isVideoChunk(chunk: MuxerVideoChunk | MuxerAudioChunk): chunk is MuxerVideoChunk {
  return 'type' in chunk && (chunk.type === 'key' || chunk.type === 'delta');
}

/**
 * Check if a chunk is an audio chunk
 */
export function isAudioChunk(chunk: MuxerVideoChunk | MuxerAudioChunk): chunk is MuxerAudioChunk {
  return 'isKeyframe' in chunk;
}
