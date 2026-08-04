import type {
  ProjectSearchAdapter,
  ProjectSearchItem,
  ProjectSearchQuery,
  ProjectSearchQueryContext,
} from '../contracts';
import type {
  CreativeEntity,
  EntityAssetProjectionPartition,
  EntityAssetProjectionRepository,
  ProjectEntityCandidateProjection,
} from '@neko/entity-domain';
import type { CreativeEntityService } from '@neko/entity-domain';

export {
  extractLineBasedScriptCharacters,
  extractScriptCharacterCandidates,
  scriptCharacterCandidateToProjectSearchItem,
  type ContextScriptEntitySearchItemOptions,
  type ScriptEntityCandidate,
  type StoryScriptParser,
} from './project-search-projection';

export interface EntitySearchAdapterOptions {
  readonly projectRoot: string;
  readonly service: Pick<CreativeEntityService, 'list'>;
  readonly automaticCandidateProjection?: {
    readonly repository: Pick<EntityAssetProjectionRepository, 'list'>;
    readonly partition: EntityAssetProjectionPartition;
    readonly readRevision: () => Promise<unknown | null>;
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

    const [entities, projectedCandidates] = await Promise.all([
      this.options.service.list(),
      this.loadAutomaticCandidates(),
    ]);
    const exactItemId = query.text.trim();
    const text = exactItemId.toLocaleLowerCase();
    const candidatesById = new Map<string, CandidateSearchProjection>();
    for (const candidate of projectedCandidates) {
      candidatesById.set(candidate.candidate.candidateId, candidate);
    }
    const items = [
      ...entities.map((entity) => entityToSearchItem(entity, this.options.projectRoot)),
      ...[...candidatesById.values()].map((candidate) =>
        candidateToSearchItem(candidate, this.options.projectRoot),
      ),
    ];
    const allowedKinds = query.kinds ? new Set(query.kinds) : undefined;
    return items
      .filter((item) => !allowedKinds || allowedKinds.has(item.kind))
      .filter(
        (item) =>
          !text || item.id === exactItemId || item.searchText.toLocaleLowerCase().includes(text),
      )
      .slice(0, query.limit ?? items.length);
  }

  private async loadAutomaticCandidates(): Promise<readonly CandidateSearchProjection[]> {
    const projection = this.options.automaticCandidateProjection;
    if (!projection || !(await projection.readRevision())) return [];
    const records = await projection.repository.list({
      partition: projection.partition,
      kinds: ['entity-candidate'],
    });
    return records.flatMap((record) => {
      if (record.kind !== 'entity-candidate' || record.value.freshness === 'failed') {
        return [];
      }
      return [
        {
          candidate: record.value,
          projectionId: record.projectionId,
          sourceId: record.sourceId,
          freshness: record.freshness === 'rebuilding' ? 'building' : record.freshness,
        },
      ];
    });
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

function entityToSearchItem(entity: CreativeEntity, projectRoot: string): ProjectSearchItem {
  const label = entity.displayName ?? entity.canonicalName;
  return {
    id: `entity:${entity.kind}:${entity.id}`,
    kind: 'creative-entity',
    label,
    description: `${entity.kind} · ${entity.status}`,
    source: {
      partition: 'creative-entities',
      sourceId: 'neko-entity',
      sourceKind: 'registry',
      refId: entity.id,
      metadata: { entityKind: entity.kind, status: entity.status },
    },
    projectRoot,
    canonicalName: entity.canonicalName,
    aliases: entity.aliases,
    searchText: [label, entity.canonicalName, ...entity.aliases, entity.kind, entity.status].join(
      ' ',
    ),
    navigationData: { entityId: entity.id, kind: entity.kind, source: 'neko-entity' },
    freshness: 'fresh',
    metadata: entity.metadata,
  };
}

interface CandidateSearchProjection {
  readonly candidate: ProjectEntityCandidateProjection;
  readonly projectionId?: string;
  readonly sourceId?: string;
  readonly freshness?: ProjectSearchItem['freshness'];
}

function candidateToSearchItem(
  projection: CandidateSearchProjection,
  projectRoot: string,
): ProjectSearchItem {
  const candidate = projection.candidate;
  const sourceRef = candidate.evidence.find((value) => value.locator)?.sourceId;
  const label = candidate.proposedNames.display ?? candidate.proposedNames.canonical;
  return {
    id: projection.projectionId
      ? `entity-projection:${projection.projectionId}`
      : `candidate:${candidate.kind}:${candidate.candidateId}`,
    kind: 'entity-candidate',
    label,
    description: `${candidate.kind} candidate`,
    source: {
      partition: 'creative-entities',
      sourceId: projection.sourceId ?? 'neko-entity',
      sourceKind: 'candidate',
      refId: candidate.candidateId,
      metadata: {
        entityKind: candidate.kind,
        freshness: candidate.freshness,
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
      source: projection.sourceId ?? 'neko-entity',
      ...(sourceRef ? { sourceRef } : {}),
    },
    freshness: projection.freshness ?? 'fresh',
    metadata: {
      freshness: candidate.freshness,
      evidenceCount: candidate.evidence.length,
      ...(candidate.confidence === undefined ? {} : { confidence: candidate.confidence }),
    },
  };
}
