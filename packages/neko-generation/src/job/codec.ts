import { isContentLocator, serializeLocalMetadataJson, validateContentLocator } from '@neko/shared';
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
  assertNoLegacyGenerationPayload(snapshot);
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
  assertNoLegacyGenerationPayload(value);
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
  const regenerateOf = value['regenerateOf'];
  const phase = value['phase'];
  const failure = value['failure'];
  const progress = value['progress'];
  const providerTask = value['providerTask'];
  const resultLocators = value['resultLocators'];
  if (
    !isGenerationRef(ref) ||
    (value['lifecycleMode'] !== 'linked' && value['lifecycleMode'] !== 'detached') ||
    !isJobPhase(phase) ||
    !isPositiveInteger(value['revision']) ||
    !isTimestamp(value['createdAt']) ||
    !isTimestamp(value['updatedAt']) ||
    value['updatedAt'] < value['createdAt'] ||
    (retryOf !== undefined && (!isGenerationRef(retryOf) || retryOf.jobId === ref.jobId)) ||
    (regenerateOf !== undefined &&
      (!isGenerationRef(regenerateOf) || regenerateOf.jobId === ref.jobId)) ||
    (retryOf !== undefined && regenerateOf !== undefined) ||
    !isGenerationJobRequest(value['request']) ||
    !isGenerationProgress(progress) ||
    (providerTask !== undefined && !isProviderTask(providerTask)) ||
    'resultRefs' in value ||
    (resultLocators !== undefined &&
      (!Array.isArray(resultLocators) ||
        !resultLocators.every((locator) => {
          const result = validateContentLocator(locator);
          return result.ok && result.locator.kind === 'generated-output';
        }))) ||
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
  return phase !== 'succeeded' || (Array.isArray(resultLocators) && resultLocators.length > 0);
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
    hasOnlyKeys(value, IMAGE_REQUEST_KEYS) &&
    optionalNumbersAreFinite(value, [
      'width',
      'height',
      'count',
      'inpaintStrength',
      'controlStrength',
    ]) &&
    optionalContentLocators(value, [
      'referenceImageLocator',
      'maskLocator',
      'controlImageLocator',
    ]) &&
    (value['panoramaReference'] === undefined ||
      isGenerationPanoramaReference(value['panoramaReference'])) &&
    (value['ipAdapterRefs'] === undefined ||
      (Array.isArray(value['ipAdapterRefs']) && value['ipAdapterRefs'].every(isIpAdapterReference)))
  );
}

function isGenerationPanoramaReference(value: unknown): boolean {
  if (!isRecord(value) || !isContentLocator(value['imageLocator'])) return false;
  const orientation = value['orientation'];
  const identity = value['identity'];
  return (
    isRecord(orientation) &&
    optionalNumbersAreFinite(orientation, ['yawDeg', 'pitchDeg', 'fieldOfViewDeg']) &&
    typeof orientation['yawDeg'] === 'number' &&
    typeof orientation['pitchDeg'] === 'number' &&
    typeof orientation['fieldOfViewDeg'] === 'number' &&
    isRecord(identity) &&
    isNonEmptyString(identity['sessionId']) &&
    isPositiveInteger(identity['revision'])
  );
}

function isVideoRequest(value: unknown): value is VideoGenerationRequest {
  return (
    isMediaRequestBase(value) &&
    hasOnlyKeys(value, VIDEO_REQUEST_KEYS) &&
    optionalNumbersAreFinite(value, ['duration', 'fps', 'motionStrength']) &&
    optionalContentLocators(value, [
      'startFrameLocator',
      'endFrameLocator',
      'referenceVideoLocator',
    ]) &&
    (value['referenceImages'] === undefined ||
      (Array.isArray(value['referenceImages']) &&
        value['referenceImages'].every(isIpAdapterReference)))
  );
}

function isAudioRequest(value: unknown): value is AudioGenerationRequest {
  return (
    isMediaRequestBase(value) &&
    hasOnlyKeys(value, AUDIO_REQUEST_KEYS) &&
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
      'quality',
      'style',
      'controlMode',
      'editInstruction',
      'resolution',
      'cameraMovement',
      'cameraAngle',
      'shotScale',
      'genre',
      'format',
    ]) &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function isIpAdapterReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, IP_ADAPTER_REFERENCE_KEYS) &&
    isContentLocator(value['imageLocator']) &&
    optionalStrings(value, ['mimeType', 'mode']) &&
    optionalNumbersAreFinite(value, ['strength'])
  );
}

function optionalContentLocators(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => value[key] === undefined || isContentLocator(value[key]));
}

function assertNoLegacyGenerationPayload(value: unknown): void {
  if (!isRecord(value)) return;
  const requestEnvelope = value['request'];
  const request =
    isRecord(requestEnvelope) && isRecord(requestEnvelope['request'])
      ? requestEnvelope['request']
      : undefined;
  if ('resultRefs' in value || (request !== undefined && containsLegacyGenerationField(request))) {
    throw new GenerationJobError(
      'generation-job-migration-required',
      'Persisted Generation Job uses retired resource-reference fields or materialized media fields and must be resubmitted.',
    );
  }
}

function containsLegacyGenerationField(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsLegacyGenerationField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      LEGACY_MATERIALIZED_REQUEST_KEYS.has(key) || containsLegacyGenerationField(nested),
  );
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
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

const BASE_REQUEST_KEYS = [
  'prompt',
  'negativePrompt',
  'providerId',
  'modelId',
  'metadata',
] as const;
const IMAGE_REQUEST_KEYS = new Set([
  ...BASE_REQUEST_KEYS,
  'operation',
  'width',
  'height',
  'aspectRatio',
  'count',
  'referenceImageLocator',
  'maskLocator',
  'inpaintStrength',
  'quality',
  'style',
  'controlImageLocator',
  'controlMode',
  'controlStrength',
  'ipAdapterRefs',
  'cameraReference',
  'panoramaReference',
  'editInstruction',
  'outpaintExpansion',
  'splitOptions',
]);
const VIDEO_REQUEST_KEYS = new Set([
  ...BASE_REQUEST_KEYS,
  'operation',
  'duration',
  'resolution',
  'fps',
  'aspectRatio',
  'startFrameLocator',
  'endFrameLocator',
  'referenceVideoLocator',
  'motionStrength',
  'cameraMovement',
  'cameraAngle',
  'shotScale',
  'referenceImages',
  'editInstruction',
]);
const AUDIO_REQUEST_KEYS = new Set([
  ...BASE_REQUEST_KEYS,
  'duration',
  'isMusic',
  'genre',
  'format',
]);
const IP_ADAPTER_REFERENCE_KEYS = new Set(['imageLocator', 'mimeType', 'strength', 'mode']);
const LEGACY_MATERIALIZED_REQUEST_KEYS: ReadonlySet<string> = new Set([
  'referenceImageUrl',
  'referenceImageBase64',
  'referenceImageUri',
  'maskBase64',
  'maskUri',
  'controlImageBase64',
  'controlImageRef',
  'controlImageUri',
  'startFrameRef',
  'endFrameRef',
  'referenceVideoRef',
  'referenceVideoUrl',
  'startFrameImageBase64',
  'endFrameImageBase64',
  'sourceVideoUrl',
  'imageBase64',
  'imageRef',
  'resourceRef',
  'sourceImageRef',
]);
