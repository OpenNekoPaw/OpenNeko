import type {
  ProjectSearchAdapter,
  ProjectSearchItem,
  ProjectSearchQuery,
  ProjectSearchQueryContext,
} from '../contracts';
import type {
  EntityBindingAvailabilityProjectionValue,
  ProjectEntityProjectionPartition,
  ProjectEntityProjectionRepository,
  ProjectEntityCandidateProjection,
  ProjectEntityDocumentRepository,
  ProjectEntityManagementProjection,
} from '@neko/entity-domain';
import { projectEntityManagement } from '@neko/entity-domain';

export {
  extractScriptCharacterCandidates,
  scriptCharacterCandidateToProjectSearchItem,
  type ContextScriptEntitySearchItemOptions,
  type ScriptEntityCandidate,
} from './project-search-projection';

export interface EntitySearchAdapterOptions {
  readonly projectRoot: string;
  readonly entities: Pick<ProjectEntityDocumentRepository, 'load'>;
  readonly derivedProjection?: {
    readonly repository: Pick<ProjectEntityProjectionRepository, 'list'>;
    readonly partition: ProjectEntityProjectionPartition;
  };
  readonly providerId?: string;
}

export function createEntitySearchAdapter(
  options: EntitySearchAdapterOptions,
): ProjectSearchAdapter {
  return new EntitySearchAdapter(options);
}

class EntitySearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;

  constructor(private readonly options: EntitySearchAdapterOptions) {}

  async ensureInitialized(): Promise<void> {
    return undefined;
  }

  async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = query.projectRoot ?? context.projectRoot ?? this.options.projectRoot;
    if (projectRoot !== this.options.projectRoot) {
      return [];
    }
    if (query.partitions && !query.partitions.includes('creative-entities')) {
      return [];
    }

    const [document, derived] = await Promise.all([
      this.options.entities.load(),
      this.loadDerivedProjections(),
    ]);
    const exactItemId = query.text.trim();
    const text = exactItemId.toLocaleLowerCase();
    const items = projectEntityManagement({
      document,
      candidates: derived.candidates,
      bindingAvailability: derived.bindingAvailability,
    }).map((projection) => managementProjectionToSearchItem(projection, this.options.projectRoot));
    const allowedKinds = query.kinds ? new Set(query.kinds) : undefined;
    return items
      .filter((item) => !allowedKinds || allowedKinds.has(item.kind))
      .filter(
        (item) =>
          !text || item.id === exactItemId || item.searchText.toLocaleLowerCase().includes(text),
      )
      .slice(0, query.limit ?? items.length);
  }

  private async loadDerivedProjections(): Promise<{
    readonly candidates: readonly ProjectEntityCandidateProjection[];
    readonly bindingAvailability: readonly EntityBindingAvailabilityProjectionValue[];
  }> {
    const projection = this.options.derivedProjection;
    if (!projection) {
      return { candidates: [], bindingAvailability: [] };
    }
    const result = await projection.repository.list({
      partition: projection.partition,
      kinds: ['entity-candidate', 'binding-availability'],
    });
    const records = result.records;
    return {
      candidates: records.flatMap((record) =>
        record.kind === 'entity-candidate' && record.value.freshness !== 'failed'
          ? [record.value]
          : [],
      ),
      bindingAvailability: records.flatMap((record) =>
        record.kind === 'binding-availability' ? [record.value] : [],
      ),
    };
  }

  getStatus() {
    return {
      partition: this.partition,
      status: 'ready',
      freshness: 'fresh',
      provider: {
        providerId: this.options.providerId ?? 'neko-entity',
        modes: ['mention', 'global', 'entity-picker', 'agent-tool'],
        itemKinds: ['creative-entity', 'entity-candidate'],
        partitions: ['creative-entities'],
      },
    } satisfies ReturnType<ProjectSearchAdapter['getStatus']>;
  }
}

function managementProjectionToSearchItem(
  projection: ProjectEntityManagementProjection,
  projectRoot: string,
): ProjectSearchItem {
  if (projection.status === 'candidate') {
    return candidateToSearchItem(projection, projectRoot);
  }
  const entity = projection.entity;
  const label = entity.names.display ?? entity.names.canonical;
  return {
    id: projection.projectionId,
    kind: 'creative-entity',
    label,
    description: `${entity.kind} · ${projection.status}`,
    source: {
      partition: 'creative-entities',
      sourceId: 'project-entity-document',
      sourceKind: 'project-entity',
      refId: entity.entityId,
      metadata: {
        entityKind: entity.kind,
        status: projection.status,
        owners: projection.sourceOwners,
      },
    },
    projectRoot,
    canonicalName: entity.names.canonical,
    aliases: entity.names.aliases,
    searchText: [
      label,
      entity.names.canonical,
      ...entity.names.aliases,
      entity.kind,
      projection.status,
    ].join(' '),
    navigationData: {
      entityId: entity.entityId,
      kind: entity.kind,
      source: 'project-entity-document',
    },
    freshness: 'fresh',
    metadata: {
      entityKind: entity.kind,
      status: projection.status,
      attentionBindingIds: projection.bindingAvailability
        .filter((binding) => binding.availability === 'needs-attention')
        .map((binding) => binding.bindingId),
      sourceOwners: projection.sourceOwners,
    },
  };
}

function candidateToSearchItem(
  projection: Extract<ProjectEntityManagementProjection, { readonly status: 'candidate' }>,
  projectRoot: string,
): ProjectSearchItem {
  const candidate = projection.candidate;
  const sourceRef = candidate.evidence.find((value) => value.locator)?.sourceId;
  const label = candidate.proposedNames.display ?? candidate.proposedNames.canonical;
  return {
    id: projection.projectionId,
    kind: 'entity-candidate',
    label,
    description: `${candidate.kind} candidate`,
    source: {
      partition: 'creative-entities',
      sourceId: `candidate:${candidate.candidateId}`,
      sourceKind: 'candidate',
      refId: candidate.candidateId,
      metadata: {
        entityKind: candidate.kind,
        freshness: candidate.freshness,
        owners: projection.sourceOwners,
      },
    },
    projectRoot,
    canonicalName: candidate.proposedNames.canonical,
    aliases: candidate.proposedNames.aliases,
    searchText: [
      label,
      candidate.proposedNames.canonical,
      ...candidate.proposedNames.aliases,
      candidate.kind,
      candidate.freshness,
      ...candidate.evidence.flatMap((evidence) => [evidence.sourceId, evidence.label ?? '']),
    ].join(' '),
    navigationData: {
      candidateId: candidate.candidateId,
      kind: candidate.kind,
      source: `candidate:${candidate.candidateId}`,
      ...(sourceRef ? { sourceRef } : {}),
    },
    freshness: candidate.freshness,
    metadata: {
      freshness: candidate.freshness,
      evidenceCount: candidate.evidence.length,
      sourceOwners: projection.sourceOwners,
      ...(candidate.confidence === undefined ? {} : { confidence: candidate.confidence }),
    },
  };
}
