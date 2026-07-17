import { isWebviewLikeRuntimeValue } from './content-access';
import type { ArtifactResourceRef } from './composite-artifact';
import type { ResourceRef } from './resource-cache';
import type {
  StoryboardMediaRef,
  StoryboardSerializableRecord,
  StoryboardSerializableValue,
  StoryboardTable,
} from './storyboard-table';
import { classifyStoryboardMediaIdentity } from './storyboard-table';

export const STORYBOARD_PLAN_OVERLAY_SCHEMA_VERSION = 1 as const;
export const STORYBOARD_PLAN_OVERLAY_KIND = 'storyboard-plan-overlay' as const;
export const ANIMATION_PLAN_OVERLAY_KIND = 'animation-plan-overlay' as const;

export const STORYBOARD_PLAN_OVERLAY_TYPES = ['AnimationPlan'] as const;
export const STORYBOARD_PLAN_SOURCE_REF_KINDS = [
  'artifact',
  'storyboard-table',
  'resource',
  'workspace-path',
] as const;
export const STORYBOARD_PLAN_DIAGNOSTIC_SEVERITIES = [
  'error',
  'warning',
  'info',
  'suggestion',
] as const;

export type StoryboardPlanOverlayType = (typeof STORYBOARD_PLAN_OVERLAY_TYPES)[number];
export type StoryboardPlanSourceRefKind = (typeof STORYBOARD_PLAN_SOURCE_REF_KINDS)[number];
export type StoryboardPlanDiagnosticSeverity =
  (typeof STORYBOARD_PLAN_DIAGNOSTIC_SEVERITIES)[number];

export type StoryboardPlanDiagnosticCode =
  | 'invalid-root'
  | 'invalid-schema-version'
  | 'invalid-kind'
  | 'invalid-overlay-type'
  | 'missing-source-storyboard-ref'
  | 'invalid-source-storyboard-ref'
  | 'missing-shot-id'
  | 'duplicate-shot-overlay'
  | 'orphan-shot-overlay'
  | 'non-durable-media-ref'
  | 'runtime-state-field'
  | 'non-serializable-extension';

export type StoryboardPlanDiagnosticPathSegment = string | number;

export interface StoryboardPlanDiagnostic {
  readonly severity: StoryboardPlanDiagnosticSeverity;
  readonly code: StoryboardPlanDiagnosticCode;
  readonly path: readonly StoryboardPlanDiagnosticPathSegment[];
  readonly message: string;
  readonly expected?: string;
  readonly actual?: StoryboardSerializableValue;
  readonly details?: StoryboardSerializableRecord;
}

export interface StoryboardPlanValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly StoryboardPlanDiagnostic[];
}

export interface StoryboardPlanSourceRef {
  readonly kind: StoryboardPlanSourceRefKind;
  readonly artifactId?: string;
  readonly storyboardId?: string;
  readonly title?: string;
  readonly resourceRef?: ResourceRef;
  readonly path?: string;
  readonly version?: string;
  readonly metadata?: StoryboardSerializableRecord;
}

export interface StoryboardPlanPromptIntent {
  readonly intent?: string;
  readonly positive?: string;
  readonly negative?: string;
  readonly constraints?: readonly string[];
  readonly providerPromptCache?: Readonly<Record<string, string>>;
  readonly metadata?: StoryboardSerializableRecord;
}

export interface StoryboardPlanImagePrepIntent {
  readonly operations?: readonly string[];
  readonly notes?: string;
  readonly maskRefs?: readonly ArtifactResourceRef[];
  readonly targetKeyframeCount?: number;
  readonly metadata?: StoryboardSerializableRecord;
}

export interface StoryboardPlanProviderHint {
  readonly capabilityId?: string;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly constraints?: readonly string[];
  readonly metadata?: StoryboardSerializableRecord;
}

export interface StoryboardShotPlanOverlay {
  readonly shotId: string;
  readonly sceneId?: string;
  readonly motionIntent?: string;
  readonly cameraIntent?: string;
  readonly imagePrep?: StoryboardPlanImagePrepIntent;
  readonly videoPromptIntent?: StoryboardPlanPromptIntent;
  readonly audioPromptIntent?: StoryboardPlanPromptIntent;
  readonly requiresImagePrep?: boolean;
  readonly requiresVideoGeneration?: boolean;
  readonly approvalNotes?: string;
  readonly providerHints?: readonly StoryboardPlanProviderHint[];
  readonly sourceMediaRefs?: readonly StoryboardMediaRef[];
  readonly preparedKeyframeRefs?: readonly ArtifactResourceRef[];
  readonly generatedVideoRefs?: readonly ArtifactResourceRef[];
  readonly outputMediaRefs?: readonly ArtifactResourceRef[];
  readonly textCueRefs?: readonly string[];
  readonly voiceCueRefs?: readonly string[];
  readonly diagnostics?: readonly StoryboardPlanDiagnostic[];
  readonly extensions?: StoryboardSerializableRecord;
}

export interface StoryboardPlanOverlay {
  readonly schemaVersion: typeof STORYBOARD_PLAN_OVERLAY_SCHEMA_VERSION;
  readonly kind: typeof STORYBOARD_PLAN_OVERLAY_KIND | typeof ANIMATION_PLAN_OVERLAY_KIND;
  readonly overlayType: StoryboardPlanOverlayType;
  readonly planId?: string;
  readonly title?: string;
  readonly sourceStoryboardRef: StoryboardPlanSourceRef;
  readonly shotOverlays: readonly StoryboardShotPlanOverlay[];
  readonly diagnostics?: readonly StoryboardPlanDiagnostic[];
  readonly extensions?: StoryboardSerializableRecord;
}

export type AnimationPlanOverlay = StoryboardPlanOverlay & {
  readonly kind: typeof ANIMATION_PLAN_OVERLAY_KIND;
  readonly overlayType: 'AnimationPlan';
};

export interface NormalizeStoryboardPlanOverlayOptions {
  readonly sourceStoryboard?: StoryboardTable;
  readonly knownToolCallIds?: readonly string[];
}

export interface NormalizeStoryboardPlanOverlayResult {
  readonly overlay?: StoryboardPlanOverlay;
  readonly diagnostics: readonly StoryboardPlanDiagnostic[];
}

const MAX_STORYBOARD_PLAN_DIAGNOSTICS = 64;
const RUNTIME_STATE_FIELDS = new Set([
  'status',
  'state',
  'queued',
  'running',
  'completed',
  'failed',
  'canceled',
  'cancelled',
  'progress',
  'attempt',
  'attemptCount',
  'providerRunId',
  'runId',
  'taskId',
  'jobId',
  'error',
]);

export function normalizeStoryboardPlanOverlay(
  value: unknown,
  options: NormalizeStoryboardPlanOverlayOptions = {},
): NormalizeStoryboardPlanOverlayResult {
  const diagnostics: StoryboardPlanDiagnostic[] = [];
  const root = readRecord(value);
  if (!root) {
    return {
      diagnostics: [
        storyboardPlanDiagnostic(
          'error',
          'invalid-root',
          [],
          'Storyboard plan overlay must be an object.',
        ),
      ],
    };
  }

  const payload = readRecord(root['payload']) ?? root;
  const kind = readString(payload['kind']);
  const domainKind = readString(root['domainKind']) ?? readString(payload['domainKind']);
  const overlayType = readOverlayType(payload['overlayType'], domainKind);
  const sourceStoryboardRef = normalizeSourceStoryboardRef(payload['sourceStoryboardRef']);
  const sourceStoryboard = options.sourceStoryboard;

  if (!sourceStoryboardRef) {
    diagnostics.push(
      storyboardPlanDiagnostic(
        'error',
        'missing-source-storyboard-ref',
        ['sourceStoryboardRef'],
        'Storyboard plan overlays need a durable source storyboard reference.',
      ),
    );
  } else {
    diagnostics.push(...validateSourceStoryboardRef(sourceStoryboardRef, ['sourceStoryboardRef']));
  }

  if (!overlayType) {
    diagnostics.push(
      storyboardPlanDiagnostic(
        'error',
        'invalid-overlay-type',
        ['overlayType'],
        'Storyboard plan overlay type must be AnimationPlan.',
        { actual: serializableDiagnosticValue(payload['overlayType'] ?? domainKind) },
      ),
    );
  }

  if (
    payload['schemaVersion'] !== undefined &&
    payload['schemaVersion'] !== STORYBOARD_PLAN_OVERLAY_SCHEMA_VERSION
  ) {
    diagnostics.push(
      storyboardPlanDiagnostic(
        'error',
        'invalid-schema-version',
        ['schemaVersion'],
        'Storyboard plan overlay schemaVersion must be 1.',
        { expected: '1', actual: serializableDiagnosticValue(payload['schemaVersion']) },
      ),
    );
  }

  if (kind && kind !== STORYBOARD_PLAN_OVERLAY_KIND && kind !== ANIMATION_PLAN_OVERLAY_KIND) {
    diagnostics.push(
      storyboardPlanDiagnostic(
        'error',
        'invalid-kind',
        ['kind'],
        'Storyboard plan overlay kind must be storyboard-plan-overlay or animation-plan-overlay.',
        { actual: kind },
      ),
    );
  }

  const shotValues = Array.isArray(payload['shotOverlays']) ? payload['shotOverlays'] : [];
  const shotOverlays = shotValues.flatMap((shot, index) => {
    const normalized = normalizeShotOverlay(shot, index, options, diagnostics);
    return normalized ? [normalized] : [];
  });
  diagnostics.push(...validateShotOverlayRefs(shotOverlays, sourceStoryboard));
  diagnostics.push(...findRuntimeStateFieldDiagnostics(payload, []));
  diagnostics.push(...findUnsafeRuntimeValueDiagnostics(payload, []));

  if (!sourceStoryboardRef || !overlayType || hasBlockingStoryboardPlanDiagnostics(diagnostics)) {
    return { diagnostics: limitDiagnostics(diagnostics) };
  }

  const normalizedKind =
    overlayType === 'AnimationPlan' ? ANIMATION_PLAN_OVERLAY_KIND : STORYBOARD_PLAN_OVERLAY_KIND;
  const overlay: StoryboardPlanOverlay = {
    schemaVersion: STORYBOARD_PLAN_OVERLAY_SCHEMA_VERSION,
    kind: normalizedKind,
    overlayType,
    ...(readString(payload['planId']) ? { planId: readString(payload['planId']) } : {}),
    ...(readString(payload['title']) ? { title: readString(payload['title']) } : {}),
    sourceStoryboardRef,
    shotOverlays,
    ...(diagnostics.length > 0 ? { diagnostics: limitDiagnostics(diagnostics) } : {}),
    ...(isSerializableRecord(payload['extensions']) ? { extensions: payload['extensions'] } : {}),
  };

  return {
    overlay,
    diagnostics: limitDiagnostics(diagnostics),
  };
}

export function validateStoryboardPlanOverlay(
  value: unknown,
  options: NormalizeStoryboardPlanOverlayOptions = {},
): StoryboardPlanValidationResult {
  const normalized = normalizeStoryboardPlanOverlay(value, options);
  return {
    ok: !hasBlockingStoryboardPlanDiagnostics(normalized.diagnostics),
    diagnostics: normalized.diagnostics,
  };
}

export function hasBlockingStoryboardPlanDiagnostics(
  diagnostics: readonly StoryboardPlanDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

export function getStoryboardShotIdSet(table: StoryboardTable): ReadonlySet<string> {
  const shotIds = new Set<string>();
  for (const scene of table.scenes) {
    for (const shot of scene.shots) {
      shotIds.add(shot.shotId ?? `${scene.sceneId}-shot-${shot.shotNumber}`);
    }
  }
  return shotIds;
}

function normalizeShotOverlay(
  value: unknown,
  index: number,
  options: NormalizeStoryboardPlanOverlayOptions,
  diagnostics: StoryboardPlanDiagnostic[],
): StoryboardShotPlanOverlay | undefined {
  const record = readRecord(value);
  const path = ['shotOverlays', index] as const;
  if (!record) return undefined;
  const shotId = readString(record['shotId']);
  if (!shotId) {
    diagnostics.push(
      storyboardPlanDiagnostic(
        'error',
        'missing-shot-id',
        [...path, 'shotId'],
        'Storyboard plan shot overlays must reference a stable shotId.',
      ),
    );
    return undefined;
  }

  const sourceMediaRefs = Array.isArray(record['sourceMediaRefs'])
    ? (record['sourceMediaRefs'].filter(isRecordLike) as unknown as StoryboardMediaRef[])
    : undefined;
  if (sourceMediaRefs) {
    for (const [mediaIndex, mediaRef] of sourceMediaRefs.entries()) {
      const classification = classifyStoryboardMediaIdentity(mediaRef, {
        knownToolCallIds: options.knownToolCallIds,
      });
      if (classification.kind !== 'stable') {
        diagnostics.push(
          storyboardPlanDiagnostic(
            'error',
            'non-durable-media-ref',
            [...path, 'sourceMediaRefs', mediaIndex],
            'Storyboard plan media refs must use durable media identity.',
            { details: { reason: classification.reason } },
          ),
        );
      }
    }
  }

  return {
    shotId,
    ...(readString(record['sceneId']) ? { sceneId: readString(record['sceneId']) } : {}),
    ...(readString(record['motionIntent'])
      ? { motionIntent: readString(record['motionIntent']) }
      : {}),
    ...(readString(record['cameraIntent'])
      ? { cameraIntent: readString(record['cameraIntent']) }
      : {}),
    ...normalizeImagePrep(record),
    ...normalizePromptIntent(record, 'videoPromptIntent'),
    ...normalizePromptIntent(record, 'audioPromptIntent'),
    ...(typeof record['requiresImagePrep'] === 'boolean'
      ? { requiresImagePrep: record['requiresImagePrep'] }
      : {}),
    ...(typeof record['requiresVideoGeneration'] === 'boolean'
      ? { requiresVideoGeneration: record['requiresVideoGeneration'] }
      : {}),
    ...(readString(record['approvalNotes'])
      ? { approvalNotes: readString(record['approvalNotes']) }
      : {}),
    ...(sourceMediaRefs ? { sourceMediaRefs } : {}),
    ...normalizeArtifactResourceRefArray(record, 'preparedKeyframeRefs'),
    ...normalizeArtifactResourceRefArray(record, 'generatedVideoRefs'),
    ...normalizeArtifactResourceRefArray(record, 'outputMediaRefs'),
    ...normalizeStringArrayField(record, 'textCueRefs'),
    ...normalizeStringArrayField(record, 'voiceCueRefs'),
    ...(isSerializableRecord(record['extensions']) ? { extensions: record['extensions'] } : {}),
  };
}

function normalizeSourceStoryboardRef(value: unknown): StoryboardPlanSourceRef | undefined {
  if (typeof value === 'string' && value.trim()) {
    return { kind: 'artifact', artifactId: value.trim() };
  }
  const record = readRecord(value);
  if (!record) return undefined;
  const kind = readString(record['kind']);
  if (!kind || !isSourceRefKind(kind)) return undefined;
  return {
    kind,
    ...(readString(record['artifactId']) ? { artifactId: readString(record['artifactId']) } : {}),
    ...(readString(record['storyboardId'])
      ? { storyboardId: readString(record['storyboardId']) }
      : {}),
    ...(readString(record['title']) ? { title: readString(record['title']) } : {}),
    ...(readRecord(record['resourceRef'])
      ? { resourceRef: record['resourceRef'] as ResourceRef }
      : {}),
    ...(readString(record['path']) ? { path: readString(record['path']) } : {}),
    ...(readString(record['version']) ? { version: readString(record['version']) } : {}),
    ...(isSerializableRecord(record['metadata']) ? { metadata: record['metadata'] } : {}),
  };
}

function validateSourceStoryboardRef(
  ref: StoryboardPlanSourceRef,
  path: readonly StoryboardPlanDiagnosticPathSegment[],
): readonly StoryboardPlanDiagnostic[] {
  const diagnostics: StoryboardPlanDiagnostic[] = [];
  if (
    ref.kind === 'artifact' &&
    !ref.artifactId &&
    !ref.storyboardId &&
    !ref.title &&
    !ref.resourceRef
  ) {
    diagnostics.push(
      storyboardPlanDiagnostic(
        'error',
        'invalid-source-storyboard-ref',
        path,
        'Artifact storyboard source refs need artifactId, storyboardId, title, or resourceRef.',
      ),
    );
  }
  if (ref.kind === 'workspace-path' && (!ref.path || isUnsafePersistentString(ref.path))) {
    diagnostics.push(
      storyboardPlanDiagnostic(
        'error',
        'invalid-source-storyboard-ref',
        [...path, 'path'],
        'Storyboard source path must be workspace-relative and durable.',
        { actual: ref.path },
      ),
    );
  }
  return diagnostics;
}

function validateShotOverlayRefs(
  overlays: readonly StoryboardShotPlanOverlay[],
  table: StoryboardTable | undefined,
): readonly StoryboardPlanDiagnostic[] {
  const diagnostics: StoryboardPlanDiagnostic[] = [];
  const seen = new Set<string>();
  const validShotIds = table ? getStoryboardShotIdSet(table) : undefined;
  for (const [index, overlay] of overlays.entries()) {
    if (seen.has(overlay.shotId)) {
      diagnostics.push(
        storyboardPlanDiagnostic(
          'error',
          'duplicate-shot-overlay',
          ['shotOverlays', index, 'shotId'],
          `Duplicate storyboard plan overlay for shotId ${overlay.shotId}.`,
          { actual: overlay.shotId },
        ),
      );
    }
    seen.add(overlay.shotId);
    if (validShotIds && !validShotIds.has(overlay.shotId)) {
      diagnostics.push(
        storyboardPlanDiagnostic(
          'error',
          'orphan-shot-overlay',
          ['shotOverlays', index, 'shotId'],
          `Storyboard plan overlay references missing shotId ${overlay.shotId}.`,
          { actual: overlay.shotId },
        ),
      );
    }
  }
  return diagnostics;
}

function normalizeImagePrep(record: Record<string, unknown>): {
  readonly imagePrep?: StoryboardPlanImagePrepIntent;
} {
  const imagePrep = readRecord(record['imagePrep']);
  if (imagePrep) {
    return {
      imagePrep: {
        ...normalizeStringArrayField(imagePrep, 'operations'),
        ...(readString(imagePrep['notes']) ? { notes: readString(imagePrep['notes']) } : {}),
        ...normalizeArtifactResourceRefArray(imagePrep, 'maskRefs'),
        ...(typeof imagePrep['targetKeyframeCount'] === 'number' &&
        Number.isInteger(imagePrep['targetKeyframeCount']) &&
        imagePrep['targetKeyframeCount'] > 0
          ? { targetKeyframeCount: imagePrep['targetKeyframeCount'] }
          : {}),
        ...(isSerializableRecord(imagePrep['metadata']) ? { metadata: imagePrep['metadata'] } : {}),
      },
    };
  }
  const operations = normalizeStringArray(record['imagePrepOperations']);
  return operations.length > 0 ? { imagePrep: { operations } } : {};
}

function normalizePromptIntent(
  record: Record<string, unknown>,
  field: 'videoPromptIntent' | 'audioPromptIntent',
): Partial<Record<typeof field, StoryboardPlanPromptIntent>> {
  const candidate = readRecord(record[field]);
  if (candidate) {
    return {
      [field]: {
        ...(readString(candidate['intent']) ? { intent: readString(candidate['intent']) } : {}),
        ...(readString(candidate['positive'])
          ? { positive: readString(candidate['positive']) }
          : {}),
        ...(readString(candidate['negative'])
          ? { negative: readString(candidate['negative']) }
          : {}),
        ...normalizeStringArrayField(candidate, 'constraints'),
        ...(isStringRecord(candidate['providerPromptCache'])
          ? {
              providerPromptCache: candidate['providerPromptCache'] as Readonly<
                Record<string, string>
              >,
            }
          : {}),
        ...(isSerializableRecord(candidate['metadata']) ? { metadata: candidate['metadata'] } : {}),
      },
    } as Partial<Record<typeof field, StoryboardPlanPromptIntent>>;
  }
  return {};
}

function normalizeArtifactResourceRefArray(
  record: Record<string, unknown>,
  field: string,
): Record<string, readonly ArtifactResourceRef[]> {
  const value = record[field];
  if (!Array.isArray(value)) return {};
  const refs = value.filter(isRecordLike) as unknown as ArtifactResourceRef[];
  return refs.length > 0 ? { [field]: refs } : {};
}

function normalizeStringArrayField(
  record: Record<string, unknown>,
  field: string,
): Record<string, readonly string[]> {
  const values = normalizeStringArray(record[field]);
  return values.length > 0 ? { [field]: values } : {};
}

function normalizeStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const normalized = readString(item);
    return normalized ? [normalized] : [];
  });
}

function findRuntimeStateFieldDiagnostics(
  value: unknown,
  path: readonly StoryboardPlanDiagnosticPathSegment[],
  seen: ReadonlySet<object> = new Set(),
): readonly StoryboardPlanDiagnostic[] {
  if (!value || typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  const nextSeen = new Set(seen).add(value);
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findRuntimeStateFieldDiagnostics(item, [...path, index], nextSeen),
    );
  }
  const diagnostics: StoryboardPlanDiagnostic[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (RUNTIME_STATE_FIELDS.has(key)) {
      diagnostics.push(
        storyboardPlanDiagnostic(
          'warning',
          'runtime-state-field',
          [...path, key],
          `Runtime execution field "${key}" belongs in Agent async task summaries, not plan overlays.`,
        ),
      );
    }
    diagnostics.push(...findRuntimeStateFieldDiagnostics(child, [...path, key], nextSeen));
  }
  return diagnostics;
}

function findUnsafeRuntimeValueDiagnostics(
  value: unknown,
  path: readonly StoryboardPlanDiagnosticPathSegment[],
  seen: ReadonlySet<object> = new Set(),
): readonly StoryboardPlanDiagnostic[] {
  if (typeof value === 'string') {
    return isUnsafePersistentString(value)
      ? [
          storyboardPlanDiagnostic(
            'error',
            'non-durable-media-ref',
            path,
            'Storyboard plan overlays must not persist runtime URLs, data URLs, localhost URLs, or absolute local paths.',
            { actual: value },
          ),
        ]
      : [];
  }
  if (!value || typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  const nextSeen = new Set(seen).add(value);
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findUnsafeRuntimeValueDiagnostics(item, [...path, index], nextSeen),
    );
  }
  return Object.entries(value).flatMap(([key, child]) =>
    findUnsafeRuntimeValueDiagnostics(child, [...path, key], nextSeen),
  );
}

function readOverlayType(
  value: unknown,
  domainKind: string | undefined,
): StoryboardPlanOverlayType | undefined {
  if (value === 'AnimationPlan' || domainKind === 'AnimationPlan') return 'AnimationPlan';
  return undefined;
}

function isSourceRefKind(value: string): value is StoryboardPlanSourceRefKind {
  return (STORYBOARD_PLAN_SOURCE_REF_KINDS as readonly string[]).includes(value);
}

function isUnsafePersistentString(value: string): boolean {
  const trimmed = value.trim();
  return (
    isWebviewLikeRuntimeValue(trimmed) ||
    /^vscode-webview:\/\//i.test(trimmed) ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(trimmed) ||
    /^file:\/\//i.test(trimmed) ||
    /^[A-Za-z]:[\\/]/.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.includes('/.neko/.cache/')
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  const record = readRecord(value);
  return Boolean(record && Object.values(record).every((item) => typeof item === 'string'));
}

function isSerializableRecord(value: unknown): value is StoryboardSerializableRecord {
  const record = readRecord(value);
  return Boolean(record && isSerializableValue(record));
}

function isSerializableValue(
  value: unknown,
  seen: ReadonlySet<object> = new Set(),
): value is StoryboardSerializableValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || value === undefined) return false;
  if (seen.has(value)) return false;
  const nextSeen = new Set(seen).add(value);
  if (Array.isArray(value)) return value.every((item) => isSerializableValue(item, nextSeen));
  const record = readRecord(value);
  return Boolean(
    record && Object.values(record).every((item) => isSerializableValue(item, nextSeen)),
  );
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isRecordLike(value: unknown): value is Record<string, unknown> {
  return Boolean(readRecord(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function storyboardPlanDiagnostic(
  severity: StoryboardPlanDiagnosticSeverity,
  code: StoryboardPlanDiagnosticCode,
  path: readonly StoryboardPlanDiagnosticPathSegment[],
  message: string,
  options: {
    readonly expected?: string;
    readonly actual?: StoryboardSerializableValue;
    readonly details?: StoryboardSerializableRecord;
  } = {},
): StoryboardPlanDiagnostic {
  return {
    severity,
    code,
    path,
    message,
    ...(options.expected ? { expected: options.expected } : {}),
    ...(options.actual !== undefined ? { actual: options.actual } : {}),
    ...(options.details ? { details: options.details } : {}),
  };
}

function serializableDiagnosticValue(value: unknown): StoryboardSerializableValue {
  return isSerializableValue(value) ? value : String(value);
}

function limitDiagnostics(
  diagnostics: readonly StoryboardPlanDiagnostic[],
): readonly StoryboardPlanDiagnostic[] {
  return diagnostics.slice(0, MAX_STORYBOARD_PLAN_DIAGNOSTICS);
}
