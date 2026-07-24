import type { CutExportSettings, TimelineView } from '@neko-cut/domain';

export interface CutExportIdentity {
  readonly documentUri: string;
  readonly sessionId: string;
  readonly expectedRevision: number;
}

export interface FrozenCutExportRequest {
  readonly documentUri: string;
  readonly sessionId: string;
  readonly sourceRevision: number;
  readonly timeline: TimelineView;
  readonly settings: CutExportSettings;
}

export function freezeCutExportRequest(
  view: TimelineView,
  identity: CutExportIdentity,
  settings: CutExportSettings,
): FrozenCutExportRequest {
  assertIdentity(view, identity);
  validateCutExportSettings(settings);
  const timeline = deepFreeze(structuredClone(view));
  const frozenSettings = Object.freeze({ ...settings });
  return Object.freeze({
    documentUri: timeline.documentUri,
    sessionId: timeline.sessionId,
    sourceRevision: timeline.revision,
    timeline,
    settings: frozenSettings,
  });
}

export function readCutExportSettings(value: unknown): CutExportSettings {
  if (!isRecord(value)) throw new Error('Cut export requires explicit job settings.');
  const width = value['width'];
  const height = value['height'];
  const framesPerSecond = value['framesPerSecond'];
  const outputName = value['outputName'];
  const container = value['container'];
  const videoBitrate = value['videoBitrate'];
  const includeAudio = value['includeAudio'];
  const audioBitrate = value['audioBitrate'];
  const audioSampleRate = value['audioSampleRate'];
  if (
    typeof outputName !== 'string' ||
    (container !== 'mp4' && container !== 'mov') ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    typeof framesPerSecond !== 'number' ||
    typeof videoBitrate !== 'number' ||
    typeof includeAudio !== 'boolean' ||
    typeof audioBitrate !== 'number' ||
    (audioSampleRate !== 44_100 && audioSampleRate !== 48_000)
  ) {
    throw new Error('Cut export job settings are incomplete or invalid.');
  }
  const settings: CutExportSettings = {
    outputName,
    container,
    width,
    height,
    framesPerSecond,
    videoBitrate,
    includeAudio,
    audioBitrate,
    audioSampleRate,
  };
  validateCutExportSettings(settings);
  return settings;
}

function assertIdentity(view: TimelineView, identity: CutExportIdentity): void {
  if (view.documentUri !== identity.documentUri) {
    throw new Error('Cut export document identity does not match the current Host document.');
  }
  if (view.sessionId !== identity.sessionId) {
    throw new Error('Cut export session identity does not match the current Host session.');
  }
  if (view.revision !== identity.expectedRevision) {
    throw new Error(
      `Cut export revision is stale: expected ${identity.expectedRevision}, current ${view.revision}.`,
    );
  }
}

function validateCutExportSettings(settings: CutExportSettings): void {
  if (
    settings.outputName.trim().length === 0 ||
    settings.outputName.includes('/') ||
    settings.outputName.includes('\\')
  ) {
    throw new Error('Cut export outputName must be a non-empty file name.');
  }
  assertIntegerInRange('width', settings.width, 16, 16_384);
  assertIntegerInRange('height', settings.height, 16, 16_384);
  if (
    !Number.isFinite(settings.framesPerSecond) ||
    settings.framesPerSecond < 1 ||
    settings.framesPerSecond > 240
  ) {
    throw new Error('Cut export framesPerSecond must be between 1 and 240.');
  }
  assertIntegerInRange('videoBitrate', settings.videoBitrate, 100_000, 200_000_000);
  assertIntegerInRange('audioBitrate', settings.audioBitrate, 32_000, 1_000_000);
  if (settings.audioSampleRate !== 44_100 && settings.audioSampleRate !== 48_000) {
    throw new Error('Cut export audioSampleRate must be 44100 or 48000.');
  }
}

function assertIntegerInRange(label: string, value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`Cut export ${label} must be an integer between ${min} and ${max}.`);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
