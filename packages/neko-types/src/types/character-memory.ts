// =============================================================================
// Progressive Character Memory Contracts
//
// Host-agnostic contracts for long-form character consistency. These records
// cite stable source refs and creative entity identity; they do not own entity
// facts, asset bindings, or runtime media payloads.
// =============================================================================

import type {
  CreativeEntityCandidate,
  CreativeEntityKind,
  CreativeEntityRef,
  RepresentationKind,
  RepresentationResolveResult,
  RepresentationTarget,
} from './creative-entity-asset-composition';
import { isCreativeEntityCandidate } from './creative-entity-asset-composition';
import type { DocumentSourceRef } from './document-reading';
import type { ArtifactResourceRef } from './composite-artifact';

export const CHARACTER_MEMORY_FILE_VERSION = 1 as const;

export const CHARACTER_MEMORY_OBSERVATION_SOURCES = [
  'story',
  'comic',
  'video',
  'audio',
  'generated-asset',
  'manual',
  'agent',
  'canvas',
  'cut',
  'document',
] as const;

export const CHARACTER_MEMORY_REVIEW_STATUSES = [
  'draft',
  'needs-review',
  'accepted',
  'rejected',
  'superseded',
  'conflict',
] as const;

export const CHARACTER_MEMORY_DIMENSIONS = [
  'identity',
  'appearance',
  'outfit',
  'action',
  'emotion',
  'dialogue',
  'voice',
  'relationship',
  'knowledge',
  'continuity',
  'injury',
  'age',
  'location',
  'behavior',
] as const;

export const CHARACTER_MEMORY_MENTION_KINDS = [
  'name',
  'ocr',
  'dialogue',
  'visual',
  'voice',
  'manual',
] as const;

export const CHARACTER_MEMORY_SOURCE_REF_KINDS = [
  'story',
  'canvas-node',
  'cut-range',
  'artifact-resource',
  'generated-asset',
  'document',
  'tool-result',
  'manual',
] as const;

export const CHARACTER_MEMORY_CHANGE_SCOPES = [
  'story',
  'scene',
  'shot',
  'canvas-node',
  'cut-range',
  'asset',
  'project',
] as const;

export type CharacterObservationSource = (typeof CHARACTER_MEMORY_OBSERVATION_SOURCES)[number];

export type CharacterMemoryReviewStatus = (typeof CHARACTER_MEMORY_REVIEW_STATUSES)[number];

export type CharacterMemoryDimension = (typeof CHARACTER_MEMORY_DIMENSIONS)[number];

export type EntityMentionKind = (typeof CHARACTER_MEMORY_MENTION_KINDS)[number];

export type CharacterMemorySourceRefKind = (typeof CHARACTER_MEMORY_SOURCE_REF_KINDS)[number];

export type CharacterMemoryChangeScope = (typeof CHARACTER_MEMORY_CHANGE_SCOPES)[number];

export type CharacterMemoryJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly CharacterMemoryJsonValue[]
  | { readonly [key: string]: CharacterMemoryJsonValue };

export type CharacterMemoryJsonRecord = {
  readonly [key: string]: CharacterMemoryJsonValue;
};

export type CharacterMemoryExtensionNamespace = `neko.${string}`;

export type CharacterMemoryExtensionMap = Readonly<
  Record<CharacterMemoryExtensionNamespace, CharacterMemoryJsonValue>
>;

export type CharacterMemoryPathSegment = string | number;

export type CharacterMemoryDiagnosticCode =
  | 'invalid-root'
  | 'invalid-version'
  | 'missing-required-field'
  | 'invalid-required-field'
  | 'invalid-source-ref'
  | 'invalid-review-status'
  | 'invalid-confidence'
  | 'invalid-dimension'
  | 'invalid-entity-ref'
  | 'invalid-extension-namespace'
  | 'non-serializable-value'
  | 'unsafe-runtime-handle'
  | 'oversized-payload'
  | 'observation-conflict'
  | 'missing-representation';

export interface CharacterMemoryDiagnostic {
  readonly severity: 'error' | 'warning' | 'info' | 'suggestion';
  readonly code: CharacterMemoryDiagnosticCode;
  readonly path: readonly CharacterMemoryPathSegment[];
  readonly message: string;
  readonly expected?: string;
  readonly actual?: CharacterMemoryJsonValue;
  readonly details?: CharacterMemoryJsonRecord;
}

export interface CharacterMemoryValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly CharacterMemoryDiagnostic[];
}

export interface CharacterMemorySourceRange {
  readonly sceneId?: string;
  readonly shotId?: string;
  readonly pageId?: string;
  readonly panelId?: string;
  readonly frameStart?: number;
  readonly frameEnd?: number;
  readonly startMs?: number;
  readonly endMs?: number;
  readonly startLine?: number;
  readonly endLine?: number;
  readonly nodeId?: string;
  readonly assetId?: string;
}

export type CharacterMemorySourceRef =
  | {
      readonly kind: 'story';
      readonly storyId: string;
      readonly sceneId?: string;
      readonly shotId?: string;
      readonly range?: CharacterMemorySourceRange;
    }
  | {
      readonly kind: 'canvas-node';
      readonly canvasNodeId: string;
      readonly outputId?: string;
      readonly range?: CharacterMemorySourceRange;
    }
  | {
      readonly kind: 'cut-range';
      readonly timelineId?: string;
      readonly trackId?: string;
      readonly elementId?: string;
      readonly startMs: number;
      readonly endMs?: number;
    }
  | {
      readonly kind: 'artifact-resource';
      readonly resourceRef: ArtifactResourceRef;
      readonly range?: CharacterMemorySourceRange;
    }
  | {
      readonly kind: 'generated-asset';
      readonly assetId: string;
      readonly sourceNodeId?: string;
      readonly sourceCueId?: string;
      readonly range?: CharacterMemorySourceRange;
    }
  | {
      readonly kind: 'document';
      readonly source: DocumentSourceRef;
      readonly range?: CharacterMemorySourceRange;
    }
  | {
      readonly kind: 'tool-result';
      readonly toolCallId: string;
      readonly assetIndex?: number;
      readonly taskId?: string;
      readonly range?: CharacterMemorySourceRange;
    }
  | {
      readonly kind: 'manual';
      readonly label: string;
      readonly range?: CharacterMemorySourceRange;
    };

export interface EntityMention {
  readonly mentionId: string;
  readonly kind: EntityMentionKind;
  readonly text?: string;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly candidateName?: string;
  readonly confidence?: number;
  readonly sourceRef?: CharacterMemorySourceRef;
  readonly range?: CharacterMemorySourceRange;
  readonly metadata?: CharacterMemoryJsonRecord;
}

export interface CharacterTraitObservation {
  readonly dimension: CharacterMemoryDimension | (string & {});
  readonly value: CharacterMemoryJsonValue;
  readonly confidence?: number;
  readonly note?: string;
  readonly sourceRef?: CharacterMemorySourceRef;
  readonly extensions?: CharacterMemoryExtensionMap;
}

export interface CharacterObservationProvenance {
  readonly source: CharacterObservationSource;
  readonly providerId?: string;
  readonly toolCallId?: string;
  readonly taskId?: string;
  readonly modelId?: string;
  readonly observedAt?: string;
  readonly metadata?: CharacterMemoryJsonRecord;
}

export interface CharacterObservation {
  readonly observationId: string;
  readonly sourceRef: CharacterMemorySourceRef;
  readonly provenance: CharacterObservationProvenance;
  readonly reviewStatus: CharacterMemoryReviewStatus;
  readonly dimensions: readonly CharacterTraitObservation[];
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly candidate?: Pick<CreativeEntityCandidate, 'id' | 'kind' | 'name' | 'confidence'>;
  readonly mention?: EntityMention;
  readonly confidence?: number;
  readonly supersedesObservationIds?: readonly string[];
  readonly conflictWithObservationIds?: readonly string[];
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly reviewer?: string;
  readonly notes?: string;
  readonly extensions?: CharacterMemoryExtensionMap;
}

export interface CharacterEvidenceLedger {
  readonly version: typeof CHARACTER_MEMORY_FILE_VERSION;
  readonly projectRoot?: string;
  readonly observations: readonly CharacterObservation[];
  readonly updatedAt?: string;
  readonly diagnostics?: readonly CharacterMemoryDiagnostic[];
}

export interface CharacterProfileDraft {
  readonly draftId: string;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
  readonly sourceObservationIds: readonly string[];
  readonly proposedTraits: readonly CharacterTraitObservation[];
  readonly reviewStatus: CharacterMemoryReviewStatus;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly notes?: string;
  readonly extensions?: CharacterMemoryExtensionMap;
}

export interface CharacterStateSnapshotTrait {
  readonly dimension: CharacterMemoryDimension | (string & {});
  readonly value: CharacterMemoryJsonValue;
  readonly evidenceObservationIds: readonly string[];
  readonly confidence?: number;
  readonly active?: boolean;
  readonly note?: string;
}

export interface CharacterStateScope {
  readonly kind: CharacterMemoryChangeScope;
  readonly storyId?: string;
  readonly sceneId?: string;
  readonly shotId?: string;
  readonly canvasNodeId?: string;
  readonly timelineId?: string;
  readonly assetId?: string;
  readonly startMs?: number;
  readonly endMs?: number;
}

export interface CharacterStateSnapshot {
  readonly snapshotId: string;
  readonly entityRef: CreativeEntityRef;
  readonly scope: CharacterStateScope;
  readonly traits: readonly CharacterStateSnapshotTrait[];
  readonly sourceObservationIds: readonly string[];
  readonly reviewStatus: CharacterMemoryReviewStatus;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly extensions?: CharacterMemoryExtensionMap;
}

export interface CharacterChangeEvent {
  readonly changeId: string;
  readonly entityRef: CreativeEntityRef;
  readonly scope: CharacterStateScope;
  readonly dimensions: readonly (CharacterMemoryDimension | (string & {}))[];
  readonly before?: CharacterMemoryJsonRecord;
  readonly after?: CharacterMemoryJsonRecord;
  readonly summary: string;
  readonly sourceObservationIds: readonly string[];
  readonly reviewStatus: CharacterMemoryReviewStatus;
  readonly confidence?: number;
  readonly createdAt?: string;
  readonly extensions?: CharacterMemoryExtensionMap;
}

export interface CharacterMemoryFile {
  readonly version: typeof CHARACTER_MEMORY_FILE_VERSION;
  readonly ledger: CharacterEvidenceLedger;
  readonly drafts?: readonly CharacterProfileDraft[];
  readonly snapshots?: readonly CharacterStateSnapshot[];
  readonly changes?: readonly CharacterChangeEvent[];
  readonly updatedAt?: string;
}

export interface CharacterMemoryOperationResult {
  readonly memory: CharacterMemoryFile;
  readonly diagnostics: readonly CharacterMemoryDiagnostic[];
}

export interface CharacterRepresentationContext {
  readonly kind: RepresentationKind;
  readonly result?: RepresentationResolveResult;
  readonly missing?: boolean;
  readonly diagnostics?: readonly CharacterMemoryDiagnostic[];
}

export interface CharacterGenerationContextParticipant {
  readonly entityRef: CreativeEntityRef;
  readonly displayName?: string;
  readonly role?: string;
  readonly action?: string;
  readonly emotion?: string;
  readonly continuityNotes?: string;
  readonly stateSnapshot?: CharacterStateSnapshot;
  readonly visualRepresentations?: readonly CharacterRepresentationContext[];
  readonly voiceRepresentation?: CharacterRepresentationContext;
  readonly missingRepresentationKinds?: readonly RepresentationKind[];
  readonly sourceRefs?: readonly CharacterMemorySourceRef[];
}

export interface CharacterGenerationContext {
  readonly contextId: string;
  readonly target: RepresentationTarget | 'generation';
  readonly sourceRef?: CharacterMemorySourceRef;
  readonly participants: readonly CharacterGenerationContextParticipant[];
  readonly diagnostics?: readonly CharacterMemoryDiagnostic[];
  readonly createdAt?: string;
  readonly metadata?: CharacterMemoryJsonRecord;
}

export interface CharacterMemoryValidationOptions {
  readonly maxSerializedBytes?: number;
  readonly maxDiagnostics?: number;
}

export interface CharacterMemoryFileOps {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
}

export interface CharacterEvidenceLedgerStore {
  load(path: string): Promise<CharacterMemoryFile | null>;
  save(path: string, memory: CharacterMemoryFile): Promise<void>;
}

export function createEmptyCharacterMemoryFile(projectRoot?: string): CharacterMemoryFile {
  const ledger: CharacterEvidenceLedger = {
    version: CHARACTER_MEMORY_FILE_VERSION,
    ...(projectRoot ? { projectRoot } : {}),
    observations: [],
  };
  return {
    version: CHARACTER_MEMORY_FILE_VERSION,
    ledger,
  };
}

export function validateCharacterMemoryFile(
  value: unknown,
  options: CharacterMemoryValidationOptions = {},
): CharacterMemoryValidationResult {
  const diagnostics: CharacterMemoryDiagnostic[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      diagnostics: [
        characterMemoryDiagnostic(
          'error',
          'invalid-root',
          [],
          'Character memory must be an object.',
        ),
      ],
    };
  }

  validateVersion(value['version'], [], diagnostics);
  validateLedger(value['ledger'], ['ledger'], diagnostics, options);
  validateArray(value['drafts'], ['drafts'], diagnostics, (draft, path) =>
    validateProfileDraft(draft, path, diagnostics, options),
  );
  validateArray(value['snapshots'], ['snapshots'], diagnostics, (snapshot, path) =>
    validateStateSnapshot(snapshot, path, diagnostics, options),
  );
  validateArray(value['changes'], ['changes'], diagnostics, (change, path) =>
    validateChangeEvent(change, path, diagnostics, options),
  );

  validateSerializedSize(value, [], diagnostics, options);
  return characterMemoryValidationResult(diagnostics, options);
}

export function validateCharacterEvidenceLedger(
  value: unknown,
  options: CharacterMemoryValidationOptions = {},
): CharacterMemoryValidationResult {
  const diagnostics: CharacterMemoryDiagnostic[] = [];
  validateLedger(value, [], diagnostics, options);
  validateSerializedSize(value, [], diagnostics, options);
  return characterMemoryValidationResult(diagnostics, options);
}

export function addCharacterObservation(
  memory: CharacterMemoryFile,
  observation: CharacterObservation,
): CharacterMemoryOperationResult {
  const validation = validateCharacterObservation(observation);
  if (!validation.ok) {
    return { memory, diagnostics: validation.diagnostics };
  }

  const observationIndex = createObservationIndex(memory.ledger.observations);
  const existingIndex = observationIndex.get(observation.observationId);
  const observations =
    existingIndex === undefined
      ? [...memory.ledger.observations, observation]
      : memory.ledger.observations.map((entry, index) =>
          index === existingIndex ? observation : entry,
        );
  const updated: CharacterMemoryFile = {
    ...memory,
    ledger: {
      ...memory.ledger,
      observations,
      updatedAt: observation.updatedAt ?? observation.createdAt ?? memory.ledger.updatedAt,
    },
    updatedAt: observation.updatedAt ?? observation.createdAt ?? memory.updatedAt,
  };

  return { memory: updated, diagnostics: [] };
}

function createObservationIndex(
  observations: readonly CharacterObservation[],
): ReadonlyMap<string, number> {
  const index = new Map<string, number>();
  observations.forEach((observation, observationIndex) => {
    index.set(observation.observationId, observationIndex);
  });
  return index;
}

export function updateCharacterObservationReviewStatus(
  memory: CharacterMemoryFile,
  observationId: string,
  reviewStatus: CharacterMemoryReviewStatus,
  options: {
    readonly reviewer?: string;
    readonly updatedAt?: string;
    readonly notes?: string;
  } = {},
): CharacterMemoryOperationResult {
  if (!isCharacterMemoryReviewStatus(reviewStatus)) {
    return {
      memory,
      diagnostics: [
        characterMemoryDiagnostic(
          'error',
          'invalid-review-status',
          ['reviewStatus'],
          'Unsupported character memory review status.',
          { actual: reviewStatus },
        ),
      ],
    };
  }

  let found = false;
  const observations = memory.ledger.observations.map((observation) => {
    if (observation.observationId !== observationId) return observation;
    found = true;
    return {
      ...observation,
      reviewStatus,
      ...(options.reviewer ? { reviewer: options.reviewer } : {}),
      ...(options.updatedAt ? { updatedAt: options.updatedAt } : {}),
      ...(options.notes ? { notes: options.notes } : {}),
    };
  });

  if (!found) {
    return {
      memory,
      diagnostics: [
        characterMemoryDiagnostic(
          'warning',
          'missing-required-field',
          ['ledger', 'observations'],
          `Observation ${observationId} was not found.`,
          { actual: observationId },
        ),
      ],
    };
  }

  return {
    memory: {
      ...memory,
      ledger: {
        ...memory.ledger,
        observations,
        ...(options.updatedAt ? { updatedAt: options.updatedAt } : {}),
      },
      ...(options.updatedAt ? { updatedAt: options.updatedAt } : {}),
    },
    diagnostics: [],
  };
}

export function markCharacterObservationConflict(
  memory: CharacterMemoryFile,
  observationId: string,
  conflictWithObservationIds: readonly string[],
  updatedAt?: string,
): CharacterMemoryOperationResult {
  const observations = memory.ledger.observations.map((observation) => {
    if (observation.observationId !== observationId) return observation;
    return {
      ...observation,
      reviewStatus: 'conflict' as const,
      conflictWithObservationIds: Array.from(
        new Set([...(observation.conflictWithObservationIds ?? []), ...conflictWithObservationIds]),
      ),
      ...(updatedAt ? { updatedAt } : {}),
    };
  });

  const changed = observations.some(
    (observation, index) => observation !== memory.ledger.observations[index],
  );
  if (!changed) {
    return {
      memory,
      diagnostics: [
        characterMemoryDiagnostic(
          'warning',
          'missing-required-field',
          ['ledger', 'observations'],
          `Observation ${observationId} was not found.`,
          { actual: observationId },
        ),
      ],
    };
  }

  return {
    memory: {
      ...memory,
      ledger: { ...memory.ledger, observations, ...(updatedAt ? { updatedAt } : {}) },
      ...(updatedAt ? { updatedAt } : {}),
    },
    diagnostics: [],
  };
}

/**
 * Derives the active state with a latest-wins merge per dimension while
 * preserving all evidence ids that contributed to the winning dimension.
 * TODO(P2): incorporate CharacterChangeEvent ordering for scoped evolution.
 */
export function deriveCharacterStateSnapshot(input: {
  readonly snapshotId: string;
  readonly entityRef: CreativeEntityRef;
  readonly scope: CharacterStateScope;
  readonly observations: readonly CharacterObservation[];
  readonly reviewStatus?: CharacterMemoryReviewStatus;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}): CharacterStateSnapshot {
  const traitsByDimension = new Map<string, CharacterStateSnapshotTrait>();

  for (const observation of input.observations) {
    if (!observationMatchesEntity(observation, input.entityRef)) continue;
    if (observation.reviewStatus !== 'accepted') continue;
    for (const dimension of observation.dimensions) {
      traitsByDimension.set(dimension.dimension, {
        dimension: dimension.dimension,
        value: dimension.value,
        evidenceObservationIds: [
          ...(traitsByDimension.get(dimension.dimension)?.evidenceObservationIds ?? []),
          observation.observationId,
        ],
        ...(dimension.confidence !== undefined ? { confidence: dimension.confidence } : {}),
        active: true,
        ...(dimension.note ? { note: dimension.note } : {}),
      });
    }
  }

  return {
    snapshotId: input.snapshotId,
    entityRef: input.entityRef,
    scope: input.scope,
    traits: Array.from(traitsByDimension.values()),
    sourceObservationIds: Array.from(
      new Set(
        input.observations
          .filter((observation) => observationMatchesEntity(observation, input.entityRef))
          .map((observation) => observation.observationId),
      ),
    ),
    reviewStatus: input.reviewStatus ?? 'accepted',
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

export function createCharacterGenerationContext(input: {
  readonly contextId: string;
  readonly target: RepresentationTarget | 'generation';
  readonly sourceRef?: CharacterMemorySourceRef;
  readonly participants: readonly CharacterGenerationContextParticipant[];
  readonly createdAt?: string;
  readonly metadata?: CharacterMemoryJsonRecord;
}): CharacterGenerationContext {
  const diagnostics = input.participants.flatMap((participant, participantIndex) =>
    buildParticipantDiagnostics(participant, ['participants', participantIndex]),
  );
  return {
    contextId: input.contextId,
    target: input.target,
    ...(input.sourceRef ? { sourceRef: input.sourceRef } : {}),
    participants: input.participants,
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  };
}

export function validateCharacterObservation(
  value: unknown,
  options: CharacterMemoryValidationOptions = {},
): CharacterMemoryValidationResult {
  const diagnostics: CharacterMemoryDiagnostic[] = [];
  validateObservation(value, [], diagnostics, options);
  validateSerializedSize(value, [], diagnostics, options);
  return characterMemoryValidationResult(diagnostics, options);
}

export function isCharacterMemoryReviewStatus(
  value: unknown,
): value is CharacterMemoryReviewStatus {
  return CHARACTER_MEMORY_REVIEW_STATUSES.includes(value as CharacterMemoryReviewStatus);
}

export function isCharacterMemoryDimension(value: unknown): value is CharacterMemoryDimension {
  return CHARACTER_MEMORY_DIMENSIONS.includes(value as CharacterMemoryDimension);
}

export function isCharacterMemorySourceRef(value: unknown): value is CharacterMemorySourceRef {
  const diagnostics: CharacterMemoryDiagnostic[] = [];
  validateSourceRef(value, [], diagnostics);
  return diagnostics.length === 0;
}

export function createCharacterEvidenceLedgerStore(
  ops: CharacterMemoryFileOps,
): CharacterEvidenceLedgerStore {
  return {
    async load(path) {
      if (!(await ops.exists(path))) return null;
      const raw = await ops.readFile(path);
      const value = JSON.parse(raw) as unknown;
      const validation = validateCharacterMemoryFile(value);
      if (!validation.ok) {
        throw new Error(
          `Invalid character memory file: ${validation.diagnostics
            .map((diagnostic) => diagnostic.message)
            .join('; ')}`,
        );
      }
      return value as CharacterMemoryFile;
    },
    async save(path, memory) {
      const validation = validateCharacterMemoryFile(memory);
      if (!validation.ok) {
        throw new Error(
          `Invalid character memory file: ${validation.diagnostics
            .map((diagnostic) => diagnostic.message)
            .join('; ')}`,
        );
      }
      await ops.writeFile(path, `${JSON.stringify(memory, null, 2)}\n`);
    },
  };
}

function validateLedger(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  options: CharacterMemoryValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-required-field',
        path,
        'Character evidence ledger must be an object.',
      ),
    );
    return;
  }
  validateVersion(value['version'], [...path, 'version'], diagnostics);
  validateArray(
    value['observations'],
    [...path, 'observations'],
    diagnostics,
    (observation, itemPath) => validateObservation(observation, itemPath, diagnostics, options),
  );
  validateDiagnostics(value['diagnostics'], [...path, 'diagnostics'], diagnostics);
}

function validateObservation(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  options: CharacterMemoryValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-required-field',
        path,
        'Character observation must be an object.',
      ),
    );
    return;
  }
  requireString(value['observationId'], [...path, 'observationId'], diagnostics);
  validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics);
  validateProvenance(value['provenance'], [...path, 'provenance'], diagnostics);
  validateReviewStatus(value['reviewStatus'], [...path, 'reviewStatus'], diagnostics);
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  validateOptionalEntityRef(value['entityRef'], [...path, 'entityRef'], diagnostics);
  validateObservationIdentityLink(value, path, diagnostics);
  validateMention(value['mention'], [...path, 'mention'], diagnostics);
  validateStringArray(
    value['supersedesObservationIds'],
    [...path, 'supersedesObservationIds'],
    diagnostics,
  );
  validateStringArray(
    value['conflictWithObservationIds'],
    [...path, 'conflictWithObservationIds'],
    diagnostics,
  );
  validateExtensions(value['extensions'], [...path, 'extensions'], diagnostics);
  validateArray(value['dimensions'], [...path, 'dimensions'], diagnostics, (dimension, itemPath) =>
    validateTraitObservation(dimension, itemPath, diagnostics, options),
  );
}

function validateObservationIdentityLink(
  value: Readonly<Record<string, unknown>>,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  const hasEntityRef = value['entityRef'] !== undefined;
  const hasCandidateId =
    typeof value['candidateId'] === 'string' && value['candidateId'].trim().length > 0;
  const hasMention = value['mention'] !== undefined;
  const candidate = value['candidate'];
  const hasCandidate = candidate !== undefined;

  if (hasCandidate && !isCreativeEntityCandidateSummary(candidate)) {
    diagnostics.push(
      invalidFieldDiagnostic(
        [...path, 'candidate'],
        'creative entity candidate summary',
        candidate,
      ),
    );
  }

  if (!hasEntityRef && !hasCandidateId && !hasCandidate && !hasMention) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'missing-required-field',
        path,
        'Character observation must reference an entity, candidate, or unresolved mention.',
        { expected: 'entityRef | candidateId | candidate | mention' },
      ),
    );
  }
}

function isCreativeEntityCandidateSummary(
  value: unknown,
): value is CharacterObservation['candidate'] {
  if (isCreativeEntityCandidate(value)) return true;
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    isCreativeEntityKind(value['kind']) &&
    typeof value['name'] === 'string' &&
    (value['confidence'] === undefined ||
      (typeof value['confidence'] === 'number' &&
        Number.isFinite(value['confidence']) &&
        value['confidence'] >= 0 &&
        value['confidence'] <= 1))
  );
}

function validateProvenance(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(missingRequiredDiagnostic(path, 'provenance'));
    return;
  }
  if (
    !CHARACTER_MEMORY_OBSERVATION_SOURCES.includes(value['source'] as CharacterObservationSource)
  ) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-required-field',
        [...path, 'source'],
        'Unsupported character observation source.',
        {
          expected: CHARACTER_MEMORY_OBSERVATION_SOURCES.join(', '),
          actual: serializableDiagnosticValue(value['source']),
        },
      ),
    );
  }
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
}

function validateTraitObservation(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  options: CharacterMemoryValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-required-field',
        path,
        'Character trait observation must be an object.',
      ),
    );
    return;
  }
  const dimension = value['dimension'];
  validateTraitDimension(dimension, [...path, 'dimension'], diagnostics);
  validateSerializableValue(value['value'], [...path, 'value'], diagnostics);
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics, true);
  validateExtensions(value['extensions'], [...path, 'extensions'], diagnostics);
  validateSerializedSize(value['value'], [...path, 'value'], diagnostics, options);
}

function validateProfileDraft(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  options: CharacterMemoryValidationOptions,
): void {
  if (!isRecord(value)) return;
  requireString(value['draftId'], [...path, 'draftId'], diagnostics);
  validateOptionalEntityRef(value['entityRef'], [...path, 'entityRef'], diagnostics);
  validateStringArray(
    value['sourceObservationIds'],
    [...path, 'sourceObservationIds'],
    diagnostics,
    true,
  );
  validateReviewStatus(value['reviewStatus'], [...path, 'reviewStatus'], diagnostics);
  validateArray(
    value['proposedTraits'],
    [...path, 'proposedTraits'],
    diagnostics,
    (trait, itemPath) => validateTraitObservation(trait, itemPath, diagnostics, options),
  );
  validateExtensions(value['extensions'], [...path, 'extensions'], diagnostics);
}

function validateStateSnapshot(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  options: CharacterMemoryValidationOptions,
): void {
  if (!isRecord(value)) return;
  requireString(value['snapshotId'], [...path, 'snapshotId'], diagnostics);
  validateEntityRef(value['entityRef'], [...path, 'entityRef'], diagnostics);
  validateStateScope(value['scope'], [...path, 'scope'], diagnostics);
  validateStringArray(
    value['sourceObservationIds'],
    [...path, 'sourceObservationIds'],
    diagnostics,
    true,
  );
  validateReviewStatus(value['reviewStatus'], [...path, 'reviewStatus'], diagnostics);
  validateArray(value['traits'], [...path, 'traits'], diagnostics, (trait, itemPath) =>
    validateSnapshotTrait(trait, itemPath, diagnostics, options),
  );
  validateExtensions(value['extensions'], [...path, 'extensions'], diagnostics);
}

function validateSnapshotTrait(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  options: CharacterMemoryValidationOptions,
): void {
  if (!isRecord(value)) return;
  validateTraitDimension(value['dimension'], [...path, 'dimension'], diagnostics);
  validateSerializableValue(value['value'], [...path, 'value'], diagnostics);
  validateStringArray(
    value['evidenceObservationIds'],
    [...path, 'evidenceObservationIds'],
    diagnostics,
    true,
  );
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  validateSerializedSize(value['value'], [...path, 'value'], diagnostics, options);
}

function validateChangeEvent(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  options: CharacterMemoryValidationOptions,
): void {
  if (!isRecord(value)) return;
  requireString(value['changeId'], [...path, 'changeId'], diagnostics);
  validateEntityRef(value['entityRef'], [...path, 'entityRef'], diagnostics);
  validateStateScope(value['scope'], [...path, 'scope'], diagnostics);
  validateDimensionArray(value['dimensions'], [...path, 'dimensions'], diagnostics, true);
  requireString(value['summary'], [...path, 'summary'], diagnostics);
  validateStringArray(
    value['sourceObservationIds'],
    [...path, 'sourceObservationIds'],
    diagnostics,
    true,
  );
  validateReviewStatus(value['reviewStatus'], [...path, 'reviewStatus'], diagnostics);
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  validateSerializableValue(value['before'], [...path, 'before'], diagnostics);
  validateSerializableValue(value['after'], [...path, 'after'], diagnostics);
  validateExtensions(value['extensions'], [...path, 'extensions'], diagnostics);
  validateSerializedSize(value, path, diagnostics, options);
}

function validateMention(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  requireString(value['mentionId'], [...path, 'mentionId'], diagnostics);
  if (!CHARACTER_MEMORY_MENTION_KINDS.includes(value['kind'] as EntityMentionKind)) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-required-field',
        [...path, 'kind'],
        'Unsupported entity mention kind.',
        {
          expected: CHARACTER_MEMORY_MENTION_KINDS.join(', '),
          actual: serializableDiagnosticValue(value['kind']),
        },
      ),
    );
  }
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  validateOptionalEntityRef(value['entityRef'], [...path, 'entityRef'], diagnostics);
  validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics, true);
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
}

function validateSourceRef(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  optional = false,
): void {
  if (value === undefined && optional) return;
  if (!isRecord(value)) {
    diagnostics.push(
      optional
        ? invalidFieldDiagnostic(path, 'object', value)
        : missingRequiredDiagnostic(path, 'sourceRef'),
    );
    return;
  }

  const kind = value['kind'];
  if (!CHARACTER_MEMORY_SOURCE_REF_KINDS.includes(kind as CharacterMemorySourceRefKind)) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-source-ref',
        [...path, 'kind'],
        'Unsupported character memory source ref kind.',
        {
          expected: CHARACTER_MEMORY_SOURCE_REF_KINDS.join(', '),
          actual: serializableDiagnosticValue(kind),
        },
      ),
    );
    return;
  }

  switch (kind) {
    case 'story':
      requireString(value['storyId'], [...path, 'storyId'], diagnostics);
      break;
    case 'canvas-node':
      requireString(value['canvasNodeId'], [...path, 'canvasNodeId'], diagnostics);
      break;
    case 'cut-range':
      requireFiniteNumber(value['startMs'], [...path, 'startMs'], diagnostics);
      if (value['endMs'] !== undefined) {
        requireFiniteNumber(value['endMs'], [...path, 'endMs'], diagnostics);
      }
      break;
    case 'artifact-resource':
      validateSerializableValue(value['resourceRef'], [...path, 'resourceRef'], diagnostics);
      break;
    case 'generated-asset':
      requireString(value['assetId'], [...path, 'assetId'], diagnostics);
      break;
    case 'document':
      validateDocumentSourceRef(value['source'], [...path, 'source'], diagnostics);
      break;
    case 'tool-result':
      requireString(value['toolCallId'], [...path, 'toolCallId'], diagnostics);
      break;
    case 'manual':
      requireString(value['label'], [...path, 'label'], diagnostics);
      break;
  }
  validateSerializableValue(value['range'], [...path, 'range'], diagnostics);
  validateSerializableValue(value, path, diagnostics);
}

function validateDocumentSourceRef(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(missingRequiredDiagnostic(path, 'source'));
    return;
  }
  requireString(value['filePath'], [...path, 'filePath'], diagnostics);
  requireString(value['format'], [...path, 'format'], diagnostics);
}

function validateStateScope(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(missingRequiredDiagnostic(path, 'scope'));
    return;
  }
  if (!CHARACTER_MEMORY_CHANGE_SCOPES.includes(value['kind'] as CharacterMemoryChangeScope)) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-required-field',
        [...path, 'kind'],
        'Unsupported character state scope kind.',
        {
          expected: CHARACTER_MEMORY_CHANGE_SCOPES.join(', '),
          actual: serializableDiagnosticValue(value['kind']),
        },
      ),
    );
  }
  validateSerializableValue(value, path, diagnostics);
}

function validateReviewStatus(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (!isCharacterMemoryReviewStatus(value)) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-review-status',
        path,
        'Unsupported character memory review status.',
        {
          expected: CHARACTER_MEMORY_REVIEW_STATUSES.join(', '),
          actual: serializableDiagnosticValue(value),
        },
      ),
    );
  }
}

function validateTraitDimension(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push(invalidFieldDiagnostic(path, 'non-empty character memory dimension', value));
    return;
  }
  if (!isAllowedCharacterMemoryDimension(value)) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-dimension',
        path,
        'Character memory dimension must be a known dimension or a neko.* extension dimension.',
        {
          expected: `${CHARACTER_MEMORY_DIMENSIONS.join(', ')} or neko.*`,
          actual: value,
        },
      ),
    );
  }
}

function validateDimensionArray(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  required = false,
): void {
  if (value === undefined) {
    if (required) diagnostics.push(missingRequiredDiagnostic(path, String(path[path.length - 1])));
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'character memory dimension[]', value));
    return;
  }
  value.forEach((item, index) => validateTraitDimension(item, [...path, index], diagnostics));
}

function isAllowedCharacterMemoryDimension(value: string): boolean {
  return isCharacterMemoryDimension(value) || value.startsWith('neko.');
}

function validateVersion(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (value !== CHARACTER_MEMORY_FILE_VERSION) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-version',
        path.length > 0 ? path : ['version'],
        'Character memory version must be 1.',
        {
          expected: String(CHARACTER_MEMORY_FILE_VERSION),
          actual: serializableDiagnosticValue(value),
        },
      ),
    );
  }
}

function validateEntityRef(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(missingRequiredDiagnostic(path, 'entityRef'));
    return;
  }
  requireString(value['entityId'], [...path, 'entityId'], diagnostics);
  if (!isCreativeEntityKind(value['entityKind'])) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-entity-ref',
        [...path, 'entityKind'],
        'Unsupported creative entity kind.',
        { actual: serializableDiagnosticValue(value['entityKind']) },
      ),
    );
  }
  validateSerializableValue(value, path, diagnostics);
}

function validateOptionalEntityRef(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (value === undefined) return;
  validateEntityRef(value, path, diagnostics);
}

function validateOptionalConfidence(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'invalid-confidence',
        path,
        'Confidence must be a finite number between 0 and 1.',
        {
          expected: '0..1',
          actual: serializableDiagnosticValue(value),
        },
      ),
    );
  }
}

function validateStringArray(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  required = false,
): void {
  if (value === undefined) {
    if (required) diagnostics.push(missingRequiredDiagnostic(path, String(path[path.length - 1])));
    return;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    diagnostics.push(invalidFieldDiagnostic(path, 'string[]', value));
  }
}

function validateArray(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  validator: (item: unknown, path: readonly CharacterMemoryPathSegment[]) => void,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'array', value));
    return;
  }
  value.forEach((item, index) => validator(item, [...path, index]));
}

function validateDiagnostics(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'array', value));
  }
}

function validateExtensions(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  for (const [key, extensionValue] of Object.entries(value)) {
    if (!key.startsWith('neko.')) {
      diagnostics.push(
        characterMemoryDiagnostic(
          'error',
          'invalid-extension-namespace',
          [...path, key],
          'Character memory extension keys must use the neko.* namespace.',
        ),
      );
    }
    validateSerializableValue(extensionValue, [...path, key], diagnostics);
  }
}

function validateSerializableValue(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isCharacterMemoryJsonValue(value)) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'non-serializable-value',
        path,
        'Value must be JSON-serializable.',
      ),
    );
    return;
  }
  const unsafe = findUnsafeRuntimeHandle(value);
  if (unsafe) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'unsafe-runtime-handle',
        path,
        'Persistent character memory cannot contain runtime-only handles.',
        { actual: unsafe },
      ),
    );
  }
}

function validateSerializedSize(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
  options: CharacterMemoryValidationOptions,
): void {
  const maxBytes = options.maxSerializedBytes ?? 64_000;
  const byteLength = jsonByteLength(value);
  if (byteLength > maxBytes) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'oversized-payload',
        path,
        'Character memory record exceeds maximum serialized size.',
        {
          expected: `<= ${maxBytes} bytes`,
          actual: byteLength,
        },
      ),
    );
  }
}

function buildParticipantDiagnostics(
  participant: CharacterGenerationContextParticipant,
  path: readonly CharacterMemoryPathSegment[],
): readonly CharacterMemoryDiagnostic[] {
  const missingKinds = new Set<RepresentationKind>(participant.missingRepresentationKinds ?? []);
  for (const context of participant.visualRepresentations ?? []) {
    if (context.missing) missingKinds.add(context.kind);
  }
  if (participant.voiceRepresentation?.missing)
    missingKinds.add(participant.voiceRepresentation.kind);
  return Array.from(missingKinds).map((kind) =>
    characterMemoryDiagnostic(
      'warning',
      'missing-representation',
      [...path, 'missingRepresentationKinds'],
      `Character ${participant.entityRef.entityId} is missing ${kind} representation.`,
      {
        expected: kind,
        actual: participant.entityRef.entityId,
      },
    ),
  );
}

function observationMatchesEntity(
  observation: CharacterObservation,
  entityRef: CreativeEntityRef,
): boolean {
  return (
    observation.entityRef?.entityId === entityRef.entityId &&
    observation.entityRef.entityKind === entityRef.entityKind
  );
}

function requireString(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push(invalidFieldDiagnostic(path, 'non-empty string', value));
  } else if (findUnsafeRuntimeHandle(value)) {
    diagnostics.push(
      characterMemoryDiagnostic(
        'error',
        'unsafe-runtime-handle',
        path,
        'Persistent character memory cannot contain runtime-only handles.',
        { actual: value },
      ),
    );
  }
}

function requireFiniteNumber(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: CharacterMemoryDiagnostic[],
): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'finite number', value));
  }
}

function missingRequiredDiagnostic(
  path: readonly CharacterMemoryPathSegment[],
  field: string,
): CharacterMemoryDiagnostic {
  return characterMemoryDiagnostic(
    'error',
    'missing-required-field',
    path,
    `Missing required character memory field ${field}.`,
    { expected: field },
  );
}

function invalidFieldDiagnostic(
  path: readonly CharacterMemoryPathSegment[],
  expected: string,
  actual: unknown,
): CharacterMemoryDiagnostic {
  return characterMemoryDiagnostic(
    'error',
    'invalid-required-field',
    path,
    `Invalid character memory field at ${formatPath(path)}.`,
    {
      expected,
      actual: serializableDiagnosticValue(actual),
    },
  );
}

function characterMemoryDiagnostic(
  severity: CharacterMemoryDiagnostic['severity'],
  code: CharacterMemoryDiagnosticCode,
  path: readonly CharacterMemoryPathSegment[],
  message: string,
  extras: Omit<CharacterMemoryDiagnostic, 'severity' | 'code' | 'path' | 'message'> = {},
): CharacterMemoryDiagnostic {
  return {
    severity,
    code,
    path,
    message,
    ...extras,
  };
}

function characterMemoryValidationResult(
  diagnostics: readonly CharacterMemoryDiagnostic[],
  options: CharacterMemoryValidationOptions,
): CharacterMemoryValidationResult {
  const maxDiagnostics = options.maxDiagnostics ?? 100;
  const bounded = diagnostics.slice(0, maxDiagnostics);
  return {
    ok: !bounded.some((diagnostic) => diagnostic.severity === 'error'),
    diagnostics: bounded,
  };
}

function isCreativeEntityKind(value: unknown): value is CreativeEntityKind {
  return (
    value === 'character' ||
    value === 'scene' ||
    value === 'object' ||
    value === 'location' ||
    value === 'style'
  );
}

function isCharacterMemoryJsonValue(value: unknown): value is CharacterMemoryJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isCharacterMemoryJsonValue);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isCharacterMemoryJsonValue);
  }
  return false;
}

function findUnsafeRuntimeHandle(value: CharacterMemoryJsonValue): string | undefined {
  if (typeof value === 'string') {
    return isUnsafeRuntimeHandle(value) ? value : undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const unsafe = findUnsafeRuntimeHandle(item);
      if (unsafe) return unsafe;
    }
    return undefined;
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const unsafe = findUnsafeRuntimeHandle(item);
      if (unsafe) return unsafe;
    }
  }
  return undefined;
}

function isUnsafeRuntimeHandle(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vscode-resource:') ||
    trimmed.startsWith('vscode-webview-resource:') ||
    trimmed.startsWith('file:') ||
    trimmed.startsWith('http://localhost') ||
    trimmed.startsWith('https://localhost') ||
    trimmed.startsWith('http://127.0.0.1') ||
    trimmed.startsWith('https://127.0.0.1') ||
    /^\/(Users|Volumes|tmp|var|private|home)\//.test(trimmed) ||
    /^[A-Za-z]:\\/.test(trimmed)
  );
}

function serializableDiagnosticValue(value: unknown): CharacterMemoryJsonValue | undefined {
  if (isCharacterMemoryJsonValue(value)) return value;
  if (value === undefined) return undefined;
  return String(value);
}

function jsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function formatPath(path: readonly CharacterMemoryPathSegment[]): string {
  return path.length === 0 ? '<root>' : path.join('.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
