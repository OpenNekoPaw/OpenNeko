import type {
  CanvasStoryboardGenerationParams,
  CanvasStoryboardModelCapabilityProjection,
  CanvasStoryboardPromptDocumentRef,
  CanvasStoryboardReferenceMedia,
  CanvasStoryboardShotTarget,
} from './canvas-semantic-storyboard';
import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  createCreativeAiDiagnostic,
  isRuntimeOnlyCreativeAiIdentityValue,
  validateCreativeAiSourceRef,
  validateCreativeAiTargetRef,
  type CreativeAiDiagnostic,
  type CreativeAiDocumentRef,
  type CreativeAiInvocationSchemaVersion,
  type CreativeAiRevision,
  type CreativeAiSourceRef,
  type CreativeAiTargetRef,
  type CreativeAiValidationResult,
} from './creative-ai-invocation';

export const CANVAS_CREATIVE_AI_PACKAGE_ID = 'neko-canvas' as const;

export const CANVAS_CREATIVE_AI_ACTION_IDS = [
  'optimize-image-prompt',
  'optimize-video-prompt',
  'generate-image',
  'edit-image',
  'generate-video',
  'edit-video',
] as const;

export type CanvasCreativeAiActionId = (typeof CANVAS_CREATIVE_AI_ACTION_IDS)[number];

export const CANVAS_CREATIVE_AI_ACTION_MODALITIES = ['image', 'video', 'prompt'] as const;

export type CanvasCreativeAiActionModality = (typeof CANVAS_CREATIVE_AI_ACTION_MODALITIES)[number];

export interface CanvasCreativeAiActionCreativeParameters {
  readonly generation?: CanvasStoryboardGenerationParams;
  readonly modelCapability?: CanvasStoryboardModelCapabilityProjection;
  readonly styleProfileId?: string;
  readonly promptDocuments?: readonly CanvasStoryboardPromptDocumentRef[];
  readonly referenceMedia?: CanvasStoryboardReferenceMedia;
}

export interface CanvasCreativeAiActionRequest {
  readonly schemaVersion: CreativeAiInvocationSchemaVersion;
  readonly requestId: string;
  readonly actionId: CanvasCreativeAiActionId;
  readonly documentRef: CreativeAiDocumentRef;
  readonly sourceRef: CreativeAiSourceRef;
  readonly targetRef: CreativeAiTargetRef;
  readonly candidateTargetRef: CreativeAiTargetRef;
  readonly documentRevision: CreativeAiRevision;
  readonly targetRevision: CreativeAiRevision;
  readonly idempotencyKey: string;
  readonly target: CanvasStoryboardShotTarget;
  readonly creativeParameters?: CanvasCreativeAiActionCreativeParameters;
  readonly requestedAt?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export function isCanvasCreativeAiActionId(value: unknown): value is CanvasCreativeAiActionId {
  return (
    typeof value === 'string' &&
    CANVAS_CREATIVE_AI_ACTION_IDS.includes(value as CanvasCreativeAiActionId)
  );
}

export function isCanvasCreativeAiActionRequest(
  value: unknown,
): value is CanvasCreativeAiActionRequest {
  return validateCanvasCreativeAiActionRequest(value).valid;
}

export function validateCanvasCreativeAiActionRequest(
  value: unknown,
): CreativeAiValidationResult<CanvasCreativeAiActionRequest> {
  const diagnostics: CreativeAiDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      diagnostics: [
        createCreativeAiDiagnostic(
          'error',
          'canvas-creative-ai-invalid-action-request',
          'Canvas creative AI action request must be an object.',
        ),
      ],
    };
  }

  validateSchemaVersion(value['schemaVersion'], diagnostics);
  requireStableString(value['requestId'], 'requestId', diagnostics);
  if (!isCanvasCreativeAiActionId(value['actionId'])) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-action-id',
        'Canvas creative AI action id is invalid.',
        'actionId',
      ),
    );
  }
  validateDocumentRef(value['documentRef'], 'documentRef', diagnostics);
  validateSourceRef(value['sourceRef'], 'sourceRef', diagnostics);
  validateTargetRef(value['targetRef'], 'targetRef', diagnostics);
  validateCandidateTargetRef(value['candidateTargetRef'], 'candidateTargetRef', diagnostics);
  requireRevision(value['documentRevision'], 'documentRevision', diagnostics);
  requireRevision(value['targetRevision'], 'targetRevision', diagnostics);
  requireStableString(
    value['idempotencyKey'],
    'idempotencyKey',
    diagnostics,
    'creative-ai-missing-idempotency-key',
  );
  validateStoryboardTarget(value['target'], 'target', diagnostics);
  validateCreativeParameters(
    value['creativeParameters'],
    value['actionId'],
    'creativeParameters',
    diagnostics,
  );
  validateOptionalStableString(value['requestedAt'], 'requestedAt', diagnostics);
  validateOptionalRecord(value['metadata'], 'metadata', diagnostics);

  return {
    valid: diagnostics.every((item) => item.severity !== 'error'),
    ...(diagnostics.every((item) => item.severity !== 'error')
      ? { value: value as unknown as CanvasCreativeAiActionRequest }
      : {}),
    diagnostics,
  };
}

export function getCanvasCreativeAiActionModality(
  actionId: CanvasCreativeAiActionId,
): CanvasCreativeAiActionModality {
  switch (actionId) {
    case 'optimize-image-prompt':
    case 'optimize-video-prompt':
      return 'prompt';
    case 'generate-image':
    case 'edit-image':
      return 'image';
    case 'generate-video':
    case 'edit-video':
      return 'video';
  }
}

function validateSchemaVersion(value: unknown, diagnostics: CreativeAiDiagnostic[]): void {
  if (value !== CREATIVE_AI_INVOCATION_SCHEMA_VERSION) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'creative-ai-unsupported-schema-version',
        'Creative AI invocation schemaVersion is unsupported.',
        'schemaVersion',
      ),
    );
  }
}

function validateDocumentRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'creative-ai-invalid-document-ref',
        'Canvas creative AI documentRef must be an object.',
        target,
      ),
    );
    return;
  }
  if (value['kind'] !== 'nk-document') {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'creative-ai-invalid-document-ref-kind',
        'Canvas creative AI documentRef kind must be nk-document.',
        `${target}.kind`,
      ),
    );
  }
  if (value['packageId'] !== CANVAS_CREATIVE_AI_PACKAGE_ID) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-package',
        'Canvas creative AI documentRef must belong to neko-canvas.',
        `${target}.packageId`,
      ),
    );
  }
  if (
    !isStableString(value['documentId']) &&
    !isStablePath(value['projectRelativePath']) &&
    !isStableVariablePath(value['variablePath'])
  ) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'creative-ai-missing-document-identity',
        'Canvas creative AI documentRef must include stable document identity.',
        target,
      ),
    );
  }
}

function validateSourceRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  const result = validateCreativeAiSourceRef(value);
  pushPrefixedDiagnostics(result.diagnostics, target, diagnostics);
}

function validateTargetRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  const result = validateCreativeAiTargetRef(value);
  pushPrefixedDiagnostics(result.diagnostics, target, diagnostics);
}

function validateCandidateTargetRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  const result = validateCreativeAiTargetRef(value);
  pushPrefixedDiagnostics(result.diagnostics, target, diagnostics);
  if (!isRecord(value)) return;
  if (value['candidateOnly'] !== true && value['kind'] !== 'candidate-target') {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-candidate-target',
        'Canvas creative AI candidateTargetRef must be candidate-only or candidate-target kind.',
        target,
      ),
    );
  }
}

function validateStoryboardTarget(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-shot-target',
        'Canvas creative AI target must be an object.',
        target,
      ),
    );
    return;
  }
  requireStableString(value['nodeId'], `${target}.nodeId`, diagnostics);
  validateOptionalStableString(value['sceneNodeId'], `${target}.sceneNodeId`, diagnostics);
  validateOptionalStableString(value['shotId'], `${target}.shotId`, diagnostics);
  if (
    value['shotNumber'] !== undefined &&
    (!Number.isInteger(value['shotNumber']) ||
      typeof value['shotNumber'] !== 'number' ||
      value['shotNumber'] < 0)
  ) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-shot-number',
        'Canvas creative AI shotNumber must be a non-negative integer.',
        `${target}.shotNumber`,
      ),
    );
  }
}

function validateCreativeParameters(
  value: unknown,
  actionId: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) {
    validateActionSpecificRequirements(actionId, undefined, target, diagnostics);
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-creative-parameters',
        'Canvas creative AI creativeParameters must be an object.',
        target,
      ),
    );
    return;
  }
  validateOptionalPromptDocuments(
    value['promptDocuments'],
    `${target}.promptDocuments`,
    diagnostics,
  );
  validateOptionalReferenceMedia(value['referenceMedia'], `${target}.referenceMedia`, diagnostics);
  validateOptionalGenerationParams(value['generation'], `${target}.generation`, diagnostics);
  validateOptionalModelCapability(
    value['modelCapability'],
    `${target}.modelCapability`,
    diagnostics,
  );
  validateOptionalStableString(value['styleProfileId'], `${target}.styleProfileId`, diagnostics);
  validateActionSpecificRequirements(actionId, value, target, diagnostics);
  validateAdvancedParametersAgainstCapability(value, target, diagnostics);
}

function validateActionSpecificRequirements(
  actionId: unknown,
  parameters: Readonly<Record<string, unknown>> | undefined,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!isCanvasCreativeAiActionId(actionId)) return;
  const promptDocuments = readPromptDocuments(parameters);
  const referenceMedia = readReferenceMedia(parameters);
  switch (actionId) {
    case 'optimize-image-prompt':
    case 'generate-image':
      requirePromptDocument(promptDocuments, 'image', `${target}.promptDocuments`, diagnostics);
      validateModelCapabilityForAction(
        parameters,
        actionId,
        `${target}.modelCapability`,
        diagnostics,
      );
      return;
    case 'edit-image':
      requirePromptDocument(promptDocuments, 'image', `${target}.promptDocuments`, diagnostics);
      if ((referenceMedia?.imageRefs?.length ?? 0) === 0) {
        diagnostics.push(
          createCreativeAiDiagnostic(
            'error',
            'canvas-creative-ai-missing-image-edit-source',
            'Canvas image editing requires at least one image reference.',
            `${target}.referenceMedia.imageRefs`,
          ),
        );
      }
      validateModelCapabilityForAction(
        parameters,
        actionId,
        `${target}.modelCapability`,
        diagnostics,
      );
      return;
    case 'optimize-video-prompt':
    case 'generate-video':
      requirePromptDocument(promptDocuments, 'video', `${target}.promptDocuments`, diagnostics);
      validateModelCapabilityForAction(
        parameters,
        actionId,
        `${target}.modelCapability`,
        diagnostics,
      );
      return;
    case 'edit-video':
      requirePromptDocument(promptDocuments, 'video', `${target}.promptDocuments`, diagnostics);
      if (
        (referenceMedia?.videoRefs?.length ?? 0) === 0 &&
        (referenceMedia?.imageRefs?.length ?? 0) === 0
      ) {
        diagnostics.push(
          createCreativeAiDiagnostic(
            'error',
            'canvas-creative-ai-missing-video-edit-source',
            'Canvas video editing requires video or keyframe reference media.',
            `${target}.referenceMedia`,
          ),
        );
      }
      validateModelCapabilityForAction(
        parameters,
        actionId,
        `${target}.modelCapability`,
        diagnostics,
      );
      return;
  }
}

function validateModelCapabilityForAction(
  parameters: Readonly<Record<string, unknown>> | undefined,
  actionId: CanvasCreativeAiActionId,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  const capability = readModelCapability(parameters);
  if (!capability) return;
  if (
    (actionId === 'generate-image' && capability.imageGeneration === false) ||
    (actionId === 'edit-image' && capability.imageEditing === false) ||
    (actionId === 'generate-video' && capability.videoGeneration === false) ||
    (actionId === 'edit-video' && capability.videoEditing === false)
  ) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-model-capability-unsupported',
        'Canvas creative AI action is unsupported by the selected model capability.',
        target,
      ),
    );
  }
}

function validateAdvancedParametersAgainstCapability(
  parameters: Readonly<Record<string, unknown>>,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  const generation = parameters['generation'];
  const capability = readModelCapability(parameters);
  if (!isRecord(generation) || !capability?.advancedParameters) return;
  const advanced = generation['advancedParameters'];
  if (!isRecord(advanced)) return;
  const supported = new Set<string>(capability.advancedParameters);
  for (const key of Object.keys(advanced)) {
    if (!supported.has(key)) {
      diagnostics.push(
        createCreativeAiDiagnostic(
          'error',
          'canvas-creative-ai-unsupported-advanced-parameter',
          'Canvas creative AI advanced parameter is unsupported by the selected model capability.',
          `${target}.generation.advancedParameters.${key}`,
        ),
      );
    }
  }
}

function requirePromptDocument(
  documents: readonly CanvasStoryboardPromptDocumentRef[] | undefined,
  blockKind: 'image' | 'video',
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (documents?.some((document) => document.blockKind === blockKind)) return;
  diagnostics.push(
    createCreativeAiDiagnostic(
      'error',
      blockKind === 'image'
        ? 'canvas-creative-ai-image-prompt-required'
        : 'canvas-creative-ai-video-prompt-required',
      `Canvas creative AI action requires a ${blockKind} prompt document ref.`,
      target,
    ),
  );
}

function validateOptionalPromptDocuments(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-prompt-documents',
        'Canvas creative AI promptDocuments must be an array.',
        target,
      ),
    );
    return;
  }
  for (const [index, document] of value.entries()) {
    validatePromptDocumentRef(document, `${target}[${index}]`, diagnostics);
  }
}

function validatePromptDocumentRef(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-prompt-document',
        'Canvas creative AI prompt document ref must be an object.',
        target,
      ),
    );
    return;
  }
  if (value['blockKind'] !== 'image' && value['blockKind'] !== 'video') {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-prompt-block-kind',
        'Canvas creative AI prompt document blockKind must be image or video.',
        `${target}.blockKind`,
      ),
    );
  }
  requireStableString(value['documentId'], `${target}.documentId`, diagnostics);
  if (value['text'] !== undefined && typeof value['text'] !== 'string') {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-prompt-document-text',
        'Canvas creative AI prompt document text must be a string.',
        `${target}.text`,
      ),
    );
  }
  if (value['version'] !== 1) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-prompt-document-version',
        'Canvas creative AI prompt document version is unsupported.',
        `${target}.version`,
      ),
    );
  }
  validateOptionalStableString(value['baseRevision'], `${target}.baseRevision`, diagnostics);
}

function validateOptionalReferenceMedia(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-reference-media',
        'Canvas creative AI referenceMedia must be an object.',
        target,
      ),
    );
    return;
  }
  validateOptionalArray(value['imageRefs'], `${target}.imageRefs`, diagnostics);
  validateOptionalArray(value['videoRefs'], `${target}.videoRefs`, diagnostics);
  validateOptionalArray(value['audioRefs'], `${target}.audioRefs`, diagnostics);
}

function validateOptionalGenerationParams(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-generation-params',
        'Canvas creative AI generation parameters must be an object.',
        target,
      ),
    );
    return;
  }
  if (value['duration'] !== undefined && typeof value['duration'] !== 'number') {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-duration',
        'Canvas creative AI duration must be a number.',
        `${target}.duration`,
      ),
    );
  }
  validateOptionalStableString(value['dialogue'], `${target}.dialogue`, diagnostics);
  validateOptionalStableString(value['voiceOver'], `${target}.voiceOver`, diagnostics);
  validateOptionalStableString(value['aspectRatio'], `${target}.aspectRatio`, diagnostics);
  validateOptionalStableString(value['modelId'], `${target}.modelId`, diagnostics);
  validateOptionalRecord(value['advancedParameters'], `${target}.advancedParameters`, diagnostics);
}

function validateOptionalModelCapability(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-model-capability',
        'Canvas creative AI model capability must be an object.',
        target,
      ),
    );
    return;
  }
  validateOptionalStableString(value['providerId'], `${target}.providerId`, diagnostics);
  validateOptionalStableString(value['modelId'], `${target}.modelId`, diagnostics);
  validateOptionalBoolean(value['imageGeneration'], `${target}.imageGeneration`, diagnostics);
  validateOptionalBoolean(value['imageEditing'], `${target}.imageEditing`, diagnostics);
  validateOptionalBoolean(value['videoGeneration'], `${target}.videoGeneration`, diagnostics);
  validateOptionalBoolean(value['videoEditing'], `${target}.videoEditing`, diagnostics);
  if (value['advancedParameters'] !== undefined) {
    validateOptionalArray(value['advancedParameters'], `${target}.advancedParameters`, diagnostics);
  }
}

function readPromptDocuments(
  parameters: Readonly<Record<string, unknown>> | undefined,
): readonly CanvasStoryboardPromptDocumentRef[] | undefined {
  const value = parameters?.['promptDocuments'];
  return Array.isArray(value) ? (value as readonly CanvasStoryboardPromptDocumentRef[]) : undefined;
}

function readReferenceMedia(
  parameters: Readonly<Record<string, unknown>> | undefined,
): CanvasStoryboardReferenceMedia | undefined {
  const value = parameters?.['referenceMedia'];
  return isRecord(value) ? (value as unknown as CanvasStoryboardReferenceMedia) : undefined;
}

function readModelCapability(
  parameters: Readonly<Record<string, unknown>> | undefined,
): CanvasStoryboardModelCapabilityProjection | undefined {
  const value = parameters?.['modelCapability'];
  return isRecord(value)
    ? (value as unknown as CanvasStoryboardModelCapabilityProjection)
    : undefined;
}

function requireRevision(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (typeof value === 'number') return;
  if (isStableString(value)) return;
  diagnostics.push(
    createCreativeAiDiagnostic(
      'error',
      'creative-ai-missing-revision',
      'Canvas creative AI action requires a revision.',
      target,
    ),
  );
}

function requireStableString(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
  missingCode = 'creative-ai-missing-required-string',
): void {
  if (!isStableString(value)) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        typeof value === 'string' && isRuntimeOnlyCreativeAiIdentityValue(value)
          ? 'creative-ai-runtime-only-identity'
          : missingCode,
        'Canvas creative AI field must be a non-empty stable string.',
        target,
      ),
    );
  }
}

function validateOptionalStableString(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value === undefined) return;
  requireStableString(value, target, diagnostics, 'creative-ai-invalid-stable-string');
}

function validateOptionalRecord(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value !== undefined && !isRecord(value)) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'creative-ai-invalid-record',
        'Canvas creative AI field must be an object.',
        target,
      ),
    );
  }
}

function validateOptionalArray(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value !== undefined && !Array.isArray(value)) {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'canvas-creative-ai-invalid-array',
        'Canvas creative AI field must be an array.',
        target,
      ),
    );
  }
}

function validateOptionalBoolean(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (value !== undefined && typeof value !== 'boolean') {
    diagnostics.push(
      createCreativeAiDiagnostic(
        'error',
        'creative-ai-invalid-boolean',
        'Canvas creative AI field must be boolean.',
        target,
      ),
    );
  }
}

function pushPrefixedDiagnostics(
  nestedDiagnostics: readonly CreativeAiDiagnostic[],
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  for (const nested of nestedDiagnostics) {
    diagnostics.push({
      ...nested,
      target: nested.target ? `${target}.${nested.target}` : target,
    });
  }
}

function isStableString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !isRuntimeOnlyCreativeAiIdentityValue(value)
  );
}

function isStablePath(value: unknown): value is string {
  if (!isStableString(value)) return false;
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) return false;
  return !value.startsWith('../') && !value.includes('/../') && !value.includes('\\..\\');
}

function isStableVariablePath(value: unknown): value is string {
  if (!isStableString(value)) return false;
  if (!/^\$\{[A-Z0-9_]+\}[\\/]/.test(value)) return false;
  return !value.includes('/../') && !value.includes('\\..\\');
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
