import type { CameraAngle, CameraMovement, ShotScale } from './canvas';
import type { CreativeEntityRef, RepresentationKind } from './creative-entity-asset-composition';
import {
  parseDocumentArchiveResourceRef,
  type DocumentArchiveResourceRef,
} from './document-reading';
import { isResourceRef, type ResourceRef } from './resource-cache';
import { validateDurableResourceRef } from './durable-resource-ref';

export const STORYBOARD_TABLE_SCHEMA_VERSION = 1 as const;
export const STORYBOARD_TABLE_KIND = 'storyboard-table' as const;
export const STORYBOARD_CANONICAL_CONTRACT_VERSION = 1 as const;

export const STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID = 'from-comic' as const;

export const STORYBOARD_SOURCE_PROFILE_IDS = [
  'from-prompt',
  'from-text',
  'from-script',
  'from-document',
  STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
  'from-image-sequence',
  'from-existing-storyboard',
] as const;

export const STORYBOARD_PROJECTION_TARGETS = ['canvas', 'cut'] as const;

export const STORYBOARD_TABLE_PROFILES = [
  'script-breakdown',
  STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID,
  'image-sequence',
  'ad-storyboard',
  'short-video',
  'character-design',
  'manual',
] as const;

export const STORYBOARD_SHOT_IMAGE_STRATEGIES = [
  'reuse-original',
  'use-as-reference',
  'generate-new',
  'transform-original',
] as const;

export const STORYBOARD_MEDIA_ROLES = [
  'source',
  'reference',
  'generated',
  'derived',
  'thumbnail',
  'mask',
] as const;

export const STORYBOARD_SOURCE_MEDIA_ROLES = ['source', 'reference', 'thumbnail', 'mask'] as const;

export const STORYBOARD_GENERATED_MEDIA_ROLES = [
  'generated',
  'derived',
  'thumbnail',
  'mask',
] as const;

export const STORYBOARD_TEXT_CUE_KINDS = [
  'dialogue',
  'narration',
  'caption',
  'sfx',
  'backgroundText',
  'unknown',
] as const;

export const STORYBOARD_TABLE_REQUIRED_FIELDS = [
  'schemaVersion',
  'kind',
  'title',
  'scenes',
] as const satisfies readonly (keyof StoryboardTable)[];

export const STORYBOARD_SCENE_REQUIRED_FIELDS = [
  'sceneId',
  'sceneTitle',
  'shots',
] as const satisfies readonly (keyof StoryboardSceneRow)[];

export const STORYBOARD_SHOT_REQUIRED_FIELDS = [
  'shotNumber',
  'duration',
  'visualDescription',
  'characterAction',
  'imageStrategy',
] as const satisfies readonly (keyof StoryboardShotRow)[];

export type StoryboardTableProfile = (typeof STORYBOARD_TABLE_PROFILES)[number];

export type StoryboardShotImageStrategy = (typeof STORYBOARD_SHOT_IMAGE_STRATEGIES)[number];

export type StoryboardMediaRole = (typeof STORYBOARD_MEDIA_ROLES)[number];

export type StoryboardSourceMediaRole = (typeof STORYBOARD_SOURCE_MEDIA_ROLES)[number];

export type StoryboardGeneratedMediaRole = (typeof STORYBOARD_GENERATED_MEDIA_ROLES)[number];

export type StoryboardSerializableValue =
  | string
  | number
  | boolean
  | null
  | readonly StoryboardSerializableValue[]
  | { readonly [key: string]: StoryboardSerializableValue };

export type StoryboardSerializableRecord = {
  readonly [key: string]: StoryboardSerializableValue;
};

export type StoryboardExtensionNamespace = `neko.${string}`;

export type StoryboardExtensionMap = Readonly<
  Record<StoryboardExtensionNamespace, StoryboardSerializableValue>
>;

export type StoryboardSourceProfileId = (typeof STORYBOARD_SOURCE_PROFILE_IDS)[number];

export type StoryboardProjectionTarget = (typeof STORYBOARD_PROJECTION_TARGETS)[number];

export interface StoryboardRevisionIdentity {
  readonly revisionId: string;
  readonly sequence: number;
  readonly contentDigest: string;
  readonly parentRevisionId?: string;
  readonly createdAt: string;
}

export interface StoryboardSourceRegion {
  readonly page?: number;
  readonly startOffset?: number;
  readonly endOffset?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface StoryboardSourceTrace {
  readonly traceId: string;
  readonly sourceProfile: StoryboardSourceProfileId;
  readonly sourceRef?: ResourceRef;
  readonly sourceDocumentRef?: DocumentArchiveResourceRef;
  readonly sourceRevisionId?: string;
  readonly sourceSceneId?: string;
  readonly sourceShotId?: string;
  readonly sourceRegion?: StoryboardSourceRegion;
  readonly label?: string;
}

export interface StoryboardProjectionHandoff {
  readonly target: StoryboardProjectionTarget;
  readonly storyboardRevisionId: string;
  readonly mode: 'read-only-projection' | 'one-way-handoff';
  readonly artifactRef?: ResourceRef;
  readonly createdAt: string;
}

export type StoryboardTableSourceType = 'story' | 'agent' | 'document' | 'image' | 'manual';

export interface StoryboardTableSource {
  readonly type: StoryboardTableSourceType;
  readonly sourceUri?: string;
  readonly sourceSceneId?: string;
  readonly sourceDocumentId?: string;
  readonly label?: string;
}

export interface StoryboardTable {
  readonly schemaVersion: typeof STORYBOARD_TABLE_SCHEMA_VERSION;
  readonly kind: typeof STORYBOARD_TABLE_KIND;
  readonly profile?: StoryboardTableProfile;
  readonly contractVersion?: typeof STORYBOARD_CANONICAL_CONTRACT_VERSION;
  readonly revision?: StoryboardRevisionIdentity;
  readonly sourceProfile?: StoryboardSourceProfileId;
  readonly sourceTrace?: readonly StoryboardSourceTrace[];
  readonly projections?: readonly StoryboardProjectionHandoff[];
  readonly source?: StoryboardTableSource;
  readonly title: string;
  readonly scenes: readonly StoryboardSceneRow[];
  readonly extensions?: StoryboardExtensionMap;
}

export interface StoryboardSceneRow {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly sceneNumber?: number;
  readonly location?: string;
  readonly timeOfDay?: string;
  readonly summary?: string;
  readonly shots: readonly StoryboardShotRow[];
  readonly sourceTrace?: readonly StoryboardSourceTrace[];
  readonly extensions?: StoryboardExtensionMap;
}

export interface StoryboardShotRow {
  readonly shotId?: string;
  readonly shotNumber: number;
  readonly duration: number;
  readonly visualDescription: string;
  readonly characters?: readonly StoryboardShotCharacter[];
  readonly shotScale?: ShotScale;
  readonly cameraMovement?: CameraMovement;
  readonly cameraAngle?: CameraAngle;
  readonly characterAction: string;
  readonly emotion?: readonly string[];
  readonly sceneTags?: readonly string[];
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly textCues?: readonly StoryboardTextCue[];
  readonly voiceCues?: readonly StoryboardVoiceCue[];
  /** Shot-level image generation or editing intent. */
  readonly imagePrompt?: string;
  /** Scene-level video intent, stored on the first shot of the scene for table projection. */
  readonly videoPrompt?: string;
  /** @deprecated Use imagePrompt for canonical Storyboard generation intent. */
  readonly generationPrompt?: string;
  readonly visualStyle?: string;
  readonly referenceImagePath?: string;
  readonly vfx?: readonly string[];
  readonly imageStrategy: StoryboardShotImageStrategy;
  readonly sourceMediaRefs?: readonly StoryboardMediaRef[];
  readonly generatedMediaRefs?: readonly StoryboardMediaRef[];
  readonly mediaRefs?: readonly StoryboardMediaRef[];
  readonly decisionReason?: string;
  readonly sourceTrace?: readonly StoryboardSourceTrace[];
  readonly extensions?: StoryboardExtensionMap;
}

export type StoryboardShotCharacterRole = 'primary' | 'secondary' | 'background';

export interface StoryboardShotCharacter {
  readonly characterId?: string;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly name: string;
  readonly role?: StoryboardShotCharacterRole;
  readonly action?: string;
  readonly emotion?: string;
  readonly continuityNotes?: string;
  readonly appearanceNotes?: string;
}

export type StoryboardTextCueKind = (typeof STORYBOARD_TEXT_CUE_KINDS)[number];

export interface StoryboardTextCue {
  readonly cueId: string;
  readonly kind: StoryboardTextCueKind;
  readonly text: string;
  readonly speakerName?: string;
  readonly speakerCharacterId?: string;
  readonly speakerEntityRef?: CreativeEntityRef;
  readonly sourceRefId?: string;
  readonly language?: string;
  readonly confidence?: number;
  readonly emotion?: string;
  readonly delivery?: string;
  readonly extensions?: StoryboardExtensionMap;
}

export type StoryboardVoiceCueKind = 'dialogue' | 'voiceOver';

export interface StoryboardVoiceCue {
  readonly cueId: string;
  readonly kind: StoryboardVoiceCueKind;
  readonly text: string;
  readonly speakerName?: string;
  readonly speakerCharacterId?: string;
  readonly speakerEntityRef?: CreativeEntityRef;
  readonly emotion?: string;
  readonly delivery?: string;
  readonly voiceAssetId?: string;
  readonly requestedRepresentationKind?: RepresentationKind;
  readonly sourceRefId?: string;
  readonly extensions?: StoryboardExtensionMap;
}

export type StoryboardMediaLocator =
  | {
      readonly type: 'tool-result';
      readonly toolCallId: string;
      readonly assetIndex: number;
      readonly taskId?: string;
    }
  | {
      readonly type: 'asset';
      readonly assetId: string;
      readonly assetVersion?: string;
      readonly uri?: string;
    }
  | {
      readonly type: 'workspace-path';
      readonly path: string;
    }
  | {
      readonly type: 'canvas-node';
      readonly canvasNodeId: string;
      readonly outputId?: string;
    }
  | {
      readonly type: 'story-source';
      readonly storyId: string;
      readonly sceneId?: string;
      readonly frameIndex?: number;
    };

export interface StoryboardMediaRef {
  readonly refId: string;
  readonly role: StoryboardMediaRole;
  readonly locator: StoryboardMediaLocator;
  readonly label?: string;
  readonly mimeType?: string;
  readonly documentResourceRef?: DocumentArchiveResourceRef;
  readonly resourceRef?: ResourceRef;
  readonly metadata?: StoryboardSerializableRecord;
}

export type StoryboardMediaIdentityKind =
  'stable' | 'runtime-only' | 'unsafe-cache-path' | 'ambiguous-alias' | 'unresolved-tool-result';

export interface StoryboardMediaIdentityClassification {
  readonly kind: StoryboardMediaIdentityKind;
  readonly reason: string;
  readonly toolCallId?: string;
  readonly alias?: string;
  readonly value?: string;
}

export interface StoryboardMediaIdentityClassificationOptions {
  readonly knownToolCallIds?: readonly string[];
  readonly ambiguousAliases?: readonly string[];
}

export type StoryboardTableRequiredField = (typeof STORYBOARD_TABLE_REQUIRED_FIELDS)[number];

export type StoryboardSceneRequiredField = (typeof STORYBOARD_SCENE_REQUIRED_FIELDS)[number];

export type StoryboardShotRequiredField = (typeof STORYBOARD_SHOT_REQUIRED_FIELDS)[number];

export type StoryboardValidationDiagnosticSeverity =
  'error' | 'warning' | 'suggestion' | 'profileHint';

export type StoryboardValidationDiagnosticCode =
  | CanonicalStoryboardDiagnosticCode
  | 'invalid-root'
  | 'canonical-scene-shot-hierarchy-required'
  | 'invalid-schema-version'
  | 'invalid-kind'
  | 'invalid-profile'
  | 'missing-required-field'
  | 'invalid-required-field'
  | 'empty-scenes'
  | 'empty-shots'
  | 'invalid-shot-duration'
  | 'invalid-shot-number'
  | 'invalid-image-strategy'
  | 'invalid-media-ref'
  | 'unsafe-media-ref'
  | 'runtime-only-media-ref'
  | 'ambiguous-media-alias'
  | 'unresolved-tool-result'
  | 'media-ref-role-mismatch'
  | 'ambiguous-media-ref'
  | 'invalid-extension-namespace'
  | 'non-serializable-extension'
  | 'missing-profile-field'
  | 'image-strategy-missing-source'
  | 'image-strategy-missing-prompt'
  | 'invalid-scene-video-prompt'
  | 'missing-capability'
  | 'generation-denied'
  | 'generation-confirmation-required'
  | 'generation-failed'
  | 'missing-backfill-output'
  | 'backfill-target-not-found';

export type StoryboardValidationDiagnosticPathSegment = string | number;

export interface StoryboardValidationDiagnostic {
  readonly severity: StoryboardValidationDiagnosticSeverity;
  readonly code: StoryboardValidationDiagnosticCode;
  readonly path: readonly StoryboardValidationDiagnosticPathSegment[];
  readonly message: string;
  readonly expected?: string;
  readonly actual?: StoryboardSerializableValue;
  readonly details?: StoryboardSerializableRecord;
}

export interface StoryboardValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly StoryboardValidationDiagnostic[];
}

export interface StoryboardValidationOptions extends StoryboardMediaIdentityClassificationOptions {}

export type CanonicalStoryboardDiagnosticCode =
  | 'missing-canonical-contract'
  | 'unsupported-source-profile'
  | 'invalid-storyboard-revision'
  | 'invalid-source-trace'
  | 'invalid-projection-handoff';

export interface CanonicalStoryboardValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly StoryboardValidationDiagnostic[];
}

export function validateCanonicalStoryboardTable(
  table: StoryboardTable,
): CanonicalStoryboardValidationResult {
  const diagnostics: StoryboardValidationDiagnostic[] = [
    ...validateStoryboardTable(table).diagnostics,
  ];
  if (table.contractVersion !== STORYBOARD_CANONICAL_CONTRACT_VERSION) {
    diagnostics.push(
      createCanonicalStoryboardDiagnostic(
        'missing-canonical-contract',
        'Canonical Storyboard requires the current contractVersion.',
        ['contractVersion'],
      ),
    );
  }
  if (!table.revision || !isValidStoryboardRevision(table.revision)) {
    diagnostics.push(
      createCanonicalStoryboardDiagnostic(
        'invalid-storyboard-revision',
        'Canonical Storyboard requires a stable revision id, positive sequence, content digest, and timestamp.',
        ['revision'],
      ),
    );
  }
  if (
    !table.sourceProfile ||
    !STORYBOARD_SOURCE_PROFILE_IDS.some((profile) => profile === table.sourceProfile)
  ) {
    diagnostics.push(
      createCanonicalStoryboardDiagnostic(
        'unsupported-source-profile',
        'Canonical Storyboard requires a supported source profile.',
        ['sourceProfile'],
      ),
    );
  }
  if (!table.sourceTrace || table.sourceTrace.length === 0) {
    diagnostics.push(
      createCanonicalStoryboardDiagnostic(
        'invalid-source-trace',
        'Canonical Storyboard requires at least one source-trace entry.',
        ['sourceTrace'],
      ),
    );
  } else {
    validateCanonicalSourceTrace(table.sourceTrace, ['sourceTrace'], diagnostics);
  }
  table.scenes.forEach((scene, sceneIndex) => {
    if (scene.sourceTrace) {
      validateCanonicalSourceTrace(
        scene.sourceTrace,
        ['scenes', sceneIndex, 'sourceTrace'],
        diagnostics,
      );
    }
    scene.shots.forEach((shot, shotIndex) => {
      if (shot.sourceTrace) {
        validateCanonicalSourceTrace(
          shot.sourceTrace,
          ['scenes', sceneIndex, 'shots', shotIndex, 'sourceTrace'],
          diagnostics,
        );
      }
    });
  });
  table.projections?.forEach((projection, index) => {
    if (
      !STORYBOARD_PROJECTION_TARGETS.some((target) => target === projection.target) ||
      !projection.storyboardRevisionId.trim() ||
      projection.storyboardRevisionId !== table.revision?.revisionId ||
      !Number.isFinite(Date.parse(projection.createdAt))
    ) {
      diagnostics.push(
        createCanonicalStoryboardDiagnostic(
          'invalid-projection-handoff',
          'Storyboard projection must bind to the current revision and a supported projection target.',
          ['projections', index],
        ),
      );
    }
    if (projection.artifactRef && !validateDurableResourceRef(projection.artifactRef).ok) {
      diagnostics.push(
        createCanonicalStoryboardDiagnostic(
          'invalid-projection-handoff',
          'Storyboard projection artifactRef must be a valid ResourceRef.',
          ['projections', index, 'artifactRef'],
        ),
      );
    }
  });
  return { ok: !hasBlockingStoryboardDiagnostics(diagnostics), diagnostics };
}

export interface StoryboardCutStoryboardShotBase {
  readonly id: string;
  readonly shotNumber: number;
  readonly duration: number;
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly textCues?: readonly StoryboardTextCue[];
  readonly voiceCues?: readonly StoryboardVoiceCue[];
  readonly label: string;
}

export type StoryboardCutStoryboardShot =
  | (StoryboardCutStoryboardShotBase & {
      readonly imagePath: string;
      readonly imageDataUrl?: string;
    })
  | (StoryboardCutStoryboardShotBase & {
      readonly imagePath?: string;
      readonly imageDataUrl: string;
    });

export interface StoryboardCutStoryboardPayload {
  readonly projectName: string;
  readonly shots: readonly StoryboardCutStoryboardShot[];
}

export interface StoryboardMediaResolverContext {
  readonly table: StoryboardTable;
  readonly scene: StoryboardSceneRow;
  readonly shot: StoryboardShotRow;
  readonly mediaRef: StoryboardMediaRef;
}

export interface StoryboardShotResolverContext {
  readonly table: StoryboardTable;
  readonly scene: StoryboardSceneRow;
  readonly shot: StoryboardShotRow;
}

export interface ProjectStoryboardTableToCutOptions {
  readonly projectName?: string;
  readonly resolveImagePath?: (context: StoryboardMediaResolverContext) => string | undefined;
  readonly resolveImageDataUrl?: (context: StoryboardMediaResolverContext) => string | undefined;
}

export interface CanonicalStoryboardCutHandoffResult {
  readonly payload?: StoryboardCutStoryboardPayload;
  readonly handoff?: StoryboardProjectionHandoff;
  readonly diagnostics: readonly StoryboardValidationDiagnostic[];
}

export type StoryboardImageGenerationPolicy = 'allow' | 'deny' | 'confirm';

export interface StoryboardImageStrategyOverrideScope {
  readonly sceneIds?: readonly string[];
  readonly shotIds?: readonly string[];
}

export interface StoryboardImageStrategyOverride {
  readonly generationPolicy: StoryboardImageGenerationPolicy;
  readonly allowedStrategies?: readonly StoryboardShotImageStrategy[];
  readonly scope?: StoryboardImageStrategyOverrideScope;
  readonly source: 'chat-instruction' | 'webview-confirmation' | 'workspace-setting';
  readonly reason?: string;
}

export type StoryboardImageToolName =
  'GenerateImage' | 'TransformImage' | 'ResolveMediaRef' | (string & {});

export interface StoryboardImageToolCapability {
  readonly toolName: StoryboardImageToolName;
  readonly supportsReferences: boolean;
  readonly supportsMasks?: boolean;
}

export interface StoryboardImageStrategyInterpreterInput {
  readonly table: StoryboardTable;
  readonly userOverride?: StoryboardImageStrategyOverride;
  readonly availableTools: readonly StoryboardImageToolCapability[];
}

export type StoryboardImageStrategyActionKind =
  'reuse-original' | 'generate-image' | 'transform-image';

export interface StoryboardImageStrategyAction {
  readonly kind: StoryboardImageStrategyActionKind;
  readonly sceneId: string;
  readonly shotId: string;
  readonly shotNumber: number;
  readonly imageStrategy: StoryboardShotImageStrategy;
  readonly toolName?: StoryboardImageToolName;
  readonly generationPrompt?: string;
  readonly sourceMediaRefs?: readonly StoryboardMediaRef[];
}

export interface StoryboardImageStrategyBlockedAction {
  readonly sceneId: string;
  readonly shotId: string;
  readonly shotNumber: number;
  readonly imageStrategy: StoryboardShotImageStrategy;
  readonly reason:
    | 'missing-source'
    | 'missing-prompt'
    | 'missing-capability'
    | 'generation-denied'
    | 'confirmation-required'
    | 'strategy-not-allowed';
  readonly diagnostics: readonly StoryboardValidationDiagnostic[];
}

export interface StoryboardImageStrategyInterpreterResult {
  readonly actions: readonly StoryboardImageStrategyAction[];
  readonly blockedActions: readonly StoryboardImageStrategyBlockedAction[];
  readonly diagnostics: readonly StoryboardValidationDiagnostic[];
}

export interface NormalizeStoryboardTableInput {
  readonly value: unknown;
}

export interface NormalizeStoryboardTableResult {
  readonly table?: StoryboardTable;
  readonly diagnostics: readonly StoryboardValidationDiagnostic[];
}

const MAX_STORYBOARD_DIAGNOSTICS = 64;
const STORYBOARD_IMAGE_ALIAS_EXTENSION = 'neko.storyboardImageAlias' as const;
const STORYBOARD_SOURCE_IMAGE_EXTENSION = 'neko.storyboardSourceImage' as const;
const FLAT_STORYBOARD_SCENE_ID = 'scene-1' as const;

export function validateStoryboardTable(
  value: unknown,
  options: StoryboardValidationOptions = {},
): StoryboardValidationResult {
  const normalized = normalizeStoryboardTable({ value });
  const diagnostics = normalized.table
    ? [...normalized.diagnostics, ...validateNormalizedStoryboardTable(normalized.table, options)]
    : normalized.diagnostics;

  return {
    ok: !hasBlockingStoryboardDiagnostics(diagnostics),
    diagnostics: limitStoryboardDiagnostics(diagnostics),
  };
}

export function normalizeCanonicalStoryboardTable(
  input: NormalizeStoryboardTableInput,
): NormalizeStoryboardTableResult {
  const root = readStoryboardRecord(input.value);
  if (!root) {
    return normalizeStoryboardTable(input);
  }

  const scenes = root['scenes'];
  if (!Array.isArray(scenes)) {
    return normalizeStoryboardTable(input);
  }

  const hierarchyDiagnostics = scenes.flatMap((scene, sceneIndex) => {
    const sceneRecord = readStoryboardRecord(scene);
    if (sceneRecord && Array.isArray(sceneRecord['shots'])) return [];
    return [
      storyboardDiagnostic(
        'error',
        'canonical-scene-shot-hierarchy-required',
        ['scenes', sceneIndex, 'shots'],
        'Canonical Storyboard scenes must own an explicit shots[] array.',
      ),
    ];
  });
  if (hierarchyDiagnostics.length > 0) {
    return { diagnostics: limitStoryboardDiagnostics(hierarchyDiagnostics) };
  }

  return normalizeStoryboardTable(input);
}

export function normalizeStoryboardTable(
  input: NormalizeStoryboardTableInput,
): NormalizeStoryboardTableResult {
  const diagnostics: StoryboardValidationDiagnostic[] = [];
  const root = readStoryboardRecord(input.value);
  if (!root) {
    return {
      diagnostics: [
        storyboardDiagnostic('error', 'invalid-root', [], 'Storyboard table must be an object.'),
      ],
    };
  }

  if (root['schemaVersion'] === 1 || root['scenes'] !== undefined) {
    const table = normalizeSemanticStoryboardTable(root, diagnostics);
    return {
      ...(table ? { table } : {}),
      diagnostics: limitStoryboardDiagnostics(diagnostics),
    };
  }

  return {
    diagnostics: [
      storyboardDiagnostic(
        'error',
        'invalid-root',
        [],
        'Storyboard table must use schemaVersion 1 with scenes[].',
      ),
    ],
  };
}

export function hasBlockingStoryboardDiagnostics(
  diagnostics: readonly StoryboardValidationDiagnostic[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

export function classifyStoryboardMediaIdentity(
  mediaRef: StoryboardMediaRef,
  options: StoryboardMediaIdentityClassificationOptions = {},
): StoryboardMediaIdentityClassification {
  if (mediaRef.resourceRef) {
    return {
      kind: 'stable',
      reason: 'Storyboard media references a stable resource ref.',
    };
  }

  const ambiguousAliases = new Set(
    (options.ambiguousAliases ?? []).flatMap((value) => {
      const normalized = normalizeStoryboardAlias(value);
      return normalized ? [normalized] : [];
    }),
  );
  const labelAlias = normalizeStoryboardAlias(mediaRef.label);
  const refAlias = normalizeStoryboardAlias(mediaRef.refId);
  const alias = labelAlias ?? refAlias;
  if (alias && ambiguousAliases.has(alias)) {
    return {
      kind: 'ambiguous-alias',
      reason: 'Storyboard media alias resolves to more than one source.',
      alias,
    };
  }

  switch (mediaRef.locator.type) {
    case 'tool-result': {
      const knownToolCallIds = options.knownToolCallIds;
      if (knownToolCallIds && !knownToolCallIds.includes(mediaRef.locator.toolCallId)) {
        return {
          kind: 'unresolved-tool-result',
          reason: 'Storyboard media references a tool result that is not available.',
          toolCallId: mediaRef.locator.toolCallId,
        };
      }
      return {
        kind: 'stable',
        reason: 'Storyboard media references a concrete tool result asset.',
        toolCallId: mediaRef.locator.toolCallId,
      };
    }
    case 'asset':
      if (mediaRef.locator.uri && isRuntimeOnlyStoryboardMediaValue(mediaRef.locator.uri)) {
        return {
          kind: 'runtime-only',
          reason: 'Asset locator URI is a runtime-only handle.',
          value: mediaRef.locator.uri,
        };
      }
      if (mediaRef.locator.uri && isUnsafeMediaUri(mediaRef.locator.uri)) {
        return {
          kind: 'unsafe-cache-path',
          reason: 'Asset locator URI is not portable storyboard identity.',
          value: mediaRef.locator.uri,
        };
      }
      return {
        kind: 'stable',
        reason: 'Storyboard media references a stable asset id.',
      };
    case 'workspace-path':
      if (isRuntimeOnlyStoryboardMediaValue(mediaRef.locator.path)) {
        return {
          kind: 'runtime-only',
          reason: 'Workspace path locator is a runtime-only handle.',
          value: mediaRef.locator.path,
        };
      }
      if (
        isManagedOrAbsoluteCachePath(mediaRef.locator.path) ||
        isUnsafeWorkspacePath(mediaRef.locator.path)
      ) {
        return {
          kind: 'unsafe-cache-path',
          reason: 'Workspace path locator is not portable storyboard identity.',
          value: mediaRef.locator.path,
        };
      }
      return {
        kind: 'stable',
        reason: 'Storyboard media references a portable workspace or variable path.',
      };
    case 'canvas-node':
    case 'story-source':
      return {
        kind: 'stable',
        reason: 'Storyboard media references another stable project entity.',
      };
  }
}

export function splitStoryboardMediaRefsByRole(
  mediaRefs: readonly StoryboardMediaRef[] | undefined,
  path: readonly StoryboardValidationDiagnosticPathSegment[] = [],
): {
  readonly sourceMediaRefs: readonly StoryboardMediaRef[];
  readonly generatedMediaRefs: readonly StoryboardMediaRef[];
  readonly diagnostics: readonly StoryboardValidationDiagnostic[];
} {
  const sourceMediaRefs: StoryboardMediaRef[] = [];
  const generatedMediaRefs: StoryboardMediaRef[] = [];
  const diagnostics: StoryboardValidationDiagnostic[] = [];

  for (const [index, mediaRef] of (mediaRefs ?? []).entries()) {
    const refPath = [...path, index];
    if (isSourceStoryboardMediaRole(mediaRef.role)) {
      sourceMediaRefs.push(mediaRef);
      continue;
    }
    if (isGeneratedStoryboardMediaRole(mediaRef.role)) {
      generatedMediaRefs.push(mediaRef);
      continue;
    }
    diagnostics.push(
      storyboardDiagnostic(
        'warning',
        'ambiguous-media-ref',
        refPath,
        `Media ref ${mediaRef.refId} has ambiguous role ${mediaRef.role}.`,
        {
          expected: 'source/reference/generated/derived/thumbnail/mask',
          actual: mediaRef.role,
        },
      ),
    );
  }

  return { sourceMediaRefs, generatedMediaRefs, diagnostics };
}

export function projectStoryboardTableToCutPayload(
  table: StoryboardTable,
  options: ProjectStoryboardTableToCutOptions = {},
): StoryboardCutStoryboardPayload | null {
  const shots: StoryboardCutStoryboardShot[] = [];
  for (const scene of table.scenes) {
    for (const shot of scene.shots) {
      const mediaRef = selectStoryboardShotImageRef(shot);
      if (!mediaRef) continue;

      const context = { table, scene, shot, mediaRef };
      const imagePath =
        options.resolveImagePath?.(context) ?? resolveStoryboardWorkspacePath(mediaRef);
      const imageDataUrl = options.resolveImageDataUrl?.(context);
      if (!imagePath && !imageDataUrl) continue;

      shots.push({
        id: shot.shotId ?? `${scene.sceneId}-shot-${shot.shotNumber}`,
        shotNumber: shot.shotNumber,
        duration: shot.duration,
        ...(shot.dialogue ? { dialogue: shot.dialogue } : {}),
        ...(shot.voiceOver ? { voiceOver: shot.voiceOver } : {}),
        ...(shot.soundCue ? { soundCue: shot.soundCue } : {}),
        ...(shot.textCues ? { textCues: shot.textCues } : {}),
        ...(shot.voiceCues ? { voiceCues: shot.voiceCues } : {}),
        label: `#${String(shot.shotNumber).padStart(3, '0')} ${scene.sceneTitle}`.trim(),
        ...(imagePath ? { imagePath } : {}),
        ...(imageDataUrl ? { imageDataUrl } : {}),
      } as StoryboardCutStoryboardShot);
    }
  }

  return shots.length > 0 ? { projectName: options.projectName ?? table.title, shots } : null;
}

export function projectCanonicalStoryboardTableToCutHandoff(
  table: StoryboardTable,
  options: ProjectStoryboardTableToCutOptions = {},
  handoffOptions: {
    readonly artifactRef?: ResourceRef;
    readonly now?: () => string;
  } = {},
): CanonicalStoryboardCutHandoffResult {
  const validation = validateCanonicalStoryboardTable(table);
  if (!validation.ok || !table.revision) {
    return { diagnostics: validation.diagnostics };
  }
  if (handoffOptions.artifactRef) {
    const artifactValidation = validateDurableResourceRef(handoffOptions.artifactRef);
    if (!artifactValidation.ok) {
      return {
        diagnostics: artifactValidation.diagnostics.map((diagnostic) =>
          createCanonicalStoryboardDiagnostic(
            'invalid-projection-handoff',
            diagnostic.message,
            diagnostic.path,
          ),
        ),
      };
    }
  }

  const payload = projectStoryboardTableToCutPayload(table, options);
  if (!payload) {
    return { diagnostics: validation.diagnostics };
  }
  return {
    payload,
    handoff: {
      target: 'cut',
      storyboardRevisionId: table.revision.revisionId,
      mode: 'one-way-handoff',
      ...(handoffOptions.artifactRef ? { artifactRef: handoffOptions.artifactRef } : {}),
      createdAt: handoffOptions.now?.() ?? new Date().toISOString(),
    },
    diagnostics: validation.diagnostics,
  };
}

function resolveStoryboardImagePrompt(shot: StoryboardShotRow): string | undefined {
  return shot.imagePrompt?.trim() || shot.generationPrompt?.trim() || undefined;
}

export function interpretStoryboardImageStrategies(
  input: StoryboardImageStrategyInterpreterInput,
): StoryboardImageStrategyInterpreterResult {
  const actions: StoryboardImageStrategyAction[] = [];
  const blockedActions: StoryboardImageStrategyBlockedAction[] = [];
  const diagnostics: StoryboardValidationDiagnostic[] = [];
  const generationTool = findStoryboardImageTool(input.availableTools, 'GenerateImage');
  const transformTool = findStoryboardImageTool(input.availableTools, 'TransformImage');

  for (const scene of input.table.scenes) {
    for (const shot of scene.shots) {
      const shotId = shot.shotId ?? `${scene.sceneId}-shot-${shot.shotNumber}`;
      const base = {
        sceneId: scene.sceneId,
        shotId,
        shotNumber: shot.shotNumber,
        imageStrategy: shot.imageStrategy,
      } as const;
      const override = isOverrideInScope(input.userOverride, scene.sceneId, shotId)
        ? input.userOverride
        : undefined;
      const strategyBlocked = validateOverrideForShot(override, shot, base);
      if (strategyBlocked) {
        blockedActions.push(strategyBlocked);
        diagnostics.push(...strategyBlocked.diagnostics);
        continue;
      }

      switch (shot.imageStrategy) {
        case 'reuse-original': {
          if ((shot.sourceMediaRefs ?? []).length === 0) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-source', {
              code: 'image-strategy-missing-source',
              path: ['scenes', scene.sceneId, 'shots', shotId, 'sourceMediaRefs'],
              message: 'reuse-original requires sourceMediaRefs.',
            });
            continue;
          }
          actions.push({
            ...base,
            kind: 'reuse-original',
            sourceMediaRefs: shot.sourceMediaRefs,
          });
          break;
        }
        case 'use-as-reference': {
          if ((shot.sourceMediaRefs ?? []).length === 0) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-source', {
              code: 'image-strategy-missing-source',
              path: ['scenes', scene.sceneId, 'shots', shotId, 'sourceMediaRefs'],
              message: 'use-as-reference requires sourceMediaRefs.',
            });
            continue;
          }
          if (!generationTool?.supportsReferences) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-capability', {
              code: 'missing-capability',
              path: ['availableTools'],
              message: 'use-as-reference requires GenerateImage with reference support.',
            });
            continue;
          }
          const imagePrompt = resolveStoryboardImagePrompt(shot);
          actions.push({
            ...base,
            kind: 'generate-image',
            toolName: generationTool.toolName,
            ...(imagePrompt ? { generationPrompt: imagePrompt } : {}),
            sourceMediaRefs: shot.sourceMediaRefs,
          });
          break;
        }
        case 'generate-new': {
          const imagePrompt = resolveStoryboardImagePrompt(shot);
          if (!imagePrompt) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-prompt', {
              code: 'image-strategy-missing-prompt',
              path: ['scenes', scene.sceneId, 'shots', shotId, 'imagePrompt'],
              message: 'generate-new requires imagePrompt.',
            });
            continue;
          }
          if (!generationTool) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-capability', {
              code: 'missing-capability',
              path: ['availableTools'],
              message: 'generate-new requires GenerateImage capability.',
            });
            continue;
          }
          actions.push({
            ...base,
            kind: 'generate-image',
            toolName: generationTool.toolName,
            generationPrompt: imagePrompt,
          });
          break;
        }
        case 'transform-original': {
          if ((shot.sourceMediaRefs ?? []).length === 0) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-source', {
              code: 'image-strategy-missing-source',
              path: ['scenes', scene.sceneId, 'shots', shotId, 'sourceMediaRefs'],
              message: 'transform-original requires sourceMediaRefs.',
            });
            continue;
          }
          if (!transformTool) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-capability', {
              code: 'missing-capability',
              path: ['availableTools'],
              message: 'transform-original requires TransformImage capability.',
            });
            continue;
          }
          const imagePrompt = resolveStoryboardImagePrompt(shot);
          actions.push({
            ...base,
            kind: 'transform-image',
            toolName: transformTool.toolName,
            ...(imagePrompt ? { generationPrompt: imagePrompt } : {}),
            sourceMediaRefs: shot.sourceMediaRefs,
          });
          break;
        }
      }
    }
  }

  return { actions, blockedActions, diagnostics };
}

function normalizeSemanticStoryboardTable(
  root: Record<string, unknown>,
  diagnostics: StoryboardValidationDiagnostic[],
): StoryboardTable | undefined {
  const schemaVersion = root['schemaVersion'];
  const kind = root['kind'];
  const title = readTrimmedString(root['title']);
  const profile = normalizeProfile(root['profile'], diagnostics);
  const contractVersion =
    root['contractVersion'] === STORYBOARD_CANONICAL_CONTRACT_VERSION
      ? STORYBOARD_CANONICAL_CONTRACT_VERSION
      : undefined;
  const revision = normalizeStoryboardRevision(root['revision']);
  const sourceProfile = normalizeStoryboardSourceProfile(root['sourceProfile']);
  const sourceTrace = normalizeCanonicalSourceTraces(root['sourceTrace']);
  const projections = normalizeStoryboardProjectionHandoffs(root['projections']);
  const source = normalizeStoryboardTableSource(root['source'], diagnostics);
  const extensions = normalizeExtensions(root['extensions'], ['extensions'], diagnostics);
  const scenes = normalizeSceneRows(root['scenes'], diagnostics);

  if (schemaVersion !== 1) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-schema-version',
        ['schemaVersion'],
        'Storyboard table schemaVersion must be 1.',
        { expected: '1', actual: serializableDiagnosticValue(schemaVersion) },
      ),
    );
  }

  if (kind !== 'storyboard-table') {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-kind',
        ['kind'],
        'Storyboard table kind must be storyboard-table.',
        { expected: 'storyboard-table', actual: serializableDiagnosticValue(kind) },
      ),
    );
  }

  if (!title) {
    diagnostics.push(missingRequiredDiagnostic(['title'], 'title'));
  }

  if (!Array.isArray(root['scenes'])) {
    diagnostics.push(missingRequiredDiagnostic(['scenes'], 'scenes'));
  } else if (scenes.length === 0) {
    diagnostics.push(
      storyboardDiagnostic('error', 'empty-scenes', ['scenes'], 'Storyboard table needs scenes.'),
    );
  }

  if (schemaVersion !== 1 || kind !== 'storyboard-table' || !title || scenes.length === 0) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    ...(profile ? { profile } : {}),
    ...(contractVersion ? { contractVersion } : {}),
    ...(revision ? { revision } : {}),
    ...(sourceProfile ? { sourceProfile } : {}),
    ...(sourceTrace.length > 0 ? { sourceTrace } : {}),
    ...(projections ? { projections } : {}),
    ...(source ? { source } : {}),
    title,
    scenes,
    ...(extensions ? { extensions } : {}),
  };
}

function normalizeSceneRows(
  value: unknown,
  diagnostics: StoryboardValidationDiagnostic[],
): readonly StoryboardSceneRow[] {
  if (!Array.isArray(value)) return [];

  if (value.some(isFlatStoryboardShotRecord)) {
    const flatScenes = normalizeFlatStoryboardShotSceneRows(value, diagnostics);
    if (flatScenes.length > 0) return flatScenes;
  }

  return value.flatMap((scene, sceneIndex) => {
    const normalized = normalizeSceneRow(scene, sceneIndex, diagnostics);
    return normalized ? [normalized] : [];
  });
}

function normalizeFlatStoryboardShotSceneRows(
  value: readonly unknown[],
  diagnostics: StoryboardValidationDiagnostic[],
): readonly StoryboardSceneRow[] {
  const groups: StoryboardSceneRow[] = [];
  const groupIndexes = new Map<string, number>();
  let defaultShotIndex = 0;

  for (const [rowIndex, row] of value.entries()) {
    if (!isFlatStoryboardShotRecord(row)) continue;

    const sceneId =
      readTrimmedString(row['sceneId']) ??
      readFlatStoryboardSceneIdFromSource(row) ??
      FLAT_STORYBOARD_SCENE_ID;
    const sceneTitle =
      readTrimmedString(row['sceneTitle']) ??
      readTrimmedString(row['sceneName']) ??
      readTrimmedString(row['page']) ??
      readTrimmedString(row['sourcePage']) ??
      readTrimmedString(row['sourceImage']) ??
      'Storyboard';
    const groupKey = sceneId;
    const existingIndex = groupIndexes.get(groupKey);
    const sceneIndex = existingIndex ?? groups.length;
    if (existingIndex === undefined) {
      groupIndexes.set(groupKey, sceneIndex);
      groups.push({
        sceneId,
        sceneTitle,
        sceneNumber: groups.length + 1,
        shots: [],
      });
    }

    const shot = normalizeShotRow(row, sceneIndex, defaultShotIndex, diagnostics, {
      diagnosticPath: ['scenes', rowIndex],
      defaultShotNumber: defaultShotIndex + 1,
    });
    defaultShotIndex += 1;
    if (!shot) continue;

    const current = groups[sceneIndex];
    if (!current) continue;
    groups[sceneIndex] = {
      ...current,
      shots: [...current.shots, shot],
    };
  }

  return groups.filter((scene) => scene.shots.length > 0);
}

function isFlatStoryboardShotRecord(value: unknown): value is Record<string, unknown> {
  const record = readStoryboardRecord(value);
  if (!record) return false;
  if (Array.isArray(record['shots'])) return false;
  return (
    record['shotNumber'] !== undefined ||
    record['duration'] !== undefined ||
    record['visualDescription'] !== undefined ||
    record['characterAction'] !== undefined ||
    record['imageStrategy'] !== undefined ||
    record['sourceMediaRefs'] !== undefined ||
    record['mediaRefs'] !== undefined
  );
}

function readFlatStoryboardSceneIdFromSource(record: Record<string, unknown>): string | undefined {
  const source =
    readTrimmedString(record['sourcePage']) ??
    readTrimmedString(record['sourceImage']) ??
    readTrimmedString(record['page']);
  if (!source) return undefined;
  return `scene-${source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`;
}

function normalizeSceneRow(
  value: unknown,
  sceneIndex: number,
  diagnostics: StoryboardValidationDiagnostic[],
): StoryboardSceneRow | undefined {
  const path = ['scenes', sceneIndex] as const;
  const record = readStoryboardRecord(value);
  if (!record) {
    diagnostics.push(
      storyboardDiagnostic('error', 'invalid-required-field', path, 'Scene must be an object.'),
    );
    return undefined;
  }

  const sceneId = readTrimmedString(record['sceneId']);
  const sceneTitle = readTrimmedString(record['sceneTitle']);
  const sceneNumber = readOptionalPositiveNumber(record['sceneNumber']);
  const location = readTrimmedString(record['location']);
  const timeOfDay = readTrimmedString(record['timeOfDay']);
  const summary = readTrimmedString(record['summary']);
  const shots = normalizeShotRows(record['shots'], sceneIndex, diagnostics);
  const sourceTrace = normalizeCanonicalSourceTraces(record['sourceTrace']);
  const extensions = normalizeExtensions(
    record['extensions'],
    [...path, 'extensions'],
    diagnostics,
  );

  if (!sceneId) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'sceneId'], 'sceneId'));
  }
  if (!sceneTitle) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'sceneTitle'], 'sceneTitle'));
  }
  if (!Array.isArray(record['shots'])) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'shots'], 'shots'));
  } else if (shots.length === 0) {
    diagnostics.push(
      storyboardDiagnostic('error', 'empty-shots', [...path, 'shots'], 'Scene needs shots.'),
    );
  }

  if (!sceneId || !sceneTitle || shots.length === 0) {
    return undefined;
  }

  return {
    sceneId,
    sceneTitle,
    ...(sceneNumber !== undefined ? { sceneNumber } : {}),
    ...(location ? { location } : {}),
    ...(timeOfDay ? { timeOfDay } : {}),
    ...(summary ? { summary } : {}),
    shots,
    ...(sourceTrace.length > 0 ? { sourceTrace } : {}),
    ...(extensions ? { extensions } : {}),
  };
}

function normalizeShotRows(
  value: unknown,
  sceneIndex: number,
  diagnostics: StoryboardValidationDiagnostic[],
): readonly StoryboardShotRow[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((shot, shotIndex) => {
    const normalized = normalizeShotRow(shot, sceneIndex, shotIndex, diagnostics);
    return normalized ? [normalized] : [];
  });
}

function normalizeShotRow(
  value: unknown,
  sceneIndex: number,
  shotIndex: number,
  diagnostics: StoryboardValidationDiagnostic[],
  options: {
    readonly diagnosticPath?: readonly StoryboardValidationDiagnosticPathSegment[];
    readonly defaultShotNumber?: number;
  } = {},
): StoryboardShotRow | undefined {
  const path = options.diagnosticPath ?? (['scenes', sceneIndex, 'shots', shotIndex] as const);
  const record = readStoryboardRecord(value);
  if (!record) {
    diagnostics.push(
      storyboardDiagnostic('error', 'invalid-required-field', path, 'Shot must be an object.'),
    );
    return undefined;
  }

  const shotId = readTrimmedString(record['shotId']);
  const shotNumber = readOptionalPositiveNumber(record['shotNumber']) ?? options.defaultShotNumber;
  const duration = readOptionalPositiveNumber(record['duration']);
  const visualDescription = readTrimmedString(record['visualDescription']);
  const characterAction = readTrimmedString(record['characterAction']);
  const imageStrategy = normalizeImageStrategy(record['imageStrategy']);
  const sourceMediaRefs = normalizeMediaRefs(
    record['sourceMediaRefs'],
    [...path, 'sourceMediaRefs'],
    diagnostics,
  );
  const generatedMediaRefs = normalizeMediaRefs(
    record['generatedMediaRefs'],
    [...path, 'generatedMediaRefs'],
    diagnostics,
  );
  const mediaRefs = normalizeMediaRefs(record['mediaRefs'], [...path, 'mediaRefs'], diagnostics);
  const inferredImageAlias = normalizeStoryboardImageAlias(record);
  const inferredSourceImage = normalizeStoryboardSourceImage(record);
  const splitRefs =
    sourceMediaRefs.length === 0 && generatedMediaRefs.length === 0 && mediaRefs.length > 0
      ? splitStoryboardMediaRefsByRole(mediaRefs, [...path, 'mediaRefs'])
      : undefined;
  if (splitRefs) {
    diagnostics.push(...splitRefs.diagnostics);
  }
  const normalizedSourceRefs =
    sourceMediaRefs.length > 0 ? sourceMediaRefs : (splitRefs?.sourceMediaRefs ?? []);
  const normalizedGeneratedRefs =
    generatedMediaRefs.length > 0 ? generatedMediaRefs : (splitRefs?.generatedMediaRefs ?? []);
  const normalizedMediaRefs = dedupeStoryboardMediaRefs([
    ...mediaRefs,
    ...normalizedSourceRefs,
    ...normalizedGeneratedRefs,
  ]);
  const characters = normalizeCharacters(
    record['characters'],
    [...path, 'characters'],
    diagnostics,
  );
  const emotion = normalizeStringArray(record['emotion']);
  const sceneTags = normalizeStringArray(record['sceneTags']);
  const vfx = normalizeStringArray(record['vfx']);
  const extensions = normalizeExtensions(
    record['extensions'],
    [...path, 'extensions'],
    diagnostics,
  );
  const normalizedExtensions = mergeStoryboardSourceImageExtension(
    mergeStoryboardImageAliasExtension(extensions, inferredImageAlias),
    inferredSourceImage,
  );
  const shotScale = normalizeShotScale(record['shotScale']);
  const cameraMovement = normalizeCameraMovement(record['cameraMovement']);
  const cameraAngle = normalizeCameraAngle(record['cameraAngle']);
  const dialogue = readTrimmedString(record['dialogue']);
  const voiceOver = readTrimmedString(record['voiceOver']);
  const soundCue = readTrimmedString(record['soundCue']);
  const textCues = normalizeTextCues(record['textCues'], [...path, 'textCues'], diagnostics);
  const voiceCues = normalizeVoiceCues(record['voiceCues'], [...path, 'voiceCues'], diagnostics);
  const imagePrompt = readTrimmedString(record['imagePrompt']);
  const videoPrompt = readTrimmedString(record['videoPrompt']);
  const generationPrompt = readTrimmedString(record['generationPrompt']);
  const visualStyle = readTrimmedString(record['visualStyle']);
  const referenceImagePath = readTrimmedString(record['referenceImagePath']);
  const decisionReason = readTrimmedString(record['decisionReason']);
  const sourceTrace = normalizeCanonicalSourceTraces(record['sourceTrace']);

  if (shotNumber === undefined) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'shotNumber'], 'shotNumber'));
  }
  if (duration === undefined) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'duration'], 'duration'));
  }
  if (!visualDescription) {
    diagnostics.push(
      missingRequiredDiagnostic([...path, 'visualDescription'], 'visualDescription'),
    );
  }
  if (!characterAction) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'characterAction'], 'characterAction'));
  }
  if (!imageStrategy) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-image-strategy',
        [...path, 'imageStrategy'],
        'Shot imageStrategy must be a supported storyboard image strategy.',
        {
          expected: STORYBOARD_SHOT_IMAGE_STRATEGIES.join(', '),
          actual: serializableDiagnosticValue(record['imageStrategy']),
        },
      ),
    );
  }

  if (
    shotNumber === undefined ||
    duration === undefined ||
    !visualDescription ||
    !characterAction ||
    !imageStrategy
  ) {
    return undefined;
  }

  return {
    ...(shotId ? { shotId } : {}),
    shotNumber,
    duration,
    visualDescription,
    ...(characters.length > 0 ? { characters } : {}),
    ...(shotScale ? { shotScale } : {}),
    ...(cameraMovement ? { cameraMovement } : {}),
    ...(cameraAngle ? { cameraAngle } : {}),
    characterAction,
    ...(emotion.length > 0 ? { emotion } : {}),
    ...(sceneTags.length > 0 ? { sceneTags } : {}),
    ...(dialogue ? { dialogue } : {}),
    ...(voiceOver ? { voiceOver } : {}),
    ...(soundCue ? { soundCue } : {}),
    ...(textCues.length > 0 ? { textCues } : {}),
    ...(voiceCues.length > 0 ? { voiceCues } : {}),
    ...(imagePrompt ? { imagePrompt } : {}),
    ...(videoPrompt ? { videoPrompt } : {}),
    ...(generationPrompt ? { generationPrompt } : {}),
    ...(visualStyle ? { visualStyle } : {}),
    ...(referenceImagePath ? { referenceImagePath } : {}),
    ...(vfx.length > 0 ? { vfx } : {}),
    imageStrategy,
    ...(normalizedSourceRefs.length > 0 ? { sourceMediaRefs: normalizedSourceRefs } : {}),
    ...(normalizedGeneratedRefs.length > 0 ? { generatedMediaRefs: normalizedGeneratedRefs } : {}),
    ...(normalizedMediaRefs.length > 0 ? { mediaRefs: normalizedMediaRefs } : {}),
    ...(decisionReason ? { decisionReason } : {}),
    ...(sourceTrace.length > 0 ? { sourceTrace } : {}),
    ...(normalizedExtensions ? { extensions: normalizedExtensions } : {}),
  };
}

function normalizeStoryboardImageAlias(
  record: Record<string, unknown>,
): StoryboardSerializableRecord | undefined {
  const aliases = Object.entries(record).flatMap(([key, value]) => {
    const locator = parseStoryboardImageAliasKey(key);
    if (!locator || !isEnabledStoryboardImageAliasValue(value)) return [];
    return [
      {
        kind: locator.kind,
        number: locator.number,
        key,
      },
    ];
  });
  if (aliases.length === 0) return undefined;
  const preferred = aliases[0];
  if (!preferred) return undefined;
  return {
    kind: preferred.kind,
    number: preferred.number,
    key: preferred.key,
    aliases,
  };
}

function parseStoryboardImageAliasKey(
  key: string,
): { readonly kind: 'page' | 'image' | 'panel'; readonly number: number } | undefined {
  const match = /^(page|image|panel)[_-]?(\d{1,4})$/i.exec(key.trim());
  if (!match) return undefined;
  const kind = normalizeStoryboardImageAliasKind(match[1]);
  const number = parsePositiveInteger(match[2]);
  return kind && number !== undefined ? { kind, number } : undefined;
}

function normalizeStoryboardImageAliasKind(
  value: string | undefined,
): 'page' | 'image' | 'panel' | undefined {
  const normalized = value?.toLowerCase();
  return normalized === 'page' || normalized === 'image' || normalized === 'panel'
    ? normalized
    : undefined;
}

function isEnabledStoryboardImageAliasValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 && !['false', 'no', 'off', '0', 'none', 'null'].includes(normalized);
}

function mergeStoryboardImageAliasExtension(
  extensions: StoryboardExtensionMap | undefined,
  alias: StoryboardSerializableRecord | undefined,
): StoryboardExtensionMap | undefined {
  if (!alias) return extensions;
  return {
    ...(extensions ?? {}),
    [STORYBOARD_IMAGE_ALIAS_EXTENSION]: alias,
  };
}

function normalizeStoryboardSourceImage(
  record: Record<string, unknown>,
): StoryboardSerializableRecord | undefined {
  for (const [key, value] of Object.entries(record)) {
    const source = parseStoryboardSourceImageValue(key, value);
    if (source) return source;
  }
  return undefined;
}

function parseStoryboardSourceImageValue(
  key: string,
  value: unknown,
): StoryboardSerializableRecord | undefined {
  const normalizedKey = normalizeSourceImageKey(key);
  if (!normalizedKey) return undefined;

  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return {
      kind: normalizedKey.kind,
      number: value,
      key,
    };
  }

  const text = readTrimmedString(value);
  if (!text) return undefined;
  const alias = parseStoryboardImageAliasKey(text);
  const number = parsePositiveInteger(text);
  const parsed =
    (alias ? { ...alias, key: text } : undefined) ??
    parseSourceImageText(text) ??
    (number !== undefined ? { kind: normalizedKey.kind, number, key: text } : undefined);
  if (!parsed) return undefined;
  return {
    kind: parsed.kind,
    number: parsed.number,
    key: parsed.key ?? text,
    sourceField: key,
  };
}

function parseSourceImageText(
  value: string,
):
  | { readonly kind: 'page' | 'image' | 'panel'; readonly number: number; readonly key: string }
  | undefined {
  const match =
    /(?:^|[\s/:：#_.\\-])(?:p|page|pg|页|原页|image|img|图|图片|panel|分格)[\s_#_.:-]*(\d{1,4})(?:\b|$)/i.exec(
      value.trim(),
    );
  const number = parsePositiveInteger(match?.[1]);
  if (number === undefined) return undefined;
  const lower = value.toLowerCase();
  const kind = /panel|分格/.test(lower)
    ? 'panel'
    : /image|img|图|图片/.test(lower)
      ? 'image'
      : 'page';
  return { kind, number, key: value };
}

function normalizeSourceImageKey(
  key: string,
): { readonly kind: 'page' | 'image' | 'panel' } | undefined {
  const normalized = key.toLowerCase().replace(/[\s_-]+/g, '');
  if (
    [
      'sourcepage',
      'sourcepagenumber',
      'originalpage',
      'originpage',
      'page',
      'p',
      '原页',
      '来源页',
      '源页',
    ].includes(normalized)
  ) {
    return { kind: 'page' };
  }
  if (
    [
      'sourceimage',
      'sourceimagenumber',
      'originalimage',
      'originimage',
      'image',
      'img',
      '参考图',
      '来源图',
      '源图',
      '图片',
    ].includes(normalized)
  ) {
    return { kind: 'image' };
  }
  if (
    [
      'sourcepanel',
      'sourcepanelnumber',
      'originalpanel',
      'originpanel',
      'panel',
      '分格',
      '格',
    ].includes(normalized)
  ) {
    return { kind: 'panel' };
  }
  return undefined;
}

function mergeStoryboardSourceImageExtension(
  extensions: StoryboardExtensionMap | undefined,
  sourceImage: StoryboardSerializableRecord | undefined,
): StoryboardExtensionMap | undefined {
  if (!sourceImage) return extensions;
  return {
    ...(extensions ?? {}),
    [STORYBOARD_SOURCE_IMAGE_EXTENSION]: sourceImage,
  };
}

function normalizeStoryboardRevision(value: unknown): StoryboardRevisionIdentity | undefined {
  const record = readStoryboardRecord(value);
  if (!record) return undefined;
  const revisionId = readTrimmedString(record['revisionId']);
  const sequence = readOptionalPositiveNumber(record['sequence']);
  const contentDigest = readTrimmedString(record['contentDigest']);
  const parentRevisionId = readTrimmedString(record['parentRevisionId']);
  const createdAt = readTrimmedString(record['createdAt']);
  if (!revisionId || sequence === undefined || !contentDigest || !createdAt) return undefined;
  return {
    revisionId,
    sequence,
    contentDigest,
    ...(parentRevisionId ? { parentRevisionId } : {}),
    createdAt,
  };
}

function normalizeStoryboardSourceProfile(value: unknown): StoryboardSourceProfileId | undefined {
  return typeof value === 'string' &&
    STORYBOARD_SOURCE_PROFILE_IDS.some((profile) => profile === value)
    ? (value as StoryboardSourceProfileId)
    : undefined;
}

function normalizeCanonicalSourceTraces(value: unknown): readonly StoryboardSourceTrace[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const record = readStoryboardRecord(item);
    if (!record) return [];
    const traceId = readTrimmedString(record['traceId']);
    const sourceProfile = normalizeStoryboardSourceProfile(record['sourceProfile']);
    const sourceRef = isResourceRef(record['sourceRef']) ? record['sourceRef'] : undefined;
    const sourceDocumentRef = parseDocumentArchiveResourceRef(record['sourceDocumentRef']);
    if (!traceId || !sourceProfile || (sourceRef ? 1 : 0) + (sourceDocumentRef ? 1 : 0) !== 1) {
      return [];
    }
    const sourceRevisionId = readTrimmedString(record['sourceRevisionId']);
    const sourceSceneId = readTrimmedString(record['sourceSceneId']);
    const sourceShotId = readTrimmedString(record['sourceShotId']);
    const label = readTrimmedString(record['label']);
    const sourceRegion = normalizeStoryboardSourceRegion(record['sourceRegion']);
    return [
      {
        traceId,
        sourceProfile,
        ...(sourceRef ? { sourceRef } : {}),
        ...(sourceDocumentRef ? { sourceDocumentRef } : {}),
        ...(sourceRevisionId ? { sourceRevisionId } : {}),
        ...(sourceSceneId ? { sourceSceneId } : {}),
        ...(sourceShotId ? { sourceShotId } : {}),
        ...(sourceRegion ? { sourceRegion } : {}),
        ...(label ? { label } : {}),
      },
    ];
  });
}

function normalizeStoryboardSourceRegion(value: unknown): StoryboardSourceRegion | undefined {
  const record = readStoryboardRecord(value);
  if (!record) return undefined;
  const fields = ['page', 'startOffset', 'endOffset', 'x', 'y', 'width', 'height'] as const;
  const normalized: Partial<Record<(typeof fields)[number], number>> = {};
  for (const field of fields) {
    const candidate = record[field];
    if (typeof candidate === 'number' && Number.isFinite(candidate)) normalized[field] = candidate;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeStoryboardProjectionHandoffs(
  value: unknown,
): readonly StoryboardProjectionHandoff[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    const record = readStoryboardRecord(item);
    if (!record) return [];
    const target = record['target'];
    const storyboardRevisionId = readTrimmedString(record['storyboardRevisionId']);
    const mode = record['mode'];
    const createdAt = readTrimmedString(record['createdAt']);
    const artifactRef = isResourceRef(record['artifactRef']) ? record['artifactRef'] : undefined;
    if (
      !STORYBOARD_PROJECTION_TARGETS.some((candidate) => candidate === target) ||
      !storyboardRevisionId ||
      (mode !== 'read-only-projection' && mode !== 'one-way-handoff') ||
      !createdAt
    ) {
      return [];
    }
    return [
      {
        target: target as StoryboardProjectionTarget,
        storyboardRevisionId,
        mode,
        ...(artifactRef ? { artifactRef } : {}),
        createdAt,
      },
    ];
  });
}

function isValidStoryboardRevision(revision: StoryboardRevisionIdentity): boolean {
  return (
    revision.revisionId.trim().length > 0 &&
    Number.isInteger(revision.sequence) &&
    revision.sequence > 0 &&
    revision.contentDigest.trim().length > 0 &&
    Number.isFinite(Date.parse(revision.createdAt))
  );
}

function validateCanonicalSourceTrace(
  traces: readonly StoryboardSourceTrace[],
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): void {
  traces.forEach((trace, index) => {
    const identityCount = (trace.sourceRef ? 1 : 0) + (trace.sourceDocumentRef ? 1 : 0);
    if (
      !trace.traceId.trim() ||
      !STORYBOARD_SOURCE_PROFILE_IDS.some((profile) => profile === trace.sourceProfile) ||
      identityCount !== 1 ||
      (trace.sourceRef !== undefined && !validateDurableResourceRef(trace.sourceRef).ok) ||
      (trace.sourceDocumentRef !== undefined &&
        parseDocumentArchiveResourceRef(trace.sourceDocumentRef) === undefined)
    ) {
      diagnostics.push(
        createCanonicalStoryboardDiagnostic(
          'invalid-source-trace',
          'Source trace requires an id, supported profile, and exactly one valid stable source reference.',
          [...path, index],
        ),
      );
    }
  });
}

function createCanonicalStoryboardDiagnostic(
  code: CanonicalStoryboardDiagnosticCode,
  message: string,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
): StoryboardValidationDiagnostic {
  return { code, severity: 'error', message, path };
}

function validateNormalizedStoryboardTable(
  table: StoryboardTable,
  options: StoryboardValidationOptions = {},
): readonly StoryboardValidationDiagnostic[] {
  const diagnostics: StoryboardValidationDiagnostic[] = [];
  if (table.profile) {
    diagnostics.push(...validateProfileHints(table));
  }

  for (const [sceneIndex, scene] of table.scenes.entries()) {
    validateSceneVideoPrompt(scene, sceneIndex, diagnostics);
    for (const [shotIndex, shot] of scene.shots.entries()) {
      const path = ['scenes', sceneIndex, 'shots', shotIndex] as const;
      validateShotStrategy(shot, path, diagnostics);
      validateProfileSourceMediaRefs(table, shot, path, diagnostics, options);
      validateLayeredMediaRefs(
        shot.sourceMediaRefs,
        'source',
        [...path, 'sourceMediaRefs'],
        diagnostics,
      );
      validateLayeredMediaRefs(
        shot.generatedMediaRefs,
        'generated',
        [...path, 'generatedMediaRefs'],
        diagnostics,
      );
      validateMediaRefs(shot.sourceMediaRefs, [...path, 'sourceMediaRefs'], diagnostics, options);
      validateMediaRefs(
        shot.generatedMediaRefs,
        [...path, 'generatedMediaRefs'],
        diagnostics,
        options,
      );
      validateMediaRefs(shot.mediaRefs, [...path, 'mediaRefs'], diagnostics, options);
      validateCueSpeakerBindings(shot.textCues, [...path, 'textCues'], diagnostics);
      validateCueSpeakerBindings(shot.voiceCues, [...path, 'voiceCues'], diagnostics);
      validateCueSpeakerEntityKinds(shot.textCues, [...path, 'textCues'], diagnostics);
      validateCueSpeakerEntityKinds(shot.voiceCues, [...path, 'voiceCues'], diagnostics);
    }
  }

  return diagnostics;
}

function validateCueSpeakerBindings(
  cues:
    | readonly {
        readonly speakerCharacterId?: string;
        readonly speakerEntityRef?: CreativeEntityRef;
      }[]
    | undefined,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): void {
  for (const [index, cue] of (cues ?? []).entries()) {
    const speakerCharacterId = cue.speakerCharacterId?.trim();
    const speakerEntityId = cue.speakerEntityRef?.entityId.trim();
    if (!speakerCharacterId || !speakerEntityId || speakerCharacterId === speakerEntityId) {
      continue;
    }
    diagnostics.push(
      storyboardDiagnostic(
        'warning',
        'invalid-required-field',
        [...path, index, 'speakerEntityRef'],
        'Cue speakerCharacterId does not match speakerEntityRef.entityId; speakerEntityRef takes precedence downstream.',
        {
          expected: speakerCharacterId,
          actual: speakerEntityId,
        },
      ),
    );
  }
}

function validateCueSpeakerEntityKinds(
  cues:
    | readonly {
        readonly speakerEntityRef?: CreativeEntityRef;
      }[]
    | undefined,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): void {
  for (const [index, cue] of (cues ?? []).entries()) {
    if (!cue.speakerEntityRef || cue.speakerEntityRef.entityKind === 'character') continue;
    diagnostics.push(
      storyboardDiagnostic(
        'warning',
        'invalid-required-field',
        [...path, index, 'speakerEntityRef', 'entityKind'],
        'Cue speakerEntityRef should reference a character entity.',
        {
          expected: 'character',
          actual: cue.speakerEntityRef.entityKind,
        },
      ),
    );
  }
}

function validateSceneVideoPrompt(
  scene: StoryboardSceneRow,
  sceneIndex: number,
  diagnostics: StoryboardValidationDiagnostic[],
): void {
  const promptShotIndices = scene.shots.flatMap((shot, shotIndex) =>
    shot.videoPrompt?.trim() ? [shotIndex] : [],
  );
  if (promptShotIndices.length === 0) return;

  for (const shotIndex of promptShotIndices) {
    if (shotIndex === 0 && promptShotIndices.length === 1) continue;
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-scene-video-prompt',
        ['scenes', sceneIndex, 'shots', shotIndex, 'videoPrompt'],
        'videoPrompt is scene-level and must appear at most once on the first shot.',
      ),
    );
  }
}

function validateShotStrategy(
  shot: StoryboardShotRow,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): void {
  const sourceRefs = shot.sourceMediaRefs ?? [];
  if (
    (shot.imageStrategy === 'reuse-original' ||
      shot.imageStrategy === 'use-as-reference' ||
      shot.imageStrategy === 'transform-original') &&
    sourceRefs.length === 0
  ) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'image-strategy-missing-source',
        [...path, 'sourceMediaRefs'],
        `${shot.imageStrategy} requires sourceMediaRefs.`,
      ),
    );
  }

  if (
    shot.imageStrategy === 'generate-new' &&
    !shot.imagePrompt?.trim() &&
    !shot.generationPrompt?.trim()
  ) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'image-strategy-missing-prompt',
        [...path, 'imagePrompt'],
        'generate-new requires imagePrompt.',
      ),
    );
  }
}

function validateProfileSourceMediaRefs(
  table: StoryboardTable,
  shot: StoryboardShotRow,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
  options: StoryboardValidationOptions,
): void {
  const profile = sourceBackedStoryboardProfile(table);
  if (!profile || !isSourceBackedStoryboardImageStrategy(shot.imageStrategy)) return;

  const sourceRefs = shot.sourceMediaRefs ?? [];
  if (sourceRefs.length === 0) return;
  const hasStableSourceRef = sourceRefs.some(
    (ref) => classifyStoryboardMediaIdentity(ref, options).kind === 'stable',
  );
  if (hasStableSourceRef) return;

  diagnostics.push(
    storyboardDiagnostic(
      'error',
      'image-strategy-missing-source',
      [...path, 'sourceMediaRefs'],
      `${profile} ${shot.imageStrategy} shots require resolvable sourceMediaRefs.`,
      {
        expected: 'stable sourceMediaRefs',
        details: { profile, imageStrategy: shot.imageStrategy },
      },
    ),
  );
}

function sourceBackedStoryboardProfile(table: StoryboardTable): string | undefined {
  return table.sourceProfile === STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID ||
    table.sourceProfile === 'from-image-sequence'
    ? table.sourceProfile
    : undefined;
}

function validateLayeredMediaRefs(
  refs: readonly StoryboardMediaRef[] | undefined,
  layer: 'source' | 'generated',
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): void {
  for (const [index, ref] of (refs ?? []).entries()) {
    const allowed =
      layer === 'source'
        ? isSourceStoryboardMediaRole(ref.role)
        : isGeneratedStoryboardMediaRole(ref.role);
    if (!allowed) {
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'media-ref-role-mismatch',
          [...path, index, 'role'],
          `${layer}MediaRefs contains incompatible role ${ref.role}.`,
          {
            expected:
              layer === 'source'
                ? STORYBOARD_SOURCE_MEDIA_ROLES.join(', ')
                : STORYBOARD_GENERATED_MEDIA_ROLES.join(', '),
            actual: ref.role,
          },
        ),
      );
    }
  }
}

function validateMediaRefs(
  refs: readonly StoryboardMediaRef[] | undefined,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
  options: StoryboardValidationOptions,
): void {
  for (const [index, ref] of (refs ?? []).entries()) {
    validateMediaLocator(ref.locator, [...path, index, 'locator'], diagnostics);
    validateMediaIdentityClassification(ref, [...path, index, 'locator'], diagnostics, options);
  }
}

function validateMediaIdentityClassification(
  ref: StoryboardMediaRef,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
  options: StoryboardValidationOptions,
): void {
  const classification = classifyStoryboardMediaIdentity(ref, options);
  switch (classification.kind) {
    case 'stable':
      return;
    case 'runtime-only':
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'runtime-only-media-ref',
          path,
          'Storyboard media identity cannot use a runtime-only handle.',
          {
            actual: classification.value,
            details: { reason: classification.reason },
          },
        ),
      );
      return;
    case 'unsafe-cache-path':
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'unsafe-media-ref',
          path,
          'Storyboard media identity cannot use cache paths or unsafe local handles.',
          {
            actual: classification.value,
            details: { reason: classification.reason },
          },
        ),
      );
      return;
    case 'ambiguous-alias':
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'ambiguous-media-alias',
          path,
          'Storyboard media alias resolves to more than one source.',
          {
            actual: classification.alias,
            details: { reason: classification.reason },
          },
        ),
      );
      return;
    case 'unresolved-tool-result':
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'unresolved-tool-result',
          path,
          'Storyboard media references a tool result that is not available.',
          {
            actual: classification.toolCallId,
            details: { reason: classification.reason },
          },
        ),
      );
      return;
  }
}

function validateMediaLocator(
  locator: StoryboardMediaLocator,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): void {
  switch (locator.type) {
    case 'tool-result':
      if (
        !locator.toolCallId.trim() ||
        !Number.isInteger(locator.assetIndex) ||
        locator.assetIndex < 0
      ) {
        diagnostics.push(
          storyboardDiagnostic('error', 'invalid-media-ref', path, 'Invalid tool-result locator.'),
        );
      }
      return;
    case 'asset':
      if (!locator.assetId.trim() || (locator.uri !== undefined && isUnsafeMediaUri(locator.uri))) {
        diagnostics.push(
          storyboardDiagnostic(
            'error',
            'unsafe-media-ref',
            path,
            'Invalid or unsafe asset locator.',
          ),
        );
      }
      return;
    case 'workspace-path':
      if (!locator.path.trim() || isUnsafeWorkspacePath(locator.path)) {
        diagnostics.push(
          storyboardDiagnostic(
            'error',
            'unsafe-media-ref',
            path,
            'Workspace media path must be relative or use ${VAR}/path.',
          ),
        );
      }
      return;
    case 'canvas-node':
      if (!locator.canvasNodeId.trim()) {
        diagnostics.push(
          storyboardDiagnostic(
            'error',
            'invalid-media-ref',
            path,
            'canvas-node locator needs canvasNodeId.',
          ),
        );
      }
      return;
    case 'story-source':
      if (!locator.storyId.trim()) {
        diagnostics.push(
          storyboardDiagnostic(
            'error',
            'invalid-media-ref',
            path,
            'story-source locator needs storyId.',
          ),
        );
      }
      return;
  }
}

function selectStoryboardShotImageRef(shot: StoryboardShotRow): StoryboardMediaRef | undefined {
  const preferred = [
    ...(shot.generatedMediaRefs ?? []),
    ...(shot.sourceMediaRefs ?? []),
    ...(shot.mediaRefs ?? []),
  ];
  return preferred.find(
    (ref) =>
      Boolean(ref.documentResourceRef) ||
      Boolean(ref.resourceRef) ||
      ref.mimeType?.startsWith('image/') ||
      ref.locator.type === 'workspace-path',
  );
}

function resolveStoryboardWorkspacePath(mediaRef: StoryboardMediaRef): string | undefined {
  if (mediaRef.locator.type === 'workspace-path') return mediaRef.locator.path;
  if (mediaRef.locator.type === 'asset') return mediaRef.locator.uri;
  return undefined;
}

function findStoryboardImageTool(
  tools: readonly StoryboardImageToolCapability[],
  toolName: 'GenerateImage' | 'TransformImage',
): StoryboardImageToolCapability | undefined {
  return tools.find((tool) => tool.toolName === toolName);
}

function isOverrideInScope(
  override: StoryboardImageStrategyOverride | undefined,
  sceneId: string,
  shotId: string,
): boolean {
  if (!override) return false;
  if (!override.scope) return true;
  const sceneScoped = override.scope.sceneIds?.includes(sceneId) ?? false;
  const shotScoped = override.scope.shotIds?.includes(shotId) ?? false;
  return sceneScoped || shotScoped;
}

function validateOverrideForShot(
  override: StoryboardImageStrategyOverride | undefined,
  shot: StoryboardShotRow,
  base: Omit<StoryboardImageStrategyBlockedAction, 'reason' | 'diagnostics'>,
): StoryboardImageStrategyBlockedAction | undefined {
  if (!override) return undefined;
  if (override.allowedStrategies && !override.allowedStrategies.includes(shot.imageStrategy)) {
    return createBlockedAction(base, 'strategy-not-allowed', {
      code: 'generation-denied',
      path: ['userOverride', 'allowedStrategies'],
      message: `Storyboard image strategy ${shot.imageStrategy} is not allowed by user override.`,
    });
  }
  if (shot.imageStrategy === 'reuse-original') return undefined;
  if (override.generationPolicy === 'deny') {
    return createBlockedAction(base, 'generation-denied', {
      code: 'generation-denied',
      path: ['userOverride', 'generationPolicy'],
      message: 'User override denies image generation or transformation.',
    });
  }
  if (override.generationPolicy === 'confirm') {
    return createBlockedAction(base, 'confirmation-required', {
      code: 'generation-confirmation-required',
      path: ['userOverride', 'generationPolicy'],
      message: 'User override requires confirmation before image generation or transformation.',
    });
  }
  return undefined;
}

function pushBlockedAction(
  blockedActions: StoryboardImageStrategyBlockedAction[],
  diagnostics: StoryboardValidationDiagnostic[],
  base: Omit<StoryboardImageStrategyBlockedAction, 'reason' | 'diagnostics'>,
  reason: StoryboardImageStrategyBlockedAction['reason'],
  diagnostic: {
    readonly code: StoryboardValidationDiagnosticCode;
    readonly path: readonly StoryboardValidationDiagnosticPathSegment[];
    readonly message: string;
  },
): void {
  const blocked = createBlockedAction(base, reason, diagnostic);
  blockedActions.push(blocked);
  diagnostics.push(...blocked.diagnostics);
}

function createBlockedAction(
  base: Omit<StoryboardImageStrategyBlockedAction, 'reason' | 'diagnostics'>,
  reason: StoryboardImageStrategyBlockedAction['reason'],
  diagnostic: {
    readonly code: StoryboardValidationDiagnosticCode;
    readonly path: readonly StoryboardValidationDiagnosticPathSegment[];
    readonly message: string;
  },
): StoryboardImageStrategyBlockedAction {
  return {
    ...base,
    reason,
    diagnostics: [
      storyboardDiagnostic(
        reason === 'missing-source' || reason === 'missing-prompt' ? 'error' : 'warning',
        diagnostic.code,
        diagnostic.path,
        diagnostic.message,
      ),
    ],
  };
}

function validateProfileHints(table: StoryboardTable): readonly StoryboardValidationDiagnostic[] {
  const diagnostics: StoryboardValidationDiagnostic[] = [];
  for (const [sceneIndex, scene] of table.scenes.entries()) {
    for (const [shotIndex, shot] of scene.shots.entries()) {
      const path = ['scenes', sceneIndex, 'shots', shotIndex] as const;
      if (table.profile === 'script-breakdown' && !shot.cameraAngle) {
        diagnostics.push(
          storyboardDiagnostic(
            'profileHint',
            'missing-profile-field',
            [...path, 'cameraAngle'],
            'script-breakdown profile recommends cameraAngle.',
          ),
        );
      }
      if (
        table.sourceProfile === STORYBOARD_FROM_COMIC_SOURCE_PROFILE_ID &&
        (shot.sourceMediaRefs ?? []).length === 0
      ) {
        diagnostics.push(
          storyboardDiagnostic(
            'profileHint',
            'missing-profile-field',
            [...path, 'sourceMediaRefs'],
            'from-comic profile recommends sourceMediaRefs.',
          ),
        );
      }
    }
  }
  return diagnostics;
}

function normalizeMediaRefs(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): readonly StoryboardMediaRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((ref, index) => {
    const normalized = normalizeMediaRef(ref, [...path, index], diagnostics);
    return normalized ? [normalized] : [];
  });
}

function normalizeMediaRef(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): StoryboardMediaRef | undefined {
  const record = readStoryboardRecord(value);
  if (!record) {
    diagnostics.push(
      storyboardDiagnostic('error', 'invalid-media-ref', path, 'Media ref must be an object.'),
    );
    return undefined;
  }

  const refId = readTrimmedString(record['refId']);
  const role = normalizeMediaRole(record['role']);
  const locator = normalizeMediaLocator(record['locator'], [...path, 'locator'], diagnostics);
  const label = readTrimmedString(record['label']) ?? readTrimmedString(record['caption']);
  const mimeType = readTrimmedString(record['mimeType']);
  const documentResourceRef = normalizeDocumentArchiveResourceRef(record['documentResourceRef']);
  const resourceRef = normalizeResourceRef(record['resourceRef']);
  const metadata = normalizeSerializableRecord(record['metadata']);

  if (!refId) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-media-ref',
        [...path, 'refId'],
        'Media ref needs refId.',
      ),
    );
  }
  if (!role) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-media-ref',
        [...path, 'role'],
        'Media ref needs a supported role.',
        {
          expected: STORYBOARD_MEDIA_ROLES.join(', '),
          actual: serializableDiagnosticValue(record['role']),
        },
      ),
    );
  }
  if (!locator) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-media-ref',
        [...path, 'locator'],
        'Media ref needs locator.',
      ),
    );
  }

  if (!refId || !role || !locator) return undefined;

  return {
    refId,
    role,
    locator,
    ...(label ? { label } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(documentResourceRef ? { documentResourceRef } : {}),
    ...(resourceRef ? { resourceRef } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function normalizeResourceRef(value: unknown): ResourceRef | undefined {
  return isResourceRef(value) ? value : undefined;
}

function normalizeDocumentArchiveResourceRef(
  value: unknown,
): DocumentArchiveResourceRef | undefined {
  const ref = parseDocumentArchiveResourceRef(value);
  if (!ref) return undefined;
  return ref;
}

function normalizeMediaLocator(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): StoryboardMediaLocator | undefined {
  const record = readStoryboardRecord(value);
  if (!record) return undefined;
  const type = record['type'];
  switch (type) {
    case 'tool-result': {
      const toolCallId = readTrimmedString(record['toolCallId']);
      const assetIndex = readNonNegativeInteger(record['assetIndex']);
      if (!toolCallId || assetIndex === undefined) return undefined;
      return {
        type,
        toolCallId,
        assetIndex,
        ...(readTrimmedString(record['taskId'])
          ? { taskId: readTrimmedString(record['taskId']) }
          : {}),
      };
    }
    case 'asset': {
      const assetId = readTrimmedString(record['assetId']);
      if (!assetId) return undefined;
      return {
        type,
        assetId,
        ...(readTrimmedString(record['assetVersion'])
          ? { assetVersion: readTrimmedString(record['assetVersion']) }
          : {}),
        ...(readTrimmedString(record['uri']) ? { uri: readTrimmedString(record['uri']) } : {}),
      };
    }
    case 'workspace-path': {
      const pathValue = readTrimmedString(record['path']);
      return pathValue ? { type, path: pathValue } : undefined;
    }
    case 'canvas-node': {
      const canvasNodeId = readTrimmedString(record['canvasNodeId']);
      return canvasNodeId
        ? {
            type,
            canvasNodeId,
            ...(readTrimmedString(record['outputId'])
              ? { outputId: readTrimmedString(record['outputId']) }
              : {}),
          }
        : undefined;
    }
    case 'story-source': {
      const storyId = readTrimmedString(record['storyId']);
      const frameIndex = readNonNegativeInteger(record['frameIndex']);
      return storyId
        ? {
            type,
            storyId,
            ...(readTrimmedString(record['sceneId'])
              ? { sceneId: readTrimmedString(record['sceneId']) }
              : {}),
            ...(frameIndex !== undefined ? { frameIndex } : {}),
          }
        : undefined;
    }
    default:
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'invalid-media-ref',
          path,
          'Media locator has unsupported type.',
          { actual: serializableDiagnosticValue(type) },
        ),
      );
      return undefined;
  }
}

function normalizeCharacters(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): readonly StoryboardShotCharacter[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((character, index) => {
    const record = readStoryboardRecord(character);
    if (!record) return [];
    const name = readTrimmedString(record['name']) ?? readTrimmedString(record['characterName']);
    if (!name) {
      diagnostics.push(
        storyboardDiagnostic(
          'warning',
          'invalid-required-field',
          [...path, index, 'name'],
          'Character entry needs name.',
        ),
      );
      return [];
    }
    const role = normalizeCharacterRole(record['role']);
    const entityRef = normalizeCreativeEntityRef(
      record['entityRef'],
      [...path, index, 'entityRef'],
      diagnostics,
    );
    const candidateId = readTrimmedString(record['candidateId']);
    return [
      {
        ...(readTrimmedString(record['characterId'])
          ? { characterId: readTrimmedString(record['characterId']) }
          : {}),
        ...(entityRef ? { entityRef } : {}),
        ...(candidateId ? { candidateId } : {}),
        name,
        ...(role ? { role } : {}),
        ...(readTrimmedString(record['action'])
          ? { action: readTrimmedString(record['action']) }
          : {}),
        ...(readTrimmedString(record['emotion'])
          ? { emotion: readTrimmedString(record['emotion']) }
          : {}),
        ...(readTrimmedString(record['continuityNotes'])
          ? { continuityNotes: readTrimmedString(record['continuityNotes']) }
          : {}),
        ...(readTrimmedString(record['appearanceNotes'])
          ? { appearanceNotes: readTrimmedString(record['appearanceNotes']) }
          : {}),
      },
    ];
  });
}

function normalizeTextCues(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): readonly StoryboardTextCue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((cue, index) => {
    const record = readStoryboardRecord(cue);
    const cuePath = [...path, index] as const;
    if (!record) return [];

    const cueId = readTrimmedString(record['cueId']);
    const kind = normalizeTextCueKind(record['kind']);
    const text = readTrimmedString(record['text']);
    if (!cueId || !kind || !text) {
      diagnostics.push(
        storyboardDiagnostic(
          'warning',
          'invalid-required-field',
          cuePath,
          'Text cue needs cueId, kind, and text.',
        ),
      );
      return [];
    }

    const speakerEntityRef = normalizeCreativeEntityRef(
      record['speakerEntityRef'],
      [...cuePath, 'speakerEntityRef'],
      diagnostics,
    );
    const confidence = readOptionalConfidence(
      record['confidence'],
      [...cuePath, 'confidence'],
      diagnostics,
    );
    const extensions = normalizeExtensions(
      record['extensions'],
      [...cuePath, 'extensions'],
      diagnostics,
    );

    return [
      {
        cueId,
        kind,
        text,
        ...(readTrimmedString(record['speakerName'])
          ? { speakerName: readTrimmedString(record['speakerName']) }
          : {}),
        ...(readTrimmedString(record['speakerCharacterId'])
          ? { speakerCharacterId: readTrimmedString(record['speakerCharacterId']) }
          : {}),
        ...(speakerEntityRef ? { speakerEntityRef } : {}),
        ...(readTrimmedString(record['sourceRefId'])
          ? { sourceRefId: readTrimmedString(record['sourceRefId']) }
          : {}),
        ...(readTrimmedString(record['language'])
          ? { language: readTrimmedString(record['language']) }
          : {}),
        ...(confidence !== undefined ? { confidence } : {}),
        ...(readTrimmedString(record['emotion'])
          ? { emotion: readTrimmedString(record['emotion']) }
          : {}),
        ...(readTrimmedString(record['delivery'])
          ? { delivery: readTrimmedString(record['delivery']) }
          : {}),
        ...(extensions ? { extensions } : {}),
      },
    ];
  });
}

function normalizeVoiceCues(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): readonly StoryboardVoiceCue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((cue, index) => {
    const record = readStoryboardRecord(cue);
    const cuePath = [...path, index] as const;
    if (!record) return [];

    const cueId = readTrimmedString(record['cueId']);
    const kind = normalizeVoiceCueKind(record['kind']);
    const text = readTrimmedString(record['text']);
    if (!cueId || !kind || !text) {
      diagnostics.push(
        storyboardDiagnostic(
          'warning',
          'invalid-required-field',
          cuePath,
          'Voice cue needs cueId, kind, and text.',
        ),
      );
      return [];
    }

    const speakerEntityRef = normalizeCreativeEntityRef(
      record['speakerEntityRef'],
      [...cuePath, 'speakerEntityRef'],
      diagnostics,
    );
    const requestedRepresentationKind = normalizeRepresentationKind(
      record['requestedRepresentationKind'],
    );
    const extensions = normalizeExtensions(
      record['extensions'],
      [...cuePath, 'extensions'],
      diagnostics,
    );

    return [
      {
        cueId,
        kind,
        text,
        ...(readTrimmedString(record['speakerName'])
          ? { speakerName: readTrimmedString(record['speakerName']) }
          : {}),
        ...(readTrimmedString(record['speakerCharacterId'])
          ? { speakerCharacterId: readTrimmedString(record['speakerCharacterId']) }
          : {}),
        ...(speakerEntityRef ? { speakerEntityRef } : {}),
        ...(readTrimmedString(record['emotion'])
          ? { emotion: readTrimmedString(record['emotion']) }
          : {}),
        ...(readTrimmedString(record['delivery'])
          ? { delivery: readTrimmedString(record['delivery']) }
          : {}),
        ...(readTrimmedString(record['voiceAssetId'])
          ? { voiceAssetId: readTrimmedString(record['voiceAssetId']) }
          : {}),
        ...(requestedRepresentationKind ? { requestedRepresentationKind } : {}),
        ...(readTrimmedString(record['sourceRefId'])
          ? { sourceRefId: readTrimmedString(record['sourceRefId']) }
          : {}),
        ...(extensions ? { extensions } : {}),
      },
    ];
  });
}

function normalizeTextCueKind(value: unknown): StoryboardTextCueKind | undefined {
  return STORYBOARD_TEXT_CUE_KINDS.includes(value as StoryboardTextCueKind)
    ? (value as StoryboardTextCueKind)
    : undefined;
}

function normalizeVoiceCueKind(value: unknown): StoryboardVoiceCueKind | undefined {
  return value === 'dialogue' || value === 'voiceOver' ? value : undefined;
}

function normalizeCreativeEntityRef(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): CreativeEntityRef | undefined {
  const record = readStoryboardRecord(value);
  if (!record) return undefined;
  const entityId = readTrimmedString(record['entityId']);
  const entityKind = normalizeCreativeEntityKind(record['entityKind']);
  if (!entityId || !entityKind) {
    diagnostics.push(
      storyboardDiagnostic(
        'warning',
        'invalid-required-field',
        path,
        'Creative entity ref needs entityId and supported entityKind.',
      ),
    );
    return undefined;
  }
  return {
    entityId,
    entityKind,
    ...(readTrimmedString(record['projectRoot'])
      ? { projectRoot: readTrimmedString(record['projectRoot']) }
      : {}),
    ...(readTrimmedString(record['source']) ? { source: readTrimmedString(record['source']) } : {}),
  };
}

function normalizeCreativeEntityKind(value: unknown): CreativeEntityRef['entityKind'] | undefined {
  return value === 'character' ||
    value === 'scene' ||
    value === 'object' ||
    value === 'location' ||
    value === 'style'
    ? value
    : undefined;
}

function normalizeRepresentationKind(value: unknown): RepresentationKind | undefined {
  return value === 'portrait' ||
    value === 'reference' ||
    value === 'puppet-bone' ||
    value === 'live2d' ||
    value === 'live3d' ||
    value === 'voice' ||
    value === 'motion' ||
    value === 'video'
    ? value
    : undefined;
}

function normalizeStoryboardTableSource(
  value: unknown,
  diagnostics: StoryboardValidationDiagnostic[],
): StoryboardTableSource | undefined {
  const record = readStoryboardRecord(value);
  if (!record) return undefined;
  const type = record['type'];
  if (
    type !== 'story' &&
    type !== 'agent' &&
    type !== 'document' &&
    type !== 'image' &&
    type !== 'manual'
  ) {
    diagnostics.push(
      storyboardDiagnostic(
        'warning',
        'invalid-required-field',
        ['source', 'type'],
        'Unknown source type.',
      ),
    );
    return undefined;
  }
  return {
    type,
    ...(readTrimmedString(record['sourceUri'])
      ? { sourceUri: readTrimmedString(record['sourceUri']) }
      : {}),
    ...(readTrimmedString(record['sourceSceneId'])
      ? { sourceSceneId: readTrimmedString(record['sourceSceneId']) }
      : {}),
    ...(readTrimmedString(record['sourceDocumentId'])
      ? { sourceDocumentId: readTrimmedString(record['sourceDocumentId']) }
      : {}),
    ...(readTrimmedString(record['label']) ? { label: readTrimmedString(record['label']) } : {}),
  };
}

function normalizeExtensions(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): StoryboardExtensionMap | undefined {
  const record = readStoryboardRecord(value);
  if (!record) return undefined;

  const entries: [StoryboardExtensionNamespace, StoryboardSerializableValue][] = [];
  for (const [key, extensionValue] of Object.entries(record)) {
    if (!key.startsWith('neko.')) {
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'invalid-extension-namespace',
          [...path, key],
          'Storyboard extension keys must use the neko.* namespace.',
        ),
      );
      continue;
    }
    if (!isStoryboardSerializableValue(extensionValue)) {
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'non-serializable-extension',
          [...path, key],
          'Storyboard extension values must be JSON-serializable.',
        ),
      );
      continue;
    }
    entries.push([key as StoryboardExtensionNamespace, extensionValue]);
  }

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeSerializableRecord(value: unknown): StoryboardSerializableRecord | undefined {
  const record = readStoryboardRecord(value);
  if (!record || !isStoryboardSerializableRecord(record)) return undefined;
  return record;
}

function isStoryboardSerializableRecord(value: unknown): value is StoryboardSerializableRecord {
  return readStoryboardRecord(value) !== undefined && isStoryboardSerializableValue(value);
}

function normalizeProfile(
  value: unknown,
  diagnostics: StoryboardValidationDiagnostic[],
): StoryboardTableProfile | undefined {
  if (value === undefined) return undefined;
  if (isStoryboardTableProfile(value)) return value;
  diagnostics.push(
    storyboardDiagnostic(
      'warning',
      'invalid-profile',
      ['profile'],
      'Storyboard profile is not a built-in v1 profile.',
      {
        expected: STORYBOARD_TABLE_PROFILES.join(', '),
        actual: serializableDiagnosticValue(value),
      },
    ),
  );
  return undefined;
}

function normalizeImageStrategy(value: unknown): StoryboardShotImageStrategy | undefined {
  return isStoryboardImageStrategy(value) ? value : undefined;
}

function normalizeMediaRole(value: unknown): StoryboardMediaRole | undefined {
  return isStoryboardMediaRole(value) ? value : undefined;
}

function normalizeCharacterRole(value: unknown): StoryboardShotCharacterRole | undefined {
  return value === 'primary' || value === 'secondary' || value === 'background' ? value : undefined;
}

function normalizeShotScale(value: unknown): ShotScale | undefined {
  return value === 'ECU' ||
    value === 'CU' ||
    value === 'MCU' ||
    value === 'MS' ||
    value === 'MLS' ||
    value === 'LS' ||
    value === 'VLS' ||
    value === 'ELS' ||
    value === 'OTS' ||
    value === 'POV'
    ? value
    : undefined;
}

function normalizeCameraMovement(value: unknown): CameraMovement | undefined {
  return value === 'static' ||
    value === 'pan' ||
    value === 'tilt' ||
    value === 'zoom-in' ||
    value === 'zoom-out' ||
    value === 'dolly' ||
    value === 'dolly-in' ||
    value === 'dolly-out' ||
    value === 'handheld' ||
    value === 'crane'
    ? value
    : undefined;
}

function normalizeCameraAngle(value: unknown): CameraAngle | undefined {
  return value === 'eye-level' ||
    value === 'high-angle' ||
    value === 'low-angle' ||
    value === 'bird-eye' ||
    value === 'dutch'
    ? value
    : undefined;
}

function isStoryboardTableProfile(value: unknown): value is StoryboardTableProfile {
  return (
    typeof value === 'string' && (STORYBOARD_TABLE_PROFILES as readonly string[]).includes(value)
  );
}

function isStoryboardImageStrategy(value: unknown): value is StoryboardShotImageStrategy {
  return (
    typeof value === 'string' &&
    (STORYBOARD_SHOT_IMAGE_STRATEGIES as readonly string[]).includes(value)
  );
}

function isStoryboardMediaRole(value: unknown): value is StoryboardMediaRole {
  return typeof value === 'string' && (STORYBOARD_MEDIA_ROLES as readonly string[]).includes(value);
}

function isSourceStoryboardMediaRole(
  value: StoryboardMediaRole,
): value is StoryboardSourceMediaRole {
  return (STORYBOARD_SOURCE_MEDIA_ROLES as readonly string[]).includes(value);
}

function isGeneratedStoryboardMediaRole(
  value: StoryboardMediaRole,
): value is StoryboardGeneratedMediaRole {
  return (STORYBOARD_GENERATED_MEDIA_ROLES as readonly string[]).includes(value);
}

function isSourceBackedStoryboardImageStrategy(
  value: StoryboardShotImageStrategy,
): value is 'reuse-original' | 'use-as-reference' | 'transform-original' {
  return (
    value === 'reuse-original' || value === 'use-as-reference' || value === 'transform-original'
  );
}

function normalizeStoryboardAlias(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.toLowerCase().replace(/[\s-]+/g, '_');
}

function isRuntimeOnlyStoryboardMediaValue(value: string): boolean {
  return (
    /^vscode-(?:webview-resource|resource):/i.test(value) ||
    /^vscode-webview:\/\//i.test(value) ||
    /^blob:/i.test(value) ||
    /^object:/i.test(value)
  );
}

function isManagedOrAbsoluteCachePath(value: string): boolean {
  if (isAbsoluteLocalPath(value)) return true;
  const normalized = value.replace(/\\/g, '/').toLowerCase();
  return (
    normalized.includes('/.neko/.cache/') ||
    normalized.includes('/globalstorage/') ||
    normalized.includes('/library/application support/code/user/globalstorage/')
  );
}

function isUnsafeMediaUri(value: string): boolean {
  return (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    value.startsWith('object:') ||
    /^vscode-(?:webview-resource|resource):/i.test(value) ||
    /^vscode-webview:\/\//i.test(value) ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value) ||
    value.startsWith('file://') ||
    isManagedOrAbsoluteCachePath(value)
  );
}

function isUnsafeWorkspacePath(value: string): boolean {
  return (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    value.startsWith('object:') ||
    /^vscode-(?:webview-resource|resource):/i.test(value) ||
    /^vscode-webview:\/\//i.test(value) ||
    /^https?:\/\//i.test(value) ||
    value.startsWith('file://') ||
    isManagedOrAbsoluteCachePath(value)
  );
}

function isAbsoluteLocalPath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function isStoryboardSerializableValue(
  value: unknown,
  seen: ReadonlySet<object> = new Set(),
  depth = 0,
): value is StoryboardSerializableValue {
  if (depth > 32) return false;
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return false;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    const nextSeen = new Set(seen).add(value);
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
      if (!isStoryboardSerializableValue(value[index], nextSeen, depth + 1)) return false;
    }
    return true;
  }
  const record = readStoryboardRecord(value);
  if (!record || seen.has(record)) return false;
  const nextSeen = new Set(seen).add(record);
  return Object.values(record).every((item) =>
    isStoryboardSerializableValue(item, nextSeen, depth + 1),
  );
}

function dedupeStoryboardMediaRefs(
  mediaRefs: readonly StoryboardMediaRef[],
): readonly StoryboardMediaRef[] {
  const seen = new Set<string>();
  const result: StoryboardMediaRef[] = [];
  for (const ref of mediaRefs) {
    if (seen.has(ref.refId)) continue;
    seen.add(ref.refId);
    result.push(ref);
  }
  return result;
}

function readStoryboardRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function readOptionalConfidence(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  diagnostics: StoryboardValidationDiagnostic[],
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) {
    return value;
  }
  diagnostics.push(
    storyboardDiagnostic(
      'warning',
      'invalid-required-field',
      path,
      'Confidence must be a finite number between 0 and 1.',
      { expected: '0..1', actual: serializableDiagnosticValue(value) },
    ),
  );
  return undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function normalizeStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const normalized = readTrimmedString(item);
    return normalized ? [normalized] : [];
  });
}

function missingRequiredDiagnostic(
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  field: string,
): StoryboardValidationDiagnostic {
  return storyboardDiagnostic(
    'error',
    'missing-required-field',
    path,
    `Missing required storyboard field ${field}.`,
    { expected: field },
  );
}

function storyboardDiagnostic(
  severity: StoryboardValidationDiagnosticSeverity,
  code: StoryboardValidationDiagnosticCode,
  path: readonly StoryboardValidationDiagnosticPathSegment[],
  message: string,
  options: {
    readonly expected?: string;
    readonly actual?: StoryboardSerializableValue;
    readonly details?: StoryboardSerializableRecord;
  } = {},
): StoryboardValidationDiagnostic {
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

function limitStoryboardDiagnostics(
  diagnostics: readonly StoryboardValidationDiagnostic[],
): readonly StoryboardValidationDiagnostic[] {
  return diagnostics.slice(0, MAX_STORYBOARD_DIAGNOSTICS);
}

function serializableDiagnosticValue(value: unknown): StoryboardSerializableValue {
  return isStoryboardSerializableValue(value) ? value : String(value);
}
