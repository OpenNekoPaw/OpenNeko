/**
 * Engine dispatch types — aligned with neko-engine Rust & Proto definitions
 *
 * Authoritative sources:
 * - Proto: packages/neko-proto/diff.proto
 * - Rust types: packages/neko-engine/packages/types/src/{request,media,waveform,stream}.rs
 * - Rust diff: packages/neko-engine/packages/engine-kernel/src/media_service/{diff,audio_diff,video_diff,image_diff,timeline_diff}.rs
 *
 * Environment-agnostic: works in both Extension Host (Node.js 18+) and Webview (browser).
 */

// =============================================================================
// Request / Response (from types/src/request.rs)
// =============================================================================

export interface ActionRequest {
  group: string;
  action: string;
  id?: string;
  /** Top-level source path (Rust also checks options.source as fallback) */
  source?: string;
  /** Session ID for stream management */
  sessionId?: string;
  /** Stream ID for stream control */
  streamId?: string;
  options?: Record<string, unknown>;
  body?: unknown;
}

export interface ActionResponse {
  id: string;
  status: 'ok' | 'error' | 'pending' | 'progress';
  data?: unknown;
  progress?: unknown;
  error?: ApiError | null;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// =============================================================================
// Raw Rust response types — MediaInfo (from types/src/media.rs)
// =============================================================================

/** Raw probe response from Rust `videos:probe` / `audios:probe` */
export interface RawProbeData {
  duration: number;
  format: string;
  fileSize: number;
  videoStreams: VideoStreamInfo[];
  audioStreams: AudioStreamInfo[];
  subtitleStreams: SubtitleStreamInfo[];
}

export interface VideoStreamInfo {
  index: number;
  codec: string;
  width: number;
  height: number;
  fps: number;
  bitrate?: number;
  pixelFormat: string;
  hwAccel?: string;
  frameCount?: number;
  colorSpace?: string;
  colorRange?: string;
}

export interface AudioStreamInfo {
  index: number;
  codec: string;
  sampleRate: number;
  channels: number;
  bitrate?: number;
  channelLayout?: string;
  language?: string;
}

export interface SubtitleStreamInfo {
  index: number;
  codec: string;
  language?: string;
  title?: string;
}

// =============================================================================
// Raw Rust response — WaveformData (from types/src/waveform.rs)
// =============================================================================

/** Raw waveform response from Rust `audios:waveform` */
export interface RawWaveformData {
  sampleRate: number;
  channels: number;
  peaksPerSecond: number;
  duration: number;
  /** Multi-channel peaks: peaks[channel][sampleIndex] */
  peaks: number[][];
}

// =============================================================================
// Raw Rust response — StreamSession (from types/src/stream.rs)
// =============================================================================

export interface RawStreamSession {
  streamId: string;
  sessionId: string;
  wsPort: number;
  wsEndpoint: string;
  resolution: Resolution;
  fps: number;
}

export interface Resolution {
  width: number;
  height: number;
}

// =============================================================================
// Diff types (from engine-kernel/src/media_service/diff.rs + proto diff.proto)
// =============================================================================

export type DiffCategory = 'Video' | 'Audio' | 'Image' | 'Timeline';

export interface FieldDiff {
  field: string;
  valueA: unknown;
  valueB: unknown;
  changed: boolean;
}

/**
 * Top-level diff result from Rust `{group}:diff`
 *
 * After responseTransform, the tagged `content` field is flattened to:
 * imageDiff / audioDiff / videoDiff / timelineDiff
 */
export interface DiffResult {
  sourceA: string;
  sourceB: string;
  category: DiffCategory;
  identical: boolean;
  diffCount: number;
  totalFields: number;
  fields: FieldDiff[];
  infoA: unknown;
  infoB: unknown;
  /** Present after responseTransform for image diffs */
  imageDiff?: ImageContentDiff;
  /** Present after responseTransform for audio diffs */
  audioDiff?: AudioContentDiff;
  /** Present after responseTransform for video diffs */
  videoDiff?: VideoContentDiff;
  /** Present after responseTransform for timeline diffs */
  timelineDiff?: TimelineContentDiff;
}

// =============================================================================
// ImageContentDiff (from engine-kernel/src/media_service/image_diff.rs)
// =============================================================================

export interface ImageContentDiff {
  ssim: number;
  psnr: number;
  mse: number;
  diffPixelPercent: number;
  diffPixelCount: number;
  totalPixels: number;
  widthA: number;
  heightA: number;
  widthB: number;
  heightB: number;
  /** JPEG base64-encoded heatmap image */
  heatmap: string;
  heatmapWidth: number;
  heatmapHeight: number;
}

// =============================================================================
// AudioContentDiff (from engine-kernel/src/media_service/audio_diff.rs)
// =============================================================================

export interface AudioDiffRegion {
  start: number;
  end: number;
  snr: number;
  rmsDiff: number;
}

export interface AudioContentDiff {
  /** Signal-to-Noise Ratio (dB) */
  snr: number;
  durationA: number;
  durationB: number;
  compareSampleRate: number;
  totalSamples: number;
  diffSegmentCount: number;
  totalSegments: number;
  diffPercent: number;
  diffRegions: AudioDiffRegion[];
  /** Downsampled waveform peaks (~800 points) for file A */
  waveformPeaksA: number[];
  /** Downsampled waveform peaks (~800 points) for file B */
  waveformPeaksB: number[];
}

// =============================================================================
// VideoContentDiff (from engine-kernel/src/media_service/video_diff.rs)
// =============================================================================

export interface FrameMetric {
  frame: number;
  timestamp: number;
  ssim: number;
  psnr: number;
}

export interface VideoDiffRegion {
  start: number;
  end: number;
  avgSsim: number;
  minSsim: number;
  frameCount: number;
}

export interface VideoContentDiff {
  avgSsim: number;
  minSsim: number;
  avgPsnr: number;
  minPsnr: number;
  durationA: number;
  durationB: number;
  fpsA: number;
  fpsB: number;
  widthA: number;
  heightA: number;
  widthB: number;
  heightB: number;
  totalFramesCompared: number;
  diffFrameCount: number;
  diffFramePercent: number;
  frameMetrics: FrameMetric[];
  diffRegions: VideoDiffRegion[];
  /** Embedded audio diff (if video has audio track) */
  audioDiff?: AudioContentDiff;
  /** Path to generated diff video (if requested) */
  diffVideoPath?: string;
}

// =============================================================================
// TimelineContentDiff (from engine-kernel/src/media_service/timeline_diff.rs)
// =============================================================================

export type TimelineChangeType = 'Added' | 'Removed' | 'Modified' | 'Moved' | 'Unchanged';

export interface PropertyChange {
  property: string;
  previous: unknown;
  current: unknown;
}

export interface ElementChange {
  elementId: string;
  elementName: string;
  elementType: string;
  changeType: TimelineChangeType;
  propertyChanges: PropertyChange[];
  src?: string;
  previousSrc?: string;
  startTime?: number;
  duration?: number;
}

export interface TrackChange {
  trackId: string;
  trackName: string;
  trackType: string;
  changeType: TimelineChangeType;
  propertyChanges: PropertyChange[];
  elementChanges: ElementChange[];
}

export interface TimelineDiffSummary {
  tracksAdded: number;
  tracksRemoved: number;
  tracksModified: number;
  elementsAdded: number;
  elementsRemoved: number;
  elementsModified: number;
  mediaSourceChanges: number;
}

export interface TimelineProjectMeta {
  name: string;
  resolutionWidth: number;
  resolutionHeight: number;
  fps: number;
}

export interface ElementContentDiffResult {
  elementId: string;
  elementType: string;
  currentSrc: string;
  previousSrc: string;
  /** Tagged: contentType = 'Image' | 'Audio' | 'Video' | 'Error' */
  contentType: string;
  diff?: ImageContentDiff;
  audioDiff?: AudioContentDiff;
  videoDiff?: VideoContentDiff;
  message?: string;
}

export interface TimelineContentDiff {
  currentProject?: TimelineProjectMeta;
  previousProject?: TimelineProjectMeta;
  trackChanges: TrackChange[];
  summary: TimelineDiffSummary;
  durationCurrent: number;
  durationPrevious: number;
  elementContentDiffs: ElementContentDiffResult[];
}

// =============================================================================
// Convenience result types (after transformation)
// =============================================================================

/** Flattened probe result — primary video/audio stream extracted */
export interface ProbeResult {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  format: string;
  bitrate?: number;
  hasAudio: boolean;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  audioBitrate?: number;
}

/** Waveform result with downmixed mono peaks plus optional per-channel peaks. */
export interface WaveformResult {
  /** Downmixed mono peaks kept for compatibility with existing callers. */
  peaks: number[];
  /** Per-channel peaks from Engine when available. */
  channelPeaks?: number[][];
  sampleRate: number;
  channels: number;
  duration: number;
  peaksPerSecond: number;
}

// =============================================================================
// Loudness Analysis (from engine-kernel/src/domain/loudness.rs)
// =============================================================================

/** Result of ITU-R BS.1770-4 loudness analysis */
export interface LoudnessAnalysis {
  /** Integrated loudness in LUFS */
  integratedLufs: number;
  /** True peak level in dBFS */
  truePeakDbfs: number;
  /** Loudness Range in LU */
  loudnessRange: number;
  /** Recommended gain adjustment in dB to reach targetLufs */
  recommendedGain: number;
  /** Target LUFS used for calculation */
  targetLufs: number;
}

// =============================================================================
// Silence Detection (from engine-kernel/src/domain/silence.rs)
// =============================================================================

/** A contiguous region of silence in the audio */
export interface SilenceRegion {
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Duration in seconds */
  duration: number;
}

/** Result of silence detection for an audio source */
export interface SilenceAnalysis {
  /** Total duration of the audio in seconds */
  totalDuration: number;
  /** Total silence duration in seconds */
  silenceDuration: number;
  /** Ratio of silence to total duration (0.0 - 1.0) */
  silenceRatio: number;
  /** Number of silent regions detected */
  regionCount: number;
  /** Individual silence regions sorted by start time */
  regions: SilenceRegion[];
  /** Threshold used for detection in dBFS */
  thresholdDbfs: number;
  /** Minimum duration used for detection in seconds */
  minDuration: number;
}

// =============================================================================
// Effects types (from engine-kernel/src/gpu/custom_shader_processor.rs)
// =============================================================================

/** Shader parameter definition */
export interface ShaderParamDef {
  name: string;
  default: number;
  min: number;
  max: number;
}

/** Preset shader metadata returned by `effects:list` / `effects:info` */
export interface EffectPresetInfo {
  id: string;
  description: string;
  params: ShaderParamDef[];
}

export type EffectKind = 'shader' | 'audio' | 'lut';

export type EffectSource = 'built-in' | 'user';

export interface EffectParamOption {
  value: unknown;
  label?: string;
  labelKey?: string;
}

export interface EffectCapabilityParamDef {
  name: string;
  type: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  labelKey?: string;
  options?: EffectParamOption[];
  animatable?: boolean;
}

export interface EffectCapability {
  id: string;
  kind: EffectKind;
  source: EffectSource;
  sourceId?: string;
  name: string;
  nameKey?: string;
  description?: string;
  category?: string;
  gpuAccelerated?: boolean;
  entry?: string;
  params: EffectCapabilityParamDef[];
}

/** Result of `effects:apply` — processed RGBA frame */
export interface EffectApplyResult {
  width: number;
  height: number;
  shaderId: string;
  size: number;
  /** Base64-encoded RGBA pixel data */
  data: string;
}

/** Stream handle with convenience WebSocket URL */
export interface StreamHandle {
  streamId: string;
  wsUrl: string;
  /** Session ID from Rust StreamSession */
  sessionId?: string;
  /** Stream resolution */
  resolution?: Resolution;
  /** Stream FPS */
  fps?: number;
  /** For timelines:stream which returns both video and audio stream IDs */
  audioStreamId?: string;
  audioWsUrl?: string;
}

/** Paired video + audio stream handle returned by MediaPlaybackService.startPlayback() */
export interface PlaybackHandle {
  videoStreamId: string | null;
  audioStreamId: string | null;
  videoStreamUrl: string | null;
  audioStreamUrl: string | null;
}

// =============================================================================
// Project context (from types/src/project_context.rs)
// =============================================================================

/**
 * Project context for resolving paths in project files.
 *
 * Passed to engine when processing project files that contain relative
 * or variable paths (e.g. NKV, NKC). The engine uses this to resolve
 * "${VAR}/rest" and relative paths to absolute local paths.
 */
export interface ProjectContext {
  /** Project file's parent directory (absolute path) */
  projectDir: string;
  /** Path variable map: VAR_NAME → absolute directory path */
  variables: Record<string, string>;
}

/** A variable referenced in source paths but not present in the context */
export interface MissingVariable {
  variable: string;
  references: string[];
}
