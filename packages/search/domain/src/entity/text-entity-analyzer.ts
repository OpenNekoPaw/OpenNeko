import type {
  SemanticEvidenceProjection,
  SemanticEntitySnapshot,
  SemanticSourceAnalysisInput,
  SemanticSourceAnalysisResult,
  SemanticSourceAnalyzer,
  SemanticTextSegment,
} from '../contracts';
import type {
  CreativeEntityKind,
  CreativeEntityOccurrenceProjection,
  ProjectEntityCandidateProjection,
  ProjectEntityRecord,
} from '@neko/entity-domain';
import type { EntityMention } from '@neko/chara';
import { parseEntityUri } from '@neko/entity-domain';
import { normalizeCreativeEntityLookupKey } from '@neko/entity-domain';

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
    const evidence = input.segments.map((segment) =>
      toSemanticEvidence(
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
      index: {
        indexId: input.source.sourceId,
        assetId: input.source.sourceId,
        sourceRef,
        ...(mentions.length > 0 ? { entityMentions: mentions } : {}),
        updatedAt: input.analyzedAt,
        metadata: {
          analyzerId: ANALYZER_ID,
          analysisMode: input.source.analysisMode,
          format: input.source.format,
        },
      },
      evidence,
      mentions,
      occurrences,
      candidates,
      diagnostics: [],
    };
  }
}

interface EntityNameIndex {
  readonly byId: ReadonlyMap<string, ProjectEntityRecord>;
  readonly byName: ReadonlyMap<string, readonly ProjectEntityRecord[]>;
  readonly labels: readonly { readonly label: string; readonly normalized: string }[];
}

interface CandidateObservation {
  readonly id: string;
  readonly kind: CreativeEntityKind;
  readonly name: string;
  readonly evidenceIds: string[];
}

function buildEntityNameIndex(snapshot: SemanticEntitySnapshot): EntityNameIndex {
  const byId = new Map<string, ProjectEntityRecord>();
  const byName = new Map<string, ProjectEntityRecord[]>();
  const labels = new Map<string, string>();
  for (const entity of snapshot.entities) {
    if (entity.lifecycle.state !== 'active') continue;
    byId.set(entity.entityId, entity);
    for (const label of [entity.names.canonical, entity.names.display, ...entity.names.aliases]) {
      if (!label?.trim()) continue;
      const normalized = normalizeCreativeEntityLookupKey(label);
      const entities = byName.get(normalized) ?? [];
      if (!entities.some((candidate) => candidate.entityId === entity.entityId)) {
        entities.push(entity);
      }
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
    const compatible = segment.explicitEntityKind
      ? entities.filter((entity) => entity.kind === segment.explicitEntityKind)
      : entities;
    if (compatible.length !== 1) continue;
    const entity = compatible[0];
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
  const normalizedName = normalizeCreativeEntityLookupKey(name);
  const exact = index.byName.get(normalizedName) ?? [];
  const compatible = exact.filter((entity) => entity.kind === kind);
  if (compatible.length === 1) return;
  const id = `candidate:auto:${kind}:${stableIdPart(normalizedName)}`;
  const mentionId = `${input.source.sourceId}:candidate:${segment.segmentId}`;
  const current = observations.get(id) ?? {
    id,
    kind,
    name,
    evidenceIds: [],
  };
  current.evidenceIds.push(mentionId);
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
    occurrenceId: `${mentionId}:occurrence`,
    mentionId,
    candidateId: id,
    label: name,
    source: {
      sourceId: input.source.sourceId,
      sourceKind: input.source.rootKind,
      sourceRef: input.source.portablePath,
      providerId: ANALYZER_ID,
      freshness: 'fresh',
      updatedAt: input.analyzedAt,
    },
    role: 'definition',
    location: `${input.source.portablePath}:${range.startLine ?? 1}`,
    detail: 'structural-candidate',
    locator: segment.locator,
    range,
    sourceFingerprint: input.source.fingerprint,
  });
}

function stableIdPart(value: string): string {
  const normalized = value.trim().normalize('NFC').toLocaleLowerCase().replace(/\s+/g, '-');
  const slug = normalized.replace(/[^\p{Letter}\p{Number}_-]+/gu, '-').replace(/-+/g, '-');
  return (slug.replace(/^-|-$/g, '') || 'entity').slice(0, 96);
}

function candidateFromObservation(
  input: SemanticSourceAnalysisInput,
  observation: CandidateObservation,
): ProjectEntityCandidateProjection {
  return {
    candidateId: observation.id,
    kind: observation.kind,
    proposedNames: { canonical: observation.name, aliases: [] },
    freshness: 'fresh',
    evidence: observation.evidenceIds.map((evidenceId) => ({
      evidenceId,
      owner: input.source.rootKind,
      sourceId: input.source.sourceId,
      ...(input.source.rootKind === 'workspace' || input.source.rootKind === 'document'
        ? {
            locator: {
              file: { authority: 'workspace' as const, path: input.source.relativePath },
            },
          }
        : {}),
      label: observation.name,
      observedAt: input.analyzedAt,
    })),
  };
}

function addLinkedMention(
  input: SemanticSourceAnalysisInput,
  segment: SemanticTextSegment,
  entity: ProjectEntityRecord,
  text: string,
  offset: number,
  mentions: EntityMention[],
  occurrences: CreativeEntityOccurrenceProjection[],
  mentionKeys: Set<string>,
  matchKind: 'stable-ref' | 'exact-name',
): void {
  const key = `${segment.segmentId}:${offset}:${entity.entityId}`;
  if (mentionKeys.has(key)) return;
  mentionKeys.add(key);
  const range = mentionRange(segment, offset, text.length);
  const mentionId = `${input.source.sourceId}:mention:${mentions.length}`;
  const entityRef = { entityId: entity.entityId, entityKind: entity.kind };
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
    occurrenceId: `${mentionId}:occurrence`,
    mentionId,
    entityRef,
    label: text,
    source: {
      sourceId: input.source.sourceId,
      sourceKind: input.source.rootKind,
      sourceRef: input.source.portablePath,
      providerId: ANALYZER_ID,
      freshness: 'fresh',
      updatedAt: input.analyzedAt,
    },
    role: 'reference',
    location: `${input.source.portablePath}:${range.startLine ?? 1}`,
    detail: matchKind,
    locator: segment.locator,
    range,
    sourceFingerprint: input.source.fingerprint,
  });
}

function toSemanticEvidence(
  input: SemanticSourceAnalysisInput,
  segment: SemanticTextSegment,
  mentions: readonly EntityMention[],
): SemanticEvidenceProjection {
  return {
    evidenceId: segment.segmentId,
    unitId: segment.unitId,
    kind: segment.kind,
    sourceRef: documentSourceRef(input, segment.range),
    locator: segment.locator,
    contentHash: segment.contentHash,
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

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error('Text Entity analysis aborted.');
}
