/**
 * Media Diff Protocol
 *
 * Defines IPC protocol between Extension Host and Webview for media diff visualization.
 *
 * Responsibilities:
 * - Define request/response message types
 * - Define diff result structures for image/video/audio/timeline
 * - Ensure type-safe communication
 *
 * Engine types (Engine*) from diff.proto are the single source of truth for
 * diff computation results. Protocol types here are presentation-layer reshaping
 * for the Webview IPC contract.
 */

import type { MediaType } from './track';

// Re-export MediaType for convenience
export type { MediaType } from './track';

// Re-export engine diff types for consumers that need raw engine results
export type {
  EngineDiffCategory,
  EngineDiffResult,
  EngineFieldDiff,
  EngineMediaInfo,
  EngineSubtitleStream,
  EngineImageContentDiff,
  EngineAudioContentDiff,
  EngineAudioDiffRegion,
  EngineVideoContentDiff,
  EngineVideoDiffRegion,
  EngineFrameMetric,
  EngineTimelineContentDiff,
  EngineTimelineChangeType,
  EngineTimelineDiffSummary,
  EngineTimelineProjectMeta,
  EngineTrackChange,
  EngineElementChange,
  EnginePropertyChange,
  EngineElementContentDiff,
} from '../generated/diff.engine';

// =============================================================================
// Media Type Definitions
// =============================================================================

/**
 * Supported media file extensions
 */
export const MEDIA_EXTENSIONS: Record<string, MediaType> = {
  // Images
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.svg': 'image',
  // Videos
  '.mp4': 'video',
  '.mov': 'video',
  '.avi': 'video',
  '.mkv': 'video',
  '.webm': 'video',
  '.m4v': 'video',
  // Audio
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.flac': 'audio',
  '.aac': 'audio',
  '.m4a': 'audio',
  // Timeline projects
  '.nkv': 'timeline',
};

/**
 * Diff view modes
 */
export type DiffViewMode = 'side-by-side' | 'overlay' | 'slider' | 'onion-skin';

// =============================================================================
// Git Related Types
// =============================================================================

/**
 * Media file change status in Git
 */
export type GitChangeStatus = 'added' | 'modified' | 'deleted' | 'renamed';

/**
 * Media file change information
 */
export interface MediaFileChange {
  /** File URI */
  uri: string;
  /** Detected media type */
  mediaType: MediaType;
  /** Git change status */
  status: GitChangeStatus;
  /** Old URI for renamed files */
  oldUri?: string;
}

/**
 * Git commit information for file history
 */
export interface GitCommitInfo {
  /** Full commit hash */
  hash: string;
  /** Abbreviated commit hash (7 chars) */
  shortHash: string;
  /** Commit subject (first line of message) */
  subject: string;
  /** Author name */
  authorName: string;
  /** Commit date (ISO 8601 string) */
  date: string;
}

/**
 * File version pair for comparison
 */
export interface FileVersionPair {
  /** Current version (working copy or newer commit) */
  current: ArrayBuffer;
  /** Previous version (HEAD or older commit) */
  previous: ArrayBuffer;
  /** Current file path */
  currentPath: string;
  /** Previous file path */
  previousPath: string;
  /** Detected media type */
  mediaType: MediaType;
  /** Whether this is a new file (no previous version in Git) */
  isNewFile?: boolean;
}

// =============================================================================
// Diff Options and Results
// =============================================================================

/**
 * Diff analysis options
 */
export interface DiffOptions {
  /** Precision level (0-1, higher = more samples) */
  precision?: number;
  /** Generate visual heatmap for differences */
  generateHeatmap?: boolean;
  /** Maximum processing time in milliseconds */
  timeout?: number;
  /** Original file extension (e.g. '.png', '.mp3') for temp file naming */
  fileExtension?: string;
  /** Original file path for current version (skip temp file when available) */
  currentPath?: string;
  /** Original file path for previous version (skip temp file when available) */
  previousPath?: string;
  /** Start time in seconds for range-limited analysis (video/audio only) */
  startTime?: number;
  /** End time in seconds for range-limited analysis (video/audio only) */
  endTime?: number;
}

/**
 * Image diff details — presentation-layer reshaping of EngineImageContentDiff.
 * Maps engine fields: ssim → structuralSimilarity, diffPixelPercent → pixelDifference
 */
export interface ImageDiffDetails {
  /** Dimensions comparison */
  dimensions: {
    current: { width: number; height: number };
    previous: { width: number; height: number };
  };
  /** Pixel difference ratio (0-1) */
  pixelDifference: number;
  /** Structural similarity index (0-1, 1 = identical) */
  structuralSimilarity: number;
  /** Color histogram difference (0-1) */
  colorHistogramDiff: number;
}

/**
 * Keyframe comparison result
 */
export interface KeyframeDiff {
  /** Time position in seconds */
  time: number;
  /** Similarity score (0-1) */
  similarity: number;
}

/**
 * Video diff details — presentation-layer reshaping of EngineVideoContentDiff.
 * Maps engine fields: avgSsim/minSsim → keyframeDiffs, durationA/B → duration
 */
export interface VideoDiffDetails {
  /** Duration comparison in seconds */
  duration: { current: number; previous: number };
  /** Resolution comparison */
  resolution: {
    current: { width: number; height: number };
    previous: { width: number; height: number };
  };
  /** FPS comparison */
  fps: { current: number; previous: number };
  /** Codec comparison */
  codec: { current: string; previous: string };
  /** Keyframe-by-keyframe comparison */
  keyframeDiffs: KeyframeDiff[];
  /** Whether audio track changed */
  audioTrackChanged: boolean;
  /** Diff regions where video frames differ significantly (SSIM < threshold) */
  diffRegions?: Array<{ start: number; end: number; avgSsim: number }>;
}

/**
 * Time range for silence detection
 */
export interface TimeRange {
  start: number;
  end: number;
}

/**
 * Audio diff details — presentation-layer reshaping of EngineAudioContentDiff.
 * Maps engine fields: snr → waveformSimilarity, diffPercent → spectralDifference
 */
export interface AudioDiffDetails {
  /** Duration comparison in seconds */
  duration: { current: number; previous: number };
  /** Sample rate comparison */
  sampleRate: { current: number; previous: number };
  /** Channel count comparison */
  channels: { current: number; previous: number };
  /** Waveform similarity (0-1) */
  waveformSimilarity: number;
  /** Spectral difference (0-1) */
  spectralDifference: number;
  /** Detected silence regions */
  silenceRegions?: { current: TimeRange[]; previous: TimeRange[] };
  /** Diff regions where audio differs significantly (SNR < threshold) */
  diffRegions?: Array<{ start: number; end: number; snr: number }>;
}

// =============================================================================
// Timeline Diff Types (derived from diff.proto via diff.engine.ts)
// =============================================================================

import type {
  EngineTimelineChangeType,
  EngineTimelineDiffSummary,
  EngineTimelineProjectMeta,
} from '../generated/diff.engine';

/** Change type for timeline structural diff — mirrors EngineTimelineChangeType */
export type TimelineChangeType = EngineTimelineChangeType;

/**
 * A single property change.
 * Engine type uses string for previous/current (JSON-encoded).
 * Protocol type uses unknown for flexibility in the presentation layer.
 */
export interface PropertyChange {
  property: string;
  previous: unknown;
  current: unknown;
}

/** Track-level change — aligned with EngineTrackChange */
export interface TrackChange {
  trackId: string;
  trackName: string;
  trackType: string;
  changeType: TimelineChangeType;
  /** Property changes (for 'modified') */
  propertyChanges?: PropertyChange[];
  /** Element changes within this track */
  elementChanges?: ElementChange[];
}

/** Element-level change — aligned with EngineElementChange */
export interface ElementChange {
  elementId: string;
  elementName: string;
  elementType: string;
  changeType: TimelineChangeType;
  /** Property changes (for 'modified') */
  propertyChanges?: PropertyChange[];
  /** Source media path (for lazy content diff) */
  src?: string;
  /** Previous source media path (if src changed) */
  previousSrc?: string;
  /** Time position in timeline */
  startTime?: number;
  duration?: number;
}

/** Timeline diff summary — mirrors EngineTimelineDiffSummary */
export type TimelineDiffSummary = EngineTimelineDiffSummary;

/** Timeline project metadata — mirrors EngineTimelineProjectMeta */
export type TimelineProjectMeta = EngineTimelineProjectMeta;

/**
 * Timeline (JVI project) diff details.
 * Presentation-layer reshaping of EngineTimelineContentDiff for the Webview.
 */
export interface TimelineDiffDetails {
  /** Project metadata comparison */
  project: {
    name: { current: string; previous: string };
    resolution: {
      current: { width: number; height: number };
      previous: { width: number; height: number };
    };
    fps: { current: number; previous: number };
  };
  /** Track-level changes */
  trackChanges: TrackChange[];
  /** Summary counts */
  summary: {
    tracksAdded: number;
    tracksRemoved: number;
    tracksModified: number;
    elementsAdded: number;
    elementsRemoved: number;
    elementsModified: number;
    /** Number of elements with changed media source (candidates for content diff) */
    mediaSourceChanges: number;
  };
  /** Total duration comparison */
  duration: { current: number; previous: number };
  /** Per-element content diffs (only when includeContentDiff=true) */
  elementContentDiffs?: ElementContentDiffDetail[];
}

/** Content diff result for a single element whose media source changed */
export interface ElementContentDiffDetail {
  /** Element ID this diff belongs to */
  elementId: string;
  /** Element type (media / audio) */
  elementType: string;
  /** Current media source path */
  currentSrc: string;
  /** Previous media source path */
  previousSrc: string;
  /** Content type: "image" | "audio" | "video" | "error" */
  contentType: 'image' | 'audio' | 'video' | 'error';
  /** Image diff (when contentType="image") */
  imageDiff?: import('../generated/diff.engine').EngineImageContentDiff;
  /** Audio diff (when contentType="audio") */
  audioDiff?: import('../generated/diff.engine').EngineAudioContentDiff;
  /** Video diff (when contentType="video") */
  videoDiff?: import('../generated/diff.engine').EngineVideoContentDiff;
  /** Error message (when contentType="error") */
  errorMessage?: string;
}

/**
 * Diff visualization data
 */
export interface DiffVisualization {
  /** Heatmap image buffer (PNG) for image diff */
  heatmap?: ArrayBuffer;
  /** Current version waveform data points */
  currentWaveform?: number[];
  /** Previous version waveform data points */
  previousWaveform?: number[];
  /** Current keyframe images (JPEG buffers) */
  currentKeyframes?: ArrayBuffer[];
  /** Previous keyframe images (JPEG buffers) */
  previousKeyframes?: ArrayBuffer[];
}

/**
 * Complete diff result
 */
export interface DiffResult {
  /** Media type */
  mediaType: MediaType;
  /** Overall similarity score (0-1) */
  similarity: number;
  /** Type-specific details */
  details: ImageDiffDetails | VideoDiffDetails | AudioDiffDetails | TimelineDiffDetails;
  /** Visualization data */
  visualization?: DiffVisualization;
}

// =============================================================================
// Git Commit Info
// =============================================================================

/**
 * Git commit information for file history
 */
export interface GitCommitInfo {
  /** Commit hash (full SHA) */
  hash: string;
  /** Short hash (first 7 characters) */
  shortHash: string;
  /** Commit subject (first line of message) */
  subject: string;
  /** Author name */
  authorName: string;
  /** Commit date (ISO 8601 string) */
  date: string;
}

// =============================================================================
// IPC Message Types - Requests (Webview → Extension)
// =============================================================================

/**
 * Base request structure
 */
interface BaseMediaDiffRequest {
  /** Unique request ID for response matching */
  requestId: string;
  /** Request timestamp */
  timestamp: number;
}

/**
 * Initialize diff request (Git-based comparison)
 */
export interface InitDiffRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:init';
  payload: {
    /** File URI to diff */
    fileUri: string;
    /** Git ref to compare against (default: HEAD) */
    ref?: string;
  };
}

/**
 * Initialize local file diff request (two local files comparison)
 */
export interface InitLocalDiffRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:initLocal';
  payload: {
    /** Current file URI (shown on the right) */
    currentUri: string;
    /** Previous file URI (shown on the left) */
    previousUri: string;
  };
}

/**
 * Change view mode request
 */
export interface SetViewModeRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:setViewMode';
  payload: {
    mode: DiffViewMode;
  };
}

/**
 * Seek to specific time (for video/audio)
 */
export interface SeekRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:seek';
  payload: {
    time: number;
  };
}

/**
 * Get frame at specific time (for video)
 */
export interface GetFrameRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:getFrame';
  payload: {
    time: number;
    version: 'current' | 'previous';
  };
}

/**
 * Cancel ongoing analysis
 */
export interface CancelAnalysisRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:cancel';
}

/**
 * Get file history (Git commits) request
 */
export interface GetFileHistoryRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:getFileHistory';
  payload: {
    /** Maximum number of commits to return */
    maxCount?: number;
  };
}

/**
 * Change comparison ref and re-run diff
 */
export interface ChangeRefRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:changeRef';
  payload: {
    /** Git ref to compare against (commit hash, branch, tag) */
    ref: string;
  };
}

/**
 * Re-run diff with a specific time range (video/audio only)
 */
export interface SetTimeRangeRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:setTimeRange';
  payload: {
    /** Start time in seconds (inclusive). Omit or 0 for beginning. */
    startTime?: number;
    /** End time in seconds (inclusive). Omit for full duration. */
    endTime?: number;
  };
}

/**
 * Inspect element request (lazy content diff for timeline media elements)
 */
export interface InspectElementRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:inspectElement';
  payload: {
    /** Media source path */
    src: string;
  };
}

/**
 * Start dual-stream video diff (replaces frame extraction for video)
 */
export interface StartStreamingRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:startStreaming';
  payload: Record<string, never>;
}

/**
 * Stop dual-stream video diff
 */
export interface StopStreamingRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:stopStreaming';
  payload: Record<string, never>;
}

/**
 * Stream playback control (play, pause, seek)
 */
export interface StreamControlRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:streamControl';
  payload: {
    action: 'play' | 'pause' | 'seek';
    /** Seek time in seconds (only for action='seek') */
    time?: number;
    /** Playback speed multiplier (only for action='play') */
    speed?: number;
  };
}

/**
 * Start audio-only streaming for audio diff
 */
export interface StartAudioStreamingRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:startAudioStreaming';
  payload: Record<string, never>;
}

/**
 * Stop audio-only streaming
 */
export interface StopAudioStreamingRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:stopAudioStreaming';
  payload: Record<string, never>;
}

/**
 * Audio stream playback control (play, pause, seek)
 */
export interface AudioStreamControlRequest extends BaseMediaDiffRequest {
  type: 'mediaDiff:audioStreamControl';
  payload: {
    action: 'play' | 'pause' | 'seek';
    /** Seek time in seconds (only for action='seek') */
    time?: number;
  };
}

/**
 * All request types
 */
export type MediaDiffRequest =
  | InitDiffRequest
  | InitLocalDiffRequest
  | SetViewModeRequest
  | SeekRequest
  | GetFrameRequest
  | CancelAnalysisRequest
  | GetFileHistoryRequest
  | ChangeRefRequest
  | SetTimeRangeRequest
  | InspectElementRequest
  | StartStreamingRequest
  | StopStreamingRequest
  | StreamControlRequest
  | StartAudioStreamingRequest
  | StopAudioStreamingRequest
  | AudioStreamControlRequest;

// =============================================================================
// IPC Message Types - Responses (Extension → Webview)
// =============================================================================

/**
 * Base response structure
 */
interface BaseMediaDiffResponse {
  /** Corresponding request ID */
  requestId?: string;
  /** Response type */
  type: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Diff initialization result
 */
export interface DiffInitResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:initResult';
  payload?: {
    /** Media type detected */
    mediaType: MediaType;
    /** Current file path */
    currentPath: string;
    /** Previous file path/ref */
    previousRef: string;
  };
}

/**
 * Diff analysis progress
 */
export interface DiffProgressResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:progress';
  payload: {
    /** Progress percentage (0-100) */
    progress: number;
    /** Current stage description */
    stage: string;
  };
}

/**
 * Diff analysis complete
 */
export interface DiffResultResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:result';
  payload: DiffResult;
}

/**
 * Frame data response
 */
export interface FrameDataResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:frameData';
  payload: {
    time: number;
    version: 'current' | 'previous';
    /** JPEG image buffer */
    imageBuffer: ArrayBuffer;
  };
}

/**
 * Image data for visualization
 */
export interface ImageDataResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:imageData';
  payload: {
    /** Current image buffer */
    currentImage: ArrayBuffer;
    /** Previous image buffer */
    previousImage: ArrayBuffer;
    /** Heatmap overlay (optional) */
    heatmap?: ArrayBuffer;
    /** MIME type */
    mimeType: string;
  };
}

/**
 * Waveform data for audio visualization
 */
export interface WaveformDataResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:waveformData';
  payload: {
    currentWaveform: number[];
    previousWaveform: number[];
  };
}

/**
 * File history response
 */
export interface FileHistoryResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:fileHistory';
  payload: {
    commits: GitCommitInfo[];
  };
}

/**
 * Audio-only stream configuration for audio diff (no video).
 * Sent when audio diff starts streaming via WebSocket PCM.
 */
export interface AudioStreamConfig {
  /** Frame server port */
  port: number;
  /** Current version audio stream ID */
  currentAudioStreamId: string;
  /** Previous version audio stream ID */
  previousAudioStreamId: string;
  /** Audio duration in seconds */
  duration: number;
}

/**
 * Stream configuration data sent to webview after streams are created
 */
export interface StreamConfig {
  /** Frame server port */
  port: number;
  /** Current version video stream ID */
  currentStreamId: string;
  /** Previous version video stream ID */
  previousStreamId: string;
  /** Current version audio stream ID (if audio exists) */
  currentAudioStreamId?: string;
  /** Previous version audio stream ID (if audio exists) */
  previousAudioStreamId?: string;
  /** Video width */
  width: number;
  /** Video height */
  height: number;
  /** Video framerate */
  fps: number;
  /** Video duration in seconds */
  duration: number;
}

/**
 * Stream config response (Extension → Webview)
 */
export interface StreamConfigResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:streamConfig';
  payload: StreamConfig;
}

/**
 * Audio stream config response (Extension → Webview)
 */
export interface AudioStreamConfigResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:audioStreamConfig';
  payload: AudioStreamConfig;
}

/**
 * Stream error response (Extension → Webview)
 */
export interface StreamErrorResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:streamError';
  error: string;
}

/**
 * Element thumbnail response (lazy content diff)
 */
export interface ElementThumbnailResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:elementThumbnail';
  payload: {
    src: string;
    imageBuffer: ArrayBuffer;
  };
}

/**
 * Fetch state response — sent by Extension when Git previous-version
 * extraction starts/finishes. Webview uses this to disable Play button
 * until the previous file is available for streaming.
 */
export interface FetchStateResponse extends BaseMediaDiffResponse {
  type: 'mediaDiff:fetchState';
  /** 'fetching': git show in progress; 'ready': file available or fetch skipped */
  state: 'fetching' | 'ready';
}

/**
 * All response types
 */
export type MediaDiffResponse =
  | DiffInitResponse
  | DiffProgressResponse
  | DiffResultResponse
  | FrameDataResponse
  | ImageDataResponse
  | WaveformDataResponse
  | FileHistoryResponse
  | ElementThumbnailResponse
  | StreamConfigResponse
  | AudioStreamConfigResponse
  | StreamErrorResponse
  | FetchStateResponse;

// =============================================================================
// Protocol Constants
// =============================================================================

/** Protocol version */
export const MEDIA_DIFF_PROTOCOL_VERSION = '1.0.0';

/** Default analysis timeout (30 seconds) */
export const DEFAULT_DIFF_TIMEOUT = 30000;

/** Default analysis timeout for video (120 seconds) — SSIM/PSNR is per-frame */
export const DEFAULT_VIDEO_DIFF_TIMEOUT = 120000;

/** Default keyframe sample count for video diff */
export const DEFAULT_KEYFRAME_SAMPLES = 10;

/** Default waveform sample count for audio diff */
export const DEFAULT_WAVEFORM_SAMPLES = 1000;

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Get media type from file extension
 */
export function getMediaType(filePath: string): MediaType | null {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!ext) return null;
  return MEDIA_EXTENSIONS[ext] ?? null;
}

/**
 * Check if file is a supported media file
 */
export function isSupportedMediaFile(filePath: string): boolean {
  return getMediaType(filePath) !== null;
}

/**
 * Format similarity as percentage string
 */
export function formatSimilarity(similarity: number): string {
  return `${(similarity * 100).toFixed(1)}%`;
}

/**
 * Get similarity interpretation
 */
export function getSimilarityLevel(
  similarity: number,
): 'identical' | 'similar' | 'different' | 'significantly-different' {
  if (similarity >= 0.99) return 'identical';
  if (similarity >= 0.9) return 'similar';
  if (similarity >= 0.5) return 'different';
  return 'significantly-different';
}
