// =============================================================================
// Audio Mix Types — Engine-aligned mix configuration
//
// These types mirror Rust MixdownConfig / MixdownTrack / MixdownElement
// in engine-kernel/src/services/audio_mixdown.rs.
// Used by both the extension bridge and webview to build mix configs.
// =============================================================================

import type { AudioAutomationCurve, AutomationTarget } from './audioAutomation';

/** Engine-supported audio effect types accepted by render paths. */
export const ENGINE_AUDIO_EFFECT_TYPES = [
  'gain',
  'high-pass',
  'low-pass',
  'band-pass',
  'notch',
  'peaking',
  'low-shelf',
  'high-shelf',
  'parametric-eq',
  'compressor',
  'noise-gate',
  'limiter',
  'reverb',
  'delay',
  'chorus',
  'distortion',
] as const;

/** Planned UI-visible effect types that are not renderable by Engine yet. */
export const PLANNED_AUDIO_EFFECT_TYPES = [
  'noise-reduction',
  'pitch-shift',
  'time-stretch',
] as const;

export type EngineAudioEffectType = (typeof ENGINE_AUDIO_EFFECT_TYPES)[number];
export type PlannedAudioEffectType = (typeof PLANNED_AUDIO_EFFECT_TYPES)[number];
export type AudioEffectType = EngineAudioEffectType | PlannedAudioEffectType;

export type RenderableAudioEffectType = EngineAudioEffectType;

const ENGINE_AUDIO_EFFECT_TYPE_SET = new Set<string>(ENGINE_AUDIO_EFFECT_TYPES);
const PLANNED_AUDIO_EFFECT_TYPE_SET = new Set<string>(PLANNED_AUDIO_EFFECT_TYPES);

export function isEngineAudioEffectType(value: string): value is EngineAudioEffectType {
  return ENGINE_AUDIO_EFFECT_TYPE_SET.has(value);
}

export function isPlannedAudioEffectType(value: string): value is PlannedAudioEffectType {
  return PLANNED_AUDIO_EFFECT_TYPE_SET.has(value);
}

export function isKnownAudioEffectType(value: string): value is AudioEffectType {
  return isEngineAudioEffectType(value) || isPlannedAudioEffectType(value);
}

export function normalizeAudioEffectType(value: string): AudioEffectType | undefined {
  return isKnownAudioEffectType(value) ? value : undefined;
}

export function normalizeRenderableAudioEffectType(
  value: string,
): RenderableAudioEffectType | undefined {
  const normalized = normalizeAudioEffectType(value);
  return normalized && isEngineAudioEffectType(normalized) ? normalized : undefined;
}

/**
 * Audio effect configuration — matches Rust AudioEffectConfig.
 *
 * This is the engine-facing type. UI-facing snapshots may include planned-only
 * effects, but render configs only carry Engine-supported canonical names.
 */
export interface AudioEffectConfig {
  id: string;
  effectType: RenderableAudioEffectType;
  enabled: boolean;
  params: Record<string, unknown>;
}

/** Engine-facing automation point with resolved timeline seconds. */
export interface MixAutomationPointConfig {
  /** Timeline position in seconds. */
  time: number;
  value: number;
  curve: AudioAutomationCurve;
}

/** Engine-facing automation lane for retained media processing. */
export interface MixAutomationLaneConfig {
  id: string;
  target: AutomationTarget;
  enabled: boolean;
  points: MixAutomationPointConfig[];
}

/** Audio element within a mix track — matches Rust MixdownElement. */
export interface MixElementConfig {
  id: string;
  /** Absolute file path to the audio source */
  src: string;
  /** Start time on the timeline (seconds) */
  startTime: number;
  /** Duration on the timeline (seconds) */
  duration: number;
  /** Trim offset from source start (seconds) */
  trimStart: number;
  /** Element volume (0.0–10.0, default 1.0) */
  volume: number;
  /** Element pan (-1.0 left to 1.0 right, default 0.0) */
  pan: number;
  /** Whether element is muted */
  muted: boolean;
  /** Fade in duration (seconds) */
  fadeIn: number;
  /** Fade out duration (seconds) */
  fadeOut: number;
  /** Gain in dB (default 0.0) */
  gain: number;
}

/** Mix track configuration — matches Rust MixdownTrack. */
export interface MixTrackConfig {
  id: string;
  muted: boolean;
  solo: boolean;
  /** Track volume (0.0–10.0, default 1.0) */
  volume: number;
  /** Track pan (-1.0 left to 1.0 right, default 0.0) */
  pan: number;
  /** Per-track effect chain */
  effectChain: AudioEffectConfig[];
  /** Enabled renderable automation lanes resolved to timeline seconds. */
  automation: MixAutomationLaneConfig[];
  /** Audio elements in this track */
  elements: MixElementConfig[];
}

/** Full mix stream/export configuration — matches Rust MixdownConfig. */
export interface MixStreamConfig {
  tracks: MixTrackConfig[];
  masterEffects: AudioEffectConfig[];
  /** Master bus volume (default 1.0) */
  masterVolume: number;
  /** Output sample rate (default 48000) */
  sampleRate: number;
  /** Output channels (default 2) */
  channels: number;
}

/** Helper: create a default MixStreamConfig. */
export function createDefaultMixStreamConfig(tracks: MixTrackConfig[] = []): MixStreamConfig {
  return {
    tracks,
    masterEffects: [],
    masterVolume: 1.0,
    sampleRate: 48000,
    channels: 2,
  };
}

/** Helper: create a default MixTrackConfig. */
export function createDefaultMixTrackConfig(
  id: string,
  elements: MixElementConfig[] = [],
): MixTrackConfig {
  return {
    id,
    muted: false,
    solo: false,
    volume: 1.0,
    pan: 0.0,
    effectChain: [],
    automation: [],
    elements,
  };
}

/** Helper: create a default MixElementConfig. */
export function createDefaultMixElementConfig(
  id: string,
  src: string,
  startTime: number,
  duration: number,
): MixElementConfig {
  return {
    id,
    src,
    startTime,
    duration,
    trimStart: 0,
    volume: 1.0,
    pan: 0.0,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    gain: 0,
  };
}
