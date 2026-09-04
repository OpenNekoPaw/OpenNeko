import { serializeLocalMetadataJson } from '@neko/local-metadata';
import {
  isContentLocator,
  isWorkspaceFileContentLocator,
  validateContentLocator,
} from '@neko/content-domain';
import type { JobFailureSummary, JobPhase } from '@neko/shared/job-lifecycle';
import {
  GENERATION_JOB_KIND,
  GenerationJobError,
  type GenerationJobRequest,
  type GenerationJobSnapshot,
  type GenerationJobStage,
  type GenerationProviderTaskRef,
  type SubmitPurposeGenerationJobInput,
} from './contracts';
import type {
  AudioGenerationRequest,
  ImageGenerationRequest,
  VideoGenerationRequest,
} from '../contracts';
import { isImageOperationId, isVideoOperationId } from '../domain-contracts';
import {
  IMAGE_GENERATION_PARAMETER_IDS,
  VIDEO_GENERATION_PARAMETER_IDS,
} from '../model-parameter-profile';
import type { PromptGenerationRequest } from '../execution';

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
const AUDIO_GENERATION_TYPES: ReadonlySet<string> = new Set(['text-to-audio']);

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
    throw invalidPersistence('Persisted Generation Job snapshot violates the stable contract.');
  }
  deepFreeze(value, new WeakSet<object>());
  return value;
}

export function decodeSubmitPurposeGenerationJobInput(
  value: unknown,
): SubmitPurposeGenerationJobInput {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, PURPOSE_GENERATION_REQUEST_KEYS) ||
    !isNonEmptyString(value['purpose']) ||
    (value['lifecycleMode'] !== 'linked' && value['lifecycleMode'] !== 'detached')
  ) {
    throw new Error('Generation submission violates the canonical purpose request contract.');
  }
  const request = value['request'];
  if (isRecord(request) && ('providerId' in request || 'modelId' in request)) {
    throw new Error('Generation provider and model bindings are Host-owned.');
  }
  if (
    !isGenerationJobRequest({
      providerId: 'host-bound',
      modelId: 'host-bound',
      generationType: value['generationType'],
      request,
    })
  ) {
    throw new Error('Generation submission request violates its generation type contract.');
  }
  if (value['purpose'] !== purposeForGenerationType(value['generationType'])) {
    throw new Error('Generation submission purpose does not match its generation type.');
  }
  return value as SubmitPurposeGenerationJobInput;
}

function purposeForGenerationType(value: unknown): string | undefined {
  if (value === 'prompt') return 'canvas.prompt';
  if (value === 'image-edit') return 'image.edit';
  if (value === 'text-to-image' || value === 'image-to-image') return 'image.generate';
  if (
    value === 'text-to-video' ||
    value === 'image-to-video' ||
    value === 'video-to-video' ||
    value === 'video-edit'
  ) {
    return 'video.generate';
  }
  if (value === 'text-to-audio') return 'audio.generate';
  return undefined;
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
    !hasOnlyKeys(value, GENERATION_JOB_SNAPSHOT_KEYS) ||
    !isGenerationRef(ref) ||
    (value['lifecycleMode'] !== 'linked' && value['lifecycleMode'] !== 'detached') ||
    (value['submissionId'] !== undefined && !isNonEmptyString(value['submissionId'])) ||
    !isJobPhase(phase) ||
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
          return (
            result.ok &&
            isWorkspaceFileContentLocator(result.locator) &&
            result.locator.selector === undefined
          );
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
  if (!isRecord(value) || !isNonEmptyString(value['providerId'])) {
    return false;
  }
  const generationType = value['generationType'];
  const request = value['request'];
  const parameterAdjustments = value['parameterAdjustments'];
  if (typeof generationType !== 'string') return false;
  if (
    !isNonEmptyString(value['modelId']) ||
    !hasOnlyKeys(value, MODEL_JOB_REQUEST_KEYS) ||
    (parameterAdjustments !== undefined &&
      (!Array.isArray(parameterAdjustments) ||
        !parameterAdjustments.every(isGenerationParameterAdjustment)))
  ) {
    return false;
  }
  if (
    parameterAdjustments !== undefined &&
    !VIDEO_GENERATION_TYPES.has(generationType) &&
    !IMAGE_GENERATION_TYPES.has(generationType)
  ) {
    return false;
  }
  if (generationType === 'prompt') return isPromptRequest(request);
  if (IMAGE_GENERATION_TYPES.has(generationType)) return isImageRequest(request);
  if (VIDEO_GENERATION_TYPES.has(generationType)) return isVideoRequest(request);
  if (AUDIO_GENERATION_TYPES.has(generationType)) return isAudioRequest(request);
  return false;
}

function isGenerationParameterAdjustment(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, GENERATION_PARAMETER_ADJUSTMENT_KEYS) ||
    typeof value['parameter'] !== 'string' ||
    typeof value['reason'] !== 'string'
  ) {
    return false;
  }
  if (IMAGE_GENERATION_PARAMETER_ID_SET.has(value['parameter'])) {
    return value['reason'] === 'invalid';
  }
  return (
    VIDEO_GENERATION_PARAMETER_ID_SET.has(value['parameter']) &&
    VIDEO_GENERATION_PARAMETER_ADJUSTMENT_REASONS.has(value['reason'])
  );
}

function isPromptRequest(value: unknown): value is PromptGenerationRequest {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, PROMPT_REQUEST_KEYS) &&
    typeof value['prompt'] === 'string' &&
    optionalNumbersAreFinite(value, ['temperature', 'maxOutputTokens']) &&
    (value['context'] === undefined ||
      (Array.isArray(value['context']) && value['context'].every(isPromptContext)))
  );
}

function isPromptContext(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, PROMPT_CONTEXT_KEYS) &&
    isNonEmptyString(value['sourceNodeId']) &&
    typeof value['text'] === 'string' &&
    isNonEmptyString(value['digest'])
  );
}

function isImageRequest(value: unknown): value is ImageGenerationRequest {
  return (
    isMediaRequestBase(value) &&
    hasOnlyKeys(value, IMAGE_REQUEST_KEYS) &&
    (value['operation'] === undefined || isImageOperationId(value['operation'])) &&
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
    hasOnlyKeys(orientation, PANORAMA_ORIENTATION_KEYS) &&
    optionalNumbersAreFinite(orientation, ['yawDeg', 'pitchDeg', 'fieldOfViewDeg']) &&
    typeof orientation['yawDeg'] === 'number' &&
    typeof orientation['pitchDeg'] === 'number' &&
    typeof orientation['fieldOfViewDeg'] === 'number' &&
    isRecord(identity) &&
    hasOnlyKeys(identity, THREE_REFERENCE_IDENTITY_KEYS) &&
    isNonEmptyString(identity['sessionId']) &&
    isNonEmptyString(identity['requestId'])
  );
}

function isVideoRequest(value: unknown): value is VideoGenerationRequest {
  return (
    isMediaRequestBase(value) &&
    hasOnlyKeys(value, VIDEO_REQUEST_KEYS) &&
    (value['operation'] === undefined || isVideoOperationId(value['operation'])) &&
    optionalNumbersAreFinite(value, ['duration', 'fps', 'motionStrength']) &&
    (value['generateAudio'] === undefined || typeof value['generateAudio'] === 'boolean') &&
    (value['inputs'] === undefined ||
      (Array.isArray(value['inputs']) &&
        value['inputs'].every(isVideoGenerationInput) &&
        value['inputs'].filter((input) => isRecord(input) && input['role'] === 'first-frame')
          .length <= 1 &&
        value['inputs'].filter((input) => isRecord(input) && input['role'] === 'last-frame')
          .length <= 1))
  );
}

function isVideoGenerationInput(value: unknown): boolean {
  if (!isRecord(value) || !hasOnlyKeys(value, VIDEO_INPUT_KEYS)) return false;
  if (!isContentLocator(value['locator'])) return false;
  if (value['mimeType'] !== undefined && typeof value['mimeType'] !== 'string') return false;
  const type = value['type'];
  const role = value['role'];
  return (
    (type === 'image' &&
      (role === 'first-frame' || role === 'last-frame' || role === 'reference-image')) ||
    (type === 'video' && role === 'reference-video') ||
    (type === 'audio' && role === 'reference-audio')
  );
}

function isAudioRequest(value: unknown): value is AudioGenerationRequest {
  return (
    isMediaRequestBase(value) &&
    hasOnlyKeys(value, AUDIO_REQUEST_KEYS) &&
    optionalNumbersAreFinite(value, ['duration'])
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
const PURPOSE_GENERATION_REQUEST_KEYS = new Set([
  'purpose',
  'generationType',
  'lifecycleMode',
  'request',
]);
const MODEL_JOB_REQUEST_KEYS = new Set([
  'providerId',
  'modelId',
  'parameterAdjustments',
  'generationType',
  'request',
]);
const GENERATION_PARAMETER_ADJUSTMENT_KEYS = new Set(['parameter', 'reason']);
const IMAGE_GENERATION_PARAMETER_ID_SET: ReadonlySet<string> = new Set(
  IMAGE_GENERATION_PARAMETER_IDS,
);
const VIDEO_GENERATION_PARAMETER_ID_SET: ReadonlySet<string> = new Set(
  VIDEO_GENERATION_PARAMETER_IDS,
);
const VIDEO_GENERATION_PARAMETER_ADJUSTMENT_REASONS: ReadonlySet<string> = new Set([
  'unsupported',
  'invalid',
  'missing-required',
]);
const GENERATION_JOB_SNAPSHOT_KEYS = new Set([
  'ref',
  'submissionId',
  'phase',
  'createdAt',
  'updatedAt',
  'retryOf',
  'failure',
  'regenerateOf',
  'lifecycleMode',
  'request',
  'progress',
  'providerTask',
  'resultLocators',
]);
const PROMPT_REQUEST_KEYS = new Set(['prompt', 'context', 'temperature', 'maxOutputTokens']);
const PROMPT_CONTEXT_KEYS = new Set(['sourceNodeId', 'text', 'digest']);
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
]);
const VIDEO_REQUEST_KEYS = new Set([
  ...BASE_REQUEST_KEYS,
  'operation',
  'duration',
  'resolution',
  'fps',
  'aspectRatio',
  'generateAudio',
  'inputs',
  'motionStrength',
  'cameraMovement',
  'cameraAngle',
  'shotScale',
  'editInstruction',
]);
const VIDEO_INPUT_KEYS = new Set(['type', 'role', 'locator', 'mimeType']);
const AUDIO_REQUEST_KEYS = new Set([...BASE_REQUEST_KEYS, 'duration', 'format']);
const IP_ADAPTER_REFERENCE_KEYS = new Set(['imageLocator', 'mimeType', 'strength', 'mode']);
const PANORAMA_ORIENTATION_KEYS = new Set(['yawDeg', 'pitchDeg', 'fieldOfViewDeg']);
const THREE_REFERENCE_IDENTITY_KEYS = new Set(['sessionId', 'requestId']);
