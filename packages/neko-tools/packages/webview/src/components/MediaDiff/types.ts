/**
 * MediaDiff Component Types
 * Adapted from neko-cut with timeline support and protocol integration
 */

import type {
  DiffViewMode,
  DiffResult,
  ImageDiffDetails,
  VideoDiffDetails,
  AudioDiffDetails,
  TimelineDiffDetails,
  MediaType,
  GitCommitInfo,
  StreamConfig,
  AudioStreamConfig,
} from '@neko/shared';

// Re-export for convenience
export type {
  DiffViewMode,
  DiffResult,
  ImageDiffDetails,
  VideoDiffDetails,
  AudioDiffDetails,
  TimelineDiffDetails,
  MediaType,
  GitCommitInfo,
  StreamConfig,
  AudioStreamConfig,
};

// =============================================================================
// Common Props
// =============================================================================

export interface BaseDiffViewerProps {
  viewMode: DiffViewMode;
  currentSrc: string;
  previousSrc: string;
  isLoading?: boolean;
  error?: string | null;
}

// =============================================================================
// Image Diff Props
// =============================================================================

export interface ImageDiffViewerProps extends BaseDiffViewerProps {
  details?: ImageDiffDetails;
  heatmapSrc?: string;
  sliderPosition?: number;
  onSliderChange?: (position: number) => void;
  overlayOpacity?: number;
  onOpacityChange?: (opacity: number) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}

// =============================================================================
// Video Diff Props
// =============================================================================

export interface VideoDiffViewerProps extends BaseDiffViewerProps {
  details?: VideoDiffDetails;
  /** Current frame Blob URL (current version) */
  currentFrameSrc?: string;
  /** Previous frame Blob URL (previous version) */
  previousFrameSrc?: string;
  currentTime?: number;
  onTimeChange?: (time: number) => void;
  isPlaying?: boolean;
  onPlayPause?: () => void;
  sliderPosition?: number;
  onSliderChange?: (position: number) => void;
  /** Stream config for real-time H264 dual-stream mode */
  streamConfig?: StreamConfig | null;
  /** Send stream playback control to extension */
  onStreamControl?: (
    action: 'play' | 'pause' | 'seek',
    payload?: { time?: number; speed?: number },
  ) => void;
  /** True while git show is extracting the previous version — disables Play */
  isFetchingPrevious?: boolean;
}

// =============================================================================
// Audio Diff Props
// =============================================================================

export interface AudioDiffViewerProps extends BaseDiffViewerProps {
  details?: AudioDiffDetails;
  currentWaveform?: number[];
  previousWaveform?: number[];
  currentTime?: number;
  onTimeChange?: (time: number) => void;
  playingVersion?: 'current' | 'previous' | 'both';
  onPlayingVersionChange?: (version: 'current' | 'previous' | 'both') => void;
  /** Audio stream config for WebSocket PCM playback */
  audioStreamConfig?: AudioStreamConfig | null;
  /** Send audio stream control to extension */
  onAudioStreamControl?: (action: 'play' | 'pause' | 'seek', payload?: { time?: number }) => void;
  /** True while git show is extracting the previous version — disables Play */
  isFetchingPrevious?: boolean;
}

// =============================================================================
// Timeline Diff Props
// =============================================================================

export interface TimelineDiffViewerProps {
  details?: TimelineDiffDetails;
  /** Request thumbnail for a media element */
  onInspectElement?: (src: string) => void;
  /** Cached element thumbnails (src → Blob URL) */
  elementThumbnails?: Map<string, string>;
}

// =============================================================================
// Controls Props
// =============================================================================

export interface DiffControlsProps {
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  similarity?: number;
  mediaType: MediaType;
  isLoading?: boolean;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  opacity?: number;
  onOpacityChange?: (opacity: number) => void;
  /** Total duration in seconds (for time range controls, video/audio only) */
  duration?: number;
  /** Callback to apply a new time range and re-run diff */
  onSetTimeRange?: (startTime?: number, endTime?: number) => void;
}

// =============================================================================
// Main MediaDiffViewer Props
// =============================================================================

export interface MediaDiffViewerProps {
  diffResult?: DiffResult;
  currentSrc: string;
  previousSrc: string;
  heatmapSrc?: string;
  /** Frame sources for video diff */
  currentFrameSrc?: string;
  previousFrameSrc?: string;
  /** Waveform data for audio diff */
  currentWaveform?: number[];
  previousWaveform?: number[];
  /** Timeline element thumbnails */
  elementThumbnails?: Map<string, string>;
  isLoading?: boolean;
  error?: string | null;
  gitRef?: string;
  filePath?: string;
  /** Stream config for real-time video diff */
  streamConfig?: StreamConfig | null;
  /** Audio stream config for audio diff */
  audioStreamConfig?: AudioStreamConfig | null;
  /** True while git show is extracting the previous version — disables Play */
  isFetchingPrevious?: boolean;
  /** Callbacks */
  onTimeChange?: (time: number) => void;
  onInspectElement?: (src: string) => void;
  onStreamControl?: (
    action: 'play' | 'pause' | 'seek',
    payload?: { time?: number; speed?: number },
  ) => void;
  onAudioStreamControl?: (action: 'play' | 'pause' | 'seek', payload?: { time?: number }) => void;
  /** Callback to apply a new time range and re-run diff */
  onSetTimeRange?: (startTime?: number, endTime?: number) => void;
}

// =============================================================================
// State Types
// =============================================================================

export interface MediaDiffState {
  viewMode: DiffViewMode;
  sliderPosition: number;
  overlayOpacity: number;
  zoom: number;
  currentTime: number;
  isPlaying: boolean;
  playingVersion: 'current' | 'previous' | 'both';
}

// =============================================================================
// Initial State (injected by Extension via window.initialState)
// =============================================================================

export interface InitialState {
  mediaType: MediaType;
  fileName: string;
  isLocalComparison: boolean;
  fileUri: string;
  previousUri?: string;
  ref?: string;
  requiresRecompare?: boolean;
}

export type ImmutableInitialState = Readonly<InitialState>;
