import type { EngineAudioStreamDescriptor } from '../generated/scene.engine';
import type { ViewportSerializableRecord } from './viewport-protocol';

export const MODEL_AI_PREVIEW_MODE_IDS = ['face', 'full-body', 'motion', 'voice-pack'] as const;

export type CharacterPreviewModeId = (typeof MODEL_AI_PREVIEW_MODE_IDS)[number];

export type CharacterPreviewCameraPresetId =
  | 'face-closeup'
  | 'full-body'
  | 'motion-review'
  | 'voice-performance';

export type CharacterPreviewFramingTarget =
  | 'head-shoulders'
  | 'full-character'
  | 'motion-envelope'
  | 'mouth-and-expression';

export type CharacterPreviewRenderPresetId =
  | 'face-detail'
  | 'body-silhouette'
  | 'motion-diagnostics'
  | 'voice-lipsync';

export type CharacterPreviewPlaybackRequirement = 'none' | 'animation' | 'voice-pack';

export type CharacterPreviewPlaybackState =
  | 'idle'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'unavailable'
  | 'failed'
  | 'stopped';

export type CharacterPreviewStateStatus =
  | 'requested'
  | 'pending'
  | 'applied'
  | 'rejected'
  | 'resynced'
  | 'unavailable';

export type CharacterPreviewDiagnosticCode =
  | 'missing-demo-clip'
  | 'missing-voice-pack'
  | 'unsupported-viseme-binding'
  | 'skeleton-incompatible'
  | 'preview-fallback'
  | 'stale-revision'
  | 'camera-override-reset'
  | 'audio-unavailable'
  | 'playback-failed'
  | 'scene-control-unavailable';

export interface CharacterPreviewDiagnostic {
  readonly code: CharacterPreviewDiagnosticCode;
  readonly severity: 'info' | 'warning' | 'error';
  readonly message?: string;
  readonly retryable?: boolean;
  readonly detail?: ViewportSerializableRecord;
}

export interface CharacterPreviewModeDescriptor {
  readonly id: CharacterPreviewModeId;
  readonly label: string;
  readonly cameraPreset: CharacterPreviewCameraPresetId;
  readonly framingTarget: CharacterPreviewFramingTarget;
  readonly renderPreset: CharacterPreviewRenderPresetId;
  readonly playbackRequirement: CharacterPreviewPlaybackRequirement;
  readonly overlaySet?: readonly string[];
}

export interface CharacterPreviewPlaybackDescriptor {
  readonly state: CharacterPreviewPlaybackState;
  readonly clipId?: string;
  readonly voicePackId?: string;
  readonly phraseId?: string;
  readonly startedAtMs?: number;
  readonly clockMs?: number;
  readonly durationMs?: number;
  readonly loop?: boolean;
  readonly audioStream?: EngineAudioStreamDescriptor;
}

export interface CharacterPreviewCameraOverrideState {
  readonly modeId: CharacterPreviewModeId;
  readonly characterId: string;
  readonly viewportId: string;
  readonly sceneRevision: number;
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly up?: readonly [number, number, number];
  readonly fovY?: number;
  readonly topologyVersion?: number;
}

export interface CharacterPreviewModeRequestPayload {
  readonly characterId: string;
  readonly modeId: CharacterPreviewModeId;
  readonly viewportId: string;
  readonly resetCamera?: boolean;
  readonly playback?: {
    readonly clipId?: string;
    readonly voicePackId?: string;
    readonly phraseId?: string;
    readonly autoPlay?: boolean;
  };
}

export interface CharacterPreviewCameraResetPayload {
  readonly characterId: string;
  readonly modeId: CharacterPreviewModeId;
  readonly viewportId: string;
}

export interface CharacterPreviewPlaybackCommandPayload {
  readonly characterId: string;
  readonly modeId: CharacterPreviewModeId;
  readonly viewportId: string;
  readonly action: 'play' | 'pause' | 'stop' | 'seek';
  readonly clockMs?: number;
}

export interface CharacterPreviewModeStatePayload {
  readonly characterId: string;
  readonly modeId: CharacterPreviewModeId;
  readonly viewportId: string;
  readonly status: CharacterPreviewStateStatus;
  readonly sceneRevision: number;
  readonly appliedSeq?: number;
  readonly cameraPreset: CharacterPreviewCameraPresetId;
  readonly renderPreset: CharacterPreviewRenderPresetId;
  readonly playback: CharacterPreviewPlaybackDescriptor;
  readonly diagnostics: readonly CharacterPreviewDiagnostic[];
  readonly hasCameraOverride?: boolean;
}

export interface CharacterPreviewFrameAlignment {
  readonly activePreviewMode?: CharacterPreviewModeId;
  readonly previewPlaybackClockMs?: number;
}

export const DEFAULT_CHARACTER_PREVIEW_MODE_DESCRIPTORS: readonly CharacterPreviewModeDescriptor[] =
  [
    {
      id: 'face',
      label: 'Face',
      cameraPreset: 'face-closeup',
      framingTarget: 'head-shoulders',
      renderPreset: 'face-detail',
      playbackRequirement: 'none',
      overlaySet: ['face-detail'],
    },
    {
      id: 'full-body',
      label: 'Body',
      cameraPreset: 'full-body',
      framingTarget: 'full-character',
      renderPreset: 'body-silhouette',
      playbackRequirement: 'none',
      overlaySet: ['silhouette'],
    },
    {
      id: 'motion',
      label: 'Motion',
      cameraPreset: 'motion-review',
      framingTarget: 'motion-envelope',
      renderPreset: 'motion-diagnostics',
      playbackRequirement: 'animation',
      overlaySet: ['deformation', 'clipping'],
    },
    {
      id: 'voice-pack',
      label: 'Voice',
      cameraPreset: 'voice-performance',
      framingTarget: 'mouth-and-expression',
      renderPreset: 'voice-lipsync',
      playbackRequirement: 'voice-pack',
      overlaySet: ['viseme', 'emotion'],
    },
  ];

export function isCharacterPreviewModeId(value: unknown): value is CharacterPreviewModeId {
  return MODEL_AI_PREVIEW_MODE_IDS.includes(value as CharacterPreviewModeId);
}

export function isCharacterPreviewModeRequestPayload(
  value: unknown,
): value is CharacterPreviewModeRequestPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.characterId === 'string' &&
    isCharacterPreviewModeId(value.modeId) &&
    typeof value.viewportId === 'string' &&
    (value.resetCamera === undefined || typeof value.resetCamera === 'boolean') &&
    (value.playback === undefined || isPreviewPlaybackRequest(value.playback))
  );
}

export function isCharacterPreviewCameraResetPayload(
  value: unknown,
): value is CharacterPreviewCameraResetPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.characterId === 'string' &&
    isCharacterPreviewModeId(value.modeId) &&
    typeof value.viewportId === 'string'
  );
}

export function isCharacterPreviewPlaybackCommandPayload(
  value: unknown,
): value is CharacterPreviewPlaybackCommandPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.characterId === 'string' &&
    isCharacterPreviewModeId(value.modeId) &&
    typeof value.viewportId === 'string' &&
    (value.action === 'play' ||
      value.action === 'pause' ||
      value.action === 'stop' ||
      value.action === 'seek') &&
    (value.clockMs === undefined || isFiniteNumber(value.clockMs))
  );
}

export function isCharacterPreviewModeStatePayload(
  value: unknown,
): value is CharacterPreviewModeStatePayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.characterId === 'string' &&
    isCharacterPreviewModeId(value.modeId) &&
    typeof value.viewportId === 'string' &&
    isPreviewStateStatus(value.status) &&
    isNonNegativeInteger(value.sceneRevision) &&
    (value.appliedSeq === undefined || isNonNegativeInteger(value.appliedSeq)) &&
    isCameraPreset(value.cameraPreset) &&
    isRenderPreset(value.renderPreset) &&
    isPreviewPlaybackDescriptor(value.playback) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.every(isCharacterPreviewDiagnostic) &&
    (value.hasCameraOverride === undefined || typeof value.hasCameraOverride === 'boolean')
  );
}

export function readCharacterPreviewFrameAlignment(meta: {
  readonly activePreviewMode?: unknown;
  readonly previewPlaybackClockMs?: unknown;
}): CharacterPreviewFrameAlignment {
  const activePreviewMode = isCharacterPreviewModeId(meta.activePreviewMode)
    ? meta.activePreviewMode
    : undefined;
  const previewPlaybackClockMs = isFiniteNumber(meta.previewPlaybackClockMs)
    ? meta.previewPlaybackClockMs
    : undefined;
  return { activePreviewMode, previewPlaybackClockMs };
}

function isPreviewPlaybackRequest(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (value.clipId === undefined || typeof value.clipId === 'string') &&
    (value.voicePackId === undefined || typeof value.voicePackId === 'string') &&
    (value.phraseId === undefined || typeof value.phraseId === 'string') &&
    (value.autoPlay === undefined || typeof value.autoPlay === 'boolean')
  );
}

function isPreviewPlaybackDescriptor(value: unknown): value is CharacterPreviewPlaybackDescriptor {
  if (!isRecord(value)) return false;
  return (
    isPlaybackState(value.state) &&
    (value.clipId === undefined || typeof value.clipId === 'string') &&
    (value.voicePackId === undefined || typeof value.voicePackId === 'string') &&
    (value.phraseId === undefined || typeof value.phraseId === 'string') &&
    (value.startedAtMs === undefined || isFiniteNumber(value.startedAtMs)) &&
    (value.clockMs === undefined || isFiniteNumber(value.clockMs)) &&
    (value.durationMs === undefined || isFiniteNumber(value.durationMs)) &&
    (value.loop === undefined || typeof value.loop === 'boolean')
  );
}

function isCharacterPreviewDiagnostic(value: unknown): value is CharacterPreviewDiagnostic {
  if (!isRecord(value)) return false;
  return (
    isDiagnosticCode(value.code) &&
    (value.severity === 'info' || value.severity === 'warning' || value.severity === 'error') &&
    (value.message === undefined || typeof value.message === 'string') &&
    (value.retryable === undefined || typeof value.retryable === 'boolean') &&
    (value.detail === undefined || isSerializableRecord(value.detail))
  );
}

function isDiagnosticCode(value: unknown): value is CharacterPreviewDiagnosticCode {
  return (
    value === 'missing-demo-clip' ||
    value === 'missing-voice-pack' ||
    value === 'unsupported-viseme-binding' ||
    value === 'skeleton-incompatible' ||
    value === 'preview-fallback' ||
    value === 'stale-revision' ||
    value === 'camera-override-reset' ||
    value === 'audio-unavailable' ||
    value === 'playback-failed' ||
    value === 'scene-control-unavailable'
  );
}

function isPreviewStateStatus(value: unknown): value is CharacterPreviewStateStatus {
  return (
    value === 'requested' ||
    value === 'pending' ||
    value === 'applied' ||
    value === 'rejected' ||
    value === 'resynced' ||
    value === 'unavailable'
  );
}

function isPlaybackState(value: unknown): value is CharacterPreviewPlaybackState {
  return (
    value === 'idle' ||
    value === 'loading' ||
    value === 'playing' ||
    value === 'paused' ||
    value === 'unavailable' ||
    value === 'failed' ||
    value === 'stopped'
  );
}

function isCameraPreset(value: unknown): value is CharacterPreviewCameraPresetId {
  return (
    value === 'face-closeup' ||
    value === 'full-body' ||
    value === 'motion-review' ||
    value === 'voice-performance'
  );
}

function isRenderPreset(value: unknown): value is CharacterPreviewRenderPresetId {
  return (
    value === 'face-detail' ||
    value === 'body-silhouette' ||
    value === 'motion-diagnostics' ||
    value === 'voice-lipsync'
  );
}

function isSerializableRecord(value: unknown): value is ViewportSerializableRecord {
  if (!isRecord(value)) return false;
  return Object.values(value).every((item) => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (Array.isArray(item)) return item.every((entry) => entry !== undefined);
    return isSerializableRecord(item);
  });
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
