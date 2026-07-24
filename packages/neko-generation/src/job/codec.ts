import { isResourceRef, serializeLocalMetadataJson } from '@neko/shared';
import type { JobFailureSummary, JobPhase } from '@neko/shared/job-lifecycle';
import {
  GENERATION_JOB_KIND,
  GenerationJobError,
  type GenerationJobRequest,
  type GenerationJobSnapshot,
  type GenerationJobStage,
  type GenerationProviderTaskRef,
} from './contracts';
import type {
  AudioGenerationRequest,
  ImageGenerationRequest,
  VideoGenerationRequest,
} from '../contracts';

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
  'submitting',
  'waiting-provider',
  'committing-result',
  'completed',
]);
const IMAGE_GENERATION_TYPES: ReadonlySet<string> = new Set([
  'text-to-image',
  'image-to-image',
  'image-edit',
]);
const VIDEO_GENERATION_TYPES: ReadonlySet<string> = new Set([
  'text-to-video',
  'image-to-video',
  'video-to-video',
  'video-edit',
]);
const AUDIO_GENERATION_TYPES: ReadonlySet<string> = new Set(['text-to-audio', 'text-to-music']);

export function encodeGenerationJobSnapshot(snapshot: GenerationJobSnapshot): string {
  if (!isGenerationJobSnapshot(snapshot)) {
    throw invalidPersistence('Generation Job is not a valid snapshot.');
  }
  return serializeLocalMetadataJson(snapshot, 'persist-generation-job');
}

export function decodeGenerationJobSnapshot(serialized: string): GenerationJobSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw invalidPersistence('Persisted Generation Job snapshot is not valid JSON.', error);
  }
  if (!isGenerationJobSnapshot(value)) {
    throw invalidPersistence('Persisted Generation Job snapshot violates schema version 2.');
  }
  deepFreeze(value, new WeakSet<object>());
  return value;
}

function isGenerationJobSnapshot(value: unknown): value is GenerationJobSnapshot {
  if (!isRecord(value)) return false;
  const ref = value['ref'];
  const retryOf = value['retryOf'];
  const phase = value['phase'];
  const failure = value['failure'];
  const progress = value['progress'];
  const providerTask = value['providerTask'];
  const resultRefs = value['resultRefs'];
  if (
    !isGenerationRef(ref) ||
    (value['lifecycleMode'] !== 'linked' && value['lifecycleMode'] !== 'detached') ||
    !isJobPhase(phase) ||
    !isPositiveInteger(value['revision']) ||
    !isTimestamp(value['createdAt']) ||
    !isTimestamp(value['updatedAt']) ||
    value['updatedAt'] < value['createdAt'] ||
    (retryOf !== undefined && (!isGenerationRef(retryOf) || retryOf.jobId === ref.jobId)) ||
    !isGenerationJobRequest(value['request']) ||
    !isGenerationProgress(progress) ||
    (providerTask !== undefined && !isProviderTask(providerTask)) ||
    (resultRefs !== undefined &&
      (!Array.isArray(resultRefs) || !resultRefs.every(isResourceRef))) ||
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
  return phase !== 'succeeded' || (Array.isArray(resultRefs) && resultRefs.length > 0);
}

function isGenerationJobRequest(value: unknown): value is GenerationJobRequest {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value['providerId']) ||
    !isNonEmptyString(value['modelId'])
  ) {
    return false;
  }
  const generationType = value['generationType'];
  const request = value['request'];
  if (typeof generationType !== 'string') return false;
  if (IMAGE_GENERATION_TYPES.has(generationType)) return isImageRequest(request);
  if (VIDEO_GENERATION_TYPES.has(generationType)) return isVideoRequest(request);
  if (AUDIO_GENERATION_TYPES.has(generationType)) return isAudioRequest(request);
  return false;
}

function isImageRequest(value: unknown): value is ImageGenerationRequest {
  return (
    isMediaRequestBase(value) &&
    optionalNumbersAreFinite(value, [
      'width',
      'height',
      'count',
      'inpaintStrength',
      'controlStrength',
    ])
  );
}

function isVideoRequest(value: unknown): value is VideoGenerationRequest {
  return (
    isMediaRequestBase(value) &&
    optionalNumbersAreFinite(value, ['duration', 'fps', 'motionStrength'])
  );
}

function isAudioRequest(value: unknown): value is AudioGenerationRequest {
  return (
    isMediaRequestBase(value) &&
    optionalNumbersAreFinite(value, ['duration']) &&
    (value['isMusic'] === undefined || typeof value['isMusic'] === 'boolean')
  );
}

function isMediaRequestBase(value: unknown): value is Record<string, unknown> & { prompt: string } {
  return (
    isRecord(value) &&
    typeof value['prompt'] === 'string' &&
    optionalStrings(value, [
      'negativePrompt',
      'providerId',
      'modelId',
      'operation',
      'aspectRatio',
      'referenceImageUrl',
      'referenceImageBase64',
      'referenceImageUri',
      'maskBase64',
      'maskUri',
      'quality',
      'style',
      'controlImageBase64',
      'controlImageUri',
      'controlMode',
      'editInstruction',
      'resolution',
      'referenceVideoUrl',
      'cameraMovement',
      'cameraAngle',
      'shotScale',
      'startFrameImageBase64',
      'endFrameImageBase64',
      'sourceVideoUrl',
      'genre',
      'format',
    ]) &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function isGenerationProgress(value: unknown): value is {
  readonly stage: GenerationJobStage;
  readonly percent: number;
} {
  return (
    isRecord(value) &&
    typeof value['stage'] === 'string' &&
    JOB_STAGES.has(value['stage']) &&
    typeof value['percent'] === 'number' &&
    Number.isFinite(value['percent']) &&
    value['percent'] >= 0 &&
    value['percent'] <= 100
  );
}

function isProviderTask(value: unknown): value is GenerationProviderTaskRef {
  return (
    isRecord(value) &&
    isNonEmptyString(value['providerId']) &&
    isNonEmptyString(value['externalTaskId'])
  );
}

function isFailure(value: unknown): value is JobFailureSummary {
  return (
    isRecord(value) &&
    isNonEmptyString(value['code']) &&
    isNonEmptyString(value['message']) &&
    (value['retryable'] === undefined || typeof value['retryable'] === 'boolean')
  );
}

function isGenerationRef(
  value: unknown,
): value is { readonly kind: typeof GENERATION_JOB_KIND; readonly jobId: string } {
  return (
    isRecord(value) && value['kind'] === GENERATION_JOB_KIND && isNonEmptyString(value['jobId'])
  );
}

function isJobPhase(value: unknown): value is JobPhase {
  return typeof value === 'string' && JOB_PHASES.has(value);
}

function optionalStrings(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => value[key] === undefined || typeof value[key] === 'string');
}

function optionalNumbersAreFinite(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  return keys.every(
    (key) =>
      value[key] === undefined || (typeof value[key] === 'number' && Number.isFinite(value[key])),
  );
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidPersistence(message: string, cause?: unknown): GenerationJobError {
  const error = new GenerationJobError('generation-job-persistence-invalid', message);
  if (cause !== undefined) Object.defineProperty(error, 'cause', { value: cause });
  return error;
}

function deepFreeze(value: unknown, visited: WeakSet<object>): void {
  if (typeof value !== 'object' || value === null || visited.has(value)) return;
  visited.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, visited);
  Object.freeze(value);
}
