import type {
  CanvasAuthoringDiagnostic,
  CanvasAuthoringFieldProfileDescriptor,
  CanvasAuthoringRef,
  CanvasAuthoringSemanticPromptDocument,
  CanvasAuthoringValidationResult,
} from './types/canvas-authoring-contracts';
import {
  isRuntimeOnlyCanvasAuthoringResourceIdentityValue,
  validateCanvasAuthoringSemanticPromptDocument,
} from './types/canvas-authoring-contracts';
import type {
  StoryboardMediaIdentityClassificationOptions,
  StoryboardMediaRef,
} from './types/storyboard-table';
import { classifyStoryboardMediaIdentity, STORYBOARD_MEDIA_ROLES } from './types/storyboard-table';

export const CANVAS_STORYBOARD_PROMPT_BLOCK_KINDS = ['image', 'video', 'voice'] as const;

export type CanvasStoryboardPromptBlockKind = (typeof CANVAS_STORYBOARD_PROMPT_BLOCK_KINDS)[number];

export const CANVAS_STORYBOARD_NEXT_CREATIVE_STATE_SEVERITIES = [
  'info',
  'warning',
  'error',
  'blocked',
] as const;

export type CanvasStoryboardNextCreativeStateSeverity =
  (typeof CANVAS_STORYBOARD_NEXT_CREATIVE_STATE_SEVERITIES)[number];

export const CANVAS_STORYBOARD_NEXT_CREATIVE_STATE_TARGETS = [
  'reference-media',
  'image-prompt',
  'video-prompt',
  'dialogue',
  'approval',
  'result-review',
  'prompt-alignment',
] as const;

export type CanvasStoryboardNextCreativeStateTarget =
  (typeof CANVAS_STORYBOARD_NEXT_CREATIVE_STATE_TARGETS)[number];

export const CANVAS_STORYBOARD_ACTION_INTENT_IDS = [
  'process-reference',
  'optimize-image-prompt',
  'optimize-video-prompt',
  'generate-image',
  'generate-video',
  'review-result',
  'fix-alignment',
  'accept-result',
  'retry',
] as const;

export type CanvasStoryboardActionIntentId = (typeof CANVAS_STORYBOARD_ACTION_INTENT_IDS)[number];

export const CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS = [
  'negativePrompt',
  'seed',
  'aspectRatio',
  'cameraControl',
  'motionStrength',
  'videoReference',
  'audioReference',
  'startFrame',
  'endFrame',
] as const;

export type CanvasStoryboardAdvancedParameterId =
  (typeof CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS)[number];

export interface CanvasStoryboardSemanticPromptDocument extends CanvasAuthoringSemanticPromptDocument {
  readonly documentId: string;
  readonly blockKind: CanvasStoryboardPromptBlockKind;
  readonly updatedAt?: number;
}

export interface CanvasStoryboardPromptBlocks {
  readonly imagePromptDocument?: CanvasStoryboardSemanticPromptDocument;
  readonly videoPromptDocument?: CanvasStoryboardSemanticPromptDocument;
  readonly voicePromptDocument?: CanvasStoryboardSemanticPromptDocument;
}

export interface CanvasStoryboardReferenceMedia {
  readonly imageRefs: readonly StoryboardMediaRef[];
  readonly videoRefs?: readonly StoryboardMediaRef[];
  readonly audioRefs?: readonly StoryboardMediaRef[];
  readonly diagnostics?: readonly CanvasAuthoringDiagnostic[];
}

export interface CanvasStoryboardResultRef {
  readonly canvasRef?: CanvasAuthoringRef;
  readonly mediaRef?: StoryboardMediaRef;
}

export interface CanvasStoryboardExecutionRefs {
  readonly resultRefs?: readonly CanvasStoryboardResultRef[];
  readonly historyRefs?: readonly string[];
}

export interface CanvasStoryboardGenerationParams {
  readonly duration?: number;
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly aspectRatio?: string;
  readonly modelId?: string;
  readonly advancedParameters?: Readonly<Record<string, unknown>>;
}

export interface CanvasStoryboardDurationCapability {
  readonly minSeconds?: number;
  readonly maxSeconds?: number;
}

export interface CanvasStoryboardReferenceInputCapability {
  readonly image?: boolean;
  readonly video?: boolean;
  readonly audio?: boolean;
}

export interface CanvasStoryboardModelCapabilityProjection {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly imagePreparation?: boolean;
  readonly imageGeneration?: boolean;
  readonly imageEditing?: boolean;
  readonly videoGeneration?: boolean;
  readonly videoEditing?: boolean;
  readonly duration?: CanvasStoryboardDurationCapability;
  readonly referenceInputs?: CanvasStoryboardReferenceInputCapability;
  readonly advancedParameters?: readonly CanvasStoryboardAdvancedParameterId[];
}

export interface CanvasStoryboardNextCreativeState {
  readonly id: string;
  readonly label: string;
  readonly severity: CanvasStoryboardNextCreativeStateSeverity;
  readonly target: CanvasStoryboardNextCreativeStateTarget;
  readonly nextActionId?: CanvasStoryboardActionIntentId;
  readonly blocker?: string;
  readonly resultRef?: CanvasStoryboardResultRef;
  readonly diagnostics?: readonly CanvasAuthoringDiagnostic[];
}

export interface CanvasStoryboardPromptState {
  readonly promptBlocks?: CanvasStoryboardPromptBlocks;
  readonly referenceMedia?: CanvasStoryboardReferenceMedia;
  readonly generationParams?: CanvasStoryboardGenerationParams;
  readonly nextCreativeState?: CanvasStoryboardNextCreativeState;
  readonly executionRefs?: CanvasStoryboardExecutionRefs;
  readonly diagnostics?: readonly CanvasAuthoringDiagnostic[];
}

export interface CanvasStoryboardShotTarget {
  readonly nodeId: string;
  readonly sceneNodeId?: string;
  readonly shotId?: string;
  readonly shotNumber?: number;
}

export interface CanvasStoryboardPromptDocumentRef {
  readonly blockKind: CanvasStoryboardPromptBlockKind;
  readonly documentId: string;
  readonly text?: string;
}

export interface CanvasStoryboardActionIntent {
  readonly actionId: CanvasStoryboardActionIntentId;
  readonly requestId?: string;
  readonly target: CanvasStoryboardShotTarget;
  readonly promptDocuments?: readonly CanvasStoryboardPromptDocumentRef[];
  readonly referenceMedia?: CanvasStoryboardReferenceMedia;
  readonly generationParams?: CanvasStoryboardGenerationParams;
  readonly expectedNextStateId?: string;
  readonly resultRef?: CanvasStoryboardResultRef;
  readonly createdAt?: number;
}

export interface CanvasStoryboardValidationOptions extends StoryboardMediaIdentityClassificationOptions {
  readonly fieldProfiles?: readonly CanvasAuthoringFieldProfileDescriptor[];
  readonly supportedAdvancedParameters?: readonly CanvasStoryboardAdvancedParameterId[];
}

export type CanvasStoryboardReviewRowSource = 'semantic-prompt-document' | 'invalid' | 'empty';

export interface CanvasStoryboardReviewRowInput {
  readonly nodeId: string;
  readonly sceneNodeId?: string;
  readonly shotId?: string;
  readonly shotNumber?: number;
  readonly data: unknown;
  readonly validationOptions?: CanvasStoryboardValidationOptions;
}

export interface CanvasStoryboardReviewRow {
  readonly nodeId: string;
  readonly sceneNodeId?: string;
  readonly shotId?: string;
  readonly shotNumber: string;
  readonly referenceMedia: string;
  readonly imagePrompt: string;
  readonly videoPrompt: string;
  readonly duration: string;
  readonly dialogue: string;
  readonly state: CanvasStoryboardNextCreativeState;
  readonly actionId?: CanvasStoryboardActionIntentId;
  readonly diagnostics: readonly CanvasAuthoringDiagnostic[];
  readonly source: CanvasStoryboardReviewRowSource;
}

const CANVAS_STORYBOARD_IMAGE_PROCESSING_KEYWORDS = [
  '图像编辑',
  '图片编辑',
  '图像处理',
  '图片处理',
  '参考图处理',
  '参考素材处理',
  '裁切',
  '切分',
  '提取分格',
  '拆分分格',
  '分格裁切',
  '分格切分',
  '旋转',
  '上色',
  '重绘',
  '去除对白',
  '移除对白',
  '去除文字',
  '移除文字',
  '去文字',
  '去除气泡',
  '移除气泡',
  '对白气泡',
  '补全遮挡',
  '局部重绘',
  '扩图',
  '修复透视',
  '清理线稿',
  '清理文字',
  '清理气泡',
] as const;

const CANVAS_STORYBOARD_IMAGE_PROCESSING_PATTERNS = [
  /\bimage\s+(edit|editing|processing|cleanup|clean-up)\b/u,
  /\b(edit|process|clean\s*up|cleanup)\s+(the\s+)?(image|reference|keyframe|panel)\b/u,
  /\b(crop|cropping|rotate|rotating|rotation|colorize|colorise|colorizing|colourise|redraw|redrawing|inpaint|outpaint|outpainting|upscale|upscaling)\b/u,
  /\b(split|extract|isolate)\s+(the\s+)?panel\b/u,
  /\bpanel\s+(split|crop|extraction|isolation)\b/u,
  /\b(remove|erase|delete)\s+(speech\s+bubble|dialogue\s+bubble|dialog\s+bubble|text|lettering|caption)\b/u,
  /\b(fix|correct|repair)\s+(the\s+)?perspective\b/u,
] as const;

export function validateCanvasStoryboardSemanticPromptDocument(
  value: unknown,
  options: CanvasStoryboardValidationOptions = {},
): CanvasAuthoringValidationResult {
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  const record = asRecord(value);
  if (!record) {
    return validationResult([
      diagnostic(
        'error',
        'malformed-storyboard-prompt-document',
        'Storyboard prompt document must be an object.',
      ),
    ]);
  }

  if (!isNonEmptyString(record['documentId'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'malformed-storyboard-prompt-document',
        'Storyboard prompt documentId is required.',
        { target: 'documentId', received: record['documentId'] },
      ),
    );
  }
  if (!includesString(CANVAS_STORYBOARD_PROMPT_BLOCK_KINDS, record['blockKind'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-storyboard-prompt-block-kind',
        'Storyboard prompt block kind is unsupported.',
        {
          target: 'blockKind',
          expected: CANVAS_STORYBOARD_PROMPT_BLOCK_KINDS,
          received: record['blockKind'],
        },
      ),
    );
  }

  diagnostics.push(
    ...validateCanvasAuthoringSemanticPromptDocument(value, {
      fieldProfiles: options.fieldProfiles,
    }).diagnostics,
  );

  return validationResult(diagnostics);
}

export function validateCanvasStoryboardPromptBlocks(
  value: unknown,
  options: CanvasStoryboardValidationOptions = {},
): CanvasAuthoringValidationResult {
  const record = asRecord(value);
  if (!record) {
    return validationResult([
      diagnostic(
        'error',
        'malformed-storyboard-prompt-blocks',
        'Storyboard prompt blocks must be an object.',
      ),
    ]);
  }

  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  validateOptionalPromptDocument(record, 'imagePromptDocument', 'image', diagnostics, options);
  validateOptionalPromptDocument(record, 'videoPromptDocument', 'video', diagnostics, options);
  validateOptionalPromptDocument(record, 'voicePromptDocument', 'voice', diagnostics, options);
  return validationResult(diagnostics);
}

export function validateCanvasStoryboardReferenceMedia(
  value: unknown,
  options: CanvasStoryboardValidationOptions = {},
): CanvasAuthoringValidationResult {
  const record = asRecord(value);
  if (!record) {
    return validationResult([
      diagnostic(
        'error',
        'malformed-storyboard-reference-media',
        'Storyboard reference media must be an object.',
      ),
    ]);
  }

  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  diagnostics.push(...validateMediaRefArray(record['imageRefs'], 'imageRefs', true, options));
  diagnostics.push(...validateMediaRefArray(record['videoRefs'], 'videoRefs', false, options));
  diagnostics.push(...validateMediaRefArray(record['audioRefs'], 'audioRefs', false, options));
  diagnostics.push(...validateOptionalDiagnostics(record['diagnostics'], 'diagnostics'));
  return validationResult(diagnostics);
}

export function validateCanvasStoryboardNextCreativeState(
  value: unknown,
): CanvasAuthoringValidationResult {
  const record = asRecord(value);
  if (!record) {
    return validationResult([
      diagnostic(
        'error',
        'malformed-storyboard-next-state',
        'Storyboard next creative state must be an object.',
      ),
    ]);
  }

  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (!isNonEmptyString(record['id'])) {
    diagnostics.push(
      diagnostic('error', 'malformed-storyboard-next-state', 'Next state id is required.', {
        target: 'id',
        received: record['id'],
      }),
    );
  }
  if (!isNonEmptyString(record['label'])) {
    diagnostics.push(
      diagnostic('error', 'malformed-storyboard-next-state', 'Next state label is required.', {
        target: 'label',
        received: record['label'],
      }),
    );
  }
  if (!includesString(CANVAS_STORYBOARD_NEXT_CREATIVE_STATE_SEVERITIES, record['severity'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-storyboard-next-state-severity',
        'Next state severity is unsupported.',
        {
          target: 'severity',
          expected: CANVAS_STORYBOARD_NEXT_CREATIVE_STATE_SEVERITIES,
          received: record['severity'],
        },
      ),
    );
  }
  if (!includesString(CANVAS_STORYBOARD_NEXT_CREATIVE_STATE_TARGETS, record['target'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-storyboard-next-state-target',
        'Next state target is unsupported.',
        {
          target: 'target',
          expected: CANVAS_STORYBOARD_NEXT_CREATIVE_STATE_TARGETS,
          received: record['target'],
        },
      ),
    );
  }
  if (
    record['nextActionId'] !== undefined &&
    !includesString(CANVAS_STORYBOARD_ACTION_INTENT_IDS, record['nextActionId'])
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-storyboard-action-intent',
        'Next state action id is unsupported.',
        {
          target: 'nextActionId',
          expected: CANVAS_STORYBOARD_ACTION_INTENT_IDS,
          received: record['nextActionId'],
        },
      ),
    );
  }
  if (record['blocker'] !== undefined && typeof record['blocker'] !== 'string') {
    diagnostics.push(
      diagnostic('error', 'malformed-storyboard-next-state', 'Next state blocker is malformed.', {
        target: 'blocker',
        received: record['blocker'],
      }),
    );
  }
  diagnostics.push(
    ...validateKnownFields(
      record,
      ['id', 'label', 'severity', 'target', 'nextActionId', 'blocker', 'resultRef', 'diagnostics'],
      'malformed-storyboard-next-state',
      'nextCreativeState',
    ),
  );
  if (record['resultRef'] !== undefined) {
    diagnostics.push(...validateResultRef(record['resultRef'], 'resultRef'));
  }
  diagnostics.push(...validateOptionalDiagnostics(record['diagnostics'], 'diagnostics'));
  return validationResult(diagnostics);
}

export function validateCanvasStoryboardActionIntent(
  value: unknown,
  options: CanvasStoryboardValidationOptions = {},
): CanvasAuthoringValidationResult {
  const record = asRecord(value);
  if (!record) {
    return validationResult([
      diagnostic(
        'error',
        'malformed-storyboard-action-intent',
        'Storyboard action intent must be an object.',
      ),
    ]);
  }

  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (!includesString(CANVAS_STORYBOARD_ACTION_INTENT_IDS, record['actionId'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-storyboard-action-intent',
        'Storyboard action intent id is unsupported.',
        {
          target: 'actionId',
          expected: CANVAS_STORYBOARD_ACTION_INTENT_IDS,
          received: record['actionId'],
        },
      ),
    );
  }
  diagnostics.push(...validateShotTarget(record['target'], 'target'));
  if (record['promptDocuments'] !== undefined) {
    diagnostics.push(...validatePromptDocumentRefs(record['promptDocuments'], 'promptDocuments'));
  }
  if (record['referenceMedia'] !== undefined) {
    diagnostics.push(
      ...validateCanvasStoryboardReferenceMedia(record['referenceMedia'], options).diagnostics,
    );
  }
  if (record['generationParams'] !== undefined) {
    diagnostics.push(...validateGenerationParams(record['generationParams'], options));
  }
  diagnostics.push(
    ...validateKnownFields(
      record,
      [
        'actionId',
        'requestId',
        'target',
        'promptDocuments',
        'referenceMedia',
        'generationParams',
        'expectedNextStateId',
        'resultRef',
        'createdAt',
      ],
      'malformed-storyboard-action-intent',
      'actionIntent',
    ),
  );
  if (record['resultRef'] !== undefined) {
    diagnostics.push(...validateResultRef(record['resultRef'], 'resultRef'));
  }
  return validationResult(diagnostics);
}

export function isCanvasStoryboardActionIntent(
  value: unknown,
  options: CanvasStoryboardValidationOptions = {},
): value is CanvasStoryboardActionIntent {
  return validateCanvasStoryboardActionIntent(value, options).valid;
}

export function validateCanvasStoryboardPromptState(
  value: unknown,
  options: CanvasStoryboardValidationOptions = {},
): CanvasAuthoringValidationResult {
  const record = asRecord(value);
  if (!record) {
    return validationResult([
      diagnostic(
        'error',
        'malformed-storyboard-prompt-state',
        'Storyboard prompt state must be an object.',
      ),
    ]);
  }

  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (record['promptBlocks'] !== undefined) {
    diagnostics.push(
      ...validateCanvasStoryboardPromptBlocks(record['promptBlocks'], options).diagnostics,
    );
  }
  if (record['referenceMedia'] !== undefined) {
    diagnostics.push(
      ...validateCanvasStoryboardReferenceMedia(record['referenceMedia'], options).diagnostics,
    );
  }
  if (record['generationParams'] !== undefined) {
    diagnostics.push(...validateGenerationParams(record['generationParams'], options));
  }
  if (record['nextCreativeState'] !== undefined) {
    diagnostics.push(
      ...validateCanvasStoryboardNextCreativeState(record['nextCreativeState']).diagnostics,
    );
  }
  if (record['executionRefs'] !== undefined) {
    diagnostics.push(...validateExecutionRefs(record['executionRefs'], 'executionRefs'));
  }
  diagnostics.push(...validateOptionalDiagnostics(record['diagnostics'], 'diagnostics'));
  return validationResult(diagnostics);
}

export function isCanvasStoryboardPromptState(
  value: unknown,
  options: CanvasStoryboardValidationOptions = {},
): value is CanvasStoryboardPromptState {
  return validateCanvasStoryboardPromptState(value, options).valid;
}

export function isCanvasStoryboardReferenceImageProcessingPrompt(
  text: string | undefined,
): boolean {
  const normalized = text?.trim();
  if (!normalized) return false;
  const lower = normalized.toLocaleLowerCase();
  return (
    CANVAS_STORYBOARD_IMAGE_PROCESSING_KEYWORDS.some((keyword) => normalized.includes(keyword)) ||
    CANVAS_STORYBOARD_IMAGE_PROCESSING_PATTERNS.some((pattern) => pattern.test(lower))
  );
}

export function projectCanvasStoryboardReviewRow(
  input: CanvasStoryboardReviewRowInput,
): CanvasStoryboardReviewRow {
  const data = asRecord(input.data) ?? {};
  const promptState = data['storyboardPrompt'];
  const validation = validateCanvasStoryboardPromptState(
    promptState,
    input.validationOptions ?? {},
  );
  const shotNumber =
    input.shotNumber ??
    readNumber(data, 'shotNumber') ??
    readNumber(asRecord(promptState), 'shotNumber');

  if (!promptState) {
    const state = createMissingVideoPromptState();
    return {
      nodeId: input.nodeId,
      ...(input.sceneNodeId ? { sceneNodeId: input.sceneNodeId } : {}),
      ...(input.shotId ? { shotId: input.shotId } : {}),
      shotNumber: formatShotNumber(shotNumber),
      referenceMedia: '',
      imagePrompt: '',
      videoPrompt: '',
      duration: formatDuration(readNumber(data, 'duration')),
      dialogue: readString(data, 'dialogue') ?? '',
      state,
      actionId: state.nextActionId,
      diagnostics: [
        diagnostic(
          'error',
          'missing-semantic-storyboard-prompt',
          'Shot does not contain semantic storyboard prompt documents.',
          { target: 'storyboardPrompt', retryable: true },
        ),
      ],
      source: 'empty',
    };
  }

  const state = asCanvasStoryboardPromptState(promptState);
  const resolvedState =
    state?.nextCreativeState ??
    resolveCanvasStoryboardNextCreativeState({
      promptBlocks: state?.promptBlocks,
      referenceMedia: state?.referenceMedia,
      generationParams: state?.generationParams,
      executionRefs: state?.executionRefs,
      diagnostics: validation.diagnostics,
    });
  const duration = state?.generationParams?.duration ?? readNumber(data, 'duration');
  const dialogue = state?.generationParams?.dialogue ?? readString(data, 'dialogue') ?? '';

  return {
    nodeId: input.nodeId,
    ...(input.sceneNodeId ? { sceneNodeId: input.sceneNodeId } : {}),
    ...(input.shotId ? { shotId: input.shotId } : {}),
    shotNumber: formatShotNumber(shotNumber),
    referenceMedia: summarizeReferenceMedia(state?.referenceMedia),
    imagePrompt: state?.promptBlocks?.imagePromptDocument?.text ?? '',
    videoPrompt: state?.promptBlocks?.videoPromptDocument?.text ?? '',
    duration: formatDuration(duration),
    dialogue,
    state: resolvedState,
    actionId: resolvedState.nextActionId,
    diagnostics: [...validation.diagnostics, ...(state?.diagnostics ?? [])],
    source: validation.valid ? 'semantic-prompt-document' : 'invalid',
  };
}

export function resolveCanvasStoryboardNextCreativeState(input: {
  readonly promptBlocks?: CanvasStoryboardPromptBlocks;
  readonly referenceMedia?: CanvasStoryboardReferenceMedia;
  readonly generationParams?: CanvasStoryboardGenerationParams;
  readonly executionRefs?: CanvasStoryboardExecutionRefs;
  readonly diagnostics?: readonly CanvasAuthoringDiagnostic[];
}): CanvasStoryboardNextCreativeState {
  const blockingDiagnostic = input.diagnostics?.find((item) => item.severity === 'error');
  if (blockingDiagnostic) {
    if (
      blockingDiagnostic.retryable &&
      (blockingDiagnostic.target === 'result-review' || blockingDiagnostic.code.includes('failed'))
    ) {
      return {
        id: 'failed-retry',
        label: 'Retry failed action',
        severity: 'error',
        target: 'result-review',
        nextActionId: 'retry',
        blocker: blockingDiagnostic.message,
        diagnostics: [blockingDiagnostic],
      };
    }
    return {
      id: 'prompt-conflict',
      label: 'Fix prompt alignment',
      severity: 'blocked',
      target: 'prompt-alignment',
      nextActionId: 'fix-alignment',
      blocker: blockingDiagnostic.message,
      diagnostics: [blockingDiagnostic],
    };
  }

  const waitingDiagnostic = input.diagnostics?.find(
    (item) => item.code === 'approval-required' || item.target === 'approval',
  );
  if (waitingDiagnostic) {
    return {
      id: 'waiting-confirmation',
      label: 'Waiting for confirmation',
      severity: 'warning',
      target: 'approval',
      nextActionId: 'fix-alignment',
      blocker: waitingDiagnostic.message,
      diagnostics: [waitingDiagnostic],
    };
  }

  const acceptedDiagnostic = input.diagnostics?.find((item) => item.code === 'result-accepted');
  if (acceptedDiagnostic) {
    return {
      id: 'accepted',
      label: 'Accepted',
      severity: 'info',
      target: 'result-review',
      resultRef: input.executionRefs?.resultRefs?.[0],
      diagnostics: [acceptedDiagnostic],
    };
  }

  const resultRef = input.executionRefs?.resultRefs?.[0];
  if (resultRef) {
    return {
      id: 'needs-result-review',
      label: 'Review result',
      severity: 'info',
      target: 'result-review',
      nextActionId: 'review-result',
      resultRef,
    };
  }

  const referenceDiagnostic = input.referenceMedia?.diagnostics?.find(
    (item) => item.severity === 'warning' || item.retryable,
  );
  if (referenceDiagnostic) {
    return {
      id: 'needs-reference-processing',
      label: 'Process reference',
      severity: 'warning',
      target: 'reference-media',
      nextActionId: 'process-reference',
      blocker: referenceDiagnostic.message,
      diagnostics: [referenceDiagnostic],
    };
  }

  const referenceCount = countReferenceMedia(input.referenceMedia);
  if (referenceCount === 0 && !input.promptBlocks?.imagePromptDocument) {
    return {
      id: 'missing-reference',
      label: 'Add or process reference',
      severity: 'warning',
      target: 'reference-media',
      nextActionId: 'process-reference',
      blocker: 'Shot has no usable reference media or image preparation prompt.',
    };
  }

  const imagePromptText = input.promptBlocks?.imagePromptDocument?.text;
  const imagePromptProcessesReference =
    isCanvasStoryboardReferenceImageProcessingPrompt(imagePromptText);

  if (referenceCount === 0 && imagePromptProcessesReference) {
    return {
      id: 'missing-reference',
      label: 'Add or bind reference',
      severity: 'warning',
      target: 'reference-media',
      nextActionId: 'process-reference',
      blocker: 'Image editing or reference processing requires usable reference media.',
    };
  }

  if (referenceCount === 0 && input.promptBlocks?.imagePromptDocument) {
    return {
      id: 'image-prompt-ready',
      label: 'Generate reference image',
      severity: 'info',
      target: 'image-prompt',
      nextActionId: 'generate-image',
    };
  }

  if (referenceCount > 0 && imagePromptProcessesReference) {
    return {
      id: 'needs-reference-processing',
      label: 'Process reference',
      severity: 'info',
      target: 'reference-media',
      nextActionId: 'process-reference',
    };
  }

  if (!input.promptBlocks?.videoPromptDocument?.text.trim()) {
    return {
      id: 'missing-video-prompt',
      label: 'Optimize scene video prompt',
      severity: 'warning',
      target: 'video-prompt',
      nextActionId: 'optimize-video-prompt',
      blocker:
        referenceCount > 0 && !input.promptBlocks?.imagePromptDocument
          ? 'Reference media is usable; image prompt is skipped and video prompt is required.'
          : 'Video generation requires a semantic video prompt document.',
    };
  }

  if (referenceCount > 0 && !input.promptBlocks.imagePromptDocument) {
    return {
      id: 'image-prompt-skipped',
      label: 'Image prompt skipped',
      severity: 'info',
      target: 'video-prompt',
      nextActionId: 'generate-video',
    };
  }

  return {
    id: 'ready-to-generate-video',
    label: 'Ready to generate video',
    severity: 'info',
    target: 'video-prompt',
    nextActionId: 'generate-video',
  };
}

function validateOptionalPromptDocument(
  record: Record<string, unknown>,
  key: keyof CanvasStoryboardPromptBlocks & string,
  expectedBlockKind: CanvasStoryboardPromptBlockKind,
  diagnostics: CanvasAuthoringDiagnostic[],
  options: CanvasStoryboardValidationOptions,
): void {
  const value = record[key];
  if (value === undefined) return;
  diagnostics.push(...validateCanvasStoryboardSemanticPromptDocument(value, options).diagnostics);
  const valueRecord = asRecord(value);
  if (valueRecord && valueRecord['blockKind'] !== expectedBlockKind) {
    diagnostics.push(
      diagnostic(
        'error',
        'storyboard-prompt-block-kind-mismatch',
        'Prompt document is stored under a mismatched prompt block key.',
        {
          target: key,
          expected: expectedBlockKind,
          received: valueRecord['blockKind'],
        },
      ),
    );
  }
}

function validateMediaRefArray(
  value: unknown,
  target: string,
  required: boolean,
  options: CanvasStoryboardValidationOptions,
): readonly CanvasAuthoringDiagnostic[] {
  if (value === undefined) {
    return required
      ? [
          diagnostic(
            'error',
            'malformed-storyboard-reference-media',
            'Storyboard reference media imageRefs is required.',
            { target },
          ),
        ]
      : [];
  }
  if (!Array.isArray(value)) {
    return [
      diagnostic(
        'error',
        'malformed-storyboard-reference-media',
        'Storyboard media refs must be an array.',
        { target, received: value },
      ),
    ];
  }

  return value.flatMap((item, index) => validateMediaRef(item, `${target}[${index}]`, options));
}

function validateMediaRef(
  value: unknown,
  target: string,
  options: CanvasStoryboardValidationOptions,
): readonly CanvasAuthoringDiagnostic[] {
  const record = asRecord(value);
  if (!record || !isNonEmptyString(record['refId']) || !asRecord(record['locator'])) {
    return [
      diagnostic('error', 'invalid-storyboard-media-ref', 'Storyboard media ref is malformed.', {
        target,
        received: value,
      }),
    ];
  }
  if (!includesString(STORYBOARD_MEDIA_ROLES, record['role'])) {
    return [
      diagnostic('error', 'invalid-storyboard-media-ref', 'Storyboard media role is unsupported.', {
        target: `${target}.role`,
        expected: STORYBOARD_MEDIA_ROLES,
        received: record['role'],
      }),
    ];
  }

  const locator = asRecord(record['locator']);
  if (!locator || typeof locator['type'] !== 'string') {
    return [
      diagnostic(
        'error',
        'invalid-storyboard-media-ref',
        'Storyboard media locator is malformed.',
        {
          target: `${target}.locator`,
          received: record['locator'],
        },
      ),
    ];
  }

  const classification = classifyStoryboardMediaIdentity(value as StoryboardMediaRef, options);
  switch (classification.kind) {
    case 'stable':
      return [];
    case 'runtime-only':
      return [
        diagnostic(
          'error',
          'runtime-only-storyboard-media-ref',
          'Storyboard media ref must use durable identity, not a runtime-only handle.',
          { target, received: classification.value, retryable: true },
        ),
      ];
    case 'unsafe-cache-path':
      return [
        diagnostic(
          'error',
          'unsafe-storyboard-media-ref',
          'Storyboard media ref must not use unsafe cache paths.',
          { target, received: classification.value, retryable: true },
        ),
      ];
    case 'ambiguous-alias':
      return [
        diagnostic(
          'error',
          'ambiguous-storyboard-media-ref',
          'Storyboard media ref alias is ambiguous.',
          { target, received: classification.alias, retryable: true },
        ),
      ];
    case 'unresolved-tool-result':
      return [
        diagnostic(
          'error',
          'unresolved-storyboard-media-ref',
          'Storyboard media ref points to an unavailable tool result.',
          { target, received: classification.toolCallId, retryable: true },
        ),
      ];
  }
}

function validateShotTarget(value: unknown, target: string): readonly CanvasAuthoringDiagnostic[] {
  const record = asRecord(value);
  if (!record || !isNonEmptyString(record['nodeId'])) {
    return [
      diagnostic(
        'error',
        'malformed-storyboard-shot-target',
        'Storyboard action target must include nodeId.',
        { target, received: value },
      ),
    ];
  }
  return [];
}

function validatePromptDocumentRefs(
  value: unknown,
  target: string,
): readonly CanvasAuthoringDiagnostic[] {
  if (!Array.isArray(value)) {
    return [
      diagnostic(
        'error',
        'malformed-storyboard-prompt-document-ref',
        'Prompt document refs must be an array.',
        { target, received: value },
      ),
    ];
  }
  return value.flatMap((item, index) => {
    const record = asRecord(item);
    const itemTarget = `${target}[${index}]`;
    if (
      !record ||
      !includesString(CANVAS_STORYBOARD_PROMPT_BLOCK_KINDS, record['blockKind']) ||
      !isNonEmptyString(record['documentId']) ||
      (record['text'] !== undefined && typeof record['text'] !== 'string')
    ) {
      return [
        diagnostic(
          'error',
          'malformed-storyboard-prompt-document-ref',
          'Prompt document ref is malformed.',
          { target: itemTarget, received: item },
        ),
      ];
    }
    return [];
  });
}

function validateGenerationParams(
  value: unknown,
  options: CanvasStoryboardValidationOptions,
): readonly CanvasAuthoringDiagnostic[] {
  const record = asRecord(value);
  if (!record) {
    return [
      diagnostic(
        'error',
        'malformed-storyboard-generation-params',
        'Storyboard generation params must be an object.',
        { received: value },
      ),
    ];
  }

  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  if (record['duration'] !== undefined && !isPositiveNumber(record['duration'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'malformed-storyboard-generation-params',
        'Storyboard duration must be a positive number.',
        { target: 'duration', received: record['duration'] },
      ),
    );
  }
  for (const key of ['dialogue', 'voiceOver', 'aspectRatio', 'modelId'] as const) {
    if (record[key] !== undefined && typeof record[key] !== 'string') {
      diagnostics.push(
        diagnostic(
          'error',
          'malformed-storyboard-generation-params',
          `Storyboard generation param ${key} must be a string.`,
          { target: key, received: record[key] },
        ),
      );
    }
  }

  const advancedParameters = asRecord(record['advancedParameters']);
  if (record['advancedParameters'] !== undefined && !advancedParameters) {
    diagnostics.push(
      diagnostic(
        'error',
        'malformed-storyboard-generation-params',
        'Storyboard advancedParameters must be an object.',
        { target: 'advancedParameters', received: record['advancedParameters'] },
      ),
    );
  }
  if (advancedParameters) {
    const supported = new Set(options.supportedAdvancedParameters ?? []);
    for (const key of Object.keys(advancedParameters)) {
      if (!includesString(CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS, key)) {
        diagnostics.push(
          diagnostic(
            'error',
            'unsupported-storyboard-advanced-parameter',
            'Storyboard advanced parameter is unknown.',
            {
              target: `advancedParameters.${key}`,
              expected: CANVAS_STORYBOARD_ADVANCED_PARAMETER_IDS,
              received: key,
            },
          ),
        );
        continue;
      }
      if (supported.size > 0 && !supported.has(key)) {
        diagnostics.push(
          diagnostic(
            'error',
            'unsupported-storyboard-advanced-parameter',
            'Storyboard advanced parameter is not supported by the active model capability.',
            {
              target: `advancedParameters.${key}`,
              expected: [...supported],
              received: key,
              retryable: true,
            },
          ),
        );
      }
    }
  }

  return diagnostics;
}

function validateResultRef(value: unknown, target: string): readonly CanvasAuthoringDiagnostic[] {
  const record = asRecord(value);
  if (!record) {
    return [
      diagnostic(
        'error',
        'malformed-storyboard-result-ref',
        'Storyboard result ref is malformed.',
        {
          target,
          received: value,
        },
      ),
    ];
  }

  const hasCanvas = record['canvasRef'] !== undefined;
  const hasMedia = record['mediaRef'] !== undefined;
  const unknownFieldDiagnostics = validateKnownFields(
    record,
    ['canvasRef', 'mediaRef'],
    'malformed-storyboard-result-ref',
    target,
  );
  if (unknownFieldDiagnostics.length > 0) return unknownFieldDiagnostics;
  if (!hasCanvas && !hasMedia) {
    return [
      diagnostic(
        'error',
        'malformed-storyboard-result-ref',
        'Storyboard result ref must contain canvasRef or mediaRef.',
        { target, received: value },
      ),
    ];
  }
  if (hasCanvas) {
    const canvasRef = asRecord(record['canvasRef']);
    if (!canvasRef || !isNonEmptyString(canvasRef['kind']) || !isNonEmptyString(canvasRef['id'])) {
      return [
        diagnostic(
          'error',
          'malformed-storyboard-result-ref',
          'Storyboard canvas result ref is malformed.',
          { target: `${target}.canvasRef`, received: record['canvasRef'] },
        ),
      ];
    }
    if (
      canvasRef['kind'] === 'resource' &&
      isRuntimeOnlyCanvasAuthoringResourceIdentityValue(String(canvasRef['id']))
    ) {
      return [
        diagnostic(
          'error',
          'runtime-only-resource-identity',
          'Storyboard result refs must use durable identity, not runtime-only handles.',
          { target: `${target}.canvasRef.id`, received: canvasRef['id'] },
        ),
      ];
    }
  }
  if (hasMedia) {
    const mediaDiagnostics = validateMediaRef(record['mediaRef'], `${target}.mediaRef`, {});
    if (mediaDiagnostics.length > 0) return mediaDiagnostics;
  }
  return [];
}

function validateExecutionRefs(
  value: unknown,
  target: string,
): readonly CanvasAuthoringDiagnostic[] {
  const record = asRecord(value);
  if (!record) {
    return [
      diagnostic(
        'error',
        'malformed-storyboard-execution-refs',
        'Storyboard execution refs must be an object.',
        { target, received: value },
      ),
    ];
  }
  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  diagnostics.push(
    ...validateKnownFields(
      record,
      ['resultRefs', 'historyRefs'],
      'malformed-storyboard-execution-refs',
      target,
    ),
  );
  if (record['resultRefs'] !== undefined) {
    if (!Array.isArray(record['resultRefs'])) {
      diagnostics.push(
        diagnostic(
          'error',
          'malformed-storyboard-result-ref',
          'Storyboard resultRefs must be an array.',
          { target: `${target}.resultRefs`, received: record['resultRefs'] },
        ),
      );
    } else {
      record['resultRefs'].forEach((item, index) => {
        diagnostics.push(...validateResultRef(item, `${target}.resultRefs[${index}]`));
      });
    }
  }
  return diagnostics;
}

function validateKnownFields(
  record: Record<string, unknown>,
  fields: readonly string[],
  code: string,
  target: string,
): readonly CanvasAuthoringDiagnostic[] {
  const knownFields = new Set(fields);
  return Object.keys(record)
    .filter((field) => !knownFields.has(field))
    .map((field) =>
      diagnostic('error', code, `${target} contains an unsupported field.`, {
        target: `${target}.${field}`,
        received: record[field],
      }),
    );
}

function validateOptionalDiagnostics(
  value: unknown,
  target: string,
): readonly CanvasAuthoringDiagnostic[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return [
      diagnostic('error', 'malformed-storyboard-diagnostics', 'Diagnostics must be an array.', {
        target,
        received: value,
      }),
    ];
  }
  return value.flatMap((item, index) => {
    const record = asRecord(item);
    if (
      !record ||
      !includesString(['info', 'warning', 'error'] as const, record['severity']) ||
      !isNonEmptyString(record['code']) ||
      !isNonEmptyString(record['message'])
    ) {
      return [
        diagnostic('error', 'malformed-storyboard-diagnostics', 'Diagnostic item is malformed.', {
          target: `${target}[${index}]`,
          received: item,
        }),
      ];
    }
    return [];
  });
}

function asCanvasStoryboardPromptState(value: unknown): CanvasStoryboardPromptState | undefined {
  return isCanvasStoryboardPromptState(value) ? value : undefined;
}

function createMissingVideoPromptState(): CanvasStoryboardNextCreativeState {
  return {
    id: 'missing-video-prompt',
    label: 'Optimize scene video prompt',
    severity: 'warning',
    target: 'video-prompt',
    nextActionId: 'optimize-video-prompt',
  };
}

function countReferenceMedia(referenceMedia: CanvasStoryboardReferenceMedia | undefined): number {
  return (
    (referenceMedia?.imageRefs.length ?? 0) +
    (referenceMedia?.videoRefs?.length ?? 0) +
    (referenceMedia?.audioRefs?.length ?? 0)
  );
}

function summarizeReferenceMedia(
  referenceMedia: CanvasStoryboardReferenceMedia | undefined,
): string {
  if (!referenceMedia) return '';
  const parts = [
    referenceMedia.imageRefs.length > 0 ? `image:${referenceMedia.imageRefs.length}` : undefined,
    referenceMedia.videoRefs && referenceMedia.videoRefs.length > 0
      ? `video:${referenceMedia.videoRefs.length}`
      : undefined,
    referenceMedia.audioRefs && referenceMedia.audioRefs.length > 0
      ? `audio:${referenceMedia.audioRefs.length}`
      : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.join(' ');
}

function formatShotNumber(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function formatDuration(value: number | undefined): string {
  return value === undefined ? '' : `${value}s`;
}

function validationResult(
  diagnostics: readonly CanvasAuthoringDiagnostic[],
): CanvasAuthoringValidationResult {
  return {
    valid: diagnostics.every((item) => item.severity !== 'error'),
    diagnostics,
  };
}

function diagnostic(
  severity: CanvasAuthoringDiagnostic['severity'],
  code: string,
  message: string,
  details: Omit<CanvasAuthoringDiagnostic, 'severity' | 'code' | 'message'> = {},
): CanvasAuthoringDiagnostic {
  return { severity, code, message, ...details };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}
