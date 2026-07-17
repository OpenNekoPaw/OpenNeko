// =============================================================================
// AUTO-GENERATED — DO NOT EDIT
//
// Source: packages/neko-proto/diff.proto
// Source hash: 07a442e88f0bb432
// Command: node scripts/proto-gen-ts.mjs
// =============================================================================

// =============================================================================
// Enums
// =============================================================================

export type EngineDiffCategory = 'image' | 'audio' | 'video' | 'timeline' | 'canvas' | 'model';

export type EngineTimelineChangeType = 'added' | 'removed' | 'modified' | 'moved' | 'unchanged';

export type EngineCanvasChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

// =============================================================================
// Messages
// =============================================================================

export interface EngineMediaInfo {
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
  hasSubtitles: boolean;
  subtitleStreams: EngineSubtitleStream[];
}

export interface EngineSubtitleStream {
  index: number;
  codec: string;
  language?: string;
  title?: string;
  isDefault: boolean;
  isForced: boolean;
}

export interface EngineFieldDiff {
  /** Field name (e.g. "duration", "codec", "width") */
  field: string;
  /** JSON-encoded value from source A */
  valueA: string;
  /** JSON-encoded value from source B */
  valueB: string;
  /** Whether the values differ */
  changed: boolean;
}

export interface EngineImageContentDiff {
  /** Structural Similarity Index (0.0 - 1.0, 1.0 = identical) */
  ssim: number;
  /** Peak Signal-to-Noise Ratio (dB, higher = more similar) */
  psnr: number;
  /** Mean Squared Error (0.0 = identical) */
  mse: number;
  /** Percentage of pixels that differ (0.0 - 1.0) */
  diffPixelPercent: number;
  /** Absolute count of differing pixels */
  diffPixelCount: number;
  /** Total pixel count */
  totalPixels: number;
  /** Source A dimensions */
  widthA: number;
  heightA: number;
  /** Source B dimensions */
  widthB: number;
  heightB: number;
  /** Heatmap image as JPEG base64 string */
  heatmap: string;
  heatmapWidth: number;
  heatmapHeight: number;
}

export interface EngineAudioDiffRegion {
  /** Region start time (seconds) */
  start: number;
  /** Region end time (seconds) */
  end: number;
  /** Signal-to-Noise Ratio for this region (dB) */
  snr: number;
  /** RMS difference for this region */
  rmsDiff: number;
}

export interface EngineAudioContentDiff {
  /** Global Signal-to-Noise Ratio (dB, higher = more similar) */
  snr: number;
  /** Duration of source A (seconds) */
  durationA: number;
  /** Duration of source B (seconds) */
  durationB: number;
  /** Sample rate used for comparison (typically 48000) */
  compareSampleRate: number;
  /** Total samples compared */
  totalSamples: number;
  /** Number of segments that differ */
  diffSegmentCount: number;
  /** Total number of segments */
  totalSegments: number;
  /** Percentage of segments that differ (0.0 - 1.0) */
  diffPercent: number;
  /** Regions where audio differs significantly */
  diffRegions: EngineAudioDiffRegion[];
  /** Waveform peak data for source A (downsampled to ~800 points, values 0.0-1.0) */
  waveformPeaksA: number[];
  /** Waveform peak data for source B (downsampled to ~800 points, values 0.0-1.0) */
  waveformPeaksB: number[];
}

export interface EngineFrameMetric {
  /** Frame number (0-based) */
  frame: number;
  /** Timestamp in seconds */
  timestamp: number;
  /** SSIM for this frame (0.0 - 1.0) */
  ssim: number;
  /** PSNR for this frame (dB) */
  psnr: number;
}

export interface EngineVideoDiffRegion {
  /** Region start time (seconds) */
  start: number;
  /** Region end time (seconds) */
  end: number;
  /** Average SSIM across frames in this region */
  avgSsim: number;
  /** Minimum SSIM in this region */
  minSsim: number;
  /** Number of frames in this region */
  frameCount: number;
}

export interface EngineVideoContentDiff {
  /** Global average SSIM across all compared frames */
  avgSsim: number;
  /** Minimum SSIM across all compared frames */
  minSsim: number;
  /** Global average PSNR (dB) */
  avgPsnr: number;
  /** Minimum PSNR (dB) */
  minPsnr: number;
  /** Source A metadata */
  durationA: number;
  durationB: number;
  fpsA: number;
  fpsB: number;
  widthA: number;
  heightA: number;
  widthB: number;
  heightB: number;
  /** Frame-level metrics */
  totalFramesCompared: number;
  diffFrameCount: number;
  diffFramePercent: number;
  frameMetrics: EngineFrameMetric[];
  /** Temporal diff regions (contiguous frames below SSIM threshold) */
  diffRegions: EngineVideoDiffRegion[];
  /** Optional audio diff (when video contains audio tracks) */
  audioDiff?: EngineAudioContentDiff;
  /** Optional path to generated difference visualization video */
  diffVideoPath?: string;
}

export interface EnginePropertyChange {
  /** Property name (e.g. "name", "muted", "src") */
  property: string;
  /** JSON-encoded previous value */
  previous: string;
  /** JSON-encoded current value */
  current: string;
}

export interface EngineElementChange {
  elementId: string;
  elementName: string;
  elementType: string;
  changeType: EngineTimelineChangeType;
  propertyChanges: EnginePropertyChange[];
  /** Media source path (for media/audio elements) */
  src?: string;
  previousSrc?: string;
  /** Timeline position */
  startTime?: number;
  duration?: number;
}

export interface EngineTrackChange {
  trackId: string;
  trackName: string;
  trackType: string;
  changeType: EngineTimelineChangeType;
  propertyChanges: EnginePropertyChange[];
  elementChanges: EngineElementChange[];
}

export interface EngineTimelineDiffSummary {
  tracksAdded: number;
  tracksRemoved: number;
  tracksModified: number;
  elementsAdded: number;
  elementsRemoved: number;
  elementsModified: number;
  mediaSourceChanges: number;
}

export interface EngineTimelineProjectMeta {
  name: string;
  resolutionWidth: number;
  resolutionHeight: number;
  fps: number;
}

export interface EngineTimelineContentDiff {
  /** Project metadata (current vs previous) */
  currentProject?: EngineTimelineProjectMeta;
  previousProject?: EngineTimelineProjectMeta;
  /** Track-level changes */
  trackChanges: EngineTrackChange[];
  /** Summary statistics */
  summary?: EngineTimelineDiffSummary;
  /** Duration comparison */
  durationCurrent: number;
  durationPrevious: number;
  /** Per-element content diffs (only when includeContentDiff=true) */
  elementContentDiffs: EngineElementContentDiff[];
}

/** Content diff for a single element whose media source changed */
export interface EngineElementContentDiff {
  elementId: string;
  elementType: string;
  currentSrc: string;
  previousSrc: string;
  /** One of the following content diff results ("image" | "audio" | "video" | "error") */
  contentType: string;
  imageDiff?: EngineImageContentDiff;
  audioDiff?: EngineAudioContentDiff;
  videoDiff?: EngineVideoContentDiff;
  errorMessage?: string;
}

export interface EngineCanvasPropertyChange {
  /** Property name (e.g. "position", "size", "rotation", "label") */
  property: string;
  /** JSON-encoded previous value */
  previous: string;
  /** JSON-encoded current value */
  current: string;
}

export interface EngineCanvasNodeChange {
  nodeId: string;
  /** Node type ("media" | "storyboard" | "annotation" | "group") */
  nodeType: string;
  /** Optional label or title for display */
  label?: string;
  changeType: EngineCanvasChangeType;
  propertyChanges: EngineCanvasPropertyChange[];
  /** For group nodes: child IDs added/removed */
  childIdsAdded: string[];
  childIdsRemoved: string[];
}

export interface EngineCanvasConnectionChange {
  connectionId: string;
  changeType: EngineCanvasChangeType;
  /** Source/target node IDs */
  sourceId: string;
  targetId: string;
  /** Connection type ("default" | "sequence" | "reference") */
  connectionType?: string;
  label?: string;
}

export interface EngineCanvasDiffSummary {
  nodesAdded: number;
  nodesRemoved: number;
  nodesModified: number;
  connectionsAdded: number;
  connectionsRemoved: number;
  connectionsModified: number;
}

export interface EngineCanvasContentDiff {
  /** Canvas metadata comparison */
  nameCurrent?: string;
  namePrevious?: string;
  /** Node-level changes */
  nodeChanges: EngineCanvasNodeChange[];
  /** Connection-level changes */
  connectionChanges: EngineCanvasConnectionChange[];
  /** Summary statistics */
  summary?: EngineCanvasDiffSummary;
  /** Total node counts */
  totalNodesCurrent: number;
  totalNodesPrevious: number;
}

export interface EngineSilenceRegion {
  /** Silence start time (seconds) */
  start: number;
  /** Silence end time (seconds) */
  end: number;
  /** Duration of the silence region (seconds) */
  duration: number;
  /** RMS level in this region (dB, negative values) */
  rmsDb: number;
}

export interface EngineAudioSilenceDetection {
  /** Silence threshold used for detection (dB) */
  thresholdDb: number;
  /** Minimum duration to be classified as silence (seconds) */
  minSilenceDuration: number;
  /** Total number of silence regions detected */
  silenceRegionCount: number;
  /** Total silence duration (seconds) */
  totalSilenceDuration: number;
  /** Total audio duration (seconds) */
  totalDuration: number;
  /** Silence percentage (0.0 - 1.0) */
  silencePercent: number;
  /** Detected silence regions */
  silenceRegionsA: EngineSilenceRegion[];
  silenceRegionsB: EngineSilenceRegion[];
  /** Regions where silence pattern differs between A and B */
  diffRegions: EngineSilenceRegion[];
}

export interface EngineDiffResult {
  /** Source file paths */
  sourceA: string;
  sourceB: string;
  /** Category of media being compared */
  category: EngineDiffCategory;
  /** Whether the files are identical */
  identical: boolean;
  /** Metadata field comparison */
  diffCount: number;
  totalFields: number;
  fields: EngineFieldDiff[];
  /** Probe info for both sources (JSON-encoded MediaInfo) */
  infoA: string;
  infoB: string;
  /** Content-level diff (one of, based on category) */
  imageDiff?: EngineImageContentDiff;
  audioDiff?: EngineAudioContentDiff;
  videoDiff?: EngineVideoContentDiff;
  timelineDiff?: EngineTimelineContentDiff;
}
