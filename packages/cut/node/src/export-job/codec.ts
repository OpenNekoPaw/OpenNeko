import { serializeLocalMetadataJson } from '@neko/local-metadata';

// Persisted snapshots use one codec in every Node-based Host.
import type { JobFailureSummary, JobPhase } from '@neko/shared/job-lifecycle';
import {
  EXPORT_JOB_KIND,
  ExportJobError,
  type ExportConfig,
  type ExportJobProgress,
  type ExportJobResult,
  type ExportJobSnapshot,
} from './contracts';

const JOB_PHASES: ReadonlySet<string> = new Set([
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'outcome-unknown',
]);
const JOB_STAGES: ReadonlySet<string> = new Set([
  'queued',
  'enqueuing',
  'waiting-executor',
  'committing-output',
  'completed',
]);
const EXPORT_FORMATS: ReadonlySet<string> = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'ts']);
const EXPORT_QUALITIES: ReadonlySet<string> = new Set(['low', 'medium', 'high']);
const QUALITY_MODES: ReadonlySet<string> = new Set(['source', 'draft-proxy']);

export function encodeExportJobSnapshot(snapshot: ExportJobSnapshot): string {
  if (!isExportJobSnapshot(snapshot)) {
    throw invalidPersistence('Export Job is not a valid snapshot.');
  }
  return serializeLocalMetadataJson(snapshot, 'persist-cut-export-job');
}

export function decodeExportJobSnapshot(serialized: string): ExportJobSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw invalidPersistence('Persisted Export Job snapshot is not valid JSON.', error);
  }
  if (!isExportJobSnapshot(value)) {
    throw invalidPersistence('Persisted Export Job snapshot violates the canonical contract.');
  }
  deepFreeze(value, new WeakSet<object>());
  return value;
}

function isExportJobSnapshot(value: unknown): value is ExportJobSnapshot {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'ref',
      'phase',
      'createdAt',
      'updatedAt',
      'retryOf',
      'failure',
      'request',
      'progress',
      'executionId',
      'result',
    ])
  ) {
    return false;
  }
  const ref = value['ref'];
  const retryOf = value['retryOf'];
  const phase = value['phase'];
  const failure = value['failure'];
  const executionId = value['executionId'];
  const result = value['result'];
  if (
    !isExportRef(ref) ||
    !isJobPhase(phase) ||
    !isTimestamp(value['createdAt']) ||
    !isTimestamp(value['updatedAt']) ||
    value['updatedAt'] < value['createdAt'] ||
    (retryOf !== undefined && (!isExportRef(retryOf) || retryOf.jobId === ref.jobId)) ||
    !isExportJobRequest(value['request']) ||
    !isExportProgress(value['progress']) ||
    (executionId !== undefined && !isNonEmptyString(executionId)) ||
    (result !== undefined && !isExportResult(result)) ||
    (failure !== undefined && !isFailure(failure))
  ) {
    return false;
  }
  if ((phase === 'failed' || phase === 'outcome-unknown') && failure === undefined) return false;
  if (
    failure !== undefined &&
    phase !== 'failed' &&
    phase !== 'cancelled' &&
    phase !== 'outcome-unknown'
  ) {
    return false;
  }
  return phase !== 'succeeded' || result !== undefined;
}

function isExportJobRequest(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value['documentUri']) &&
    isExportConfig(value['config']) &&
    isJsonRecord(value['executionConfig'])
  );
}

function isExportConfig(value: unknown): value is ExportConfig {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['outputPath']) &&
    typeof value['format'] === 'string' &&
    EXPORT_FORMATS.has(value['format']) &&
    isPositiveInteger(value['width']) &&
    isPositiveInteger(value['height']) &&
    isPositiveNumber(value['fps']) &&
    typeof value['quality'] === 'string' &&
    EXPORT_QUALITIES.has(value['quality']) &&
    isPositiveInteger(value['audioBitrate']) &&
    isPositiveInteger(value['videoBitrate']) &&
    typeof value['includeAudio'] === 'boolean' &&
    (value['audioSampleRate'] === 44_100 || value['audioSampleRate'] === 48_000) &&
    optionalNonEmptyString(value['videoCodec']) &&
    optionalNonEmptyString(value['audioCodec']) &&
    (value['qualityMode'] === undefined ||
      (typeof value['qualityMode'] === 'string' && QUALITY_MODES.has(value['qualityMode'])))
  );
}

function isExportProgress(value: unknown): value is ExportJobProgress {
  if (!isRecord(value)) return false;
  const stage = value['stage'];
  return (
    typeof stage === 'string' &&
    JOB_STAGES.has(stage) &&
    isPercent(value['percent']) &&
    isNonNegativeInteger(value['currentFrame']) &&
    isNonNegativeInteger(value['totalFrames']) &&
    isNonNegativeInteger(value['elapsedMs']) &&
    isNonNegativeInteger(value['estimatedRemainingMs']) &&
    isNonNegativeNumber(value['currentFps'])
  );
}

function isExportResult(value: unknown): value is ExportJobResult {
  return (
    isRecord(value) &&
    isNonEmptyString(value['outputPath']) &&
    isNonNegativeInteger(value['totalFrames']) &&
    isNonNegativeInteger(value['elapsedMs'])
  );
}

function isExportRef(
  value: unknown,
): value is { readonly kind: typeof EXPORT_JOB_KIND; readonly jobId: string } {
  return isRecord(value) && value['kind'] === EXPORT_JOB_KIND && isNonEmptyString(value['jobId']);
}

function isFailure(value: unknown): value is JobFailureSummary {
  return (
    isRecord(value) &&
    isNonEmptyString(value['code']) &&
    isNonEmptyString(value['message']) &&
    (value['retryable'] === undefined || typeof value['retryable'] === 'boolean')
  );
}

function isJobPhase(value: unknown): value is JobPhase {
  return typeof value === 'string' && JOB_PHASES.has(value);
}

function isJsonRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function optionalNonEmptyString(value: unknown): boolean {
  return value === undefined || isNonEmptyString(value);
}

function isPercent(value: unknown): value is number {
  return isNonNegativeNumber(value) && value <= 100;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isTimestamp(value: unknown): value is number {
  return isNonNegativeInteger(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function invalidPersistence(message: string, cause?: unknown): ExportJobError {
  const error = new ExportJobError('export-job-persistence-invalid', message);
  if (cause !== undefined) Object.defineProperty(error, 'cause', { value: cause });
  return error;
}

function deepFreeze(value: unknown, visited: WeakSet<object>): void {
  if (typeof value !== 'object' || value === null || visited.has(value)) return;
  visited.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, visited);
  Object.freeze(value);
}
