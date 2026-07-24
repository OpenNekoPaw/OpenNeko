/**
 * @neko/neko-client - Media clients for OpenNeko
 *
 * Provides clients for consuming neko-engine services:
 *
 * Engine dispatch (HTTP/WS — works in both Extension Host and Webview):
 * - EngineClient: HTTP dispatch + WS stream management
 *
 * Stream consumers (browser-side):
 * - H264StreamClient: H.264 WebCodecs decoder
 * - AudioStreamClient: PCM Web Audio player (master clock for A/V sync)
 * - FrameScheduler: A/V synchronized frame scheduling
 * - FMP4StreamClient: fMP4 MSE player (alternative pipeline)
 * - PlaybackPerformanceMonitor: Real-time performance metrics
 */

// H.264 WebCodecs decoder
export {
  H264StreamClient,
  type H264BackpressurePolicy,
  type H264StreamClientConfig,
  type H264StreamClientStats,
} from './H264StreamClient';

// PCM Web Audio player + master clock
export {
  AudioStreamClient,
  type AudioStreamClientConfig,
  type AudioStreamStats,
} from './AudioStreamClient';

// A/V synchronized frame scheduler
export {
  FrameScheduler,
  type ScheduleAction,
  type ScheduleResult,
  type FrameSchedulerStats,
} from './FrameScheduler';

// fMP4 MSE player (alternative pipeline)
export {
  FMP4StreamClient,
  type FMP4StreamClientConfig,
  type FMP4StreamStats,
} from './FMP4StreamClient';

// Playback performance monitoring
export { PlaybackPerformanceMonitor, type PerformanceSnapshot } from './PlaybackPerformanceMonitor';

// Browser capability detection
export {
  detectCapabilities,
  type CapabilityResult,
  type CapabilityReport,
} from './detectCapabilities';

// Time formatting utilities
export {
  formatMediaTime,
  formatMediaTimeCentiseconds,
  formatMediaTimeFromMilliseconds,
  formatTime,
  formatTimePrecise,
  type FormatMediaTimeOptions,
} from './formatTime';

export {
  EngineAvStreamLifecycle,
  type EngineAvAudioStreamClient,
  type EngineAvFrameScheduler,
  type EngineAvStreamClients,
  type EngineAvStreamDescriptor,
  type EngineAvStreamLifecycleCallbacks,
  type EngineAvStreamLifecycleFactories,
  type EngineAvStreamLifecycleOptions,
  type EngineAvStreamLifecycleSnapshot,
  type EngineAvStreamLifecycleStats,
  type EngineAvVideoStreamClient,
} from './EngineAvStreamLifecycle';

// Engine HTTP/WS dispatch client
export {
  EngineClient,
  type DetectedShot,
  type EngineClientConfig,
  type FileAccessPurpose,
  type FileSourceRef,
  type RegisteredFile,
  type RegisterFileRequest,
} from './EngineClient';

export { isRecord, readFiniteNumber, readString } from './utils/wireReaders';

// High-level media playback (paired video + audio streams)
export {
  MediaPlaybackService,
  type MediaPlaybackEnginePort,
  type PlaybackMediaType,
  type PlaybackStreamGroup,
  type StartPlaybackOptions,
  type CaptureFrameOptions,
} from './MediaPlaybackService';

export type {
  PreviewManifest,
  PreviewVariant,
  PreviewVariantRequest,
  RegisterPreviewAssetRequest,
  UpdatePreviewAssetMetadataRequest,
} from '@neko/shared';

export type {
  // Request / Response
  ActionRequest,
  ActionResponse,
  ApiError,
  // Raw Rust types
  RawProbeData,
  VideoStreamInfo,
  AudioStreamInfo,
  SubtitleStreamInfo,
  RawWaveformData,
  RawStreamSession,
  Resolution,
  // Diff types
  DiffCategory,
  FieldDiff,
  DiffResult,
  ImageContentDiff,
  AudioDiffRegion,
  AudioContentDiff,
  FrameMetric,
  VideoDiffRegion,
  VideoContentDiff,
  TimelineChangeType,
  PropertyChange,
  ElementChange,
  TrackChange,
  TimelineDiffSummary,
  TimelineProjectMeta,
  ElementContentDiffResult,
  TimelineContentDiff,
  // Convenience types
  ProbeResult,
  WaveformResult,
  StreamHandle,
  PlaybackHandle,
  LoudnessAnalysis,
  // Silence detection
  SilenceAnalysis,
  SilenceRegion,
  // Effects types
  EffectCapability,
  EffectCapabilityParamDef,
  EffectKind,
  EffectParamOption,
  ShaderParamDef,
  EffectPresetInfo,
  EffectApplyResult,
  // Project context
  ProjectContext,
  MissingVariable,
} from './engine/types';

export { transformDiffResponse } from './engine/responseTransform';
