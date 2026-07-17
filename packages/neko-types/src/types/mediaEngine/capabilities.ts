/**
 * Media Engine Capabilities
 *
 * Defines capability detection types for the compatible mode media engine.
 */

// =============================================================================
// Codec Capabilities
// =============================================================================

/**
 * Supported video codec identifiers
 */
export type VideoCodecId = 'h264' | 'h265' | 'vp8' | 'vp9' | 'av1' | 'prores' | 'dnxhd';

/**
 * Supported audio codec identifiers
 */
export type AudioCodecId = 'aac' | 'mp3' | 'opus' | 'vorbis' | 'flac' | 'pcm' | 'ac3' | 'dts';

/**
 * Video codec capability
 */
export interface VideoCodecCapability {
  /** Codec identifier */
  codec: VideoCodecId;
  /** Whether decoding is supported */
  decode: boolean;
  /** Whether encoding is supported */
  encode: boolean;
  /** Supported profiles (e.g., 'baseline', 'main', 'high' for H.264) */
  profiles?: string[];
  /** Maximum supported bitrate in bps */
  maxBitrate?: number;
  /** Maximum supported resolution */
  maxResolution?: { width: number; height: number };
  /** Whether hardware acceleration is available */
  hardwareAccelerated?: boolean;
}

/**
 * Audio codec capability
 */
export interface AudioCodecCapability {
  /** Codec identifier */
  codec: AudioCodecId;
  /** Whether decoding is supported */
  decode: boolean;
  /** Whether encoding is supported */
  encode: boolean;
  /** Maximum supported sample rate in Hz */
  maxSampleRate?: number;
  /** Maximum supported channels */
  maxChannels?: number;
  /** Supported bit depths */
  bitDepths?: number[];
}

// =============================================================================
// Hardware Acceleration
// =============================================================================

/**
 * Hardware acceleration type
 */
export type HardwareAccelType =
  | 'videotoolbox' // macOS
  | 'nvenc' // NVIDIA
  | 'vaapi' // Linux
  | 'qsv' // Intel Quick Sync
  | 'd3d11va' // Windows
  | 'wgpu'; // wgpu (compatible mode)

/**
 * Hardware acceleration info
 */
export interface HardwareAccelInfo {
  /** Whether hardware acceleration is available */
  available: boolean;
  /** Hardware acceleration type */
  type?: HardwareAccelType;
  /** Device name */
  deviceName?: string;
  /** Supported decoders */
  decoders?: string[];
  /** Supported encoders */
  encoders?: string[];
  /** Recommended decoder */
  recommendedDecoder?: string;
  /** Recommended encoder */
  recommendedEncoder?: string;
}

// =============================================================================
// Engine Capabilities
// =============================================================================

/**
 * Media engine capabilities
 *
 * Describes what the media engine can do, used for feature availability checks.
 */
export interface MediaEngineCapabilities {
  /** Supported video codecs */
  videoCodecs: VideoCodecCapability[];
  /** Supported audio codecs */
  audioCodecs: AudioCodecCapability[];
  /** Supported container formats */
  containerFormats: string[];
  /** Whether hardware acceleration is available */
  hardwareAcceleration: boolean;
  /** Hardware acceleration details */
  hwAccelInfo?: HardwareAccelInfo;
  /** Maximum supported resolution */
  maxResolution: { width: number; height: number };
  /** Whether HDR is supported */
  hdrSupport: boolean;
  /** Whether GPU effects processing is available */
  gpuEffects: boolean;
  /** GPU backend */
  gpuBackend?: 'wgpu';
}

// =============================================================================
// Capability Helpers
// =============================================================================

/**
 * Check if capabilities support a specific video codec for decoding
 */
export function canDecodeVideo(capabilities: MediaEngineCapabilities, codec: string): boolean {
  const codecLower = codec.toLowerCase();
  return capabilities.videoCodecs.some((c) => c.codec === codecLower && c.decode);
}

/**
 * Check if capabilities support a specific video codec for encoding
 */
export function canEncodeVideo(capabilities: MediaEngineCapabilities, codec: string): boolean {
  const codecLower = codec.toLowerCase();
  return capabilities.videoCodecs.some((c) => c.codec === codecLower && c.encode);
}

/**
 * Check if capabilities support a specific audio codec for decoding
 */
export function canDecodeAudio(capabilities: MediaEngineCapabilities, codec: string): boolean {
  const codecLower = codec.toLowerCase();
  return capabilities.audioCodecs.some((c) => c.codec === codecLower && c.decode);
}

/**
 * Check if capabilities support a specific audio codec for encoding
 */
export function canEncodeAudio(capabilities: MediaEngineCapabilities, codec: string): boolean {
  const codecLower = codec.toLowerCase();
  return capabilities.audioCodecs.some((c) => c.codec === codecLower && c.encode);
}

/**
 * Check if capabilities support a specific container format
 */
export function supportsContainer(
  capabilities: MediaEngineCapabilities,
  container: string,
): boolean {
  const containerLower = container.toLowerCase();
  return capabilities.containerFormats.includes(containerLower);
}

// =============================================================================
// Default Capabilities
// =============================================================================

/**
 * Default capabilities for compatible mode (Native FFmpeg + wgpu via NAPI)
 */
export const COMPATIBLE_MODE_CAPABILITIES: MediaEngineCapabilities = {
  videoCodecs: [
    {
      codec: 'h264',
      decode: true,
      encode: true,
      profiles: ['baseline', 'main', 'high'],
      hardwareAccelerated: true,
    },
    {
      codec: 'h265',
      decode: true,
      encode: true,
      profiles: ['main', 'main10'],
      hardwareAccelerated: true,
    },
    { codec: 'vp8', decode: true, encode: true },
    { codec: 'vp9', decode: true, encode: true },
    { codec: 'av1', decode: true, encode: false },
    {
      codec: 'prores',
      decode: true,
      encode: true,
      profiles: ['proxy', 'lt', 'standard', 'hq', '4444'],
    },
    { codec: 'dnxhd', decode: true, encode: true },
  ],
  audioCodecs: [
    { codec: 'aac', decode: true, encode: true, maxSampleRate: 96000, maxChannels: 8 },
    { codec: 'mp3', decode: true, encode: true, maxSampleRate: 48000, maxChannels: 2 },
    { codec: 'opus', decode: true, encode: true, maxSampleRate: 48000, maxChannels: 8 },
    { codec: 'vorbis', decode: true, encode: true, maxSampleRate: 48000, maxChannels: 8 },
    { codec: 'flac', decode: true, encode: true, maxSampleRate: 192000, maxChannels: 8 },
    { codec: 'pcm', decode: true, encode: true, maxSampleRate: 192000, maxChannels: 8 },
    { codec: 'ac3', decode: true, encode: true, maxSampleRate: 48000, maxChannels: 6 },
    { codec: 'dts', decode: true, encode: false, maxSampleRate: 48000, maxChannels: 6 },
  ],
  containerFormats: ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi', 'mxf'],
  hardwareAcceleration: true,
  maxResolution: { width: 8192, height: 4320 },
  hdrSupport: true,
  gpuEffects: true,
  gpuBackend: 'wgpu',
};
