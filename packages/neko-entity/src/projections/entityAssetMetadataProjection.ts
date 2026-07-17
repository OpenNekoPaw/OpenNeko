import {
  hashStableValue,
  type CreativeEntityCandidate,
  type CreativeEntityOccurrenceProjection,
  type CreativeEntityRelationshipProjection,
  type CreativeEntitySourceMetadata,
  type EntityAssetBinding,
  type EntityAssetProjectionRecord,
  type EntityAssetProjectionRepository,
  type LocalMetadataPartition,
} from '@neko/shared';
import type { CreativeEntityProviderSnapshot } from '../providers';

export interface EntityAssetMetadataProjectorOptions {
  readonly partition: LocalMetadataPartition;
  readonly repository: EntityAssetProjectionRepository;
  readonly listCandidates: () => Promise<readonly CreativeEntityCandidate[]>;
  readonly listBindings: () => Promise<readonly EntityAssetBinding[]>;
  readonly now?: () => string;
}

export class EntityAssetMetadataProjector {
  constructor(private readonly options: EntityAssetMetadataProjectorOptions) {}

  async refreshFacts(): Promise<void> {
    const [candidates, bindings] = await Promise.all([
      this.options.listCandidates(),
      this.options.listBindings(),
    ]);
    const updatedAt = this.now();
    await this.options.repository.replaceSource({
      partition: this.options.partition,
      sourceId: 'neko-entity-facts',
      records: sortRecords([
        ...bindings.map((binding) => bindingProjection(binding, updatedAt)),
        ...candidates.map((candidate) => candidateProjection(candidate, updatedAt)),
      ]),
      updatedAt,
    });
  }

  async replaceProviderSnapshot(
    providerId: string,
    snapshot: CreativeEntityProviderSnapshot,
  ): Promise<void> {
    if (!providerId.trim()) throw new Error('Entity projection providerId must not be empty.');
    const updatedAt = this.now();
    const sourceId = `provider:${providerId}`;
    await this.options.repository.replaceSource({
      partition: this.options.partition,
      sourceId,
      records: sortRecords([
        ...snapshot.candidates.map((candidate) =>
          candidateProjection(candidate, updatedAt, sourceId),
        ),
        ...snapshot.occurrences.map((occurrence) =>
          occurrenceProjection(occurrence, updatedAt, sourceId),
        ),
        ...snapshot.relationships.map((relationship) =>
          relationshipProjection(relationship, updatedAt, sourceId),
        ),
      ]),
      updatedAt,
    });
  }

  private now(): string {
    return this.options.now?.() ?? new Date().toISOString();
  }
}

function candidateProjection(
  candidate: CreativeEntityCandidate,
  updatedAt: string,
  sourceId = 'neko-entity-facts',
): EntityAssetProjectionRecord {
  return {
    projectionId: candidate.id,
    kind: 'entity-candidate',
    sourceId,
    candidateId: candidate.id,
    freshness: 'fresh',
    value: sanitizeCandidate(candidate),
    updatedAt,
  };
}

function bindingProjection(
  binding: EntityAssetBinding,
  updatedAt: string,
): EntityAssetProjectionRecord {
  return {
    projectionId: binding.id,
    kind: 'binding-availability',
    sourceId: 'neko-entity-facts',
    entityId: binding.entityId,
    assetRef: binding.assetRef,
    freshness: 'fresh',
    value: {
      bindingId: binding.id,
      entityId: binding.entityId,
      entityKind: binding.entityKind,
      assetRef: binding.assetRef,
      role: binding.role,
      status: binding.status,
      availability: binding.availability,
      ...(binding.orphanedAt ? { orphanedAt: binding.orphanedAt } : {}),
      ...(binding.isDefault ? { isDefault: true } : {}),
    },
    updatedAt,
  };
}

function occurrenceProjection(
  occurrence: CreativeEntityOccurrenceProjection,
  updatedAt: string,
  sourceId: string,
): EntityAssetProjectionRecord {
  if (!isPortableProjectionRef(occurrence.location)) {
    throw new Error(`Entity occurrence location is not portable: ${occurrence.location}`);
  }
  const value: CreativeEntityOccurrenceProjection = {
    ...(occurrence.entityRef
      ? {
          entityRef: {
            entityId: occurrence.entityRef.entityId,
            entityKind: occurrence.entityRef.entityKind,
            ...(occurrence.entityRef.source ? { source: occurrence.entityRef.source } : {}),
          },
        }
      : {}),
    ...(occurrence.candidateId ? { candidateId: occurrence.candidateId } : {}),
    label: occurrence.label,
    source: sanitizeSource(occurrence.source),
    role: occurrence.role,
    location: occurrence.location,
    ...(occurrence.detail ? { detail: occurrence.detail } : {}),
  };
  return {
    projectionId: `occurrence:${hashStableValue(value)}`,
    kind: 'entity-occurrence',
    sourceId,
    ...(value.entityRef ? { entityId: value.entityRef.entityId } : {}),
    ...(value.candidateId ? { candidateId: value.candidateId } : {}),
    freshness: projectionFreshness(value.source.freshness),
    value,
    updatedAt: value.source.updatedAt ?? updatedAt,
  };
}

function relationshipProjection(
  relationship: CreativeEntityRelationshipProjection,
  updatedAt: string,
  sourceId: string,
): EntityAssetProjectionRecord {
  const value: CreativeEntityRelationshipProjection = {
    from: {
      entityId: relationship.from.entityId,
      entityKind: relationship.from.entityKind,
      ...(relationship.from.source ? { source: relationship.from.source } : {}),
    },
    to: {
      entityId: relationship.to.entityId,
      entityKind: relationship.to.entityKind,
      ...(relationship.to.source ? { source: relationship.to.source } : {}),
    },
    type: relationship.type,
    ...(relationship.strength ? { strength: relationship.strength } : {}),
    source: sanitizeSource(relationship.source),
    ...(relationship.confidence !== undefined ? { confidence: relationship.confidence } : {}),
  };
  return {
    projectionId: `relationship:${hashStableValue(value)}`,
    kind: 'entity-relationship',
    sourceId,
    entityId: value.from.entityId,
    relatedEntityId: value.to.entityId,
    freshness: projectionFreshness(value.source.freshness),
    value,
    updatedAt: value.source.updatedAt ?? updatedAt,
  };
}

function sanitizeCandidate(candidate: CreativeEntityCandidate): CreativeEntityCandidate {
  return {
    ...candidate,
    provenance: candidate.provenance.map((item) => ({
      providerId: item.providerId,
      sourceKind: item.sourceKind,
      ...(item.sourceRef && isPortableProjectionRef(item.sourceRef)
        ? { sourceRef: item.sourceRef }
        : {}),
      ...(item.label ? { label: item.label } : {}),
      ...(item.confidence !== undefined ? { confidence: item.confidence } : {}),
      ...(item.observedAt ? { observedAt: item.observedAt } : {}),
      ...(item.metadata ? { metadata: sanitizeMetadata(item.metadata) } : {}),
    })),
    sourceRefs: candidate.sourceRefs.filter(isPortableProjectionRef),
    ...(candidate.resolvedEntityRef
      ? {
          resolvedEntityRef: {
            entityId: candidate.resolvedEntityRef.entityId,
            entityKind: candidate.resolvedEntityRef.entityKind,
            ...(candidate.resolvedEntityRef.source
              ? { source: candidate.resolvedEntityRef.source }
              : {}),
          },
        }
      : {}),
    ...(candidate.metadata ? { metadata: sanitizeMetadata(candidate.metadata) } : {}),
  };
}

function sanitizeSource(source: CreativeEntitySourceMetadata): CreativeEntitySourceMetadata {
  return {
    sourceId: source.sourceId,
    sourceKind: source.sourceKind,
    ...(source.sourceRef && isPortableProjectionRef(source.sourceRef)
      ? { sourceRef: source.sourceRef }
      : {}),
    ...(source.providerId ? { providerId: source.providerId } : {}),
    ...(source.freshness ? { freshness: source.freshness } : {}),
    ...(source.updatedAt ? { updatedAt: source.updatedAt } : {}),
    ...(source.metadata ? { metadata: sanitizeMetadata(source.metadata) } : {}),
  };
}

function sanitizeMetadata(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entryValue]) => {
      if (key === 'projectRoot' || key === 'absolutePath' || key === 'cachePath') return [];
      const sanitized = sanitizeMetadataValue(entryValue);
      return sanitized === undefined ? [] : [[key, sanitized]];
    }),
  );
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (typeof value === 'string') return isPortableProjectionRef(value) ? value : undefined;
  if (Array.isArray(value)) {
    return value.map(sanitizeMetadataValue).filter((item) => item !== undefined);
  }
  if (isRecord(value)) return sanitizeMetadata(value);
  return value;
}

function isPortableProjectionRef(value: string): boolean {
  const normalized = value.replace(/\\/gu, '/');
  return (
    !/^([A-Za-z]:\/|\/)/u.test(normalized) &&
    !normalized.includes('/.neko/.cache/') &&
    !normalized.startsWith('.neko/.cache/')
  );
}

function projectionFreshness(
  freshness: CreativeEntitySourceMetadata['freshness'],
): EntityAssetProjectionRecord['freshness'] {
  if (freshness === 'building') return 'rebuilding';
  if (freshness === 'failed' || freshness === 'partial') return 'stale';
  return freshness ?? 'fresh';
}

function sortRecords(
  records: readonly EntityAssetProjectionRecord[],
): readonly EntityAssetProjectionRecord[] {
  return [...records].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind) || left.projectionId.localeCompare(right.projectionId),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
