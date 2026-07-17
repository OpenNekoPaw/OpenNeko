export { EngineClient } from '../EngineClient';
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
  // Effects types
  EffectCapability,
  EffectCapabilityParamDef,
  EffectKind,
  EffectParamOption,
  ShaderParamDef,
  EffectPresetInfo,
  EffectApplyResult,
} from './types';
export { transformDiffResponse } from './responseTransform';
