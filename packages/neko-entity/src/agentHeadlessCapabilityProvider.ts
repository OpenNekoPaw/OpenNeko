import type {
  AgentCapabilityContext,
  AgentCapabilityProvider,
  AgentReferenceContributor,
  AgentReferenceSearchRequest,
  AgentReferenceSearchResult,
  CreativeEntity,
  CreativeEntityCandidate,
  CreativeEntityCandidateStatus,
  CreativeEntityKind,
  CreativeEntityQuery,
  ProjectIndexFreshness,
  ProjectSearchAdapter,
  ProjectSearchItem,
  ProjectSearchPartitionStatusSnapshot,
  ProjectSearchQuery,
  ProjectSearchQueryContext,
  Tool,
  ToolParameters,
} from '@neko/shared';
import { isCreativeEntityKind, TOOL_NAMES_ENTITY } from '@neko/shared';

export interface CreativeEntityHeadlessRuntime {
  list(query?: CreativeEntityQuery): Promise<readonly CreativeEntity[]>;
  get(id: string): Promise<CreativeEntity | undefined>;
  listCandidates?(
    status?: CreativeEntityCandidateStatus,
  ): Promise<readonly CreativeEntityCandidate[]>;
}

export function createCreativeEntityHeadlessCapabilityProvider(
  runtime: CreativeEntityHeadlessRuntime,
): AgentCapabilityProvider {
  return new CreativeEntityHeadlessCapabilityProvider(runtime);
}

export function createCreativeEntityProjectSearchAdapter(input: {
  readonly runtime: CreativeEntityHeadlessRuntime;
  readonly projectRoot?: string;
  readonly now?: () => string;
}): ProjectSearchAdapter {
  return new CreativeEntityProjectSearchAdapter(input);
}

interface CreativeEntitySummary {
  readonly id: string;
  readonly kind: CreativeEntityKind;
  readonly label: string;
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly status: CreativeEntity['status'];
}

interface CreativeEntityCandidateSummary {
  readonly id: string;
  readonly kind: CreativeEntityKind;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly status: CreativeEntityCandidate['status'];
  readonly identityBasis: CreativeEntityCandidate['identityBasis'];
  readonly confidence?: number;
  readonly resolvedEntityId?: string;
}

class CreativeEntityHeadlessCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-entity';
  readonly version = '1.0.0';
  readonly hostRequirements = [
    { host: 'tui' as const },
    { host: 'cli' as const },
    { host: 'vscode' as const },
  ];
  readonly requirements = { contentAccess: false } as const;

  constructor(private readonly runtime: CreativeEntityHeadlessRuntime) {}

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      {
        name: TOOL_NAMES_ENTITY.LIST_CREATIVE_ENTITIES,
        description:
          'List sanitized creative entity and candidate summaries from the entity runtime. Does not expose entity store files or managed workspace internals.',
        category: 'file',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Optional case-insensitive text filter over entity names and aliases.',
            },
            kind: {
              type: 'string',
              description: 'Optional creative entity kind filter.',
              enum: ['character', 'scene', 'object', 'location', 'style'],
            },
            status: {
              type: 'string',
              description: 'Optional entity lifecycle status filter.',
              enum: ['candidate', 'confirmed', 'deprecated'],
            },
            includeCandidates: {
              type: 'boolean',
              description: 'Whether to include unresolved entity candidates. Default true.',
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of rows to return. Defaults to 50, maximum 200.',
            },
          },
        } satisfies ToolParameters,
        execute: async (args) => this.listCreativeEntities(args),
      },
      {
        name: TOOL_NAMES_ENTITY.GET_CREATIVE_ENTITY,
        description:
          'Get one sanitized creative entity by stable entity ID. Does not expose backing store paths.',
        category: 'file',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            entityId: { type: 'string', description: 'Stable creative entity ID.' },
          },
          required: ['entityId'],
        } satisfies ToolParameters,
        execute: async (args) => this.getCreativeEntity(args),
      },
    ];
  }

  getReferenceContributors(_context: AgentCapabilityContext): readonly AgentReferenceContributor[] {
    return [new CreativeEntityReferenceContributor(this.runtime)];
  }

  private async listCreativeEntities(args: Record<string, unknown>) {
    const kind = readCreativeEntityKind(args['kind']);
    const status = readEntityStatus(args['status']);
    const query = optionalString(args['query']);
    const limit = clampLimit(args['limit'], 50, 200);
    const includeCandidates = args['includeCandidates'] !== false;

    try {
      const entities = await this.runtime.list({
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
        ...(query ? { text: query } : {}),
      });
      const candidateStatus =
        status === 'candidate' || status === undefined
          ? readCandidateStatus(args['status'])
          : undefined;
      const candidates =
        includeCandidates && this.runtime.listCandidates
          ? await this.runtime.listCandidates(candidateStatus)
          : [];
      const candidateSummaries = candidates
        .filter((candidate) => (kind ? candidate.kind === kind : true))
        .filter((candidate) => matchesCandidateQuery(candidate, query))
        .map(toCandidateSummary);
      const rows = [...entities.map(toEntitySummary), ...candidateSummaries].slice(0, limit);

      return {
        success: true,
        data: {
          entities: rows,
          total: entities.length + candidateSummaries.length,
          returned: rows.length,
          truncated: entities.length + candidateSummaries.length > limit,
        },
      };
    } catch (error) {
      return { success: false, error: `Failed to list creative entities: ${String(error)}` };
    }
  }

  private async getCreativeEntity(args: Record<string, unknown>) {
    const entityId = optionalString(args['entityId']);
    if (!entityId) {
      return { success: false, error: 'entityId is required' };
    }

    try {
      const entity = await this.runtime.get(entityId);
      if (!entity) {
        return { success: false, error: `Creative entity not found: ${entityId}` };
      }
      return { success: true, data: { entity: toEntitySummary(entity) } };
    } catch (error) {
      return { success: false, error: `Failed to get creative entity: ${String(error)}` };
    }
  }
}

class CreativeEntityReferenceContributor implements AgentReferenceContributor {
  readonly id = 'neko-entity';
  readonly displayName = 'Entities';

  constructor(private readonly runtime: CreativeEntityHeadlessRuntime) {}

  async search(request: AgentReferenceSearchRequest): Promise<AgentReferenceSearchResult> {
    try {
      const entities = await this.runtime.list({ text: request.query });
      const limit = clampLimit(request.limit, 20, 100);
      return {
        candidates: entities.slice(0, limit).map((entity) => ({
          id: `entity:${entity.id}`,
          label: entity.displayName ?? entity.canonicalName,
          source: 'entities',
          kind: 'entity',
          insertText: `@entity:${entity.id}`,
          description: [entity.kind, entity.status, entity.aliases.join(', ')]
            .filter((part) => part.length > 0)
            .join(' · '),
          metadata: {
            entityId: entity.id,
            kind: entity.kind,
            status: entity.status,
          },
        })),
        diagnostics: [],
      };
    } catch (error) {
      return {
        candidates: [],
        diagnostics: [
          {
            level: 'warn',
            providerId: 'neko-entity',
            contributionKind: 'referenceContributor',
            contributionName: this.id,
            code: 'capability.reference.unavailable',
            reason: 'entity-query-failed',
            message: `Failed to search creative entities: ${String(error)}`,
            host: 'tui',
          },
        ],
      };
    }
  }
}

class CreativeEntityProjectSearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;
  private itemCount = 0;
  private status: ProjectSearchPartitionStatusSnapshot['status'] = 'idle';
  private freshness: ProjectIndexFreshness = 'fresh';
  private error: string | undefined;

  constructor(
    private readonly input: {
      readonly runtime: CreativeEntityHeadlessRuntime;
      readonly projectRoot?: string;
      readonly now?: () => string;
    },
  ) {}

  async ensureInitialized(projectRoot: string): Promise<void> {
    await this.query({ text: '', projectRoot, mode: 'agent-tool' }, { projectRoot });
  }

  async query(
    _query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    const projectRoot = context.projectRoot ?? this.input.projectRoot;
    if (!projectRoot) {
      this.status = 'failed';
      this.freshness = 'failed';
      this.error = 'Missing project root for creative entity search.';
      return [];
    }

    try {
      const [entities, candidates] = await Promise.all([
        this.input.runtime.list(),
        this.input.runtime.listCandidates?.(),
      ]);
      const items = [
        ...entities.map((entity) => entityToProjectSearchItem(entity, projectRoot)),
        ...(candidates ?? []).map((candidate) =>
          candidateToProjectSearchItem(candidate, projectRoot),
        ),
      ];
      this.itemCount = items.length;
      this.status = 'ready';
      this.freshness = 'fresh';
      this.error = undefined;
      return items;
    } catch (error) {
      this.status = 'failed';
      this.freshness = 'failed';
      this.error = error instanceof Error ? error.message : String(error);
      return [];
    }
  }

  getStatus(_projectRoot: string): ProjectSearchPartitionStatusSnapshot {
    return {
      partition: this.partition,
      status: this.status,
      freshness: this.freshness,
      itemCount: this.itemCount,
      updatedAt: this.input.now?.(),
      ...(this.error ? { error: this.error } : {}),
      provider: {
        providerId: 'neko-entity',
        modes: ['agent-tool', 'entity-picker', 'global'],
        itemKinds: ['creative-entity', 'entity-candidate'],
        partitions: ['creative-entities'],
      },
    };
  }
}

function entityToProjectSearchItem(entity: CreativeEntity, projectRoot: string): ProjectSearchItem {
  const label = entity.displayName ?? entity.canonicalName;
  return {
    id: `creative-entity:${entity.id}`,
    kind: 'creative-entity',
    label,
    description: `${entity.kind} · ${entity.status}`,
    icon: iconForKind(entity.kind),
    source: {
      partition: 'creative-entities',
      sourceId: entity.id,
      sourceKind: entity.kind,
      refId: entity.id,
      metadata: {
        entityKind: entity.kind,
        status: entity.status,
      },
    },
    projectRoot,
    canonicalName: entity.canonicalName,
    aliases: entity.aliases,
    searchText: [label, entity.canonicalName, ...entity.aliases, entity.kind, entity.status].join(
      ' ',
    ),
    navigationData: {
      entityId: entity.id,
      entityKind: entity.kind,
      status: entity.status,
    },
    freshness: 'fresh',
    metadata: {
      entityType: entity.kind,
      status: entity.status,
    },
  };
}

function candidateToProjectSearchItem(
  candidate: CreativeEntityCandidate,
  projectRoot: string,
): ProjectSearchItem {
  return {
    id: `entity-candidate:${candidate.id}`,
    kind: 'entity-candidate',
    label: candidate.name,
    description: `${candidate.kind} candidate · ${candidate.status}`,
    icon: iconForKind(candidate.kind),
    source: {
      partition: 'creative-entities',
      sourceId: candidate.id,
      sourceKind: 'candidate',
      refId: candidate.resolvedEntityRef?.entityId,
      metadata: {
        entityKind: candidate.kind,
        status: candidate.status,
        identityBasis: candidate.identityBasis,
      },
    },
    projectRoot,
    canonicalName: candidate.name,
    aliases: candidate.aliases ?? [],
    searchText: [
      candidate.name,
      ...(candidate.aliases ?? []),
      candidate.kind,
      candidate.status,
      candidate.identityBasis,
    ].join(' '),
    navigationData: {
      candidateId: candidate.id,
      entityKind: candidate.kind,
      status: candidate.status,
      ...(candidate.resolvedEntityRef?.entityId
        ? { resolvedEntityId: candidate.resolvedEntityRef.entityId }
        : {}),
    },
    freshness: 'fresh',
    metadata: {
      entityType: candidate.kind,
      status: candidate.status,
      identityBasis: candidate.identityBasis,
    },
  };
}

function toEntitySummary(entity: CreativeEntity): CreativeEntitySummary {
  return {
    id: entity.id,
    kind: entity.kind,
    label: entity.displayName ?? entity.canonicalName,
    canonicalName: entity.canonicalName,
    aliases: entity.aliases,
    status: entity.status,
  };
}

function toCandidateSummary(candidate: CreativeEntityCandidate): CreativeEntityCandidateSummary {
  return {
    id: candidate.id,
    kind: candidate.kind,
    label: candidate.name,
    aliases: candidate.aliases ?? [],
    status: candidate.status,
    identityBasis: candidate.identityBasis,
    ...(candidate.confidence !== undefined ? { confidence: candidate.confidence } : {}),
    ...(candidate.resolvedEntityRef?.entityId
      ? { resolvedEntityId: candidate.resolvedEntityRef.entityId }
      : {}),
  };
}

function matchesCandidateQuery(
  candidate: CreativeEntityCandidate,
  query: string | undefined,
): boolean {
  if (!query) return true;
  const normalized = query.toLocaleLowerCase();
  return [candidate.name, ...(candidate.aliases ?? []), candidate.kind, candidate.status]
    .join('\n')
    .toLocaleLowerCase()
    .includes(normalized);
}

function readCreativeEntityKind(value: unknown): CreativeEntityKind | undefined {
  return isCreativeEntityKind(value) ? value : undefined;
}

function readEntityStatus(value: unknown): CreativeEntity['status'] | undefined {
  return value === 'candidate' || value === 'confirmed' || value === 'deprecated'
    ? value
    : undefined;
}

function readCandidateStatus(value: unknown): CreativeEntityCandidateStatus | undefined {
  return value === 'open' ||
    value === 'confirmed' ||
    value === 'rejected' ||
    value === 'dismissed' ||
    value === 'merged'
    ? value
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function clampLimit(value: unknown, defaultValue: number, maxValue: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return Math.min(Math.max(Math.floor(value), 1), maxValue);
}

function iconForKind(kind: CreativeEntityKind): string {
  switch (kind) {
    case 'character':
      return '@';
    case 'scene':
      return '#';
    case 'location':
      return 'location';
    case 'object':
      return 'object';
    case 'style':
      return 'style';
  }
}
