import type {
  ArtifactAction,
  ArtifactDiagnostic,
  ArtifactJsonRecord,
  ArtifactJsonValue,
  ArtifactMediaItem,
  ArtifactPathSegment,
  ArtifactProfileDescriptor,
  GenericTable,
  GenericTableCell,
  GenericTableColumn,
  GenericTableRow,
} from './composite-artifact';
import type { CreativeEntityRef } from './creative-entity-asset-composition';
import { MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID } from './media-production';
import type { PerceptionCardRef } from './media-semantic-index';
import type {
  StoryboardMediaRef,
  StoryboardSceneRow,
  StoryboardShotImageStrategy,
  StoryboardShotRow,
  StoryboardTable,
} from './storyboard-table';

export const SHOT_IMAGE_PREP_SCHEMA_VERSION = 1 as const;
export const SHOT_IMAGE_PREP_KIND = 'shot-image-prep-plan' as const;
export const SHOT_IMAGE_PREP_PROFILE_VERSION = 1 as const;

export const SHOT_IMAGE_PREP_OPERATIONS = [
  'crop-panel',
  'rotate',
  'split-panels',
  'remove-text',
  'inpaint',
  'outpaint',
  'colorize',
  'upscale',
  'style-normalize',
  'redraw',
  'generate-keyframe',
] as const;

export const SHOT_IMAGE_PREP_COMIC_IMAGE_AUDIT_EXTENSION_KEY = 'neko.comicImageAudit' as const;

export const SHOT_IMAGE_PREP_COMIC_IMAGE_AUDIT_ORIENTATIONS = [
  'ok',
  'rotate-90',
  'rotate-180',
  'rotate-270',
  'unknown',
] as const;

export const SHOT_IMAGE_PREP_STATUSES = [
  'planned',
  'needs-approval',
  'approved',
  'queued',
  'running',
  'succeeded',
  'failed',
  'skipped',
] as const;

export const SHOT_IMAGE_PREP_RETRY_REASONS = [
  'provider-timeout',
  'rate-limit',
  'transient-error',
] as const;

export const SHOT_IMAGE_PREP_FAILURE_POLICIES = [
  'stop-on-first-failure',
  'continue',
  'continue-approved-only',
] as const;

export const SHOT_IMAGE_PREP_PROFILE_ACTIONS = [
  'approve-shot-prep',
  'reject-shot-prep',
  'edit-shot-prep',
  'estimate-batch-cost',
  'run-shot-prep',
  'run-approved-shot-prep-batch',
] as const;

export type ShotImagePrepOperation = (typeof SHOT_IMAGE_PREP_OPERATIONS)[number];

export type ShotImagePrepStatus = (typeof SHOT_IMAGE_PREP_STATUSES)[number];

export type ShotImagePrepRetryReason = (typeof SHOT_IMAGE_PREP_RETRY_REASONS)[number];

export type ShotImagePrepFailurePolicy = (typeof SHOT_IMAGE_PREP_FAILURE_POLICIES)[number];

export type ShotImagePrepProfileActionId = (typeof SHOT_IMAGE_PREP_PROFILE_ACTIONS)[number];

export type ShotImagePrepComicImageAuditOrientation =
  (typeof SHOT_IMAGE_PREP_COMIC_IMAGE_AUDIT_ORIENTATIONS)[number];

export type ShotImageRegenerationRecommendationDecision =
  'not-needed' | 'transform-source' | 'regenerate' | 'blocked' | 'unknown';

export interface ShotImageRegenerationRecommendation {
  readonly decision: ShotImageRegenerationRecommendationDecision;
  readonly label: string;
  readonly reason: string;
  readonly confidence?: number;
}

export type ShotImagePrepDiagnosticCode =
  | 'invalid-root'
  | 'invalid-schema-version'
  | 'invalid-kind'
  | 'missing-required-field'
  | 'invalid-required-field'
  | 'invalid-image-strategy'
  | 'invalid-operation'
  | 'invalid-status'
  | 'invalid-source-ref'
  | 'unsafe-runtime-handle'
  | 'non-serializable-value'
  | 'oversized-payload'
  | 'invalid-entity-ref'
  | 'missing-perception-card'
  | 'missing-cost-estimate'
  | 'budget-exceeded'
  | 'missing-capability'
  | 'provider-unavailable';

export interface ShotImagePrepDiagnostic {
  readonly severity: 'error' | 'warning' | 'info' | 'suggestion';
  readonly code: ShotImagePrepDiagnosticCode;
  readonly path: readonly ArtifactPathSegment[];
  readonly message: string;
  readonly expected?: string;
  readonly actual?: ShotImagePrepJsonValue;
  readonly details?: ShotImagePrepJsonRecord;
}

export interface ShotImagePrepValidationOptions {
  readonly maxSerializedBytes?: number;
  readonly maxDiagnostics?: number;
  readonly requirePerceptionForSourceBacked?: boolean;
}

export interface ShotImagePrepValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly ShotImagePrepDiagnostic[];
}

export type ShotImagePrepJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly ShotImagePrepJsonValue[]
  | { readonly [key: string]: ShotImagePrepJsonValue };

export type ShotImagePrepJsonRecord = {
  readonly [key: string]: ShotImagePrepJsonValue;
};

export interface CharacterReferenceRef {
  readonly entityRef: CreativeEntityRef;
  readonly role?:
    'identity' | 'appearance' | 'outfit' | 'expression' | 'pose' | 'voice' | 'continuity';
  readonly assetRefs?: readonly StoryboardMediaRef[];
  readonly memoryObservationIds?: readonly string[];
  readonly confidence?: number;
}

export interface SceneReferenceRef {
  readonly entityRef: CreativeEntityRef;
  readonly role?: 'layout' | 'lighting' | 'time-of-day' | 'mood' | 'prop-continuity' | 'continuity';
  readonly assetRefs?: readonly StoryboardMediaRef[];
  readonly semanticIndexRefs?: readonly string[];
  readonly confidence?: number;
}

export interface ShotReferenceBundle {
  readonly sourcePanelRefs?: readonly StoryboardMediaRef[];
  readonly characterRefs?: readonly CharacterReferenceRef[];
  readonly sceneRefs?: readonly SceneReferenceRef[];
  readonly styleRefs?: readonly StoryboardMediaRef[];
  readonly previousShotRefs?: readonly StoryboardMediaRef[];
  readonly continuityNotes?: readonly string[];
}

export interface ShotImagePrepPlan {
  readonly schemaVersion: typeof SHOT_IMAGE_PREP_SCHEMA_VERSION;
  readonly kind: typeof SHOT_IMAGE_PREP_KIND;
  readonly planId: string;
  readonly storyboardId?: string;
  readonly sceneId: string;
  readonly shotId: string;
  readonly sourceMediaRefs: readonly StoryboardMediaRef[];
  readonly imageStrategy: StoryboardShotImageStrategy;
  readonly operationPlan: readonly ShotImagePrepOperation[];
  readonly referenceBundle?: ShotReferenceBundle;
  readonly targetAspectRatio?: string;
  readonly targetStyle?: string;
  readonly editInstruction?: string;
  readonly generationPrompt?: string;
  readonly negativePrompt?: string;
  readonly maskRefs?: readonly StoryboardMediaRef[];
  readonly perceptionCardRefs?: readonly PerceptionCardRef[];
  readonly outputMediaRefs?: readonly StoryboardMediaRef[];
  readonly status: ShotImagePrepStatus;
  readonly diagnostics?: readonly ShotImagePrepDiagnostic[];
  readonly metadata?: ShotImagePrepJsonRecord;
}

export interface ShotImagePrepRetryPolicy {
  readonly maxAttempts: number;
  readonly retryOn: readonly ShotImagePrepRetryReason[];
}

export interface ShotImagePrepBudgetLimit {
  readonly maxEstimatedCost?: number;
  readonly maxEstimatedTokens?: number;
  readonly maxOutputImages?: number;
}

export interface ShotImagePrepBatchRequest {
  readonly batchId: string;
  readonly planIds: readonly string[];
  readonly providerId?: string;
  readonly maxConcurrency: number;
  readonly retryPolicy: ShotImagePrepRetryPolicy;
  readonly budgetLimit?: ShotImagePrepBudgetLimit;
  readonly failurePolicy: ShotImagePrepFailurePolicy;
}

export interface ShotImagePrepCostEstimate {
  readonly planId: string;
  readonly providerId?: string;
  readonly operationPlan: readonly ShotImagePrepOperation[];
  readonly estimateState?: 'known' | 'unknown' | 'unavailable';
  readonly estimatedCost?: number;
  readonly estimatedTokens?: number;
  readonly estimatedDurationMs?: number;
  readonly diagnostics?: readonly ShotImagePrepDiagnostic[];
}

export interface DeriveShotImagePrepPlansInput {
  readonly table: StoryboardTable;
  readonly storyboardId?: string;
  readonly requirePerceptionForSourceBacked?: boolean;
}

export interface DeriveShotImagePrepPlansResult {
  readonly plans: readonly ShotImagePrepPlan[];
  readonly diagnostics: readonly ShotImagePrepDiagnostic[];
}

export const SHOT_IMAGE_PREP_PROFILE: ArtifactProfileDescriptor = {
  profileId: MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
  kind: 'artifact',
  protocol: 'GenericTable',
  version: SHOT_IMAGE_PREP_PROFILE_VERSION,
  source: 'builtin',
  title: 'Shot Image Prep',
  fieldDefinitions: [
    { columnId: 'shotId', cellType: 'string', required: true },
    {
      columnId: 'sourcePanel',
      cellType: 'media-preview',
      required: false,
      resourceMediaTypes: ['image'],
    },
    {
      columnId: 'imageStrategy',
      cellType: 'enum',
      required: true,
      enumValues: ['reuse-original', 'use-as-reference', 'generate-new', 'transform-original'],
    },
    {
      columnId: 'operationPlan',
      cellType: 'tags',
      required: true,
    },
    { columnId: 'regenerationRecommendation', cellType: 'status', required: false },
    {
      columnId: 'imageAudit',
      cellType: 'json',
      required: false,
      schemaRef: 'neko.shot-image-prep.image-audit',
    },
    { columnId: 'textRemoval', cellType: 'status', required: false },
    {
      columnId: 'maskRefs',
      cellType: 'json',
      required: false,
      schemaRef: 'neko.shot-image-prep.mask-refs',
      shape: {
        requiredKeys: ['refs'],
        fieldTypes: { refs: 'array' },
      },
    },
    {
      columnId: 'referenceBundle',
      cellType: 'json',
      required: false,
      schemaRef: 'neko.shot-image-prep.reference-bundle',
      shape: {
        fieldTypes: {
          characters: 'array',
          scenes: 'array',
          styleRefs: 'array',
        },
      },
    },
    { columnId: 'generationPrompt', cellType: 'string', required: false },
    { columnId: 'videoPrompt', cellType: 'string', required: false },
    { columnId: 'targetAspectRatio', cellType: 'string', required: false },
    {
      columnId: 'output',
      cellType: 'media-preview',
      required: false,
      resourceMediaTypes: ['image'],
    },
    { columnId: 'status', cellType: 'status', required: true },
    { columnId: 'diagnostics', cellType: 'diagnostic', required: false },
  ],
  fieldGroups: [
    {
      groupId: 'shot-core',
      fieldIds: [
        'shotId',
        'sourcePanel',
        'imageStrategy',
        'operationPlan',
        'regenerationRecommendation',
        'imageAudit',
        'status',
      ],
    },
    {
      groupId: 'prep-inputs',
      fieldIds: [
        'textRemoval',
        'maskRefs',
        'referenceBundle',
        'generationPrompt',
        'targetAspectRatio',
      ],
    },
    {
      groupId: 'prep-results',
      fieldIds: ['output', 'diagnostics'],
    },
  ],
  includeFieldGroups: ['shot-core', 'prep-inputs', 'prep-results'],
  columns: [
    { columnId: 'shotId', cellType: 'string', required: true },
    {
      columnId: 'sourcePanel',
      cellType: 'media-preview',
      required: false,
      resourceMediaTypes: ['image'],
    },
    {
      columnId: 'imageStrategy',
      cellType: 'enum',
      required: true,
      enumValues: ['reuse-original', 'use-as-reference', 'generate-new', 'transform-original'],
    },
    { columnId: 'operationPlan', cellType: 'tags', required: true },
    { columnId: 'regenerationRecommendation', cellType: 'status', required: false },
    {
      columnId: 'imageAudit',
      cellType: 'json',
      required: false,
      schemaRef: 'neko.shot-image-prep.image-audit',
    },
    { columnId: 'textRemoval', cellType: 'status', required: false },
    {
      columnId: 'maskRefs',
      cellType: 'json',
      required: false,
      schemaRef: 'neko.shot-image-prep.mask-refs',
      shape: {
        requiredKeys: ['refs'],
        fieldTypes: { refs: 'array' },
      },
    },
    {
      columnId: 'referenceBundle',
      cellType: 'json',
      required: false,
      schemaRef: 'neko.shot-image-prep.reference-bundle',
      shape: {
        fieldTypes: {
          characters: 'array',
          scenes: 'array',
          styleRefs: 'array',
        },
      },
    },
    { columnId: 'generationPrompt', cellType: 'string', required: false },
    { columnId: 'videoPrompt', cellType: 'string', required: false },
    { columnId: 'targetAspectRatio', cellType: 'string', required: false },
    {
      columnId: 'output',
      cellType: 'media-preview',
      required: false,
      resourceMediaTypes: ['image'],
    },
    { columnId: 'status', cellType: 'status', required: true },
    { columnId: 'diagnostics', cellType: 'diagnostic', required: false },
  ],
  suggestedActions: [
    action('approve-shot-prep', 'review', 'Approve shot prep', 'Approve this shot prep plan.'),
    action('reject-shot-prep', 'review', 'Skip shot prep', 'Skip this shot prep plan.'),
    action(
      'edit-shot-prep',
      'review',
      'Edit shot prep',
      'Edit strategy, operations, refs, or prompts.',
    ),
    action('estimate-batch-cost', 'review', 'Estimate batch cost', 'Estimate approved prep cost.'),
    action(
      'run-shot-prep',
      'execute',
      'Run shot prep',
      'Execute this shot prep plan.',
      true,
      'high',
    ),
    action(
      'run-approved-shot-prep-batch',
      'execute',
      'Run approved prep batch',
      'Execute approved prep plans.',
      true,
      'high',
    ),
  ],
};

const SOURCE_BACKED_IMAGE_STRATEGIES: readonly StoryboardShotImageStrategy[] = [
  'reuse-original',
  'use-as-reference',
  'transform-original',
] as const;

export function validateShotImagePrepPlan(
  value: unknown,
  options: ShotImagePrepValidationOptions = {},
): ShotImagePrepValidationResult {
  const diagnostics: ShotImagePrepDiagnostic[] = [];
  validateShotImagePrepPlanValue(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function validateShotImagePrepPlans(
  values: readonly unknown[],
  options: ShotImagePrepValidationOptions = {},
): ShotImagePrepValidationResult {
  const diagnostics: ShotImagePrepDiagnostic[] = [];
  values.forEach((value, index) =>
    validateShotImagePrepPlanValue(value, [index], diagnostics, options),
  );
  return validationResult(diagnostics, options);
}

export function deriveShotImagePrepPlansFromStoryboard(
  input: DeriveShotImagePrepPlansInput,
): DeriveShotImagePrepPlansResult {
  const diagnostics: ShotImagePrepDiagnostic[] = [];
  const plans: ShotImagePrepPlan[] = [];
  for (const scene of input.table.scenes) {
    for (const shot of scene.shots) {
      const plan = deriveShotImagePrepPlanFromShot({
        scene,
        shot,
        storyboardId: input.storyboardId,
        requirePerceptionForSourceBacked: input.requirePerceptionForSourceBacked,
      });
      plans.push(plan.plan);
      diagnostics.push(...plan.diagnostics);
    }
  }
  return { plans, diagnostics };
}

export function buildShotImagePrepTable(
  plans: readonly ShotImagePrepPlan[],
  options: {
    readonly tableId?: string;
    readonly title?: string;
    readonly includeProfileVersion?: boolean;
  } = {},
): GenericTable {
  return {
    schemaVersion: 1,
    kind: 'generic-table',
    tableId: options.tableId ?? 'shot-image-prep',
    profile: MEDIA_PRODUCTION_SHOT_IMAGE_PREP_PROFILE_ID,
    ...(options.includeProfileVersion ? { profileVersion: SHOT_IMAGE_PREP_PROFILE_VERSION } : {}),
    title: options.title ?? 'Shot Image Prep',
    columns: shotImagePrepColumns(),
    rows: plans.map(projectPlanToRow),
    actions: SHOT_IMAGE_PREP_PROFILE.suggestedActions,
  };
}

export function transitionShotImagePrepStatus(
  status: ShotImagePrepStatus,
  actionId: ShotImagePrepProfileActionId,
): ShotImagePrepStatus {
  switch (actionId) {
    case 'approve-shot-prep':
      return status === 'planned' || status === 'needs-approval' || status === 'failed'
        ? 'approved'
        : status;
    case 'reject-shot-prep':
      return 'skipped';
    case 'run-shot-prep':
    case 'run-approved-shot-prep-batch':
      return status === 'approved' ? 'queued' : status;
    case 'edit-shot-prep':
      return 'needs-approval';
    case 'estimate-batch-cost':
      return status;
  }
}

export function projectShotImageRegenerationRecommendation(
  plan: Pick<ShotImagePrepPlan, 'diagnostics' | 'imageStrategy' | 'operationPlan' | 'status'>,
): ShotImageRegenerationRecommendation {
  const blockingDiagnostic = plan.diagnostics?.find((item) => item.severity === 'error');
  if (blockingDiagnostic) {
    return {
      decision: 'blocked',
      label: 'Needs input before image prep',
      reason: blockingDiagnostic.message,
      confidence: 1,
    };
  }

  if (plan.imageStrategy === 'generate-new' || hasOperation(plan, 'redraw', 'generate-keyframe')) {
    return {
      decision: 'regenerate',
      label: 'Recommend regenerating storyboard image',
      reason:
        plan.imageStrategy === 'generate-new'
          ? 'The shot is planned as a new image instead of a source-panel transform.'
          : 'The operation plan creates a new keyframe or redraw.',
      confidence: 0.9,
    };
  }

  if (
    plan.imageStrategy === 'transform-original' ||
    hasOperation(
      plan,
      'rotate',
      'split-panels',
      'remove-text',
      'inpaint',
      'outpaint',
      'colorize',
      'upscale',
      'style-normalize',
    )
  ) {
    return {
      decision: 'transform-source',
      label: 'Recommend editing source image',
      reason: 'The shot can preserve source composition through image transform operations.',
      confidence: 0.85,
    };
  }

  if (plan.imageStrategy === 'reuse-original') {
    return {
      decision: 'not-needed',
      label: 'Reuse source image',
      reason: 'The shot is planned to reuse the original panel with minimal preparation.',
      confidence: 0.8,
    };
  }

  return {
    decision: 'unknown',
    label: 'Review image prep recommendation',
    reason: `No deterministic recommendation is available for status ${plan.status}.`,
  };
}

function deriveShotImagePrepPlanFromShot(input: {
  readonly scene: StoryboardSceneRow;
  readonly shot: StoryboardShotRow;
  readonly storyboardId?: string;
  readonly requirePerceptionForSourceBacked?: boolean;
}): { readonly plan: ShotImagePrepPlan; readonly diagnostics: readonly ShotImagePrepDiagnostic[] } {
  const shotId = input.shot.shotId ?? `${input.scene.sceneId}-shot-${input.shot.shotNumber}`;
  const sourceMediaRefs = input.shot.sourceMediaRefs ?? [];
  const diagnostics: ShotImagePrepDiagnostic[] = [];
  const sourceBacked = SOURCE_BACKED_IMAGE_STRATEGIES.includes(input.shot.imageStrategy);
  const referenceBundle = buildReferenceBundle(input.shot);
  const maskRefs = sourceMediaRefs.filter((ref) => ref.role === 'mask');
  const perceptionCardRefs = readPerceptionRefs(input.shot);
  const comicImageAudit = readComicImageAudit(input.shot);
  const operationPlan = mergeShotImagePrepOperations(
    defaultOperationsForStrategy(input.shot.imageStrategy),
    sourceBacked || sourceMediaRefs.length > 0
      ? operationsFromComicImageAudit(comicImageAudit)
      : [],
  );
  if (sourceBacked && sourceMediaRefs.length === 0) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-source-ref',
        ['sourceMediaRefs'],
        `${input.shot.imageStrategy} prep requires sourceMediaRefs.`,
      ),
    );
  }
  if (input.requirePerceptionForSourceBacked && sourceBacked && perceptionCardRefs.length === 0) {
    diagnostics.push(
      diagnostic(
        'warning',
        'missing-perception-card',
        ['perceptionCardRefs'],
        'Source-backed shot prep has no perception card refs.',
      ),
    );
  }

  const plan: ShotImagePrepPlan = {
    schemaVersion: SHOT_IMAGE_PREP_SCHEMA_VERSION,
    kind: SHOT_IMAGE_PREP_KIND,
    planId: `${shotId}-image-prep`,
    ...(input.storyboardId ? { storyboardId: input.storyboardId } : {}),
    sceneId: input.scene.sceneId,
    shotId,
    sourceMediaRefs,
    imageStrategy: input.shot.imageStrategy,
    operationPlan,
    ...(referenceBundle ? { referenceBundle } : {}),
    ...(input.shot.visualStyle ? { targetStyle: input.shot.visualStyle } : {}),
    ...(input.shot.generationPrompt ? { generationPrompt: input.shot.generationPrompt } : {}),
    ...(input.shot.visualDescription ? { editInstruction: input.shot.visualDescription } : {}),
    ...(maskRefs.length > 0 ? { maskRefs } : {}),
    ...(perceptionCardRefs.length > 0 ? { perceptionCardRefs } : {}),
    status: diagnostics.some((item) => item.severity === 'error') ? 'needs-approval' : 'planned',
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
  };
  const recommendation = projectShotImageRegenerationRecommendation(plan);
  const metadata: ShotImagePrepJsonRecord = {
    ...(comicImageAudit ? { imageAudit: comicImageAudit } : {}),
    regenerationRecommendation: recommendationToJson(recommendation),
  };
  return {
    plan: {
      ...plan,
      metadata,
    },
    diagnostics,
  };
}

function defaultOperationsForStrategy(
  strategy: StoryboardShotImageStrategy,
): readonly ShotImagePrepOperation[] {
  switch (strategy) {
    case 'reuse-original':
      return ['crop-panel'];
    case 'transform-original':
      return ['crop-panel', 'remove-text', 'inpaint'];
    case 'use-as-reference':
      return ['generate-keyframe'];
    case 'generate-new':
      return ['generate-keyframe'];
  }
}

const SHOT_IMAGE_PREP_OPERATION_ORDER: readonly ShotImagePrepOperation[] = [
  'crop-panel',
  'rotate',
  'split-panels',
  'remove-text',
  'inpaint',
  'outpaint',
  'colorize',
  'upscale',
  'style-normalize',
  'redraw',
  'generate-keyframe',
] as const;

function mergeShotImagePrepOperations(
  ...operationGroups: readonly (readonly ShotImagePrepOperation[])[]
): readonly ShotImagePrepOperation[] {
  const selected = new Set<ShotImagePrepOperation>();
  for (const operations of operationGroups) {
    for (const operation of operations) {
      selected.add(operation);
    }
  }
  return SHOT_IMAGE_PREP_OPERATION_ORDER.filter((operation) => selected.has(operation));
}

function operationsFromComicImageAudit(
  audit: ShotImagePrepJsonRecord | undefined,
): readonly ShotImagePrepOperation[] {
  if (!audit) return [];
  const operations: ShotImagePrepOperation[] = [];
  const orientation = audit['orientation'];
  if (
    audit['requiresRotation'] === true ||
    orientation === 'rotate-90' ||
    orientation === 'rotate-180' ||
    orientation === 'rotate-270'
  ) {
    operations.push('rotate');
  }
  if (
    audit['requiresSplit'] === true ||
    positiveNumberValue(audit, 'panelCount') > 1 ||
    positiveNumberValue(audit, 'derivedShotCount') > 1
  ) {
    operations.push('split-panels');
  }
  if (audit['requiresTextRemoval'] === true) operations.push('remove-text');
  if (audit['requiresInpaint'] === true) operations.push('inpaint');
  if (audit['requiresOutpaint'] === true) operations.push('outpaint');
  if (audit['requiresColorize'] === true) operations.push('colorize');
  if (audit['requiresUpscale'] === true) operations.push('upscale');
  if (audit['requiresStyleNormalize'] === true) operations.push('style-normalize');
  if (audit['requiresRedraw'] === true) operations.push('redraw');
  if (audit['requiresKeyframeGeneration'] === true) operations.push('generate-keyframe');
  const requiredOperations = audit['requiredOperations'];
  if (Array.isArray(requiredOperations)) {
    for (const operation of requiredOperations) {
      if (isShotImagePrepOperation(operation)) operations.push(operation);
    }
  }
  return mergeShotImagePrepOperations(operations);
}

function positiveNumberValue(record: ShotImagePrepJsonRecord, key: string): number {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function hasOperation(
  plan: Pick<ShotImagePrepPlan, 'operationPlan'>,
  ...operations: readonly ShotImagePrepOperation[]
): boolean {
  return operations.some((operation) => plan.operationPlan.includes(operation));
}

function recommendationToJson(
  recommendation: ShotImageRegenerationRecommendation,
): ShotImagePrepJsonRecord {
  return {
    decision: recommendation.decision,
    label: recommendation.label,
    reason: recommendation.reason,
    ...(recommendation.confidence !== undefined ? { confidence: recommendation.confidence } : {}),
  };
}

function buildReferenceBundle(shot: StoryboardShotRow): ShotReferenceBundle | undefined {
  const characterRefs = (shot.characters ?? []).flatMap(
    (character): readonly CharacterReferenceRef[] =>
      character.entityRef
        ? [
            {
              entityRef: character.entityRef,
              role: 'continuity',
            },
          ]
        : [],
  );
  const sourcePanelRefs = shot.sourceMediaRefs?.filter((ref) => ref.role !== 'mask') ?? [];
  if (characterRefs.length === 0 && sourcePanelRefs.length === 0) return undefined;
  return {
    ...(sourcePanelRefs.length > 0 ? { sourcePanelRefs } : {}),
    ...(characterRefs.length > 0 ? { characterRefs } : {}),
  };
}

function readPerceptionRefs(shot: StoryboardShotRow): readonly PerceptionCardRef[] {
  const extension = shot.extensions?.['neko.perception'];
  if (!isRecord(extension)) return [];
  const refs = extension['perceptionCardRefs'];
  if (!Array.isArray(refs)) return [];
  return refs.flatMap((ref): readonly PerceptionCardRef[] =>
    isPerceptionCardRef(ref) ? [ref] : [],
  );
}

function readComicImageAudit(shot: StoryboardShotRow): ShotImagePrepJsonRecord | undefined {
  const extension = shot.extensions?.[SHOT_IMAGE_PREP_COMIC_IMAGE_AUDIT_EXTENSION_KEY];
  if (!isRecord(extension)) return undefined;

  const audit: Record<string, ShotImagePrepJsonValue> = {};
  copyString(extension, audit, 'sourceImageGroupId');
  copyString(extension, audit, 'sourcePageRefId');
  copyString(extension, audit, 'sourcePanelId');
  copyString(extension, audit, 'panelId');
  copyString(extension, audit, 'notes');
  copyComicImageAuditOrientation(extension, audit);
  copyPositiveNumber(extension, audit, 'panelCount');
  copyPositiveNumber(extension, audit, 'derivedShotCount');
  copyBoolean(extension, audit, 'requiresRotation');
  copyBoolean(extension, audit, 'requiresSplit');
  copyBoolean(extension, audit, 'requiresTextRemoval');
  copyBoolean(extension, audit, 'requiresInpaint');
  copyBoolean(extension, audit, 'requiresOutpaint');
  copyBoolean(extension, audit, 'requiresColorize');
  copyBoolean(extension, audit, 'requiresUpscale');
  copyBoolean(extension, audit, 'requiresStyleNormalize');
  copyBoolean(extension, audit, 'requiresRedraw');
  copyBoolean(extension, audit, 'requiresKeyframeGeneration');
  const cropBBox = extension['cropBBox'];
  if (isRecord(cropBBox) && isJsonValue(cropBBox)) audit['cropBBox'] = cropBBox;
  const requiredOperations = extension['requiredOperations'];
  if (Array.isArray(requiredOperations)) {
    const operations = requiredOperations.filter(isShotImagePrepOperation);
    if (operations.length > 0) audit['requiredOperations'] = operations;
  }

  return Object.keys(audit).length > 0 ? audit : undefined;
}

function copyString(
  source: Record<string, unknown>,
  target: Record<string, ShotImagePrepJsonValue>,
  key: string,
): void {
  const value = source[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    target[key] = value;
  }
}

function copyBoolean(
  source: Record<string, unknown>,
  target: Record<string, ShotImagePrepJsonValue>,
  key: string,
): void {
  const value = source[key];
  if (typeof value === 'boolean') {
    target[key] = value;
  }
}

function copyPositiveNumber(
  source: Record<string, unknown>,
  target: Record<string, ShotImagePrepJsonValue>,
  key: string,
): void {
  const value = source[key];
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    target[key] = value;
  }
}

function copyComicImageAuditOrientation(
  source: Record<string, unknown>,
  target: Record<string, ShotImagePrepJsonValue>,
): void {
  const value = source['orientation'];
  if (
    typeof value === 'string' &&
    SHOT_IMAGE_PREP_COMIC_IMAGE_AUDIT_ORIENTATIONS.includes(
      value as ShotImagePrepComicImageAuditOrientation,
    )
  ) {
    target['orientation'] = value;
  }
}

function projectPlanToRow(plan: ShotImagePrepPlan): GenericTableRow {
  const recommendation = projectShotImageRegenerationRecommendation(plan);
  const cells: Record<string, GenericTableCell> = {
    shotId: { type: 'string', value: plan.shotId },
    imageStrategy: { type: 'enum', value: plan.imageStrategy },
    operationPlan: { type: 'tags', value: plan.operationPlan },
    regenerationRecommendation: { type: 'status', value: recommendation.label },
    status: { type: 'status', value: plan.status },
  };
  const sourcePanel = mediaRefToMediaItem(plan.sourceMediaRefs.find((ref) => ref.role !== 'mask'));
  if (sourcePanel) cells['sourcePanel'] = { type: 'media-preview', value: sourcePanel };
  const imageAudit = readImageAuditMetadata(plan);
  if (imageAudit) {
    cells['imageAudit'] = {
      type: 'json',
      value: imageAudit,
      schemaRef: 'neko.shot-image-prep.image-audit',
    };
  }
  if (plan.maskRefs && plan.maskRefs.length > 0) {
    cells['maskRefs'] = { type: 'json', value: { refs: plan.maskRefs.map(mediaRefToJson) } };
  }
  if (plan.referenceBundle) {
    cells['referenceBundle'] = {
      type: 'json',
      value: referenceBundleToJson(plan.referenceBundle),
    };
  }
  if (plan.generationPrompt) {
    cells['generationPrompt'] = { type: 'string', value: plan.generationPrompt };
  }
  if (plan.targetAspectRatio) {
    cells['targetAspectRatio'] = { type: 'string', value: plan.targetAspectRatio };
  }
  const output = mediaRefToMediaItem(plan.outputMediaRefs?.[0]);
  if (output) cells['output'] = { type: 'media-preview', value: output };
  if (plan.diagnostics?.[0]) {
    cells['diagnostics'] = {
      type: 'diagnostic',
      value: prepDiagnosticToArtifact(plan.diagnostics[0]),
    };
  }
  return {
    rowId: plan.planId,
    cells,
    diagnostics: plan.diagnostics?.map(prepDiagnosticToArtifact),
    metadata: {
      planId: plan.planId,
      sceneId: plan.sceneId,
      shotId: plan.shotId,
      status: plan.status,
      regenerationRecommendation: recommendationToJson(recommendation),
      ...(imageAudit ? { imageAudit } : {}),
    },
  };
}

function readImageAuditMetadata(plan: ShotImagePrepPlan): ArtifactJsonValue | undefined {
  const imageAudit = plan.metadata?.['imageAudit'];
  return imageAudit !== undefined && isJsonValue(imageAudit) ? imageAudit : undefined;
}

function shotImagePrepColumns(): readonly GenericTableColumn[] {
  return [
    { columnId: 'shotId', label: 'Shot', cellType: 'string', required: true },
    { columnId: 'sourcePanel', label: 'Source', cellType: 'media-preview' },
    {
      columnId: 'imageStrategy',
      label: 'Strategy',
      cellType: 'enum',
      required: true,
      enumValues: ['reuse-original', 'use-as-reference', 'generate-new', 'transform-original'],
    },
    { columnId: 'operationPlan', label: 'Operations', cellType: 'tags', required: true },
    {
      columnId: 'regenerationRecommendation',
      label: 'Image Recommendation',
      cellType: 'status',
    },
    {
      columnId: 'imageAudit',
      label: 'Image Audit',
      cellType: 'json',
      schemaRef: 'neko.shot-image-prep.image-audit',
    },
    { columnId: 'textRemoval', label: 'Text', cellType: 'status' },
    {
      columnId: 'maskRefs',
      label: 'Masks',
      cellType: 'json',
      schemaRef: 'neko.shot-image-prep.mask-refs',
    },
    {
      columnId: 'referenceBundle',
      label: 'References',
      cellType: 'json',
      schemaRef: 'neko.shot-image-prep.reference-bundle',
    },
    { columnId: 'generationPrompt', label: 'Image Prompt', cellType: 'string' },
    { columnId: 'videoPrompt', label: 'Video Prompt', cellType: 'string' },
    { columnId: 'targetAspectRatio', label: 'Aspect', cellType: 'string' },
    { columnId: 'output', label: 'Output', cellType: 'media-preview' },
    { columnId: 'status', label: 'Status', cellType: 'status', required: true },
    { columnId: 'diagnostics', label: 'Diagnostics', cellType: 'diagnostic' },
  ];
}

function validateShotImagePrepPlanValue(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ShotImagePrepDiagnostic[],
  options: ShotImagePrepValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-root', path, 'Shot image prep plan must be an object.'),
    );
    return;
  }
  validateLiteral(
    value['schemaVersion'],
    SHOT_IMAGE_PREP_SCHEMA_VERSION,
    [...path, 'schemaVersion'],
    'invalid-schema-version',
    diagnostics,
  );
  validateLiteral(
    value['kind'],
    SHOT_IMAGE_PREP_KIND,
    [...path, 'kind'],
    'invalid-kind',
    diagnostics,
  );
  requireString(value['planId'], [...path, 'planId'], diagnostics);
  requireString(value['sceneId'], [...path, 'sceneId'], diagnostics);
  requireString(value['shotId'], [...path, 'shotId'], diagnostics);
  validateImageStrategy(value['imageStrategy'], [...path, 'imageStrategy'], diagnostics);
  validateOperations(value['operationPlan'], [...path, 'operationPlan'], diagnostics);
  validateStatus(value['status'], [...path, 'status'], diagnostics);
  validateSerializable(value, path, diagnostics, options);

  const strategy = value['imageStrategy'];
  const sourceRefs = Array.isArray(value['sourceMediaRefs']) ? value['sourceMediaRefs'] : [];
  if (!Array.isArray(value['sourceMediaRefs'])) {
    diagnostics.push(missing([...path, 'sourceMediaRefs'], 'sourceMediaRefs'));
  }
  if (isSourceBackedStrategy(strategy) && sourceRefs.length === 0) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-source-ref',
        [...path, 'sourceMediaRefs'],
        `${strategy} requires sourceMediaRefs.`,
      ),
    );
  }
  validateMediaRefs(sourceRefs, [...path, 'sourceMediaRefs'], diagnostics);
  validateMediaRefs(arrayValue(value['maskRefs']), [...path, 'maskRefs'], diagnostics);
  const outputRefs = arrayValue(value['outputMediaRefs']);
  validateMediaRefs(outputRefs, [...path, 'outputMediaRefs'], diagnostics);
  if (outputRefs.length > 0 && value['status'] !== 'succeeded') {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-required-field',
        [...path, 'outputMediaRefs'],
        'Shot image prep output refs can only be recorded after succeeded execution.',
        {
          expected: 'status: succeeded',
          actual: diagnosticValue(value['status']),
        },
      ),
    );
  }
  validateReferenceBundle(value['referenceBundle'], [...path, 'referenceBundle'], diagnostics);
  validatePerceptionRefs(value['perceptionCardRefs'], [...path, 'perceptionCardRefs'], diagnostics);
  if (
    options.requirePerceptionForSourceBacked &&
    isSourceBackedStrategy(strategy) &&
    arrayValue(value['perceptionCardRefs']).length === 0
  ) {
    diagnostics.push(
      diagnostic(
        'warning',
        'missing-perception-card',
        [...path, 'perceptionCardRefs'],
        'Source-backed shot image prep should cite perception card refs when available.',
      ),
    );
  }
}

function validateReferenceBundle(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ShotImagePrepDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(invalid(path, 'object', value));
    return;
  }
  validateMediaRefs(
    arrayValue(value['sourcePanelRefs']),
    [...path, 'sourcePanelRefs'],
    diagnostics,
  );
  validateMediaRefs(arrayValue(value['styleRefs']), [...path, 'styleRefs'], diagnostics);
  validateMediaRefs(
    arrayValue(value['previousShotRefs']),
    [...path, 'previousShotRefs'],
    diagnostics,
  );
  for (const [index, ref] of arrayValue(value['characterRefs']).entries()) {
    validateCreativeEntityWrapper(ref, [...path, 'characterRefs', index], 'character', diagnostics);
  }
  for (const [index, ref] of arrayValue(value['sceneRefs']).entries()) {
    validateCreativeEntityWrapper(ref, [...path, 'sceneRefs', index], 'scene', diagnostics);
  }
}

function validateCreativeEntityWrapper(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  expectedKind: 'character' | 'scene',
  diagnostics: ShotImagePrepDiagnostic[],
): void {
  if (!isRecord(value) || !isRecord(value['entityRef'])) {
    diagnostics.push(missing([...path, 'entityRef'], 'entityRef'));
    return;
  }
  const entityKind = value['entityRef']['entityKind'];
  const ok =
    expectedKind === 'character'
      ? entityKind === 'character'
      : entityKind === 'scene' || entityKind === 'location';
  if (!ok) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-entity-ref',
        [...path, 'entityRef', 'entityKind'],
        `${expectedKind} reference uses the wrong entity kind.`,
        {
          expected: expectedKind === 'character' ? 'character' : 'scene or location',
          actual: diagnosticValue(entityKind),
        },
      ),
    );
  }
  validateSerializable(value, path, diagnostics, {});
}

function validatePerceptionRefs(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ShotImagePrepDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(invalid(path, 'array', value));
    return;
  }
  for (const [index, ref] of value.entries()) {
    if (!isPerceptionCardRef(ref)) {
      diagnostics.push(invalid([...path, index], 'PerceptionCardRef', ref));
    }
  }
}

function validateMediaRefs(
  refs: readonly unknown[],
  path: readonly ArtifactPathSegment[],
  diagnostics: ShotImagePrepDiagnostic[],
): void {
  for (const [index, ref] of refs.entries()) {
    if (!isRecord(ref)) {
      diagnostics.push(invalid([...path, index], 'StoryboardMediaRef', ref));
      continue;
    }
    const locator = ref['locator'];
    if (!isRecord(locator)) {
      diagnostics.push(missing([...path, index, 'locator'], 'locator'));
      continue;
    }
    validateSerializable(ref, [...path, index], diagnostics, {});
    validateMediaLocator(locator, [...path, index, 'locator'], diagnostics);
  }
}

function validateMediaLocator(
  locator: Record<string, unknown>,
  path: readonly ArtifactPathSegment[],
  diagnostics: ShotImagePrepDiagnostic[],
): void {
  const type = locator['type'];
  switch (type) {
    case 'tool-result':
      if (typeof locator['toolCallId'] !== 'string' || locator['toolCallId'].trim().length === 0) {
        diagnostics.push(
          invalid([...path, 'toolCallId'], 'non-empty string', locator['toolCallId']),
        );
      }
      return;
    case 'asset':
      if (typeof locator['assetId'] !== 'string' || locator['assetId'].trim().length === 0) {
        diagnostics.push(invalid([...path, 'assetId'], 'non-empty string', locator['assetId']));
      }
      if (typeof locator['uri'] === 'string' && isUnsafeRuntimeHandle(locator['uri'])) {
        diagnostics.push(unsafe([...path, 'uri'], locator['uri']));
      }
      return;
    case 'workspace-path':
      if (typeof locator['path'] !== 'string' || locator['path'].trim().length === 0) {
        diagnostics.push(invalid([...path, 'path'], 'non-empty string', locator['path']));
      } else if (isUnsafeRuntimeHandle(locator['path'])) {
        diagnostics.push(unsafe([...path, 'path'], locator['path']));
      }
      return;
    case 'canvas-node':
      if (
        typeof locator['canvasNodeId'] !== 'string' ||
        locator['canvasNodeId'].trim().length === 0
      ) {
        diagnostics.push(
          invalid([...path, 'canvasNodeId'], 'non-empty string', locator['canvasNodeId']),
        );
      }
      return;
    case 'story-source':
      if (typeof locator['storyId'] !== 'string' || locator['storyId'].trim().length === 0) {
        diagnostics.push(invalid([...path, 'storyId'], 'non-empty string', locator['storyId']));
      }
      return;
    default:
      diagnostics.push(invalid([...path, 'type'], 'StoryboardMediaLocator type', type));
  }
}

function validateImageStrategy(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ShotImagePrepDiagnostic[],
): void {
  if (
    value !== 'reuse-original' &&
    value !== 'use-as-reference' &&
    value !== 'generate-new' &&
    value !== 'transform-original'
  ) {
    diagnostics.push(invalid(path, 'storyboard image strategy', value, 'invalid-image-strategy'));
  }
}

function validateOperations(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ShotImagePrepDiagnostic[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(invalid(path, 'non-empty operation array', value));
    return;
  }
  for (const [index, operation] of value.entries()) {
    if (!isShotImagePrepOperation(operation)) {
      diagnostics.push(
        invalid(
          [...path, index],
          SHOT_IMAGE_PREP_OPERATIONS.join(', '),
          operation,
          'invalid-operation',
        ),
      );
    }
  }
}

function validateStatus(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ShotImagePrepDiagnostic[],
): void {
  if (!isShotImagePrepStatus(value)) {
    diagnostics.push(invalid(path, SHOT_IMAGE_PREP_STATUSES.join(', '), value, 'invalid-status'));
  }
}

function validateLiteral(
  actual: unknown,
  expected: string | number,
  path: readonly ArtifactPathSegment[],
  code: ShotImagePrepDiagnosticCode,
  diagnostics: ShotImagePrepDiagnostic[],
): void {
  if (actual !== expected) {
    diagnostics.push(
      diagnostic('error', code, path, `Expected ${String(expected)}.`, {
        expected: String(expected),
        actual: diagnosticValue(actual),
      }),
    );
  }
}

function requireString(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ShotImagePrepDiagnostic[],
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push(invalid(path, 'non-empty string', value));
  }
}

function validateSerializable(
  value: unknown,
  path: readonly ArtifactPathSegment[],
  diagnostics: ShotImagePrepDiagnostic[],
  options: ShotImagePrepValidationOptions,
): void {
  const unsafe = findUnsafeRuntimeHandle(value);
  if (unsafe) {
    diagnostics.push(unsafeDiagnostic([...path, ...unsafe.path], unsafe.value));
  }
  const byteLength = jsonByteLength(value);
  const maxBytes = options.maxSerializedBytes ?? 65_536;
  if (byteLength > maxBytes) {
    diagnostics.push(
      diagnostic('error', 'oversized-payload', path, 'Shot image prep payload is too large.', {
        expected: `<= ${maxBytes} bytes`,
        actual: byteLength,
      }),
    );
  }
  if (!isJsonValue(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'non-serializable-value',
        path,
        'Shot image prep payload must be JSON-serializable.',
      ),
    );
  }
}

function isShotImagePrepOperation(value: unknown): value is ShotImagePrepOperation {
  return (
    typeof value === 'string' &&
    SHOT_IMAGE_PREP_OPERATIONS.includes(value as ShotImagePrepOperation)
  );
}

function isShotImagePrepStatus(value: unknown): value is ShotImagePrepStatus {
  return (
    typeof value === 'string' && SHOT_IMAGE_PREP_STATUSES.includes(value as ShotImagePrepStatus)
  );
}

function isSourceBackedStrategy(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    SOURCE_BACKED_IMAGE_STRATEGIES.includes(value as StoryboardShotImageStrategy)
  );
}

function isPerceptionCardRef(value: unknown): value is PerceptionCardRef {
  return (
    isRecord(value) &&
    typeof value['assetId'] === 'string' &&
    value['assetId'].trim().length > 0 &&
    (value['cacheKey'] === undefined || typeof value['cacheKey'] === 'string') &&
    (value['sourceToolCallId'] === undefined || typeof value['sourceToolCallId'] === 'string') &&
    (value['contextPacketId'] === undefined || typeof value['contextPacketId'] === 'string') &&
    (value['createdAt'] === undefined || typeof value['createdAt'] === 'number')
  );
}

function mediaRefToMediaItem(ref: StoryboardMediaRef | undefined): ArtifactMediaItem | undefined {
  if (!ref) return undefined;
  const resourceRef = mediaRefToArtifactResourceRef(ref);
  if (!resourceRef) return undefined;
  return {
    itemId: ref.refId,
    mediaType: ref.mimeType?.startsWith('video/') ? 'video' : 'image',
    resourceRef,
    ...(ref.label ? { label: ref.label } : {}),
    ...(ref.mimeType ? { mimeType: ref.mimeType } : {}),
    ...(ref.metadata ? { metadata: storyboardRecordToArtifactRecord(ref.metadata) } : {}),
  };
}

function mediaRefToArtifactResourceRef(
  ref: StoryboardMediaRef,
): ArtifactMediaItem['resourceRef'] | undefined {
  switch (ref.locator.type) {
    case 'tool-result':
      return {
        kind: 'tool-result',
        toolCallId: ref.locator.toolCallId,
        assetIndex: ref.locator.assetIndex,
        ...(ref.locator.taskId ? { taskId: ref.locator.taskId } : {}),
      };
    case 'canvas-node':
      return {
        kind: 'canvas-node',
        canvasNodeId: ref.locator.canvasNodeId,
        ...(ref.locator.outputId ? { outputId: ref.locator.outputId } : {}),
      };
    case 'story-source':
      return {
        kind: 'story-source',
        storyId: ref.locator.storyId,
        ...(ref.locator.sceneId ? { sceneId: ref.locator.sceneId } : {}),
        ...(ref.locator.frameIndex !== undefined ? { frameIndex: ref.locator.frameIndex } : {}),
      };
    case 'asset':
    case 'workspace-path':
      return undefined;
  }
}

function referenceBundleToJson(bundle: ShotReferenceBundle): ArtifactJsonValue {
  const record: Record<string, ArtifactJsonValue> = {};
  if (bundle.sourcePanelRefs && bundle.sourcePanelRefs.length > 0) {
    record['sourcePanelRefs'] = bundle.sourcePanelRefs.map(mediaRefToJson);
  }
  if (bundle.characterRefs && bundle.characterRefs.length > 0) {
    record['characters'] = bundle.characterRefs.map(characterRefToJson);
  }
  if (bundle.sceneRefs && bundle.sceneRefs.length > 0) {
    record['scenes'] = bundle.sceneRefs.map(sceneRefToJson);
  }
  if (bundle.styleRefs && bundle.styleRefs.length > 0) {
    record['styleRefs'] = bundle.styleRefs.map(mediaRefToJson);
  }
  if (bundle.previousShotRefs && bundle.previousShotRefs.length > 0) {
    record['previousShotRefs'] = bundle.previousShotRefs.map(mediaRefToJson);
  }
  if (bundle.continuityNotes && bundle.continuityNotes.length > 0) {
    record['continuityNotes'] = bundle.continuityNotes;
  }
  return record;
}

function characterRefToJson(ref: CharacterReferenceRef): ArtifactJsonValue {
  return {
    entityRef: creativeEntityRefToJson(ref.entityRef),
    ...(ref.role ? { role: ref.role } : {}),
    ...(ref.assetRefs ? { assetRefs: ref.assetRefs.map(mediaRefToJson) } : {}),
    ...(ref.memoryObservationIds ? { memoryObservationIds: ref.memoryObservationIds } : {}),
    ...(ref.confidence !== undefined ? { confidence: ref.confidence } : {}),
  };
}

function sceneRefToJson(ref: SceneReferenceRef): ArtifactJsonValue {
  return {
    entityRef: creativeEntityRefToJson(ref.entityRef),
    ...(ref.role ? { role: ref.role } : {}),
    ...(ref.assetRefs ? { assetRefs: ref.assetRefs.map(mediaRefToJson) } : {}),
    ...(ref.semanticIndexRefs ? { semanticIndexRefs: ref.semanticIndexRefs } : {}),
    ...(ref.confidence !== undefined ? { confidence: ref.confidence } : {}),
  };
}

function creativeEntityRefToJson(ref: CreativeEntityRef): ArtifactJsonValue {
  return {
    entityId: ref.entityId,
    entityKind: ref.entityKind,
    ...(ref.projectRoot ? { projectRoot: ref.projectRoot } : {}),
    ...(ref.source ? { source: ref.source } : {}),
  };
}

function mediaRefToJson(ref: StoryboardMediaRef): ArtifactJsonValue {
  return {
    refId: ref.refId,
    role: ref.role,
    locator: ref.locator as unknown as ArtifactJsonValue,
    ...(ref.label ? { label: ref.label } : {}),
    ...(ref.mimeType ? { mimeType: ref.mimeType } : {}),
    ...(ref.metadata ? { metadata: storyboardRecordToArtifactRecord(ref.metadata) } : {}),
  };
}

function storyboardRecordToArtifactRecord(record: Record<string, unknown>): ArtifactJsonRecord {
  const output: Record<string, ArtifactJsonValue> = {};
  for (const [key, value] of Object.entries(record)) {
    output[key] = isJsonValue(value) ? value : String(value);
  }
  return output;
}

function prepDiagnosticToArtifact(item: ShotImagePrepDiagnostic): ArtifactDiagnostic {
  return {
    severity: item.severity,
    code: mapDiagnosticCode(item.code),
    path: item.path,
    message: item.message,
    ...(item.expected ? { expected: item.expected } : {}),
    ...(item.actual !== undefined ? { actual: item.actual } : {}),
    ...(item.details ? { details: item.details } : {}),
  };
}

function mapDiagnosticCode(code: ShotImagePrepDiagnosticCode): ArtifactDiagnostic['code'] {
  switch (code) {
    case 'invalid-root':
      return 'invalid-root';
    case 'invalid-schema-version':
      return 'invalid-schema-version';
    case 'invalid-kind':
      return 'invalid-kind';
    case 'missing-required-field':
      return 'missing-required-field';
    case 'unsafe-runtime-handle':
      return 'unsafe-runtime-handle';
    case 'invalid-source-ref':
      return 'invalid-resource-ref';
    case 'invalid-entity-ref':
    case 'invalid-image-strategy':
    case 'invalid-operation':
    case 'invalid-status':
    case 'invalid-required-field':
      return 'invalid-required-field';
    case 'non-serializable-value':
    case 'oversized-payload':
      return 'non-serializable-value';
    case 'missing-perception-card':
      return 'invalid-required-field';
    case 'missing-cost-estimate':
      return 'missing-required-field';
    case 'budget-exceeded':
      return 'invalid-required-field';
    case 'missing-capability':
      return 'missing-capability';
    case 'provider-unavailable':
      return 'provider-unavailable';
  }
}

function action(
  actionId: ShotImagePrepProfileActionId,
  kind: ArtifactAction['kind'],
  label: string,
  description: string,
  requiresApproval = false,
  risk: ArtifactAction['risk'] = 'low',
): ArtifactAction {
  return {
    actionId,
    kind,
    label,
    description,
    requiresApproval,
    risk,
  };
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function missing(path: readonly ArtifactPathSegment[], fieldName: string): ShotImagePrepDiagnostic {
  return diagnostic(
    'error',
    'missing-required-field',
    path,
    `Missing required field: ${fieldName}.`,
  );
}

function invalid(
  path: readonly ArtifactPathSegment[],
  expected: string,
  actual: unknown,
  code: ShotImagePrepDiagnosticCode = 'invalid-required-field',
): ShotImagePrepDiagnostic {
  return diagnostic('error', code, path, `Invalid field at ${path.join('.')}.`, {
    expected,
    actual: diagnosticValue(actual),
  });
}

function unsafe(path: readonly ArtifactPathSegment[], value: string): ShotImagePrepDiagnostic {
  return unsafeDiagnostic(path, value);
}

function unsafeDiagnostic(
  path: readonly ArtifactPathSegment[],
  value: string,
): ShotImagePrepDiagnostic {
  return diagnostic(
    'error',
    'unsafe-runtime-handle',
    path,
    'Runtime-only handles are not valid shot image prep refs.',
    {
      actual: value,
    },
  );
}

function diagnostic(
  severity: ShotImagePrepDiagnostic['severity'],
  code: ShotImagePrepDiagnosticCode,
  path: readonly ArtifactPathSegment[],
  message: string,
  extra: Omit<ShotImagePrepDiagnostic, 'severity' | 'code' | 'path' | 'message'> = {},
): ShotImagePrepDiagnostic {
  return { severity, code, path, message, ...extra };
}

function validationResult(
  diagnostics: readonly ShotImagePrepDiagnostic[],
  options: ShotImagePrepValidationOptions,
): ShotImagePrepValidationResult {
  const limited = diagnostics.slice(0, options.maxDiagnostics ?? 96);
  return {
    ok: !limited.some((item) => item.severity === 'error'),
    diagnostics: limited,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isJsonValue(
  value: unknown,
  seen: ReadonlySet<object> = new Set(),
): value is ShotImagePrepJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, seen));
  if (!isRecord(value)) return false;
  if (seen.has(value)) return false;
  const nextSeen = new Set(seen);
  nextSeen.add(value);
  return Object.values(value).every((item) => isJsonValue(item, nextSeen));
}

function diagnosticValue(value: unknown): ShotImagePrepJsonValue | undefined {
  return isJsonValue(value) ? value : String(value);
}

function jsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function findUnsafeRuntimeHandle(
  value: unknown,
  path: readonly ArtifactPathSegment[] = [],
): { readonly path: readonly ArtifactPathSegment[]; readonly value: string } | undefined {
  if (typeof value === 'string') {
    return isUnsafeRuntimeHandle(value) ? { path, value } : undefined;
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findUnsafeRuntimeHandle(item, [...path, index]);
      if (found) return found;
    }
  }
  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      const found = findUnsafeRuntimeHandle(item, [...path, key]);
      if (found) return found;
    }
  }
  return undefined;
}

function isUnsafeRuntimeHandle(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (
    normalized.startsWith('blob:') ||
    normalized.startsWith('data:') ||
    normalized.startsWith('object:') ||
    normalized.startsWith('vscode-resource:') ||
    normalized.startsWith('vscode-webview-resource:') ||
    normalized.startsWith('vscode-webview://') ||
    normalized.startsWith('file:') ||
    normalized.startsWith('http://localhost') ||
    normalized.startsWith('http://127.0.0.1') ||
    normalized.startsWith('https://localhost') ||
    normalized.startsWith('https://127.0.0.1')
  ) {
    return true;
  }
  if (/^[a-z]:\\/i.test(value)) return true;
  if (value.startsWith('/') && !value.startsWith('${')) return true;
  if (normalized.includes('/.neko/.cache/')) return true;
  if (normalized.includes('/library/application support/code/user/globalstorage/')) return true;
  return false;
}
