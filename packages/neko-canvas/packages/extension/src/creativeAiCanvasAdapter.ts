import {
  CANVAS_CREATIVE_AI_PACKAGE_ID,
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS,
  getCanvasCreativeAiActionModality,
  createCreativeAiDiagnostic,
  isRuntimeOnlyCreativeAiIdentityValue,
  isCanvasStoryboardPromptState,
  validateCanvasCreativeAiActionRequest,
  validateCreativeAiApplyRequest,
  validateCreativeAiCandidatePromotionRequest,
  validateExternalCreativeAiInvocation,
  type CanvasCreativeAiActionId,
  type CanvasCreativeAiActionRequest,
  type CanvasNode,
  type CanvasStoryboardGenerationParams,
  type CanvasStoryboardModelCapabilityProjection,
  type CanvasStoryboardPromptDocumentRef,
  type CanvasStoryboardPromptState,
  type CanvasStoryboardReferenceMedia,
  type CanvasStoryboardSemanticPromptDocument,
  type CreativeAiApplyRequest,
  type CreativeAiCandidatePromotionRequest,
  type CreativeAiCandidatePromotionResult,
  type CreativeAiDiagnostic,
  type CreativeAiDocumentRef,
  type CreativeAiInvocationMode,
  type CreativeAiOutputRef,
  type CreativeAiRevision,
  type CreativeAiSourceRef,
  type CreativeAiTargetRef,
  type CreativeAiWritebackPolicy,
  type ExternalCreativeAiInvocation,
} from '@neko/shared';

export const CANVAS_CREATIVE_AI_INVOKE_EXTERNAL_COMMAND = 'neko.canvas.creativeAi.invokeExternal';
export const CANVAS_GENERATED_IMAGE_FIELD_PATH = '/generatedImage';
export const CANVAS_GENERATED_ASSET_FIELD_PATH = '/generatedAsset';
export const CANVAS_GENERATED_VIDEO_ASSET_FIELD_PATH = '/generatedVideoAsset';
const CANVAS_IMAGE_PROMPT_DOCUMENT_FIELD_PATH =
  '/storyboardPrompt/promptBlocks/imagePromptDocument';
const CANVAS_VIDEO_PROMPT_DOCUMENT_FIELD_PATH =
  '/storyboardPrompt/promptBlocks/videoPromptDocument';

export interface CanvasCreativeAiDocumentIdentity {
  readonly documentId?: string;
  readonly projectRelativePath?: string;
  readonly variablePath?: string;
  readonly label?: string;
  readonly revision?: CreativeAiRevision;
}

export interface CanvasCreativeAiActionInvocationInput {
  readonly document: CanvasCreativeAiDocumentIdentity;
  readonly node: CanvasNode;
  readonly actionId: CanvasCreativeAiActionId;
  readonly requestedAt?: string;
}

export type CanvasCreativeAiActionInvocationResult =
  | {
      readonly ok: true;
      readonly request: CanvasCreativeAiActionRequest;
      readonly invocation: ExternalCreativeAiInvocation;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

export interface CanvasCreativeAiApplyPort {
  getNode(nodeId: string): Promise<CanvasNode | undefined>;
  updateNode(nodeId: string, data: Record<string, unknown>): Promise<void>;
}

export type CanvasCreativeAiApplyResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly targetRef?: CreativeAiTargetRef;
      readonly outputRef?: CreativeAiOutputRef;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

type CanvasCreativeAiProjectedOutput =
  | { readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly ok: false; readonly diagnostics: readonly CreativeAiDiagnostic[] };

interface CanvasCreativeAiStoredCandidate {
  readonly candidateId: string;
  readonly status: 'candidate' | 'promoted' | 'rejected' | 'deleted';
  readonly sourcePackage: string;
  readonly targetRef?: CreativeAiTargetRef;
  readonly candidateTargetRef: CreativeAiTargetRef;
  readonly outputRefs: readonly CreativeAiOutputRef[];
  readonly targetRevision?: CreativeAiRevision;
  readonly candidateRevision: CreativeAiRevision;
  readonly runId: string;
  readonly workItemId?: string;
  readonly conversationId: string;
  readonly idempotencyKey: string;
  readonly diagnostics?: readonly CreativeAiDiagnostic[];
  readonly createdAt?: string;
  readonly promotedAt?: string;
  readonly rejectedAt?: string;
  readonly deletedAt?: string;
  readonly provenance?: Readonly<Record<string, unknown>>;
}

export type CanvasCreativeAiCandidateDisposition = 'rejected' | 'deleted';

export interface CanvasCreativeAiStoredCandidateActionRequest {
  readonly nodeId: string;
  readonly candidateId: string;
  readonly requestedAt?: string;
  readonly idempotencyKey?: string;
}

export interface CanvasCreativeAiStoredCandidatePromotionRequest extends CanvasCreativeAiStoredCandidateActionRequest {
  readonly actor: 'user' | 'judge';
  readonly judgePassed?: boolean;
  readonly judgeWorkItemId?: string;
  readonly judgeResultRef?: CreativeAiOutputRef;
}

export interface CanvasCreativeAiStoredCandidateDispositionRequest extends CanvasCreativeAiStoredCandidateActionRequest {
  readonly disposition: CanvasCreativeAiCandidateDisposition;
  readonly diagnostics?: readonly CreativeAiDiagnostic[];
}

export type CanvasCreativeAiStoredCandidateDispositionResult =
  | {
      readonly ok: true;
      readonly candidateId: string;
      readonly disposition: CanvasCreativeAiCandidateDisposition;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
      readonly idempotencyKey?: string;
    }
  | {
      readonly ok: false;
      readonly candidateId?: string;
      readonly disposition?: CanvasCreativeAiCandidateDisposition;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
      readonly idempotencyKey?: string;
    };

export interface CanvasCreativeAiBatchApplyResult {
  readonly ok: boolean;
  readonly atomic: boolean;
  readonly results: readonly CanvasCreativeAiApplyResult[];
  readonly diagnostics: readonly CreativeAiDiagnostic[];
}

export type CanvasCreativeAiHostInvocationResult =
  | {
      readonly ok: true;
      readonly status: 'completed';
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

function buildCanvasCreativeAiDocumentRef(
  input: CanvasCreativeAiDocumentIdentity,
): CreativeAiDocumentRef {
  return {
    kind: 'nk-document',
    packageId: CANVAS_CREATIVE_AI_PACKAGE_ID,
    ...(input.documentId ? { documentId: input.documentId } : {}),
    ...(input.projectRelativePath ? { projectRelativePath: input.projectRelativePath } : {}),
    ...(input.variablePath ? { variablePath: input.variablePath } : {}),
    format: 'nkc',
    ...(input.label ? { label: input.label } : {}),
  };
}

export function buildCanvasCreativeActionExternalInvocation(
  input: CanvasCreativeAiActionInvocationInput,
): CanvasCreativeAiActionInvocationResult {
  const documentRef = buildCanvasCreativeAiDocumentRef(input.document);
  const sourceRef = buildCanvasNodeSourceRef({ documentRef, node: input.node });
  const targetRef = buildCanvasCreativeActionTargetRef({
    documentRef,
    node: input.node,
    actionId: input.actionId,
  });
  const candidateTargetRef = buildCanvasCreativeActionCandidateTargetRef({
    documentRef,
    node: input.node,
    actionId: input.actionId,
    targetRef,
  });
  const documentRevision = input.document.revision;
  const targetRevision = targetRef.revision;
  const requestedAt = input.requestedAt ?? new Date().toISOString();
  const associationKey = createCanvasCreativeAiAssociationKey(documentRef);
  const requestId = createCanvasActionRequestId({
    documentRef,
    nodeId: input.node.id,
    actionId: input.actionId,
    targetRevision,
  });
  const idempotencyKey = createCanvasActionIdempotencyKey({
    associationKey,
    nodeId: input.node.id,
    actionId: input.actionId,
    documentRevision,
    targetRevision,
  });
  const creativeParameters = createCanvasCreativeActionParameters(input.node, input.actionId);
  const diagnostics = validateCanvasCreativeActionPreflight(input.node, input.actionId, {
    documentRevision,
    targetRevision,
  });

  if (documentRevision === undefined) {
    diagnostics.push(
      diagnostic(
        'canvas-creative-ai-missing-document-revision',
        'Canvas creative AI action requires a document revision.',
        'documentRevision',
      ),
    );
  }
  if (targetRevision === undefined) {
    diagnostics.push(
      diagnostic(
        'canvas-creative-ai-missing-target-revision',
        'Canvas creative AI action requires a target revision.',
        'targetRevision',
      ),
    );
  }

  const target = createCanvasCreativeActionShotTarget(input.node);
  const request: CanvasCreativeAiActionRequest = {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    requestId,
    actionId: input.actionId,
    documentRef,
    sourceRef,
    targetRef,
    candidateTargetRef,
    documentRevision: documentRevision ?? 'missing-document-revision',
    targetRevision: targetRevision ?? 'missing-target-revision',
    idempotencyKey,
    target,
    ...(creativeParameters ? { creativeParameters } : {}),
    requestedAt,
    metadata: {
      targetFieldPath: targetRef.fieldPath,
      candidateTargetFieldPath: candidateTargetRef.fieldPath,
    },
  };

  const requestValidation = validateCanvasCreativeAiActionRequest(request);
  diagnostics.push(...requestValidation.diagnostics);
  if (diagnostics.some((item) => item.severity === 'error')) {
    return { ok: false, diagnostics };
  }

  const mode = toCanvasCreativeInvocationMode(input.actionId);
  const invocation: ExternalCreativeAiInvocation = {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    domain: 'external-creative-package',
    invocationId: requestId,
    sourcePackage: CANVAS_CREATIVE_AI_PACKAGE_ID,
    documentRef,
    sourceRef,
    targetRef,
    candidateTargetRef,
    intent: createCanvasCreativeActionIntent(input.actionId),
    mode,
    writeback: {
      kind: 'candidate',
      atomicity: 'per-target',
      requiresRevisionMatch: true,
    },
    documentRevision,
    targetRevision,
    routing: {
      associationKey,
      allowCreateBackgroundConversation: true,
    },
    idempotencyKey,
    requestedAt,
    metadata: {
      canvasCreativeAiAction: request,
      actionId: input.actionId,
      modality: getCanvasCreativeAiActionModality(input.actionId),
      targetFieldPath: targetRef.fieldPath,
      candidateTargetFieldPath: candidateTargetRef.fieldPath,
    },
  };

  const invocationValidation = validateExternalCreativeAiInvocation(invocation);
  if (!invocationValidation.valid) {
    return {
      ok: false,
      diagnostics: [...diagnostics, ...invocationValidation.diagnostics],
    };
  }

  return {
    ok: true,
    request,
    invocation,
    diagnostics,
  };
}

function buildCanvasCreativeActionTargetRef(input: {
  readonly documentRef: CreativeAiDocumentRef;
  readonly node: CanvasNode;
  readonly actionId: CanvasCreativeAiActionId;
}): CreativeAiTargetRef {
  const fieldPath = getCanvasCreativeActionTargetFieldPath(input.actionId);
  return {
    kind: 'canvas-field',
    packageId: CANVAS_CREATIVE_AI_PACKAGE_ID,
    id: `canvas-node:${input.node.id}#${fieldPath}`,
    documentRef: input.documentRef,
    entityId: input.node.id,
    fieldPath,
    label: `${createCanvasNodeLabel(input.node)} ${getCanvasCreativeActionTargetLabel(
      input.actionId,
    )}`,
    revision: createCanvasTargetRevision(input.node, fieldPath),
    metadata: {
      actionId: input.actionId,
      targetFieldPath: fieldPath,
    },
  };
}

function buildCanvasCreativeActionCandidateTargetRef(input: {
  readonly documentRef: CreativeAiDocumentRef;
  readonly node: CanvasNode;
  readonly actionId: CanvasCreativeAiActionId;
  readonly targetRef: CreativeAiTargetRef;
}): CreativeAiTargetRef {
  const fieldPath = `/storyboardPrompt/candidates/${input.actionId}`;
  return {
    kind: 'candidate-target',
    packageId: CANVAS_CREATIVE_AI_PACKAGE_ID,
    id: `canvas-node:${input.node.id}#candidate:${input.actionId}:${stableHash(
      String(input.targetRef.revision ?? input.targetRef.id),
    )}`,
    documentRef: input.documentRef,
    entityId: input.node.id,
    fieldPath,
    role: 'candidate-target',
    candidateOnly: true,
    label: `${createCanvasNodeLabel(input.node)} ${input.actionId} candidate`,
    revision: `canvas-candidate-target:${stableHash(
      stableStringify({
        nodeId: input.node.id,
        actionId: input.actionId,
        targetRevision: input.targetRef.revision,
      }),
    )}`,
    metadata: {
      actionId: input.actionId,
      formalTargetRefId: input.targetRef.id,
      formalTargetFieldPath: input.targetRef.fieldPath,
    },
  };
}

function createCanvasCreativeActionParameters(
  node: CanvasNode,
  actionId: CanvasCreativeAiActionId,
): CanvasCreativeAiActionRequest['creativeParameters'] | undefined {
  const promptState = readCanvasStoryboardPromptState(node);
  const promptDocuments = readActionPromptDocumentRefs(promptState, actionId);
  const referenceMedia = promptState?.referenceMedia;
  const generation = readCanvasCreativeActionGenerationParams(node, promptState);
  const modelCapability = readCanvasCreativeActionModelCapability(node);
  const parameters: CanvasCreativeAiActionRequest['creativeParameters'] = {
    ...(promptDocuments.length > 0 ? { promptDocuments } : {}),
    ...(referenceMedia ? { referenceMedia } : {}),
    ...(generation ? { generation } : {}),
    ...(modelCapability ? { modelCapability } : {}),
  };
  return Object.keys(parameters).length > 0 ? parameters : undefined;
}

function validateCanvasCreativeActionPreflight(
  node: CanvasNode,
  actionId: CanvasCreativeAiActionId,
  revisions: {
    readonly documentRevision?: CreativeAiRevision;
    readonly targetRevision?: CreativeAiRevision;
  },
): CreativeAiDiagnostic[] {
  const diagnostics: CreativeAiDiagnostic[] = [];
  const promptState = readCanvasStoryboardPromptState(node);
  const generation = readCanvasCreativeActionGenerationParams(node, promptState);
  const promptDocuments = readActionPromptDocumentRefs(promptState, actionId);
  const referenceMedia = promptState?.referenceMedia;

  if (node.type !== 'shot' && node.type !== 'scene') {
    diagnostics.push(
      diagnostic(
        'canvas-creative-ai-unsupported-node-type',
        'Canvas creative AI actions require a shot or scene node.',
        'node.type',
      ),
    );
  }
  if (revisions.documentRevision === undefined) {
    diagnostics.push(
      diagnostic(
        'canvas-creative-ai-missing-document-revision',
        'Canvas creative AI action requires an active document revision.',
        'documentRevision',
      ),
    );
  }
  if (revisions.targetRevision === undefined) {
    diagnostics.push(
      diagnostic(
        'canvas-creative-ai-missing-target-revision',
        'Canvas creative AI action requires a target revision.',
        'targetRevision',
      ),
    );
  }
  if (
    requiresImagePrompt(actionId) &&
    !promptDocuments.some((item) => item.blockKind === 'image')
  ) {
    diagnostics.push(
      diagnostic(
        'canvas-creative-ai-image-prompt-required',
        'Canvas creative AI image action requires imagePromptDocument.',
        CANVAS_IMAGE_PROMPT_DOCUMENT_FIELD_PATH,
      ),
    );
  }
  if (
    requiresVideoPrompt(actionId) &&
    !promptDocuments.some((item) => item.blockKind === 'video')
  ) {
    diagnostics.push(
      diagnostic(
        'canvas-creative-ai-video-prompt-required',
        'Canvas creative AI video action requires videoPromptDocument.',
        CANVAS_VIDEO_PROMPT_DOCUMENT_FIELD_PATH,
      ),
    );
  }
  if (actionId === 'edit-image' && (referenceMedia?.imageRefs.length ?? 0) === 0) {
    diagnostics.push(
      diagnostic(
        'canvas-creative-ai-missing-image-edit-source',
        'Canvas image editing requires at least one image reference.',
        '/storyboardPrompt/referenceMedia/imageRefs',
      ),
    );
  }
  if (
    actionId === 'edit-video' &&
    (referenceMedia?.videoRefs?.length ?? 0) === 0 &&
    (referenceMedia?.imageRefs.length ?? 0) === 0
  ) {
    diagnostics.push(
      diagnostic(
        'canvas-creative-ai-missing-video-edit-source',
        'Canvas video editing requires a video or keyframe image reference.',
        '/storyboardPrompt/referenceMedia',
      ),
    );
  }
  if (generation?.duration !== undefined && generation.duration <= 0) {
    diagnostics.push(
      diagnostic(
        'canvas-creative-ai-invalid-duration',
        'Canvas creative AI duration must be greater than zero.',
        '/storyboardPrompt/generationParams/duration',
      ),
    );
  }
  if (generation?.aspectRatio && !/^[1-9]\d*:[1-9]\d*$/.test(generation.aspectRatio)) {
    diagnostics.push(
      diagnostic(
        'canvas-creative-ai-invalid-aspect-ratio',
        'Canvas creative AI aspectRatio must use W:H format.',
        '/storyboardPrompt/generationParams/aspectRatio',
      ),
    );
  }
  const advancedParameters = generation?.advancedParameters;
  if (advancedParameters) {
    const supported = new Set<string>(CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS);
    for (const key of Object.keys(advancedParameters)) {
      if (!supported.has(key)) {
        diagnostics.push(
          diagnostic(
            'canvas-creative-ai-unsupported-advanced-parameter',
            'Canvas creative AI advanced parameter is unsupported.',
            `/storyboardPrompt/generationParams/advancedParameters/${key}`,
          ),
        );
      }
    }
  }

  return diagnostics;
}

function readActionPromptDocumentRefs(
  state: CanvasStoryboardPromptState | undefined,
  actionId: CanvasCreativeAiActionId,
): readonly CanvasStoryboardPromptDocumentRef[] {
  const documents: CanvasStoryboardPromptDocumentRef[] = [];
  const image = state?.promptBlocks?.imagePromptDocument;
  const video = state?.promptBlocks?.videoPromptDocument;
  if (requiresImagePrompt(actionId) && image) {
    documents.push(toPromptDocumentRef(image));
  }
  if (requiresVideoPrompt(actionId) && video) {
    documents.push(toPromptDocumentRef(video));
  }
  return documents;
}

function toPromptDocumentRef(
  document: CanvasStoryboardSemanticPromptDocument,
): CanvasStoryboardPromptDocumentRef {
  return {
    blockKind: document.blockKind,
    documentId: document.documentId,
    version: document.version,
    ...(document.text ? { text: document.text } : {}),
    ...(document.baseRevision ? { baseRevision: document.baseRevision } : {}),
  };
}

function readCanvasCreativeActionGenerationParams(
  node: CanvasNode,
  state: CanvasStoryboardPromptState | undefined,
): CanvasStoryboardGenerationParams | undefined {
  const data = isRecord(node.data) ? node.data : {};
  const stateParams = state?.generationParams;
  const duration = stateParams?.duration ?? readNumber(data['duration']);
  const dialogue = stateParams?.dialogue ?? readString(data['dialogue']);
  const voiceOver = stateParams?.voiceOver ?? readString(data['voiceOver']);
  const aspectRatio = stateParams?.aspectRatio ?? readString(data['aspectRatio']);
  const modelId = stateParams?.modelId ?? readString(data['modelId']);
  const advancedParameters = stateParams?.advancedParameters;
  const params: CanvasStoryboardGenerationParams = {
    ...(duration !== undefined ? { duration } : {}),
    ...(dialogue ? { dialogue } : {}),
    ...(voiceOver ? { voiceOver } : {}),
    ...(aspectRatio ? { aspectRatio } : {}),
    ...(modelId ? { modelId } : {}),
    ...(advancedParameters ? { advancedParameters } : {}),
  };
  return Object.keys(params).length > 0 ? params : undefined;
}

function readCanvasCreativeActionModelCapability(
  node: CanvasNode,
): CanvasStoryboardModelCapabilityProjection | undefined {
  const data = isRecord(node.data) ? node.data : {};
  const value = data['modelCapability'];
  return isRecord(value)
    ? (value as unknown as CanvasStoryboardModelCapabilityProjection)
    : undefined;
}

function readCanvasStoryboardPromptState(
  node: CanvasNode,
): CanvasStoryboardPromptState | undefined {
  const data = isRecord(node.data) ? node.data : {};
  const state = data['storyboardPrompt'];
  return isCanvasStoryboardPromptState(state) ? state : undefined;
}

function createCanvasCreativeActionShotTarget(
  node: CanvasNode,
): CanvasCreativeAiActionRequest['target'] {
  const data = isRecord(node.data) ? node.data : {};
  const shotNumber = readNumber(data['shotNumber']);
  return {
    nodeId: node.id,
    ...(readString(data['sceneNodeId']) ? { sceneNodeId: readString(data['sceneNodeId']) } : {}),
    ...(readString(data['shotId']) ? { shotId: readString(data['shotId']) } : {}),
    ...(shotNumber !== undefined && Number.isInteger(shotNumber) && shotNumber >= 0
      ? { shotNumber }
      : {}),
  };
}

function getCanvasCreativeActionTargetFieldPath(actionId: CanvasCreativeAiActionId): string {
  switch (actionId) {
    case 'optimize-image-prompt':
      return CANVAS_IMAGE_PROMPT_DOCUMENT_FIELD_PATH;
    case 'optimize-video-prompt':
      return CANVAS_VIDEO_PROMPT_DOCUMENT_FIELD_PATH;
    case 'generate-image':
    case 'edit-image':
      return CANVAS_GENERATED_ASSET_FIELD_PATH;
    case 'generate-video':
    case 'edit-video':
      return CANVAS_GENERATED_VIDEO_ASSET_FIELD_PATH;
  }
}

function getCanvasCreativeActionTargetLabel(actionId: CanvasCreativeAiActionId): string {
  switch (actionId) {
    case 'optimize-image-prompt':
      return 'image prompt';
    case 'optimize-video-prompt':
      return 'video prompt';
    case 'generate-image':
    case 'edit-image':
      return 'generated image asset';
    case 'generate-video':
    case 'edit-video':
      return 'generated video asset';
  }
}

function createCanvasCreativeActionIntent(actionId: CanvasCreativeAiActionId): string {
  switch (actionId) {
    case 'optimize-image-prompt':
      return 'Optimize the Canvas shot image prompt and return a candidate prompt document.';
    case 'optimize-video-prompt':
      return 'Optimize the Canvas shot video prompt, including dialogue, sound, motion, and camera instructions, and return a candidate prompt document.';
    case 'generate-image':
      return 'Generate a stable image ResourceRef candidate for the Canvas shot.';
    case 'edit-image':
      return 'Edit the Canvas shot image using declared reference media and return a stable image ResourceRef candidate.';
    case 'generate-video':
      return 'Generate a stable video ResourceRef candidate for the Canvas shot.';
    case 'edit-video':
      return 'Edit the Canvas shot video using declared reference media and return a stable video ResourceRef candidate.';
  }
}

function toCanvasCreativeInvocationMode(
  actionId: CanvasCreativeAiActionId,
): CreativeAiInvocationMode {
  if (actionId === 'optimize-image-prompt' || actionId === 'optimize-video-prompt') {
    return 'optimize';
  }
  if (actionId === 'edit-image' || actionId === 'edit-video') {
    return 'edit';
  }
  return 'generate';
}

function createCanvasActionRequestId(input: {
  readonly documentRef: CreativeAiDocumentRef;
  readonly nodeId: string;
  readonly actionId: CanvasCreativeAiActionId;
  readonly targetRevision?: CreativeAiRevision;
}): string {
  return `canvas-ai-action:${stableHash(stableStringify(input))}`;
}

function createCanvasActionIdempotencyKey(input: {
  readonly associationKey: string;
  readonly nodeId: string;
  readonly actionId: CanvasCreativeAiActionId;
  readonly documentRevision?: CreativeAiRevision;
  readonly targetRevision?: CreativeAiRevision;
}): string {
  return `canvas-ai-action-idempotency:${stableHash(stableStringify(input))}`;
}

function requiresImagePrompt(actionId: CanvasCreativeAiActionId): boolean {
  return (
    actionId === 'optimize-image-prompt' ||
    actionId === 'generate-image' ||
    actionId === 'edit-image'
  );
}

function requiresVideoPrompt(actionId: CanvasCreativeAiActionId): boolean {
  return (
    actionId === 'optimize-video-prompt' ||
    actionId === 'generate-video' ||
    actionId === 'edit-video'
  );
}

function buildCanvasNodeSourceRef(input: {
  readonly documentRef: CreativeAiDocumentRef;
  readonly node: CanvasNode;
}): CreativeAiSourceRef {
  return {
    kind: 'canvas-node',
    packageId: CANVAS_CREATIVE_AI_PACKAGE_ID,
    id: `canvas-node:${input.node.id}`,
    documentRef: input.documentRef,
    entityId: input.node.id,
    label: createCanvasNodeLabel(input.node),
    revision: createCanvasNodeRevision(input.node),
  };
}

export function buildCanvasGeneratedImageTargetRef(input: {
  readonly documentRef: CreativeAiDocumentRef;
  readonly node: CanvasNode;
  readonly childNodeId?: string;
  readonly fieldPath?: string;
}): CreativeAiTargetRef {
  const fieldPath = input.fieldPath ?? CANVAS_GENERATED_IMAGE_FIELD_PATH;
  const entityId = input.childNodeId ?? input.node.id;
  return {
    kind: 'canvas-field',
    packageId: CANVAS_CREATIVE_AI_PACKAGE_ID,
    id: `canvas-node:${entityId}#${fieldPath}`,
    documentRef: input.documentRef,
    entityId,
    fieldPath,
    label: `${createCanvasNodeLabel(input.node)} generated image`,
    revision: createCanvasTargetRevision(input.node, fieldPath),
  };
}

export function createCanvasDocumentRevision(canvasData: unknown): string {
  return `canvas-doc:${stableHash(stableStringify(canvasData))}`;
}

function createCanvasNodeRevision(node: CanvasNode): string {
  return `canvas-node:${stableHash(stableStringify(projectNodeRevisionInput(node)))}`;
}

export function createCanvasTargetRevision(node: CanvasNode, fieldPath: string): string {
  return `canvas-target:${stableHash(
    stableStringify({
      nodeId: node.id,
      fieldPath,
      value: readJsonPointer(node.data, fieldPath).value,
    }),
  )}`;
}

function createCanvasCreativeAiAssociationKey(documentRef: CreativeAiDocumentRef): string {
  const documentIdentity =
    documentRef.projectRelativePath ?? documentRef.variablePath ?? documentRef.documentId;
  if (!documentIdentity) {
    throw new Error('Canvas creative AI document association requires stable document identity.');
  }
  return `${CANVAS_CREATIVE_AI_PACKAGE_ID}:document:${documentIdentity}`;
}

export class CanvasCreativeAiApplyAdapter {
  private readonly activeTargetLocks = new Map<string, string>();
  private readonly completedByIdempotency = new Map<string, CanvasCreativeAiApplyResult>();
  private readonly completedPromotionsByIdempotency = new Map<
    string,
    CreativeAiCandidatePromotionResult
  >();
  private readonly completedDispositionsByIdempotency = new Map<
    string,
    CanvasCreativeAiStoredCandidateDispositionResult
  >();

  constructor(private readonly port: CanvasCreativeAiApplyPort) {}

  async apply(request: CreativeAiApplyRequest): Promise<CanvasCreativeAiApplyResult> {
    const validation = validateCreativeAiApplyRequest(request);
    if (!validation.valid || !validation.value) {
      return { ok: false, diagnostics: validation.diagnostics };
    }

    const stableIdentityDiagnostics = validateStableCanvasApplyIdentity(validation.value);
    if (stableIdentityDiagnostics.length > 0) {
      return { ok: false, diagnostics: stableIdentityDiagnostics };
    }

    const existing = this.completedByIdempotency.get(validation.value.idempotencyKey);
    if (existing) {
      return existing;
    }

    if (validation.value.sourcePackage !== CANVAS_CREATIVE_AI_PACKAGE_ID) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-wrong-source-package',
            'Canvas apply adapter only accepts neko-canvas creative AI outputs.',
            'sourcePackage',
          ),
        ],
      };
    }

    if (
      validation.value.writeback.kind === 'candidate' ||
      validation.value.candidateTargetRef?.candidateOnly === true ||
      (!validation.value.targetRef && validation.value.candidateTargetRef)
    ) {
      const result = await this.applyCandidate(validation.value);
      this.completedByIdempotency.set(validation.value.idempotencyKey, result);
      return result;
    }

    const targetRef = validation.value.targetRef;
    if (!targetRef) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-missing-target',
            'Canvas mutating apply requires targetRef.',
            'targetRef',
          ),
        ],
      };
    }

    const targetKey = createCanvasTargetKey(targetRef);
    const lockOwner = this.activeTargetLocks.get(targetKey);
    if (lockOwner && lockOwner !== validation.value.idempotencyKey) {
      return {
        ok: false,
        diagnostics: [
          {
            ...diagnostic(
              'creative-ai-canvas-target-locked',
              'Canvas target is already being updated by another creative AI apply request.',
              'targetRef',
            ),
            retryable: true,
          },
        ],
      };
    }

    this.activeTargetLocks.set(targetKey, validation.value.idempotencyKey);
    try {
      const result = await this.applyWithLock(validation.value, targetRef);
      if (result.ok) {
        this.completedByIdempotency.set(validation.value.idempotencyKey, result);
      }
      return result;
    } finally {
      if (this.activeTargetLocks.get(targetKey) === validation.value.idempotencyKey) {
        this.activeTargetLocks.delete(targetKey);
      }
    }
  }

  async applyBatch(
    requests: readonly CreativeAiApplyRequest[],
    options: { readonly atomic?: boolean } = {},
  ): Promise<CanvasCreativeAiBatchApplyResult> {
    const atomic =
      options.atomic === true ||
      requests.some((request) => request.writeback.atomicity === 'atomic');
    const results: CanvasCreativeAiApplyResult[] = [];

    for (const request of requests) {
      const result = await this.apply(request);
      results.push(result);
      if (atomic && !result.ok) {
        break;
      }
    }

    const diagnostics = results.flatMap((result) => result.diagnostics);
    return {
      ok: results.every((result) => result.ok),
      atomic,
      results,
      diagnostics,
    };
  }

  async promoteCandidate(
    request: CreativeAiCandidatePromotionRequest,
  ): Promise<CreativeAiCandidatePromotionResult> {
    const validation = validateCreativeAiCandidatePromotionRequest(request);
    if (!validation.valid || !validation.value) {
      return {
        ok: false,
        outcome: 'failed',
        diagnostics: validation.diagnostics,
      };
    }
    const existing = this.completedPromotionsByIdempotency.get(validation.value.idempotencyKey);
    if (existing) {
      return {
        ...existing,
        outcome: 'idempotent',
        idempotencyKey: validation.value.idempotencyKey,
      };
    }
    if (validation.value.sourcePackage !== CANVAS_CREATIVE_AI_PACKAGE_ID) {
      return {
        ok: false,
        outcome: 'failed',
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-wrong-source-package',
            'Canvas promotion adapter only accepts neko-canvas candidates.',
            'sourcePackage',
          ),
        ],
        idempotencyKey: validation.value.idempotencyKey,
      };
    }

    const nodeId = validation.value.targetRef.entityId;
    if (!nodeId) {
      return {
        ok: false,
        outcome: 'target-missing',
        targetRef: validation.value.targetRef,
        candidateTargetRef: validation.value.candidateTargetRef,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-missing-target-entity',
            'Canvas promotion targetRef must include entityId.',
            'targetRef.entityId',
          ),
        ],
        idempotencyKey: validation.value.idempotencyKey,
      };
    }
    const node = await this.port.getNode(nodeId);
    if (!node) {
      return {
        ok: false,
        outcome: 'target-missing',
        targetRef: validation.value.targetRef,
        candidateTargetRef: validation.value.candidateTargetRef,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-target-deleted',
            `Canvas target node "${nodeId}" no longer exists.`,
            'targetRef.entityId',
          ),
        ],
        idempotencyKey: validation.value.idempotencyKey,
      };
    }

    const targetFieldPath = validation.value.targetRef.fieldPath;
    if (!targetFieldPath) {
      return {
        ok: false,
        outcome: 'target-missing',
        targetRef: validation.value.targetRef,
        candidateTargetRef: validation.value.candidateTargetRef,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-missing-target-field',
            'Canvas promotion targetRef must include fieldPath.',
            'targetRef.fieldPath',
          ),
        ],
        idempotencyKey: validation.value.idempotencyKey,
      };
    }
    const currentRevision = createCanvasTargetRevision(node, targetFieldPath);
    if (validation.value.targetRevision !== currentRevision) {
      return {
        ok: false,
        outcome: 'stale-target',
        targetRef: validation.value.targetRef,
        candidateTargetRef: validation.value.candidateTargetRef,
        diagnostics: [
          {
            ...diagnostic(
              'creative-ai-canvas-target-stale',
              'Canvas target revision changed before candidate promotion.',
              'targetRevision',
            ),
            expected: validation.value.targetRevision,
            received: currentRevision,
          },
        ],
        idempotencyKey: validation.value.idempotencyKey,
      };
    }

    const candidates = readCanvasCreativeAiCandidates(node);
    const candidate = candidates[validation.value.candidateTargetRef.id];
    if (!candidate || candidate.status === 'deleted') {
      return {
        ok: false,
        outcome: 'candidate-missing',
        targetRef: validation.value.targetRef,
        candidateTargetRef: validation.value.candidateTargetRef,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-candidate-missing',
            'Canvas candidate was not found for promotion.',
            'candidateTargetRef',
          ),
        ],
        idempotencyKey: validation.value.idempotencyKey,
      };
    }
    if (
      validation.value.actor === 'judge' &&
      validation.value.metadata?.['judgePassed'] === false
    ) {
      await this.port.updateNode(nodeId, {
        creativeAiCandidates: {
          ...candidates,
          [candidate.candidateId]: {
            ...candidate,
            status: 'rejected',
            rejectedAt: validation.value.requestedAt,
            diagnostics: [
              ...(candidate.diagnostics ?? []),
              diagnostic(
                'creative-ai-canvas-judge-rejected',
                'Canvas candidate promotion was rejected by judge.',
                'actor',
              ),
            ],
            provenance: {
              ...(candidate.provenance ?? {}),
              judgePromotion: {
                actor: validation.value.actor,
                runId: validation.value.runId,
                workItemId: validation.value.workItemId,
                judgeWorkItemId: validation.value.judgeWorkItemId,
                requestedAt: validation.value.requestedAt,
                outcome: 'judge-rejected',
              },
            },
          },
        },
      });
      return {
        ok: false,
        outcome: 'judge-rejected',
        targetRef: validation.value.targetRef,
        candidateTargetRef: validation.value.candidateTargetRef,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-judge-rejected',
            'Canvas candidate promotion was rejected by judge.',
            'actor',
          ),
        ],
        idempotencyKey: validation.value.idempotencyKey,
      };
    }

    const outputRefs =
      validation.value.outputRefs && validation.value.outputRefs.length > 0
        ? validation.value.outputRefs
        : candidate.outputRefs;
    const output = projectCanvasOutputForTarget(validation.value.targetRef, outputRefs[0], node);
    if (!output.ok) {
      return {
        ok: false,
        outcome: 'failed',
        targetRef: validation.value.targetRef,
        candidateTargetRef: validation.value.candidateTargetRef,
        diagnostics: output.diagnostics,
        idempotencyKey: validation.value.idempotencyKey,
      };
    }

    const promotedCandidate: CanvasCreativeAiStoredCandidate = {
      ...candidate,
      status: 'promoted',
      promotedAt: validation.value.requestedAt,
      provenance: {
        ...(candidate.provenance ?? {}),
        promotion: {
          actor: validation.value.actor,
          runId: validation.value.runId,
          workItemId: validation.value.workItemId,
          judgeWorkItemId: validation.value.judgeWorkItemId,
          requestedAt: validation.value.requestedAt,
          outcome: 'promoted',
        },
      },
    };
    await this.port.updateNode(nodeId, {
      ...output.data,
      creativeAiCandidates: {
        ...candidates,
        [candidate.candidateId]: promotedCandidate,
      },
    });
    const result: CreativeAiCandidatePromotionResult = {
      ok: true,
      outcome: 'promoted',
      targetRef: validation.value.targetRef,
      candidateTargetRef: validation.value.candidateTargetRef,
      appliedOutputRefs: outputRefs,
      diagnostics: [],
      idempotencyKey: validation.value.idempotencyKey,
    };
    this.completedPromotionsByIdempotency.set(validation.value.idempotencyKey, result);
    return result;
  }

  async promoteStoredCandidate(
    request: CanvasCreativeAiStoredCandidatePromotionRequest,
  ): Promise<CreativeAiCandidatePromotionResult> {
    const candidate = await this.readStoredCandidate(request.nodeId, request.candidateId);
    if (!candidate.ok) {
      return {
        ok: false,
        outcome: candidate.outcome,
        diagnostics: candidate.diagnostics,
        idempotencyKey: request.idempotencyKey,
      };
    }
    if (!candidate.value.targetRef) {
      return {
        ok: false,
        outcome: 'target-missing',
        candidateTargetRef: candidate.value.candidateTargetRef,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-candidate-missing-target',
            'Canvas candidate cannot be promoted because it has no formal targetRef.',
            'targetRef',
          ),
        ],
        idempotencyKey: request.idempotencyKey,
      };
    }
    if (candidate.value.targetRevision === undefined) {
      return {
        ok: false,
        outcome: 'failed',
        targetRef: candidate.value.targetRef,
        candidateTargetRef: candidate.value.candidateTargetRef,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-candidate-missing-target-revision',
            'Canvas candidate cannot be promoted without the captured target revision.',
            'targetRevision',
          ),
        ],
        idempotencyKey: request.idempotencyKey,
      };
    }
    return this.promoteCandidate({
      schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
      requestId: `canvas-creative-ai-promote:${stableHash(
        stableStringify({
          nodeId: request.nodeId,
          candidateId: request.candidateId,
          requestedAt: request.requestedAt,
        }),
      )}`,
      sourcePackage: CANVAS_CREATIVE_AI_PACKAGE_ID,
      targetRef: candidate.value.targetRef,
      candidateTargetRef: candidate.value.candidateTargetRef,
      targetRevision: candidate.value.targetRevision,
      candidateRevision: candidate.value.candidateRevision,
      runId: candidate.value.runId,
      workItemId: candidate.value.workItemId,
      conversationId: candidate.value.conversationId,
      outputRefs: candidate.value.outputRefs,
      actor: request.actor,
      ...(request.judgeWorkItemId ? { judgeWorkItemId: request.judgeWorkItemId } : {}),
      ...(request.judgeResultRef ? { judgeResultRef: request.judgeResultRef } : {}),
      idempotencyKey:
        request.idempotencyKey ??
        `canvas-creative-ai-promote:${stableHash(
          stableStringify({
            nodeId: request.nodeId,
            candidateId: request.candidateId,
            actor: request.actor,
            targetRevision: candidate.value.targetRevision,
          }),
        )}`,
      requestedAt: request.requestedAt,
      metadata: {
        judgePassed: request.judgePassed,
      },
    });
  }

  async markStoredCandidateDisposition(
    request: CanvasCreativeAiStoredCandidateDispositionRequest,
  ): Promise<CanvasCreativeAiStoredCandidateDispositionResult> {
    const idempotencyKey =
      request.idempotencyKey ??
      `canvas-creative-ai-candidate-${request.disposition}:${stableHash(
        stableStringify({
          nodeId: request.nodeId,
          candidateId: request.candidateId,
          disposition: request.disposition,
        }),
      )}`;
    const existing = this.completedDispositionsByIdempotency.get(idempotencyKey);
    if (existing) return existing;

    const candidate = await this.readStoredCandidate(request.nodeId, request.candidateId);
    if (!candidate.ok) {
      const result: CanvasCreativeAiStoredCandidateDispositionResult = {
        ok: false,
        candidateId: request.candidateId,
        disposition: request.disposition,
        diagnostics: candidate.diagnostics,
        idempotencyKey,
      };
      this.completedDispositionsByIdempotency.set(idempotencyKey, result);
      return result;
    }
    const node = candidate.node;
    const candidates = readCanvasCreativeAiCandidates(node);
    const updated: CanvasCreativeAiStoredCandidate = {
      ...candidate.value,
      status: request.disposition,
      ...(request.disposition === 'rejected'
        ? { rejectedAt: request.requestedAt }
        : { deletedAt: request.requestedAt }),
      ...(request.diagnostics && request.diagnostics.length > 0
        ? { diagnostics: request.diagnostics }
        : {}),
      provenance: {
        ...(candidate.value.provenance ?? {}),
        disposition: {
          disposition: request.disposition,
          requestedAt: request.requestedAt,
        },
      },
    };
    await this.port.updateNode(request.nodeId, {
      creativeAiCandidates: {
        ...candidates,
        [candidate.value.candidateId]: updated,
      },
    });
    const result: CanvasCreativeAiStoredCandidateDispositionResult = {
      ok: true,
      candidateId: request.candidateId,
      disposition: request.disposition,
      diagnostics: [],
      idempotencyKey,
    };
    this.completedDispositionsByIdempotency.set(idempotencyKey, result);
    return result;
  }

  private async readStoredCandidate(
    nodeId: string,
    candidateId: string,
  ): Promise<
    | {
        readonly ok: true;
        readonly node: CanvasNode;
        readonly value: CanvasCreativeAiStoredCandidate;
      }
    | {
        readonly ok: false;
        readonly outcome: 'candidate-missing' | 'target-missing' | 'failed';
        readonly diagnostics: readonly CreativeAiDiagnostic[];
      }
  > {
    const node = await this.port.getNode(nodeId);
    if (!node) {
      return {
        ok: false,
        outcome: 'target-missing',
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-target-deleted',
            `Canvas target node "${nodeId}" no longer exists.`,
            'nodeId',
          ),
        ],
      };
    }
    const candidate = readCanvasCreativeAiCandidates(node)[candidateId];
    if (!candidate || candidate.status === 'deleted') {
      return {
        ok: false,
        outcome: 'candidate-missing',
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-candidate-missing',
            'Canvas candidate was not found.',
            'candidateId',
          ),
        ],
      };
    }
    if (candidate.sourcePackage !== CANVAS_CREATIVE_AI_PACKAGE_ID) {
      return {
        ok: false,
        outcome: 'failed',
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-wrong-source-package',
            'Canvas candidate action only accepts neko-canvas candidates.',
            'sourcePackage',
          ),
        ],
      };
    }
    return { ok: true, node, value: candidate };
  }

  private async applyCandidate(
    request: CreativeAiApplyRequest,
  ): Promise<CanvasCreativeAiApplyResult> {
    const candidateTargetRef = request.candidateTargetRef;
    if (!candidateTargetRef) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-missing-candidate-target',
            'Canvas candidate apply requires candidateTargetRef.',
            'candidateTargetRef',
          ),
        ],
      };
    }
    const nodeId = candidateTargetRef.entityId;
    if (!nodeId) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-missing-candidate-entity',
            'Canvas candidateTargetRef must include entityId.',
            'candidateTargetRef.entityId',
          ),
        ],
      };
    }
    const node = await this.port.getNode(nodeId);
    if (!node) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-candidate-target-deleted',
            `Canvas candidate target node "${nodeId}" no longer exists.`,
            'candidateTargetRef.entityId',
          ),
        ],
      };
    }
    const candidates = readCanvasCreativeAiCandidates(node);
    const candidate: CanvasCreativeAiStoredCandidate = {
      candidateId: candidateTargetRef.id,
      status: 'candidate',
      sourcePackage: request.sourcePackage,
      ...(request.targetRef ? { targetRef: request.targetRef } : {}),
      candidateTargetRef,
      outputRefs: request.outputRefs,
      ...(request.targetRevision !== undefined ? { targetRevision: request.targetRevision } : {}),
      candidateRevision: createCanvasCandidateRevision(request),
      runId: request.runId,
      ...(request.workItemId ? { workItemId: request.workItemId } : {}),
      conversationId: request.conversationId,
      idempotencyKey: request.idempotencyKey,
      ...(request.diagnostics ? { diagnostics: request.diagnostics } : {}),
      ...(request.requestedAt ? { createdAt: request.requestedAt } : {}),
    };
    await this.port.updateNode(nodeId, {
      creativeAiCandidates: {
        ...candidates,
        [candidate.candidateId]: candidate,
      },
    });
    return {
      ok: true,
      changed: true,
      targetRef: candidateTargetRef,
      outputRef: request.outputRefs[0],
      diagnostics: [
        createCreativeAiDiagnostic(
          'info',
          'creative-ai-canvas-candidate-output-ready',
          'Generated Canvas output was stored as a candidate and did not mutate the formal target.',
          'candidateTargetRef',
        ),
      ],
    };
  }

  private async applyWithLock(
    request: CreativeAiApplyRequest,
    targetRef: CreativeAiTargetRef,
  ): Promise<CanvasCreativeAiApplyResult> {
    const nodeId = targetRef.entityId;
    if (!nodeId) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-missing-target-entity',
            'Canvas targetRef must include entityId.',
            'targetRef.entityId',
          ),
        ],
      };
    }

    const fieldPath = normalizeCanvasGeneratedImageFieldPath(targetRef.fieldPath);
    if (!fieldPath) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-target-field-conflict',
            'Canvas generated-image apply can only write /generatedImage.',
            'targetRef.fieldPath',
          ),
        ],
      };
    }

    const node = await this.port.getNode(nodeId);
    if (!node) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-target-deleted',
            `Canvas target node "${nodeId}" no longer exists.`,
            'targetRef.entityId',
          ),
        ],
      };
    }

    const currentRevision = createCanvasTargetRevision(node, fieldPath);
    if (
      request.writeback.requiresRevisionMatch !== false &&
      request.targetRevision !== undefined &&
      request.targetRevision !== currentRevision
    ) {
      return {
        ok: false,
        diagnostics: [
          {
            ...diagnostic(
              'creative-ai-canvas-target-stale',
              'Canvas target revision changed before creative AI output could be applied.',
              'targetRevision',
            ),
            expected: request.targetRevision,
            received: currentRevision,
          },
        ],
      };
    }

    const outputRef = request.outputRefs[0];
    if (!outputRef) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-missing-output',
            'Canvas apply requires at least one output ref.',
            'outputRefs',
          ),
        ],
      };
    }

    const output = projectCanvasGeneratedImageOutput(outputRef);
    if (!output.ok) {
      return output;
    }

    await this.port.updateNode(nodeId, output.data);
    return {
      ok: true,
      changed: true,
      targetRef,
      outputRef,
      diagnostics: [],
    };
  }
}

function createCanvasTargetKey(targetRef: CreativeAiTargetRef): string {
  return `${targetRef.packageId}:${targetRef.entityId ?? targetRef.id}:${targetRef.fieldPath ?? ''}`;
}

function createCanvasNodeLabel(node: CanvasNode): string {
  const data = isRecord(node.data) ? node.data : {};
  const label =
    readString(data['sceneTitle']) ??
    readString(data['title']) ??
    readString(data['visualDescription']) ??
    readString(data['content']);
  return label ? `${node.type}:${label.slice(0, 48)}` : `${node.type}:${node.id}`;
}

function projectNodeRevisionInput(node: CanvasNode): unknown {
  return {
    id: node.id,
    type: node.type,
    data: node.data,
    preset: node.preset,
    container: node.container,
  };
}

function readJsonPointer(
  root: unknown,
  path: string,
): { readonly found: boolean; readonly value: unknown } {
  if (path === '' || path === '/') {
    return { found: true, value: root };
  }
  const segments = path
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = root;
  for (const segment of segments) {
    if (!isRecord(current) && !Array.isArray(current)) {
      return { found: false, value: undefined };
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[index];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false, value: undefined };
    }
    current = current[segment];
  }
  return { found: true, value: current };
}

function normalizeCanvasGeneratedImageFieldPath(fieldPath: string | undefined): string | null {
  if (!fieldPath || fieldPath === CANVAS_GENERATED_IMAGE_FIELD_PATH) {
    return CANVAS_GENERATED_IMAGE_FIELD_PATH;
  }
  return null;
}

function projectCanvasGeneratedImageOutput(
  outputRef: CreativeAiOutputRef,
): CanvasCreativeAiProjectedOutput {
  if (
    outputRef.kind !== 'generated-asset' &&
    outputRef.kind !== 'resource' &&
    outputRef.kind !== 'resource-variant'
  ) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-canvas-unsupported-output',
          'Canvas generated-image apply requires a generated asset or resource output ref.',
          'outputRefs',
        ),
      ],
    };
  }

  const variantResource = outputRef.resourceVariantRef?.resource;
  const variantPath =
    variantResource?.source.projectRelativePath ??
    (variantResource?.locator?.kind === 'file' ? variantResource.locator.path : undefined);
  const resourcePath =
    variantPath ??
    outputRef.resourceRef?.source.projectRelativePath ??
    (outputRef.resourceRef?.locator?.kind === 'file'
      ? outputRef.resourceRef.locator.path
      : undefined) ??
    (outputRef.generatedAssetId ? `generated-assets/${outputRef.generatedAssetId}` : undefined);

  if (!resourcePath || isRuntimeOnlyCreativeAiIdentityValue(resourcePath)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-canvas-unstable-output-ref',
          'Canvas generated-image apply requires a stable generated asset or resource path.',
          'outputRefs',
        ),
      ],
    };
  }

  return {
    ok: true,
    data: {
      generatedImage: resourcePath,
      generatedAsset: {
        id: outputRef.generatedAssetId ?? outputRef.resourceRef?.id ?? outputRef.id,
        path: resourcePath,
        kind: outputRef.kind,
        ...(outputRef.mimeType ? { mimeType: outputRef.mimeType } : {}),
        ...(outputRef.resourceRef ? { resourceRef: outputRef.resourceRef } : {}),
        ...(outputRef.resourceVariantRef
          ? { resourceVariantRef: outputRef.resourceVariantRef }
          : {}),
      },
    },
  };
}

function projectCanvasOutputForTarget(
  targetRef: CreativeAiTargetRef,
  outputRef: CreativeAiOutputRef | undefined,
  node: CanvasNode,
): CanvasCreativeAiProjectedOutput {
  if (!outputRef) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-canvas-missing-output',
          'Canvas promotion requires at least one output ref.',
          'outputRefs',
        ),
      ],
    };
  }
  switch (targetRef.fieldPath) {
    case CANVAS_GENERATED_IMAGE_FIELD_PATH:
      return projectCanvasGeneratedImageOutput(outputRef);
    case CANVAS_GENERATED_ASSET_FIELD_PATH:
      return projectCanvasGeneratedAssetOutput(outputRef, 'image');
    case CANVAS_GENERATED_VIDEO_ASSET_FIELD_PATH:
      return projectCanvasGeneratedAssetOutput(outputRef, 'video');
    case CANVAS_IMAGE_PROMPT_DOCUMENT_FIELD_PATH:
      return projectCanvasPromptDocumentOutput(node, outputRef, 'image');
    case CANVAS_VIDEO_PROMPT_DOCUMENT_FIELD_PATH:
      return projectCanvasPromptDocumentOutput(node, outputRef, 'video');
    default:
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-target-field-conflict',
            'Canvas promotion target field is not supported.',
            'targetRef.fieldPath',
          ),
        ],
      };
  }
}

function projectCanvasGeneratedAssetOutput(
  outputRef: CreativeAiOutputRef,
  mediaKind: 'image' | 'video',
): CanvasCreativeAiProjectedOutput {
  if (
    outputRef.kind !== 'generated-asset' &&
    outputRef.kind !== 'resource' &&
    outputRef.kind !== 'resource-variant'
  ) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-canvas-unsupported-output',
          'Canvas media promotion requires a generated asset or resource output ref.',
          'outputRefs',
        ),
      ],
    };
  }
  const resourcePath = resolveStableOutputResourcePath(outputRef);
  if (!resourcePath || isRuntimeOnlyCreativeAiIdentityValue(resourcePath)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-canvas-unstable-output-ref',
          'Canvas media promotion requires a stable generated asset or resource path.',
          'outputRefs',
        ),
      ],
    };
  }
  const asset = {
    id: outputRef.generatedAssetId ?? outputRef.resourceRef?.id ?? outputRef.id,
    path: resourcePath,
    kind: outputRef.kind,
    ...(outputRef.mimeType ? { mimeType: outputRef.mimeType } : {}),
    ...(outputRef.resourceRef ? { resourceRef: outputRef.resourceRef } : {}),
    ...(outputRef.resourceVariantRef ? { resourceVariantRef: outputRef.resourceVariantRef } : {}),
  };
  return {
    ok: true,
    data: mediaKind === 'image' ? { generatedAsset: asset } : { generatedVideoAsset: asset },
  };
}

function projectCanvasPromptDocumentOutput(
  node: CanvasNode,
  outputRef: CreativeAiOutputRef,
  blockKind: 'image' | 'video',
): CanvasCreativeAiProjectedOutput {
  const text = readString(outputRef.metadata?.['text']);
  if (!text) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-canvas-missing-prompt-output',
          'Canvas prompt promotion requires outputRefs metadata.text.',
          'outputRefs.metadata.text',
        ),
      ],
    };
  }
  const promptState = readCanvasStoryboardPromptState(node);
  const existing =
    blockKind === 'image'
      ? promptState?.promptBlocks?.imagePromptDocument
      : promptState?.promptBlocks?.videoPromptDocument;
  if (!existing) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          blockKind === 'image'
            ? 'creative-ai-canvas-image-prompt-missing'
            : 'creative-ai-canvas-video-prompt-missing',
          'Canvas prompt promotion requires an existing prompt document target.',
          blockKind === 'image'
            ? CANVAS_IMAGE_PROMPT_DOCUMENT_FIELD_PATH
            : CANVAS_VIDEO_PROMPT_DOCUMENT_FIELD_PATH,
        ),
      ],
    };
  }
  return {
    ok: true,
    data: {
      storyboardPrompt: {
        ...(promptState ?? { version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION }),
        promptBlocks: {
          ...(promptState?.promptBlocks ?? {}),
          [blockKind === 'image' ? 'imagePromptDocument' : 'videoPromptDocument']: {
            ...existing,
            text,
            updatedAt: Date.now(),
          },
        },
      },
    },
  };
}

function resolveStableOutputResourcePath(outputRef: CreativeAiOutputRef): string | undefined {
  const variantResource = outputRef.resourceVariantRef?.resource;
  return (
    variantResource?.source.projectRelativePath ??
    (variantResource?.locator?.kind === 'file' ? variantResource.locator.path : undefined) ??
    outputRef.resourceRef?.source.projectRelativePath ??
    (outputRef.resourceRef?.locator?.kind === 'file'
      ? outputRef.resourceRef.locator.path
      : undefined) ??
    (outputRef.generatedAssetId ? `generated-assets/${outputRef.generatedAssetId}` : undefined)
  );
}

function readCanvasCreativeAiCandidates(
  node: CanvasNode,
): Record<string, CanvasCreativeAiStoredCandidate> {
  const data = isRecord(node.data) ? node.data : {};
  const rawCandidates = isRecord(data['creativeAiCandidates']) ? data['creativeAiCandidates'] : {};
  const candidates: Record<string, CanvasCreativeAiStoredCandidate> = {};
  for (const [candidateId, candidate] of Object.entries(rawCandidates)) {
    if (isCanvasCreativeAiStoredCandidate(candidate)) {
      candidates[candidateId] = candidate;
    }
  }
  return candidates;
}

function isCanvasCreativeAiStoredCandidate(
  value: unknown,
): value is CanvasCreativeAiStoredCandidate {
  return (
    isRecord(value) &&
    typeof value['candidateId'] === 'string' &&
    (value['status'] === 'candidate' ||
      value['status'] === 'promoted' ||
      value['status'] === 'rejected' ||
      value['status'] === 'deleted') &&
    Array.isArray(value['outputRefs']) &&
    isRecord(value['candidateTargetRef'])
  );
}

function createCanvasCandidateRevision(request: CreativeAiApplyRequest): CreativeAiRevision {
  return `canvas-candidate:${stableHash(
    stableStringify({
      candidateTargetRef: request.candidateTargetRef?.id,
      outputRefs: request.outputRefs,
      diagnostics: request.diagnostics,
    }),
  )}`;
}

function validateStableCanvasApplyIdentity(
  request: CreativeAiApplyRequest,
): readonly CreativeAiDiagnostic[] {
  const diagnostics: CreativeAiDiagnostic[] = [];
  collectRuntimeOnlyIdentityDiagnostics(request.targetRef, 'targetRef', diagnostics);
  collectRuntimeOnlyIdentityDiagnostics(
    request.candidateTargetRef,
    'candidateTargetRef',
    diagnostics,
  );
  for (const [index, outputRef] of request.outputRefs.entries()) {
    collectRuntimeOnlyIdentityDiagnostics(
      outputRef.metadata,
      `outputRefs[${index}].metadata`,
      diagnostics,
    );
  }
  return diagnostics;
}

function collectRuntimeOnlyIdentityDiagnostics(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (typeof value === 'string') {
    if (isRuntimeOnlyCreativeAiIdentityValue(value)) {
      diagnostics.push(
        diagnostic(
          'creative-ai-canvas-runtime-only-identity',
          'Canvas creative AI apply cannot persist Webview, blob, cache, temp, or provider runtime identity.',
          target,
        ),
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectRuntimeOnlyIdentityDiagnostics(item, `${target}[${index}]`, diagnostics),
    );
    return;
  }

  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    collectRuntimeOnlyIdentityDiagnostics(child, `${target}.${key}`, diagnostics);
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(',')}}`;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function diagnostic(code: string, message: string, target?: string): CreativeAiDiagnostic {
  return createCreativeAiDiagnostic('error', code, message, target);
}
