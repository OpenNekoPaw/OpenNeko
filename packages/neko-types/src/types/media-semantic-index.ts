// =============================================================================
// Media Semantic Index Contracts
//
// Host-agnostic contracts for project-searchable media/text evidence. These
// records cite stable content/evidence refs and do not own confirmed entity
// facts, media payloads, Webview URIs, or provider runtime handles.
// =============================================================================

import type { ContentStableSourceRef } from './content-access';
import {
  CHARACTER_MEMORY_OBSERVATION_SOURCES,
  CHARACTER_MEMORY_SOURCE_REF_KINDS,
  isCharacterMemorySourceRef,
  validateCharacterObservation,
  type CharacterMemoryJsonRecord,
  type CharacterMemoryJsonValue,
  type CharacterMemoryPathSegment,
  type CharacterMemorySourceRange,
  type CharacterMemorySourceRef,
  type CharacterMemorySourceRefKind,
  type CharacterObservation,
  type CharacterObservationSource,
  type EntityMention,
} from './character-memory';
import type {
  CreativeEntityCandidate,
  EntityAssetRequirement,
} from './creative-entity-asset-composition';
import type { PerceptionCard, PerceptionEvidenceEntry } from './perception-card';

export const MEDIA_SEMANTIC_INDEX_FILE_VERSION = 1 as const;

export const MEDIA_TEXT_SEGMENT_KINDS = [
  'ocr',
  'subtitle',
  'asr',
  'caption',
  'script',
  'manual',
  'agent',
] as const;

export const MEDIA_TEXT_SOURCE_KINDS = CHARACTER_MEMORY_OBSERVATION_SOURCES;

export const ENTITY_MEMORY_CONTRIBUTION_REVIEW_POLICIES = [
  'draft-only',
  'requires-user-review',
  'source-approved',
] as const;

export const MEDIA_BOUNDING_BOX_UNITS = ['pixel', 'normalized'] as const;

export type MediaSemanticSourceRef = ContentStableSourceRef;

export type MediaEvidenceSourceRef = CharacterMemorySourceRef;

export type MediaTextSegmentKind = (typeof MEDIA_TEXT_SEGMENT_KINDS)[number];

export type MediaTextSourceKind = CharacterObservationSource;

export type EntityMemoryContributionReviewPolicy =
  (typeof ENTITY_MEMORY_CONTRIBUTION_REVIEW_POLICIES)[number];

export type MediaBoundingBoxUnit = (typeof MEDIA_BOUNDING_BOX_UNITS)[number];

export type MediaSemanticDiagnosticCode =
  | 'invalid-root'
  | 'invalid-version'
  | 'missing-required-field'
  | 'invalid-required-field'
  | 'invalid-source-ref'
  | 'invalid-source-kind'
  | 'invalid-review-policy'
  | 'invalid-confidence'
  | 'invalid-bounding-box'
  | 'invalid-range'
  | 'non-serializable-value'
  | 'unsafe-runtime-handle'
  | 'oversized-payload';

export interface MediaSemanticDiagnostic {
  readonly severity: 'error' | 'warning' | 'info' | 'suggestion';
  readonly code: MediaSemanticDiagnosticCode;
  readonly path: readonly CharacterMemoryPathSegment[];
  readonly message: string;
  readonly expected?: string;
  readonly actual?: CharacterMemoryJsonValue;
  readonly details?: CharacterMemoryJsonRecord;
}

export interface MediaSemanticValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly MediaSemanticDiagnostic[];
}

export interface MediaSemanticValidationOptions {
  readonly maxSerializedBytes?: number;
  readonly maxDiagnostics?: number;
  readonly warnOnUnrelatedRangeFields?: boolean;
}

export interface MediaSemanticIndexSidecarRef {
  readonly rootDir: '${PROJECT}/.neko/semantic-index';
  readonly relativePath: string;
  readonly indexId: string;
  readonly assetId: string;
  readonly sourceRef: MediaSemanticSourceRef;
}

export interface MediaSemanticIndexSidecarRecord {
  readonly ref: MediaSemanticIndexSidecarRef;
  readonly index: MediaSemanticIndex;
  readonly searchItemsCachePath?: `${'${PROJECT}'}/.neko/.cache/${string}`;
}

export interface MediaSemanticIndexParseResult {
  readonly record?: MediaSemanticIndexSidecarRecord;
  readonly diagnostics: readonly MediaSemanticDiagnostic[];
}

export interface MediaBoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly unit?: MediaBoundingBoxUnit;
}

export interface MediaTextRange extends CharacterMemorySourceRange {
  readonly boundingBox?: MediaBoundingBox;
}

export interface PerceptionCardRef {
  readonly assetId: string;
  readonly cacheKey?: string;
  readonly sourceToolCallId?: string;
  readonly contextPacketId?: string;
  readonly createdAt?: number;
}

export interface SemanticTag {
  readonly tagId: string;
  readonly label: string;
  readonly confidence?: number;
  readonly source?: MediaTextSourceKind;
  readonly sourceRef?: MediaEvidenceSourceRef;
  readonly metadata?: CharacterMemoryJsonRecord;
}

export interface MediaTextSegmentProvenance {
  readonly providerId: string;
  readonly sourceKind: MediaTextSourceKind;
  readonly toolCallId?: string;
  readonly taskId?: string;
  readonly modelId?: string;
  readonly observedAt?: string;
  readonly metadata?: CharacterMemoryJsonRecord;
}

export interface MediaTextSegment {
  readonly segmentId: string;
  readonly kind: MediaTextSegmentKind;
  readonly text: string;
  readonly sourceRef: MediaEvidenceSourceRef;
  readonly provenance: MediaTextSegmentProvenance;
  readonly language?: string;
  readonly confidence?: number;
  readonly range?: MediaTextRange;
  readonly entityMentionIds?: readonly string[];
  readonly semanticTagIds?: readonly string[];
  readonly metadata?: CharacterMemoryJsonRecord;
}

export interface MediaSemanticIndex {
  readonly version: typeof MEDIA_SEMANTIC_INDEX_FILE_VERSION;
  readonly indexId?: string;
  readonly assetId: string;
  readonly sourceRef: MediaSemanticSourceRef;
  readonly textSegments?: readonly MediaTextSegment[];
  readonly entityMentions?: readonly EntityMention[];
  readonly perceptionRefs?: readonly PerceptionCardRef[];
  readonly semanticTags?: readonly SemanticTag[];
  readonly updatedAt?: string;
  readonly metadata?: CharacterMemoryJsonRecord;
}

export interface ContributionDiagnostic {
  readonly severity: 'error' | 'warning' | 'info' | 'suggestion';
  readonly code: string;
  readonly message: string;
  readonly path?: readonly CharacterMemoryPathSegment[];
  readonly sourceRef?: MediaEvidenceSourceRef;
  readonly details?: CharacterMemoryJsonRecord;
}

export interface EntityMemoryContribution {
  readonly contributionId: string;
  readonly sourcePackage: string;
  readonly sourceRef: MediaEvidenceSourceRef;
  readonly reviewPolicy: EntityMemoryContributionReviewPolicy;
  readonly entityCandidates?: readonly CreativeEntityCandidate[];
  readonly characterObservations?: readonly CharacterObservation[];
  readonly mediaTextSegments?: readonly MediaTextSegment[];
  readonly semanticTags?: readonly SemanticTag[];
  readonly assetRequirements?: readonly EntityAssetRequirement[];
  readonly diagnostics?: readonly ContributionDiagnostic[];
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly metadata?: CharacterMemoryJsonRecord;
}

export interface ProjectPerceptionCardToSemanticIndexInput {
  readonly card: PerceptionCard;
  readonly sourceRef: MediaSemanticSourceRef;
  readonly evidenceSourceRef?: MediaEvidenceSourceRef;
  readonly providerId?: string;
  readonly sourceKind?: MediaTextSourceKind;
  readonly indexId?: string;
  readonly updatedAt?: string;
}

export function isMediaTextSourceKind(value: unknown): value is MediaTextSourceKind {
  return includesString(MEDIA_TEXT_SOURCE_KINDS, value);
}

export function isMediaTextSegmentKind(value: unknown): value is MediaTextSegmentKind {
  return includesString(MEDIA_TEXT_SEGMENT_KINDS, value);
}

export function isEntityMemoryContributionReviewPolicy(
  value: unknown,
): value is EntityMemoryContributionReviewPolicy {
  return includesString(ENTITY_MEMORY_CONTRIBUTION_REVIEW_POLICIES, value);
}

export function isMediaBoundingBoxUnit(value: unknown): value is MediaBoundingBoxUnit {
  return includesString(MEDIA_BOUNDING_BOX_UNITS, value);
}

export function mapMediaTextSourceKindToCharacterObservationSource(
  sourceKind: MediaTextSourceKind,
): CharacterObservationSource {
  return sourceKind;
}

export function mediaTextSegmentToCharacterObservationProvenance(
  segment: Pick<MediaTextSegment, 'provenance'>,
): CharacterObservation['provenance'] {
  const { provenance } = segment;
  return {
    source: mapMediaTextSourceKindToCharacterObservationSource(provenance.sourceKind),
    ...(provenance.providerId ? { providerId: provenance.providerId } : {}),
    ...(provenance.toolCallId ? { toolCallId: provenance.toolCallId } : {}),
    ...(provenance.taskId ? { taskId: provenance.taskId } : {}),
    ...(provenance.modelId ? { modelId: provenance.modelId } : {}),
    ...(provenance.observedAt ? { observedAt: provenance.observedAt } : {}),
    ...(provenance.metadata ? { metadata: provenance.metadata } : {}),
  };
}

export function projectPerceptionCardToMediaSemanticIndex(
  input: ProjectPerceptionCardToSemanticIndexInput,
): MediaSemanticIndex {
  const textSegments = (input.card.semantic?.evidences ?? []).flatMap((evidence, index) =>
    projectPerceptionEvidenceToTextSegment(input, evidence, index),
  );
  return {
    version: MEDIA_SEMANTIC_INDEX_FILE_VERSION,
    ...(input.indexId ? { indexId: input.indexId } : {}),
    assetId: input.card.assetId,
    sourceRef: input.sourceRef,
    ...(textSegments.length > 0 ? { textSegments } : {}),
    perceptionRefs: [
      {
        assetId: input.card.assetId,
        ...(input.card.cacheKey ? { cacheKey: input.card.cacheKey } : {}),
        ...(input.card.sourceToolCallId ? { sourceToolCallId: input.card.sourceToolCallId } : {}),
        ...(input.card.contextPacketId ? { contextPacketId: input.card.contextPacketId } : {}),
        createdAt: input.card.createdAt,
      },
    ],
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

export function createMediaSemanticIndexSidecarRef(
  index: MediaSemanticIndex,
): MediaSemanticIndexSidecarRef {
  const indexId = index.indexId ?? `asset-${sanitizeSidecarPathPart(index.assetId)}`;
  return {
    rootDir: '${PROJECT}/.neko/semantic-index',
    relativePath: `${sanitizeSidecarPathPart(index.assetId)}/${sanitizeSidecarPathPart(indexId)}.json`,
    indexId,
    assetId: index.assetId,
    sourceRef: index.sourceRef,
  };
}

export function createMediaSemanticIndexSidecarRecord(
  index: MediaSemanticIndex,
): MediaSemanticIndexSidecarRecord {
  return {
    ref: createMediaSemanticIndexSidecarRef(index),
    index,
  };
}

export function validateMediaSemanticIndexSidecarRecord(
  record: MediaSemanticIndexSidecarRecord,
  options: MediaSemanticValidationOptions = {},
): MediaSemanticValidationResult {
  const diagnostics = [
    ...validateMediaSemanticIndex(record.index, options).diagnostics,
    ...validateMediaSemanticIndexSidecarRef(record.ref),
    ...validateSidecarRecordConsistency(record),
    ...validateMediaSemanticIndexCachePath(record.searchItemsCachePath),
  ];
  return validationResult(diagnostics, options);
}

export function serializeMediaSemanticIndexSidecar(
  record: MediaSemanticIndexSidecarRecord,
  options: MediaSemanticValidationOptions = {},
): MediaSemanticValidationResult & { readonly content?: string } {
  const result = validateMediaSemanticIndexSidecarRecord(record, options);
  if (!result.ok) return result;
  return {
    ...result,
    content: `${JSON.stringify(record.index, null, 2)}\n`,
  };
}

export function parseMediaSemanticIndexSidecar(
  content: string,
  options: MediaSemanticValidationOptions = {},
): MediaSemanticIndexParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      diagnostics: [
        diagnostic('error', 'invalid-root', [], 'Media semantic index sidecar must be valid JSON.'),
      ],
    };
  }
  const validation = validateMediaSemanticIndex(parsed, options);
  if (!validation.ok || !isMediaSemanticIndex(parsed, options)) {
    return { diagnostics: validation.diagnostics };
  }
  return {
    record: createMediaSemanticIndexSidecarRecord(parsed),
    diagnostics: validation.diagnostics,
  };
}

function projectPerceptionEvidenceToTextSegment(
  input: ProjectPerceptionCardToSemanticIndexInput,
  evidence: PerceptionEvidenceEntry,
  index: number,
): readonly MediaTextSegment[] {
  if (!isTextualPerceptionEvidence(evidence)) return [];
  const text = typeof evidence.value === 'string' ? evidence.value : JSON.stringify(evidence.value);
  if (!text || text.trim().length === 0) return [];
  return [
    {
      segmentId: `${input.card.assetId}:perception:${index}`,
      kind: perceptionEvidenceKindToTextKind(evidence.kind),
      text,
      sourceRef:
        input.evidenceSourceRef ??
        ({
          kind: 'generated-asset',
          assetId: input.card.assetId,
        } satisfies MediaEvidenceSourceRef),
      confidence: evidence.confidence,
      provenance: {
        providerId: input.providerId ?? 'perception-card',
        sourceKind: input.sourceKind ?? perceptionCardModalityToSourceKind(input.card),
        ...(input.card.sourceToolCallId ? { toolCallId: input.card.sourceToolCallId } : {}),
      },
      metadata: {
        perceptionEvidenceKind: evidence.kind,
      },
    },
  ];
}

function isTextualPerceptionEvidence(evidence: PerceptionEvidenceEntry): boolean {
  return (
    evidence.kind === 'description' ||
    evidence.kind === 'transcript' ||
    evidence.kind === 'tags' ||
    typeof evidence.value === 'string'
  );
}

function perceptionEvidenceKindToTextKind(
  kind: PerceptionEvidenceEntry['kind'],
): MediaTextSegmentKind {
  if (kind === 'transcript') return 'asr';
  if (kind === 'description' || kind === 'tags') return 'caption';
  return 'agent';
}

function perceptionCardModalityToSourceKind(card: PerceptionCard): MediaTextSourceKind {
  switch (card.modality) {
    case 'image':
      return 'comic';
    case 'video':
      return 'video';
    case 'audio':
      return 'audio';
    default:
      return 'generated-asset';
  }
}

export function validateMediaSemanticIndex(
  value: unknown,
  options: MediaSemanticValidationOptions = {},
): MediaSemanticValidationResult {
  const diagnostics: MediaSemanticDiagnostic[] = [];
  validateIndex(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function validateMediaTextSegment(
  value: unknown,
  options: MediaSemanticValidationOptions = {},
): MediaSemanticValidationResult {
  const diagnostics: MediaSemanticDiagnostic[] = [];
  validateTextSegment(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function validateMediaTextRangeForSourceRef(
  range: unknown,
  sourceRef: unknown,
  options: MediaSemanticValidationOptions = {},
): MediaSemanticValidationResult {
  const diagnostics: MediaSemanticDiagnostic[] = [];
  validateTextRange(range, sourceRef, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function validateEntityMemoryContribution(
  value: unknown,
  options: MediaSemanticValidationOptions = {},
): MediaSemanticValidationResult {
  const diagnostics: MediaSemanticDiagnostic[] = [];
  validateContribution(value, [], diagnostics, options);
  return validationResult(diagnostics, options);
}

export function isMediaSemanticIndex(
  value: unknown,
  options: MediaSemanticValidationOptions = {},
): value is MediaSemanticIndex {
  return validateMediaSemanticIndex(value, options).ok;
}

export function isMediaTextSegment(
  value: unknown,
  options: MediaSemanticValidationOptions = {},
): value is MediaTextSegment {
  return validateMediaTextSegment(value, options).ok;
}

export function isEntityMemoryContribution(
  value: unknown,
  options: MediaSemanticValidationOptions = {},
): value is EntityMemoryContribution {
  return validateEntityMemoryContribution(value, options).ok;
}

function validateIndex(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
  options: MediaSemanticValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-root', path, 'Media semantic index must be an object.'),
    );
    return;
  }
  validateVersion(value['version'], [...path, 'version'], diagnostics);
  requireString(value['assetId'], [...path, 'assetId'], diagnostics);
  validateSerializableValue(value['sourceRef'], [...path, 'sourceRef'], diagnostics);
  validateArray(value['textSegments'], [...path, 'textSegments'], diagnostics, (item, itemPath) =>
    validateTextSegment(item, itemPath, diagnostics, options),
  );
  validateArray(
    value['entityMentions'],
    [...path, 'entityMentions'],
    diagnostics,
    (item, itemPath) => validateEntityMention(item, itemPath, diagnostics),
  );
  validateArray(
    value['perceptionRefs'],
    [...path, 'perceptionRefs'],
    diagnostics,
    (item, itemPath) => validatePerceptionRef(item, itemPath, diagnostics),
  );
  validateArray(value['semanticTags'], [...path, 'semanticTags'], diagnostics, (item, itemPath) =>
    validateSemanticTag(item, itemPath, diagnostics),
  );
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
  validateSerializedSize(value, path, diagnostics, options);
}

function validateTextSegment(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
  options: MediaSemanticValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-required-field', path, 'Media text segment must be an object.'),
    );
    return;
  }
  requireString(value['segmentId'], [...path, 'segmentId'], diagnostics);
  if (!isMediaTextSegmentKind(value['kind'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-required-field',
        [...path, 'kind'],
        'Unsupported media text segment kind.',
        {
          expected: MEDIA_TEXT_SEGMENT_KINDS.join(', '),
          actual: serializableDiagnosticValue(value['kind']),
        },
      ),
    );
  }
  requireString(value['text'], [...path, 'text'], diagnostics);
  validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics);
  validateTextProvenance(value['provenance'], [...path, 'provenance'], diagnostics);
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  validateTextRange(value['range'], value['sourceRef'], [...path, 'range'], diagnostics, options);
  validateStringArray(value['entityMentionIds'], [...path, 'entityMentionIds'], diagnostics);
  validateStringArray(value['semanticTagIds'], [...path, 'semanticTagIds'], diagnostics);
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
  validateSerializedSize(value, path, diagnostics, options);
}

function validateTextProvenance(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(missingRequiredDiagnostic(path, 'provenance'));
    return;
  }
  requireString(value['providerId'], [...path, 'providerId'], diagnostics);
  if (!isMediaTextSourceKind(value['sourceKind'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-source-kind',
        [...path, 'sourceKind'],
        'Unsupported media text source kind.',
        {
          expected: MEDIA_TEXT_SOURCE_KINDS.join(', '),
          actual: serializableDiagnosticValue(value['sourceKind']),
        },
      ),
    );
  }
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
}

function validateTextRange(
  value: unknown,
  sourceRef: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
  options: MediaSemanticValidationOptions,
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  validateBoundingBox(value['boundingBox'], [...path, 'boundingBox'], diagnostics);
  validateSerializableValue(value, path, diagnostics);
  validateRangeCombination(value, sourceRef, path, diagnostics, options);
}

function validateRangeCombination(
  range: Readonly<Record<string, unknown>>,
  sourceRef: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
  options: MediaSemanticValidationOptions,
): void {
  if (!isRecord(sourceRef)) return;
  const kind = sourceRef['kind'] as CharacterMemorySourceRefKind | undefined;
  if (!includesString(CHARACTER_MEMORY_SOURCE_REF_KINDS, kind)) return;
  for (const field of Object.keys(range)) {
    if (!isMediaTextRangeField(field)) continue;
    if (!isRangeFieldCompatible(kind, field)) {
      diagnostics.push(
        diagnostic(
          options.warnOnUnrelatedRangeFields ? 'warning' : 'error',
          'invalid-range',
          [...path, field],
          `${field} is not valid range evidence for ${kind} source refs.`,
          { expected: `range fields compatible with ${kind}` },
        ),
      );
    }
  }
}

function validateBoundingBox(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  for (const field of ['x', 'y', 'width', 'height'] as const) {
    if (typeof value[field] !== 'number' || !Number.isFinite(value[field])) {
      diagnostics.push(
        invalidBoundingBoxDiagnostic([...path, field], 'finite number', value[field]),
      );
    }
  }
  if (typeof value['width'] === 'number' && value['width'] < 0) {
    diagnostics.push(
      invalidBoundingBoxDiagnostic([...path, 'width'], 'non-negative number', value['width']),
    );
  }
  if (typeof value['height'] === 'number' && value['height'] < 0) {
    diagnostics.push(
      invalidBoundingBoxDiagnostic([...path, 'height'], 'non-negative number', value['height']),
    );
  }
  if (value['unit'] !== undefined && !isMediaBoundingBoxUnit(value['unit'])) {
    diagnostics.push(
      invalidBoundingBoxDiagnostic(
        [...path, 'unit'],
        MEDIA_BOUNDING_BOX_UNITS.join(', '),
        value['unit'],
      ),
    );
  }
  validateSerializableValue(value, path, diagnostics);
}

function validatePerceptionRef(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  requireString(value['assetId'], [...path, 'assetId'], diagnostics);
  validateSerializableValue(value, path, diagnostics);
}

function validateSemanticTag(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  requireString(value['tagId'], [...path, 'tagId'], diagnostics);
  requireString(value['label'], [...path, 'label'], diagnostics);
  validateOptionalConfidence(value['confidence'], [...path, 'confidence'], diagnostics);
  if (value['source'] !== undefined && !isMediaTextSourceKind(value['source'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-source-kind',
        [...path, 'source'],
        'Unsupported semantic tag source.',
        {
          expected: MEDIA_TEXT_SOURCE_KINDS.join(', '),
          actual: serializableDiagnosticValue(value['source']),
        },
      ),
    );
  }
  validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics, true);
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
}

function validateContribution(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
  options: MediaSemanticValidationOptions,
): void {
  if (!isRecord(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-root', path, 'Entity memory contribution must be an object.'),
    );
    return;
  }
  requireString(value['contributionId'], [...path, 'contributionId'], diagnostics);
  requireString(value['sourcePackage'], [...path, 'sourcePackage'], diagnostics);
  validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics);
  if (!isEntityMemoryContributionReviewPolicy(value['reviewPolicy'])) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-review-policy',
        [...path, 'reviewPolicy'],
        'Unsupported entity memory contribution review policy.',
        {
          expected: ENTITY_MEMORY_CONTRIBUTION_REVIEW_POLICIES.join(', '),
          actual: serializableDiagnosticValue(value['reviewPolicy']),
        },
      ),
    );
  }
  validateArray(
    value['characterObservations'],
    [...path, 'characterObservations'],
    diagnostics,
    (item, itemPath) => {
      const result = validateCharacterObservation(item);
      for (const childDiagnostic of result.diagnostics) {
        diagnostics.push(
          diagnostic(
            childDiagnostic.severity === 'info' ? 'info' : childDiagnostic.severity,
            mapCharacterMemoryDiagnosticCode(childDiagnostic.code),
            [...itemPath, ...childDiagnostic.path],
            childDiagnostic.message,
            {
              ...(childDiagnostic.expected ? { expected: childDiagnostic.expected } : {}),
              ...(childDiagnostic.actual !== undefined ? { actual: childDiagnostic.actual } : {}),
              ...(childDiagnostic.details ? { details: childDiagnostic.details } : {}),
            },
          ),
        );
      }
      validateSerializableValue(item, itemPath, diagnostics);
    },
  );
  validateArray(
    value['mediaTextSegments'],
    [...path, 'mediaTextSegments'],
    diagnostics,
    (item, itemPath) => validateTextSegment(item, itemPath, diagnostics, options),
  );
  validateArray(value['semanticTags'], [...path, 'semanticTags'], diagnostics, (item, itemPath) =>
    validateSemanticTag(item, itemPath, diagnostics),
  );
  validateArray(
    value['assetRequirements'],
    [...path, 'assetRequirements'],
    diagnostics,
    (item, itemPath) => validateAssetRequirement(item, itemPath, diagnostics),
  );
  validateArray(value['diagnostics'], [...path, 'diagnostics'], diagnostics, (item, itemPath) =>
    validateContributionDiagnostic(item, itemPath, diagnostics),
  );
  validateSerializableValue(value['metadata'], [...path, 'metadata'], diagnostics);
  validateSerializedSize(value, path, diagnostics, options);
}

function validateAssetRequirement(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  validateSerializableValue(value, path, diagnostics);
}

function validateContributionDiagnostic(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'object', value));
    return;
  }
  if (!isDiagnosticSeverity(value['severity'])) {
    diagnostics.push(
      invalidFieldDiagnostic([...path, 'severity'], 'diagnostic severity', value['severity']),
    );
  }
  requireString(value['code'], [...path, 'code'], diagnostics);
  requireString(value['message'], [...path, 'message'], diagnostics);
  validateSourceRef(value['sourceRef'], [...path, 'sourceRef'], diagnostics, true);
  validateSerializableValue(value['details'], [...path, 'details'], diagnostics);
}

function validateMediaSemanticIndexSidecarRef(
  ref: MediaSemanticIndexSidecarRef,
): readonly MediaSemanticDiagnostic[] {
  const diagnostics: MediaSemanticDiagnostic[] = [];
  if (ref.rootDir !== '${PROJECT}/.neko/semantic-index') {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-source-ref',
        ['ref', 'rootDir'],
        'Media semantic sidecars must stay under the project semantic-index directory.',
        {
          expected: '${PROJECT}/.neko/semantic-index',
          actual: ref.rootDir,
        },
      ),
    );
  }
  if (
    ref.relativePath.trim().length === 0 ||
    ref.relativePath.startsWith('/') ||
    ref.relativePath.includes('..') ||
    isUnsafeRuntimeHandle(ref.relativePath)
  ) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-source-ref',
        ['ref', 'relativePath'],
        'Media semantic sidecar path must be project-relative and durable.',
        { actual: ref.relativePath },
      ),
    );
  }
  validateSerializableValue(ref, ['ref'], diagnostics);
  return diagnostics;
}

function validateSidecarRecordConsistency(
  record: MediaSemanticIndexSidecarRecord,
): readonly MediaSemanticDiagnostic[] {
  const diagnostics: MediaSemanticDiagnostic[] = [];
  if (record.ref.assetId !== record.index.assetId) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-source-ref',
        ['ref', 'assetId'],
        'Media semantic sidecar ref assetId must match the indexed asset.',
        {
          expected: record.index.assetId,
          actual: record.ref.assetId,
        },
      ),
    );
  }
  if (record.index.indexId !== undefined && record.ref.indexId !== record.index.indexId) {
    diagnostics.push(
      diagnostic(
        'error',
        'invalid-source-ref',
        ['ref', 'indexId'],
        'Media semantic sidecar ref indexId must match the semantic index id.',
        {
          expected: record.index.indexId,
          actual: record.ref.indexId,
        },
      ),
    );
  }
  if (JSON.stringify(record.ref.sourceRef) !== JSON.stringify(record.index.sourceRef)) {
    diagnostics.push(
      diagnostic(
        'warning',
        'invalid-source-ref',
        ['ref', 'sourceRef'],
        'Media semantic sidecar ref sourceRef should match the semantic index sourceRef.',
      ),
    );
  }
  return diagnostics;
}

function validateMediaSemanticIndexCachePath(
  path: MediaSemanticIndexSidecarRecord['searchItemsCachePath'],
): readonly MediaSemanticDiagnostic[] {
  if (path === undefined) return [];
  if (
    !path.startsWith('${PROJECT}/.neko/.cache/') ||
    path.includes('..') ||
    isUnsafeRuntimeHandle(path)
  ) {
    return [
      diagnostic(
        'error',
        'invalid-source-ref',
        ['searchItemsCachePath'],
        'Media semantic cache projections must stay under the rebuildable project cache directory.',
        {
          expected: '${PROJECT}/.neko/.cache/<partition>',
          actual: path,
        },
      ),
    ];
  }
  return [];
}

function validateEntityMention(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
): void {
  validateSerializableValue(value, path, diagnostics);
}

function validateSourceRef(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
  optional = false,
): void {
  if (value === undefined && optional) return;
  if (!isCharacterMemorySourceRef(value)) {
    diagnostics.push(
      diagnostic('error', 'invalid-source-ref', path, 'Invalid character memory source reference.'),
    );
    return;
  }
  validateSerializableValue(value, path, diagnostics);
}

function validateVersion(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
): void {
  if (value !== MEDIA_SEMANTIC_INDEX_FILE_VERSION) {
    diagnostics.push(
      diagnostic('error', 'invalid-version', path, 'Media semantic index version must be 1.', {
        expected: String(MEDIA_SEMANTIC_INDEX_FILE_VERSION),
        actual: serializableDiagnosticValue(value),
      }),
    );
  }
}

function validateOptionalConfidence(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    diagnostics.push(
      diagnostic(
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
  diagnostics: MediaSemanticDiagnostic[],
): void {
  if (value === undefined) return;
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    diagnostics.push(invalidFieldDiagnostic(path, 'string[]', value));
  }
}

function validateArray(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
  validator: (item: unknown, path: readonly CharacterMemoryPathSegment[]) => void,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(invalidFieldDiagnostic(path, 'array', value));
    return;
  }
  value.forEach((item, index) => validator(item, [...path, index]));
}

function validateSerializableValue(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
): void {
  if (value === undefined) return;
  if (!isJsonValue(value)) {
    diagnostics.push(
      diagnostic('error', 'non-serializable-value', path, 'Value must be JSON-serializable.'),
    );
    return;
  }
  const unsafe = findUnsafeRuntimeHandle(value);
  if (unsafe) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsafe-runtime-handle',
        path,
        'Persistent media semantic evidence cannot contain runtime-only handles.',
        { actual: unsafe },
      ),
    );
  }
}

function validateSerializedSize(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
  options: MediaSemanticValidationOptions,
): void {
  const maxBytes = options.maxSerializedBytes ?? 96_000;
  const byteLength = jsonByteLength(value);
  if (byteLength > maxBytes) {
    diagnostics.push(
      diagnostic(
        'error',
        'oversized-payload',
        path,
        'Media semantic record exceeds maximum serialized size.',
        {
          expected: `<= ${maxBytes} bytes`,
          actual: byteLength,
        },
      ),
    );
  }
}

function requireString(
  value: unknown,
  path: readonly CharacterMemoryPathSegment[],
  diagnostics: MediaSemanticDiagnostic[],
): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    diagnostics.push(invalidFieldDiagnostic(path, 'non-empty string', value));
    return;
  }
  if (isUnsafeRuntimeHandle(value)) {
    diagnostics.push(
      diagnostic(
        'error',
        'unsafe-runtime-handle',
        path,
        'Persistent media semantic evidence cannot contain runtime-only handles.',
        {
          actual: value,
        },
      ),
    );
  }
}

function missingRequiredDiagnostic(
  path: readonly CharacterMemoryPathSegment[],
  field: string,
): MediaSemanticDiagnostic {
  return diagnostic(
    'error',
    'missing-required-field',
    path,
    `Missing required media semantic field ${field}.`,
    {
      expected: field,
    },
  );
}

function invalidFieldDiagnostic(
  path: readonly CharacterMemoryPathSegment[],
  expected: string,
  actual: unknown,
): MediaSemanticDiagnostic {
  return diagnostic(
    'error',
    'invalid-required-field',
    path,
    `Invalid media semantic field at ${formatPath(path)}.`,
    {
      expected,
      actual: serializableDiagnosticValue(actual),
    },
  );
}

function invalidBoundingBoxDiagnostic(
  path: readonly CharacterMemoryPathSegment[],
  expected: string,
  actual: unknown,
): MediaSemanticDiagnostic {
  return diagnostic('error', 'invalid-bounding-box', path, 'Invalid media bounding box.', {
    expected,
    actual: serializableDiagnosticValue(actual),
  });
}

function diagnostic(
  severity: MediaSemanticDiagnostic['severity'],
  code: MediaSemanticDiagnosticCode,
  path: readonly CharacterMemoryPathSegment[],
  message: string,
  extras: Omit<MediaSemanticDiagnostic, 'severity' | 'code' | 'path' | 'message'> = {},
): MediaSemanticDiagnostic {
  return {
    severity,
    code,
    path,
    message,
    ...extras,
  };
}

function validationResult(
  diagnostics: readonly MediaSemanticDiagnostic[],
  options: MediaSemanticValidationOptions,
): MediaSemanticValidationResult {
  const bounded = diagnostics.slice(0, options.maxDiagnostics ?? 100);
  return {
    ok: !bounded.some((item) => item.severity === 'error'),
    diagnostics: bounded,
  };
}

function isDiagnosticSeverity(value: unknown): value is MediaSemanticDiagnostic['severity'] {
  return value === 'error' || value === 'warning' || value === 'info' || value === 'suggestion';
}

function mapCharacterMemoryDiagnosticCode(code: string): MediaSemanticDiagnosticCode {
  switch (code) {
    case 'invalid-root':
    case 'invalid-version':
    case 'missing-required-field':
    case 'invalid-source-ref':
    case 'invalid-confidence':
    case 'non-serializable-value':
    case 'unsafe-runtime-handle':
    case 'oversized-payload':
      return code;
    case 'invalid-review-status':
      return 'invalid-review-policy';
    default:
      return 'invalid-required-field';
  }
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isJsonValue(value: unknown): value is CharacterMemoryJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isJsonValue);
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
  if (isJsonValue(value)) return value;
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

function isMediaTextRangeField(value: string): boolean {
  return (
    value === 'sceneId' ||
    value === 'shotId' ||
    value === 'pageId' ||
    value === 'panelId' ||
    value === 'frameStart' ||
    value === 'frameEnd' ||
    value === 'startMs' ||
    value === 'endMs' ||
    value === 'startLine' ||
    value === 'endLine' ||
    value === 'nodeId' ||
    value === 'assetId' ||
    value === 'boundingBox'
  );
}

function isRangeFieldCompatible(kind: CharacterMemorySourceRefKind, field: string): boolean {
  switch (kind) {
    case 'story':
      return (
        field === 'sceneId' || field === 'shotId' || field === 'startLine' || field === 'endLine'
      );
    case 'document':
      return field === 'startLine' || field === 'endLine' || field === 'assetId';
    case 'manual':
      return field === 'sceneId' || field === 'shotId' || field === 'assetId';
    case 'canvas-node':
      return field === 'nodeId' || field === 'assetId' || field === 'boundingBox';
    case 'cut-range':
      return field === 'sceneId' || field === 'shotId' || field === 'startMs' || field === 'endMs';
    case 'artifact-resource':
    case 'generated-asset':
    case 'tool-result':
      return true;
  }
}

function sanitizeSidecarPathPart(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return sanitized.length > 0 ? sanitized : 'semantic-index';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
