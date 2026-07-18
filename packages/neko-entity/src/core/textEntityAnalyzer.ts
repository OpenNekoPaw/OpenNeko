import type {
  AutomaticEntityCandidateProjectionMetadata,
  AutomaticEntityCandidateReviewItem,
  CreativeEntity,
  CreativeEntityCandidate,
  CreativeEntityKind,
  CreativeEntityOccurrenceProjection,
  EntityMention,
  MediaTextSegment,
  SemanticEntitySnapshot,
  SemanticSourceAnalysisInput,
  SemanticSourceAnalysisResult,
  SemanticSourceAnalyzer,
  SemanticTextSegment,
} from '@neko/shared';
import {
  isAutomaticEntityCandidateProjectionMetadata,
  normalizeCharacterLookupKey,
  parseEntityUri,
} from '@neko/shared';
import { stableIdPart } from './adapters';

const ANALYZER_ID = 'neko.text-entity.deterministic';

export class TextEntityAnalyzer implements SemanticSourceAnalyzer {
  readonly analyzerId = ANALYZER_ID;

  supports(input: SemanticSourceAnalysisInput['source']): boolean {
    return input.analysisMode !== 'off';
  }

  async analyze(input: SemanticSourceAnalysisInput): Promise<SemanticSourceAnalysisResult> {
    if (!this.supports(input.source)) {
      throw new Error(
        `Text Entity analyzer does not support disabled source ${input.source.sourceId}`,
      );
    }
    assertNotAborted(input.signal);
    const index = buildEntityNameIndex(input.entities);
    const mentions: EntityMention[] = [];
    const occurrences: CreativeEntityOccurrenceProjection[] = [];
    const candidateObservations = new Map<string, CandidateObservation>();
    const mentionKeys = new Set<string>();

    for (const segment of input.segments) {
      assertNotAborted(input.signal);
      collectStableReferenceMentions(input, segment, index, mentions, occurrences, mentionKeys);
      collectExactNameMentions(input, segment, index, mentions, occurrences, mentionKeys);
      if (input.source.analysisMode === 'discover-candidates' && segment.explicitEntityName) {
        collectExplicitCandidateObservation(
          input,
          segment,
          index,
          candidateObservations,
          mentions,
          occurrences,
        );
      }
    }

    const candidates = [...candidateObservations.values()].map((observation) =>
      candidateFromObservation(input, observation),
    );
    const textSegments = input.segments.map((segment) =>
      toMediaTextSegment(
        input,
        segment,
        mentions.filter((mention) => mention.metadata?.['segmentId'] === segment.segmentId),
      ),
    );
    const sourceRef = {
      kind: 'file' as const,
      path: input.source.portablePath,
      metadata: {
        workspaceId: input.source.workspaceId,
        rootId: input.source.rootId,
        relativePath: input.source.relativePath,
      },
    };
    return {
      sourceId: input.source.sourceId,
      sourceFingerprint: input.source.fingerprint,
      entityRevision: input.entities.revision,
      index: {
        version: 1,
        indexId: input.source.sourceId,
        assetId: input.source.sourceId,
        sourceRef,
        ...(textSegments.length > 0 ? { textSegments } : {}),
        ...(mentions.length > 0 ? { entityMentions: mentions } : {}),
        updatedAt: input.analyzedAt,
        metadata: {
          analyzerId: ANALYZER_ID,
          entityRevision: input.entities.revision,
          analysisMode: input.source.analysisMode,
          format: input.source.format,
        },
      },
      mentions,
      occurrences,
      candidates,
      diagnostics: [],
    };
  }
}

export function projectAutomaticEntityCandidateReview(
  candidates: readonly CreativeEntityCandidate[],
): readonly AutomaticEntityCandidateReviewItem[] {
  const groups = new Map<string, AutomaticCandidateAggregate>();
  for (const candidate of candidates) {
    const metadata = candidate.metadata;
    if (!isAutomaticEntityCandidateProjectionMetadata(metadata)) continue;
    const current = groups.get(candidate.id) ?? {
      candidate,
      sourceRefs: new Set<string>(),
      occurrenceCount: 0,
      explicitStructuralMentionCount: 0,
      mentionIds: new Set<string>(),
      ambiguous: false,
      matched: false,
    };
    candidate.sourceRefs.forEach((sourceRef) => current.sourceRefs.add(sourceRef));
    metadata.mentionIds.forEach((mentionId) => current.mentionIds.add(mentionId));
    current.occurrenceCount += metadata.sourceOccurrenceCount;
    current.explicitStructuralMentionCount += metadata.explicitStructuralMentionCount;
    current.ambiguous ||= metadata.reviewStatus === 'ambiguous';
    current.matched ||= metadata.reviewStatus === 'matched';
    current.candidate = mergeAutomaticCandidate(current.candidate, candidate);
    groups.set(candidate.id, current);
  }
  return [...groups.values()]
    .map((group) => {
      const reviewStatus: AutomaticEntityCandidateReviewItem['reviewStatus'] = group.ambiguous
        ? 'ambiguous'
        : group.matched
          ? 'matched'
          : group.sourceRefs.size >= 2 || group.explicitStructuralMentionCount >= 3
            ? 'suggested'
            : 'observed';
      return {
        candidate: group.candidate,
        reviewStatus,
        distinctSourceCount: group.sourceRefs.size,
        occurrenceCount: group.occurrenceCount,
        explicitStructuralMentionCount: group.explicitStructuralMentionCount,
        mentionIds: [...group.mentionIds].sort(),
      };
    })
    .sort(compareReviewItems);
}

interface EntityNameIndex {
  readonly byId: ReadonlyMap<string, CreativeEntity>;
  readonly byName: ReadonlyMap<string, readonly CreativeEntity[]>;
  readonly labels: readonly { readonly label: string; readonly normalized: string }[];
}

interface CandidateObservation {
  readonly id: string;
  readonly kind: CreativeEntityKind;
  readonly name: string;
  readonly normalizedName: string;
  readonly mentionIds: string[];
  readonly sourceRefs: Set<string>;
  occurrenceCount: number;
  explicitStructuralMentionCount: number;
  reviewStatus: AutomaticEntityCandidateProjectionMetadata['reviewStatus'];
}

interface AutomaticCandidateAggregate {
  candidate: CreativeEntityCandidate;
  readonly sourceRefs: Set<string>;
  occurrenceCount: number;
  explicitStructuralMentionCount: number;
  readonly mentionIds: Set<string>;
  ambiguous: boolean;
  matched: boolean;
}

function buildEntityNameIndex(snapshot: SemanticEntitySnapshot): EntityNameIndex {
  const byId = new Map<string, CreativeEntity>();
  const byName = new Map<string, CreativeEntity[]>();
  const labels = new Map<string, string>();
  for (const entity of snapshot.entities) {
    if (entity.status !== 'confirmed') continue;
    byId.set(entity.id, entity);
    for (const label of [entity.canonicalName, entity.displayName, ...entity.aliases]) {
      if (!label?.trim()) continue;
      const normalized = normalizeCharacterLookupKey(label);
      const entities = byName.get(normalized) ?? [];
      if (!entities.some((candidate) => candidate.id === entity.id)) entities.push(entity);
      byName.set(normalized, entities);
      const previous = labels.get(normalized);
      if (!previous || label.length > previous.length) labels.set(normalized, label);
    }
  }
  return {
    byId,
    byName,
    labels: [...labels]
      .map(([normalized, label]) => ({ label, normalized }))
      .sort((left, right) => right.label.length - left.label.length),
  };
}

function collectStableReferenceMentions(
  input: SemanticSourceAnalysisInput,
  segment: SemanticTextSegment,
  index: EntityNameIndex,
  mentions: EntityMention[],
  occurrences: CreativeEntityOccurrenceProjection[],
  mentionKeys: Set<string>,
): void {
  const pattern = /entity:\/\/[A-Za-z0-9_-]+(?:\/[a-z]+)?/gu;
  for (const match of segment.text.matchAll(pattern)) {
    const parsed = parseEntityUri(match[0]);
    const entity = parsed ? index.byId.get(parsed.entityId) : undefined;
    if (!entity || match.index === undefined) continue;
    addLinkedMention(
      input,
      segment,
      entity,
      match[0],
      match.index,
      mentions,
      occurrences,
      mentionKeys,
      'stable-ref',
    );
  }
}

function collectExactNameMentions(
  input: SemanticSourceAnalysisInput,
  segment: SemanticTextSegment,
  index: EntityNameIndex,
  mentions: EntityMention[],
  occurrences: CreativeEntityOccurrenceProjection[],
  mentionKeys: Set<string>,
): void {
  for (const entry of index.labels) {
    const entities = index.byName.get(entry.normalized) ?? [];
    if (entities.length !== 1) continue;
    const entity = entities[0];
    if (!entity) continue;
    for (const offset of findExactOffsets(segment.text, entry.label)) {
      addLinkedMention(
        input,
        segment,
        entity,
        entry.label,
        offset,
        mentions,
        occurrences,
        mentionKeys,
        'exact-name',
      );
    }
  }
}

function collectExplicitCandidateObservation(
  input: SemanticSourceAnalysisInput,
  segment: SemanticTextSegment,
  index: EntityNameIndex,
  observations: Map<string, CandidateObservation>,
  mentions: EntityMention[],
  occurrences: CreativeEntityOccurrenceProjection[],
): void {
  const name = segment.explicitEntityName?.trim();
  const kind = segment.explicitEntityKind;
  if (!name || !kind) return;
  const normalizedName = normalizeCharacterLookupKey(name);
  const exact = index.byName.get(normalizedName) ?? [];
  const compatible = exact.filter((entity) => entity.kind === kind);
  if (compatible.length === 1 && exact.length === 1) return;
  const id = `candidate:auto:${kind}:${stableIdPart(normalizedName)}`;
  const mentionId = `${input.source.sourceId}:candidate:${segment.segmentId}`;
  const current = observations.get(id) ?? {
    id,
    kind,
    name,
    normalizedName,
    mentionIds: [],
    sourceRefs: new Set<string>(),
    occurrenceCount: 0,
    explicitStructuralMentionCount: 0,
    reviewStatus: exact.length > 0 ? 'ambiguous' : 'observed',
  };
  current.mentionIds.push(mentionId);
  current.sourceRefs.add(input.source.portablePath);
  current.occurrenceCount += 1;
  current.explicitStructuralMentionCount += 1;
  if (exact.length > 0) current.reviewStatus = 'ambiguous';
  else if (current.explicitStructuralMentionCount >= 3) current.reviewStatus = 'suggested';
  observations.set(id, current);
  const range = mentionRange(segment, 0, name.length);
  mentions.push({
    mentionId,
    kind: 'name',
    text: name,
    candidateId: id,
    candidateName: name,
    sourceRef: documentSourceRef(input, range),
    range,
    metadata: { segmentId: segment.segmentId, matchKind: 'structural-candidate' },
  });
  occurrences.push({
    candidateId: id,
    label: name,
    source: {
      sourceId: input.source.sourceId,
      sourceKind: 'document',
      sourceRef: input.source.portablePath,
      providerId: ANALYZER_ID,
      freshness: 'fresh',
      updatedAt: input.analyzedAt,
    },
    role: 'definition',
    location: `${input.source.portablePath}:${range.startLine ?? 1}`,
    detail: 'structural-candidate',
  });
}

function candidateFromObservation(
  input: SemanticSourceAnalysisInput,
  observation: CandidateObservation,
): CreativeEntityCandidate {
  const metadata: AutomaticEntityCandidateProjectionMetadata = {
    projectionKind: 'automatic-entity-candidate',
    normalizedName: observation.normalizedName,
    reviewStatus: observation.reviewStatus,
    sourceOccurrenceCount: observation.occurrenceCount,
    explicitStructuralMentionCount: observation.explicitStructuralMentionCount,
    mentionIds: observation.mentionIds,
    entityRevision: input.entities.revision,
  };
  return {
    id: observation.id,
    kind: observation.kind,
    name: observation.name,
    status: 'open',
    identityBasis: 'user-named',
    provenance: [
      {
        providerId: ANALYZER_ID,
        sourceKind: 'document',
        sourceRef: input.source.portablePath,
        observedAt: input.analyzedAt,
      },
    ],
    sourceRefs: [...observation.sourceRefs],
    createdAt: input.analyzedAt,
    updatedAt: input.analyzedAt,
    metadata: { ...metadata },
  };
}

function addLinkedMention(
  input: SemanticSourceAnalysisInput,
  segment: SemanticTextSegment,
  entity: CreativeEntity,
  text: string,
  offset: number,
  mentions: EntityMention[],
  occurrences: CreativeEntityOccurrenceProjection[],
  mentionKeys: Set<string>,
  matchKind: 'stable-ref' | 'exact-name',
): void {
  const key = `${segment.segmentId}:${offset}:${entity.id}`;
  if (mentionKeys.has(key)) return;
  mentionKeys.add(key);
  const range = mentionRange(segment, offset, text.length);
  const mentionId = `${input.source.sourceId}:mention:${mentions.length}`;
  const entityRef = { entityId: entity.id, entityKind: entity.kind };
  mentions.push({
    mentionId,
    kind: 'name',
    text,
    entityRef,
    sourceRef: documentSourceRef(input, range),
    range,
    metadata: { segmentId: segment.segmentId, matchKind },
  });
  occurrences.push({
    entityRef,
    label: text,
    source: {
      sourceId: input.source.sourceId,
      sourceKind: 'document',
      sourceRef: input.source.portablePath,
      providerId: ANALYZER_ID,
      freshness: 'fresh',
      updatedAt: input.analyzedAt,
    },
    role: 'reference',
    location: `${input.source.portablePath}:${range.startLine ?? 1}`,
    detail: matchKind,
  });
}

function toMediaTextSegment(
  input: SemanticSourceAnalysisInput,
  segment: SemanticTextSegment,
  mentions: readonly EntityMention[],
): MediaTextSegment {
  return {
    segmentId: segment.segmentId,
    kind: input.source.format === 'fountain' ? 'script' : 'manual',
    text: segment.text,
    sourceRef: documentSourceRef(input, segment.range),
    provenance: {
      providerId: ANALYZER_ID,
      sourceKind: 'document',
      observedAt: input.analyzedAt,
    },
    range: segment.range,
    ...(mentions.length > 0
      ? { entityMentionIds: mentions.map((mention) => mention.mentionId) }
      : {}),
    metadata: {
      semanticSegmentKind: segment.kind,
      ...(segment.explicitEntityKind ? { explicitEntityKind: segment.explicitEntityKind } : {}),
      ...(segment.explicitEntityName ? { explicitEntityName: segment.explicitEntityName } : {}),
      ...(segment.range.structuredPath ? { structuredPath: segment.range.structuredPath } : {}),
    },
  };
}

function documentSourceRef(
  input: SemanticSourceAnalysisInput,
  range: SemanticTextSegment['range'],
) {
  return {
    kind: 'document' as const,
    source: {
      filePath: input.source.portablePath,
      format: input.source.format === 'plain' ? ('text' as const) : input.source.format,
      fileId: input.source.sourceId,
      identity: {
        fileId: input.source.sourceId,
        sizeBytes: input.source.sizeBytes,
        mtimeMs: input.source.modifiedAtMs,
        hash: input.source.fingerprint,
      },
    },
    range,
  };
}

function mentionRange(
  segment: SemanticTextSegment,
  relativeOffset: number,
  length: number,
): SemanticTextSegment['range'] {
  const before = segment.text.slice(0, relativeOffset);
  const lines = before.split('\n');
  const lineDelta = lines.length - 1;
  const startLine = (segment.range.startLine ?? 1) + lineDelta;
  const startColumn =
    lineDelta === 0
      ? (segment.range.startColumn ?? 1) + relativeOffset
      : (lines[lines.length - 1]?.length ?? 0) + 1;
  return {
    startOffset: segment.range.startOffset + relativeOffset,
    endOffset: segment.range.startOffset + relativeOffset + length,
    startLine,
    endLine: startLine,
    startColumn,
    endColumn: startColumn + length,
    ...(segment.range.structuredPath ? { structuredPath: segment.range.structuredPath } : {}),
  };
}

function findExactOffsets(text: string, label: string): readonly number[] {
  const offsets: number[] = [];
  const lowerText = text.toLocaleLowerCase();
  const lowerLabel = label.toLocaleLowerCase();
  let offset = lowerText.indexOf(lowerLabel);
  while (offset >= 0) {
    if (hasCompatibleBoundary(text, label, offset)) offsets.push(offset);
    offset = lowerText.indexOf(lowerLabel, offset + Math.max(1, lowerLabel.length));
  }
  return offsets;
}

function hasCompatibleBoundary(text: string, label: string, offset: number): boolean {
  if (!/[A-Za-z0-9_]/u.test(label)) return true;
  const before = offset > 0 ? text[offset - 1] : undefined;
  const after = text[offset + label.length];
  return !isAsciiWord(before) && !isAsciiWord(after);
}

function isAsciiWord(value: string | undefined): boolean {
  return value !== undefined && /[A-Za-z0-9_]/u.test(value);
}

function mergeAutomaticCandidate(
  left: CreativeEntityCandidate,
  right: CreativeEntityCandidate,
): CreativeEntityCandidate {
  return {
    ...left,
    provenance: uniqueByJson([...left.provenance, ...right.provenance]),
    sourceRefs: [...new Set([...left.sourceRefs, ...right.sourceRefs])],
    updatedAt: right.updatedAt ?? left.updatedAt,
  };
}

function compareReviewItems(
  left: AutomaticEntityCandidateReviewItem,
  right: AutomaticEntityCandidateReviewItem,
): number {
  const priority = { ambiguous: 0, suggested: 1, observed: 2, matched: 3 } as const;
  return (
    priority[left.reviewStatus] - priority[right.reviewStatus] ||
    right.distinctSourceCount - left.distinctSourceCount ||
    right.occurrenceCount - left.occurrenceCount ||
    left.candidate.name.localeCompare(right.candidate.name)
  );
}

function uniqueByJson<T>(values: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error('Text Entity analysis aborted.');
}
