import type {
  CanvasAuthoringDiagnostic,
  CanvasAuthoringFieldProfileDescriptor,
  CanvasAuthoringRef,
  CanvasAuthoringSemanticPromptDocument,
  CanvasAuthoringValidationResult,
} from './canvas-authoring-contracts';
import {
  isRuntimeOnlyCanvasAuthoringResourceIdentityValue,
  validateCanvasAuthoringSemanticPromptDocument,
} from './canvas-authoring-contracts';
import type { AgentTaskResultRef } from './agent-task-result-observation';
import type { TaskProjectionRef } from './task-projection';
import type {
  StoryboardMediaIdentityClassificationOptions,
  StoryboardMediaRef,
} from './storyboard-table';
import { classifyStoryboardMediaIdentity, STORYBOARD_MEDIA_ROLES } from './storyboard-table';

export const CANVAS_STORYBOARD_PROMPT_STATE_VERSION = 1 as const;
export const CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION = 1 as const;

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
  readonly version: typeof CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION;
  readonly documentId: string;
  readonly blockKind: CanvasStoryboardPromptBlockKind;
  readonly baseRevision?: string;
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

export interface CanvasStoryboardTaskRef extends TaskProjectionRef {
  readonly taskId?: string;
  readonly taskKind?: 'image' | 'video' | 'audio' | 'reference-processing' | 'prompt-optimization';
  readonly conversationId?: string;
}

export interface CanvasStoryboardResultRef {
  readonly agentResult?: AgentTaskResultRef;
  readonly canvasRef?: CanvasAuthoringRef;
  readonly mediaRef?: StoryboardMediaRef;
}

export interface CanvasStoryboardExecutionRefs {
  readonly taskRefs?: readonly CanvasStoryboardTaskRef[];
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
  readonly taskRef?: CanvasStoryboardTaskRef;
  readonly resultRef?: CanvasStoryboardResultRef;
  readonly diagnostics?: readonly CanvasAuthoringDiagnostic[];
}

export type CanvasStoryboardMigrationSource =
  | 'imagePrompt'
  | 'videoPrompt'
  | 'generationPrompt'
  | 'promptSlots'
  | 'visualDescription'
  | 'characters'
  | 'dialogue'
  | 'duration'
  | 'sourceMediaRefs'
  | 'generatedMediaRefs'
  | 'mediaRefs'
  | 'shotImagePrepPlan'
  | 'generatedVideoAsset';

export interface CanvasStoryboardMigrationProvenance {
  readonly migrationId: string;
  readonly source: CanvasStoryboardMigrationSource;
  readonly sourceFields: readonly string[];
  readonly targetBlockKind?: CanvasStoryboardPromptBlockKind;
  readonly migratedAt?: number;
  readonly rawValueSummary?: string;
}

export interface CanvasStoryboardPromptState {
  readonly version: typeof CANVAS_STORYBOARD_PROMPT_STATE_VERSION;
  readonly promptBlocks?: CanvasStoryboardPromptBlocks;
  readonly referenceMedia?: CanvasStoryboardReferenceMedia;
  readonly generationParams?: CanvasStoryboardGenerationParams;
  readonly nextCreativeState?: CanvasStoryboardNextCreativeState;
  readonly executionRefs?: CanvasStoryboardExecutionRefs;
  readonly migrationProvenance?: readonly CanvasStoryboardMigrationProvenance[];
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
  readonly version: typeof CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION;
  readonly text?: string;
  readonly baseRevision?: string;
}

export interface CanvasStoryboardActionIntent {
  readonly version: typeof CANVAS_STORYBOARD_PROMPT_STATE_VERSION;
  readonly actionId: CanvasStoryboardActionIntentId;
  readonly requestId?: string;
  readonly target: CanvasStoryboardShotTarget;
  readonly promptDocuments?: readonly CanvasStoryboardPromptDocumentRef[];
  readonly referenceMedia?: CanvasStoryboardReferenceMedia;
  readonly generationParams?: CanvasStoryboardGenerationParams;
  readonly expectedNextStateId?: string;
  readonly taskRef?: CanvasStoryboardTaskRef;
  readonly resultRef?: CanvasStoryboardResultRef;
  readonly createdAt?: number;
}

export interface CanvasStoryboardValidationOptions extends StoryboardMediaIdentityClassificationOptions {
  readonly fieldProfiles?: readonly CanvasAuthoringFieldProfileDescriptor[];
  readonly supportedAdvancedParameters?: readonly CanvasStoryboardAdvancedParameterId[];
}

export interface CanvasStoryboardLegacyShotMigrationInput extends StoryboardMediaIdentityClassificationOptions {
  readonly shotData: unknown;
  readonly nodeId?: string;
  readonly sceneNodeId?: string;
  readonly shotId?: string;
  readonly migratedAt?: number;
}

export interface CanvasStoryboardLegacyShotMigrationResult {
  readonly migrated: boolean;
  readonly promptState?: CanvasStoryboardPromptState;
  readonly diagnostics: readonly CanvasAuthoringDiagnostic[];
  readonly provenance: readonly CanvasStoryboardMigrationProvenance[];
}

export type CanvasStoryboardReviewRowSource =
  'semantic-prompt-document' | 'migration-required' | 'empty';

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

interface LegacyPromptSlotLike {
  readonly fieldId: string;
  readonly scope: string;
  readonly mediaType: string;
  readonly operation: string;
  readonly prompt: string;
}

interface MigrationPromptCandidate {
  readonly source: CanvasStoryboardMigrationSource;
  readonly sourceField: string;
  readonly text: string;
}

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

  if (record['version'] !== CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-storyboard-prompt-document-version',
        'Storyboard prompt document version is unsupported.',
        {
          target: 'version',
          expected: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
          received: record['version'],
        },
      ),
    );
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
  if (record['taskRef'] !== undefined) {
    diagnostics.push(...validateTaskRef(record['taskRef'], 'taskRef'));
  }
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
  if (record['version'] !== CANVAS_STORYBOARD_PROMPT_STATE_VERSION) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-storyboard-action-intent-version',
        'Storyboard action intent version is unsupported.',
        {
          target: 'version',
          expected: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
          received: record['version'],
        },
      ),
    );
  }
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
  if (record['taskRef'] !== undefined) {
    diagnostics.push(...validateTaskRef(record['taskRef'], 'taskRef'));
  }
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
  if (record['version'] !== CANVAS_STORYBOARD_PROMPT_STATE_VERSION) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsupported-storyboard-prompt-state-version',
        'Storyboard prompt state version is unsupported.',
        {
          target: 'version',
          expected: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
          received: record['version'],
        },
      ),
    );
  }
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
  diagnostics.push(
    ...validateMigrationProvenance(record['migrationProvenance'], 'migrationProvenance'),
  );
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

export function migrateLegacyCanvasStoryboardShot(
  input: CanvasStoryboardLegacyShotMigrationInput,
): CanvasStoryboardLegacyShotMigrationResult {
  const data = asRecord(input.shotData);
  if (!data) {
    return {
      migrated: false,
      diagnostics: [
        diagnostic(
          'error',
          'malformed-legacy-storyboard-shot',
          'Legacy storyboard shot data must be an object.',
        ),
      ],
      provenance: [],
    };
  }

  const diagnostics: CanvasAuthoringDiagnostic[] = [];
  const provenance: CanvasStoryboardMigrationProvenance[] = [];
  const migratedAt = input.migratedAt;
  const shotKey =
    readString(data, 'shotId') ??
    input.shotId ??
    input.nodeId ??
    `shot-${readNumber(data, 'shotNumber') ?? 'unknown'}`;

  const promptSlots = readLegacyPromptSlots(data['promptSlots']);
  const slotDiagnostics = validateLegacyPromptSlots(data['promptSlots']);
  diagnostics.push(...slotDiagnostics);

  const imagePromptCandidates = uniqueMigrationPromptCandidates([
    {
      source: 'imagePrompt',
      sourceField: '/imagePrompt',
      text: readString(data, 'imagePrompt'),
    },
    {
      source: 'promptSlots',
      sourceField: '/promptSlots',
      text: firstPromptSlotText(promptSlots, 'image'),
    },
    {
      source: 'shotImagePrepPlan',
      sourceField: '/shotImagePrepPlan/generationPrompt',
      text: readString(asRecord(data['shotImagePrepPlan']), 'generationPrompt'),
    },
    {
      source: 'generationPrompt',
      sourceField: '/generationPrompt',
      text: readString(data, 'generationPrompt'),
    },
  ]);
  if (imagePromptCandidates.length > 1) {
    diagnostics.push(
      diagnostic(
        'error',
        'ambiguous-legacy-prompt-authority',
        'Legacy image prompt fields conflict and require explicit user or Agent resolution before migration.',
        {
          target: 'generationPrompt',
          received: imagePromptCandidates.map((candidate) => candidate.sourceField),
          retryable: true,
        },
      ),
    );
  }
  const imagePromptCandidate = imagePromptCandidates[0];
  const imagePromptText = imagePromptCandidate?.text;
  const directVideoPrompt = readString(data, 'videoPrompt');
  const videoPromptText =
    directVideoPrompt ??
    firstPromptSlotText(promptSlots, 'video') ??
    readString(asRecord(data['generatedVideoAsset']), 'prompt') ??
    assembleLegacyVideoPrompt(data);
  const voicePromptText =
    firstPromptSlotText(promptSlots, 'audio') ??
    readString(data, 'dialogue') ??
    readString(data, 'voiceOver');

  const promptBlocks: CanvasStoryboardPromptBlocks = {
    ...(imagePromptText
      ? {
          imagePromptDocument: createMigratedPromptDocument({
            shotKey,
            blockKind: 'image',
            text: imagePromptText,
            sourceField: imagePromptCandidate.sourceField,
            migratedAt,
          }),
        }
      : {}),
    ...(videoPromptText
      ? {
          videoPromptDocument: createMigratedPromptDocument({
            shotKey,
            blockKind: 'video',
            text: videoPromptText,
            sourceField: directVideoPrompt
              ? '/videoPrompt'
              : firstPromptSlotText(promptSlots, 'video')
                ? '/promptSlots'
                : readString(asRecord(data['generatedVideoAsset']), 'prompt')
                  ? '/generatedVideoAsset/prompt'
                  : '/visualDescription',
            migratedAt,
          }),
        }
      : {}),
    ...(voicePromptText
      ? {
          voicePromptDocument: createMigratedPromptDocument({
            shotKey,
            blockKind: 'voice',
            text: voicePromptText,
            sourceField: firstPromptSlotText(promptSlots, 'audio')
              ? '/promptSlots'
              : readString(data, 'dialogue')
                ? '/dialogue'
                : '/voiceOver',
            migratedAt,
          }),
        }
      : {}),
  };

  pushProvenance(provenance, {
    migrationId: `${shotKey}:visualDescription`,
    source: 'visualDescription',
    sourceFields: ['/visualDescription', '/characterAction', '/cameraMovement', '/cameraAngle'],
    targetBlockKind: 'video',
    migratedAt,
    rawValueSummary: videoPromptText,
  });
  if (imagePromptText) {
    pushProvenance(provenance, {
      migrationId: `${shotKey}:generationPrompt`,
      source: imagePromptCandidate.source,
      sourceFields: [imagePromptCandidate.sourceField],
      targetBlockKind: 'image',
      migratedAt,
      rawValueSummary: imagePromptText,
    });
  }
  if (voicePromptText) {
    pushProvenance(provenance, {
      migrationId: `${shotKey}:voice`,
      source: readString(data, 'dialogue') ? 'dialogue' : 'promptSlots',
      sourceFields: [readString(data, 'dialogue') ? '/dialogue' : '/promptSlots'],
      targetBlockKind: 'voice',
      migratedAt,
      rawValueSummary: voicePromptText,
    });
  }

  const referenceMedia = migrateReferenceMedia(data, diagnostics, input);
  const executionRefs = migrateExecutionRefs(data, diagnostics, input);
  const generationParams = migrateGenerationParams(data);
  const nextCreativeState = resolveCanvasStoryboardNextCreativeState({
    promptBlocks,
    referenceMedia,
    generationParams,
    executionRefs,
    diagnostics,
  });
  const promptState: CanvasStoryboardPromptState = {
    version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
    ...(hasPromptBlocks(promptBlocks) ? { promptBlocks } : {}),
    ...(referenceMedia ? { referenceMedia } : {}),
    ...(generationParams ? { generationParams } : {}),
    nextCreativeState,
    ...(executionRefs ? { executionRefs } : {}),
    ...(provenance.length > 0 ? { migrationProvenance: provenance } : {}),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };

  const validation = validateCanvasStoryboardPromptState(promptState, input);
  const allDiagnostics = [...diagnostics, ...validation.diagnostics];
  return {
    migrated: validation.valid && allDiagnostics.every((item) => item.severity !== 'error'),
    promptState,
    diagnostics: allDiagnostics,
    provenance,
  };
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
    const legacyPrompt = readString(data, 'generationPrompt');
    const state = legacyPrompt ? createMigrationRequiredState() : createMissingVideoPromptState();
    const diagnosticCode = legacyPrompt
      ? 'legacy-generation-prompt-requires-migration'
      : 'missing-semantic-storyboard-prompt';
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
          legacyPrompt ? 'warning' : 'error',
          diagnosticCode,
          legacyPrompt
            ? 'Legacy generationPrompt is migration input and is not canonical storyboard prompt authority.'
            : 'Shot does not contain semantic storyboard prompt documents.',
          { target: 'storyboardPrompt', retryable: true },
        ),
      ],
      source: legacyPrompt ? 'migration-required' : 'empty',
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
    source: validation.valid ? 'semantic-prompt-document' : 'migration-required',
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
      record['version'] !== CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION ||
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

function validateTaskRef(value: unknown, target: string): readonly CanvasAuthoringDiagnostic[] {
  const record = asRecord(value);
  if (!record || !isNonEmptyString(record['source']) || !isNonEmptyString(record['sourceTaskId'])) {
    return [
      diagnostic('error', 'malformed-storyboard-task-ref', 'Storyboard task ref is malformed.', {
        target,
        received: value,
      }),
    ];
  }
  return [];
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

  const hasAgent = record['agentResult'] !== undefined;
  const hasCanvas = record['canvasRef'] !== undefined;
  const hasMedia = record['mediaRef'] !== undefined;
  if (!hasAgent && !hasCanvas && !hasMedia) {
    return [
      diagnostic(
        'error',
        'malformed-storyboard-result-ref',
        'Storyboard result ref must contain agentResult, canvasRef, or mediaRef.',
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
  if (record['taskRefs'] !== undefined) {
    if (!Array.isArray(record['taskRefs'])) {
      diagnostics.push(
        diagnostic(
          'error',
          'malformed-storyboard-task-ref',
          'Storyboard taskRefs must be an array.',
          { target: `${target}.taskRefs`, received: record['taskRefs'] },
        ),
      );
    } else {
      record['taskRefs'].forEach((item, index) => {
        diagnostics.push(...validateTaskRef(item, `${target}.taskRefs[${index}]`));
      });
    }
  }
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

function validateMigrationProvenance(
  value: unknown,
  target: string,
): readonly CanvasAuthoringDiagnostic[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return [
      diagnostic(
        'error',
        'malformed-storyboard-migration-provenance',
        'Storyboard migration provenance must be an array.',
        { target, received: value },
      ),
    ];
  }
  return value.flatMap((item, index) => {
    const record = asRecord(item);
    if (
      !record ||
      !isNonEmptyString(record['migrationId']) ||
      !isNonEmptyString(record['source']) ||
      !Array.isArray(record['sourceFields'])
    ) {
      return [
        diagnostic(
          'error',
          'malformed-storyboard-migration-provenance',
          'Storyboard migration provenance item is malformed.',
          { target: `${target}[${index}]`, received: item },
        ),
      ];
    }
    return [];
  });
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

function readLegacyPromptSlots(value: unknown): readonly LegacyPromptSlotLike[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return undefined;
      const fieldId = readString(record, 'fieldId');
      const scope = readString(record, 'scope');
      const mediaType = readString(record, 'mediaType');
      const operation = readString(record, 'operation');
      const prompt = readString(record, 'prompt');
      if (!fieldId || !scope || !mediaType || !operation || !prompt) return undefined;
      return { fieldId, scope, mediaType, operation, prompt };
    })
    .filter((item): item is LegacyPromptSlotLike => Boolean(item));
}

function validateLegacyPromptSlots(value: unknown): readonly CanvasAuthoringDiagnostic[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    return [
      diagnostic(
        'error',
        'malformed-legacy-prompt-slots',
        'Legacy promptSlots must be an array before migration.',
        { target: 'promptSlots', received: value },
      ),
    ];
  }
  const parsed = readLegacyPromptSlots(value);
  return parsed.length === value.length
    ? []
    : [
        diagnostic(
          'error',
          'malformed-legacy-prompt-slots',
          'One or more legacy promptSlots cannot be migrated safely.',
          { target: 'promptSlots', received: value.length },
        ),
      ];
}

function firstPromptSlotText(
  slots: readonly LegacyPromptSlotLike[],
  mediaType: CanvasStoryboardPromptBlockKind | 'audio',
): string | undefined {
  const normalizedMediaType = mediaType === 'voice' ? 'audio' : mediaType;
  return slots.find((slot) => slot.scope === 'shot' && slot.mediaType === normalizedMediaType)
    ?.prompt;
}

function uniqueMigrationPromptCandidates(
  candidates: readonly {
    readonly source: CanvasStoryboardMigrationSource;
    readonly sourceField: string;
    readonly text?: string;
  }[],
): readonly MigrationPromptCandidate[] {
  const unique: MigrationPromptCandidate[] = [];
  const seenText = new Set<string>();
  for (const candidate of candidates) {
    const text = candidate.text?.trim();
    if (!text) continue;
    const normalizedText = text.replace(/\s+/g, ' ');
    if (seenText.has(normalizedText)) continue;
    seenText.add(normalizedText);
    unique.push({
      source: candidate.source,
      sourceField: candidate.sourceField,
      text,
    });
  }
  return unique;
}

function createMigratedPromptDocument(input: {
  readonly shotKey: string;
  readonly blockKind: CanvasStoryboardPromptBlockKind;
  readonly text: string;
  readonly sourceField: string;
  readonly migratedAt?: number;
}): CanvasStoryboardSemanticPromptDocument {
  return {
    version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
    documentId: `${input.shotKey}:${input.blockKind}:prompt`,
    blockKind: input.blockKind,
    text: input.text,
    spans: input.text
      ? [
          {
            id: `${input.shotKey}:${input.blockKind}:legacy-span`,
            kind: input.blockKind === 'voice' ? 'voice' : 'prompt',
            range: { start: 0, end: input.text.length },
            fieldId:
              input.blockKind === 'image'
                ? 'shot.imagePrompt'
                : input.blockKind === 'video'
                  ? 'scene.videoPrompt'
                  : 'voice.dialogue',
            source: 'agent',
          },
        ]
      : [],
    fieldProjections: [
      {
        fieldId:
          input.blockKind === 'image'
            ? 'shot.imagePrompt'
            : input.blockKind === 'video'
              ? 'scene.videoPrompt'
              : 'voice.dialogue',
        value: input.text,
        sourceSpanId: `${input.shotKey}:${input.blockKind}:legacy-span`,
        alignmentState: 'in-sync',
      },
    ],
    profileId: 'canvas.storyboard.semantic-prompt',
    ...(input.migratedAt ? { updatedAt: input.migratedAt } : {}),
    baseRevision: input.sourceField,
  };
}

function migrateReferenceMedia(
  data: Record<string, unknown>,
  diagnostics: CanvasAuthoringDiagnostic[],
  options: StoryboardMediaIdentityClassificationOptions,
): CanvasStoryboardReferenceMedia | undefined {
  const mediaRefCandidates = [
    ...readUnknownArray(data['sourceMediaRefs']),
    ...readUnknownArray(data['mediaRefs']),
  ];
  if (mediaRefCandidates.length === 0) return undefined;

  const imageRefs: StoryboardMediaRef[] = [];
  const videoRefs: StoryboardMediaRef[] = [];
  const audioRefs: StoryboardMediaRef[] = [];
  for (const [index, candidate] of mediaRefCandidates.entries()) {
    const record = asRecord(candidate);
    const refTarget = readString(record, 'refId') ?? String(index);
    const refDiagnostics = validateMediaRef(candidate, `referenceMedia.${refTarget}`, options);
    diagnostics.push(...refDiagnostics);
    if (refDiagnostics.some((item) => item.severity === 'error')) continue;
    const ref = candidate as StoryboardMediaRef;
    if (isAudioRef(ref)) {
      audioRefs.push(ref);
    } else if (isVideoRef(ref)) {
      videoRefs.push(ref);
    } else {
      imageRefs.push(ref);
    }
  }

  return {
    imageRefs,
    ...(videoRefs.length > 0 ? { videoRefs } : {}),
    ...(audioRefs.length > 0 ? { audioRefs } : {}),
  };
}

function migrateExecutionRefs(
  data: Record<string, unknown>,
  diagnostics: CanvasAuthoringDiagnostic[],
  options: StoryboardMediaIdentityClassificationOptions,
): CanvasStoryboardExecutionRefs | undefined {
  const resultRefs: CanvasStoryboardResultRef[] = [];
  for (const [index, candidate] of readUnknownArray(data['generatedMediaRefs']).entries()) {
    const record = asRecord(candidate);
    const refTarget = readString(record, 'refId') ?? String(index);
    const refDiagnostics = validateMediaRef(candidate, `generatedMediaRefs.${refTarget}`, options);
    diagnostics.push(...refDiagnostics);
    if (refDiagnostics.some((item) => item.severity === 'error')) continue;
    resultRefs.push({ mediaRef: candidate as StoryboardMediaRef });
  }
  return resultRefs.length > 0 ? { resultRefs } : undefined;
}

function migrateGenerationParams(
  data: Record<string, unknown>,
): CanvasStoryboardGenerationParams | undefined {
  const duration = readNumber(data, 'duration');
  const dialogue = readString(data, 'dialogue');
  const voiceOver = readString(data, 'voiceOver');
  if (duration === undefined && !dialogue && !voiceOver) return undefined;
  return {
    ...(duration !== undefined ? { duration } : {}),
    ...(dialogue ? { dialogue } : {}),
    ...(voiceOver ? { voiceOver } : {}),
  };
}

function assembleLegacyVideoPrompt(data: Record<string, unknown>): string | undefined {
  const parts = [
    readString(data, 'visualDescription'),
    summarizeLegacyCharacters(data['characters']),
    readString(data, 'characterAction'),
    readString(data, 'shotScale'),
    readString(data, 'cameraAngle'),
    readString(data, 'cameraMovement'),
    readString(data, 'visualStyle'),
    readString(data, 'dialogue') ? `Dialogue: ${readString(data, 'dialogue')}` : undefined,
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join('. ') : undefined;
}

function summarizeLegacyCharacters(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value
    .map((item) => {
      const record = asRecord(item);
      if (!record) return undefined;
      const name = readString(record, 'characterName') ?? readString(record, 'name');
      const action = readString(record, 'action');
      const appearance = readString(record, 'appearanceNotes');
      const details = [action, appearance].filter((part): part is string => Boolean(part));
      if (!name) return details.join(', ') || undefined;
      return details.length > 0 ? `${name} (${details.join(', ')})` : name;
    })
    .filter((part): part is string => Boolean(part));
  return names.length > 0 ? `Characters: ${names.join(', ')}` : undefined;
}

function readUnknownArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function pushProvenance(
  provenance: CanvasStoryboardMigrationProvenance[],
  item: CanvasStoryboardMigrationProvenance,
): void {
  if (!item.rawValueSummary) return;
  provenance.push(item);
}

function hasPromptBlocks(blocks: CanvasStoryboardPromptBlocks): boolean {
  return Boolean(
    blocks.imagePromptDocument || blocks.videoPromptDocument || blocks.voicePromptDocument,
  );
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

function createMigrationRequiredState(): CanvasStoryboardNextCreativeState {
  return {
    id: 'legacy-migration-required',
    label: 'Migrate prompt document',
    severity: 'warning',
    target: 'prompt-alignment',
    nextActionId: 'fix-alignment',
    blocker: 'Legacy generationPrompt must be migrated before prompt-first authoring.',
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

function isAudioRef(ref: StoryboardMediaRef): boolean {
  return ref.mimeType?.startsWith('audio/') ?? false;
}

function isVideoRef(ref: StoryboardMediaRef): boolean {
  return ref.mimeType?.startsWith('video/') ?? false;
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
