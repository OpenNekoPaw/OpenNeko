import type {
  ProjectIndexChangeEvent,
  ProjectIndexFreshness,
  ProjectIndexChangedRef,
  ProjectIndexUpdateReason,
  ProjectSearchAdapter,
  ProjectSearchItem,
  ProjectSearchPartitionKind,
  ProjectSearchPartitionStatusSnapshot,
  ProjectSearchQuery,
  ProjectSearchQueryContext,
  ProjectSemanticCoverageQuery,
  ProjectSemanticCoverageResult,
} from '@neko/shared';
import { matchesProjectSearchItem, rankProjectSearchItems } from './normalization';
import { DEFAULT_PROJECT_SEARCH_PORTS } from './defaults';
import type {
  ProjectSearchDisposable,
  ProjectSearchRuntimePorts,
  ProjectSemanticCoverageProvider,
} from './ports';
import { aggregateProjectSemanticCoverage } from './semanticCoverage';
import { SimpleEventEmitter } from './simpleEventEmitter';

const DEFAULT_LIMIT = 50;

export class ProjectIndexCoordinator implements ProjectSearchDisposable {
  private readonly adapters = new Map<ProjectSearchPartitionKind, ProjectSearchAdapter>();
  private readonly coverageProviders = new Map<string, ProjectSemanticCoverageProvider>();
  private readonly initializedProjects = new Set<string>();
  private readonly disposables: ProjectSearchDisposable[] = [];
  private generation = 0;

  private readonly ports: ProjectSearchRuntimePorts;
  private readonly onDidChangeEmitter = new SimpleEventEmitter<ProjectIndexChangeEvent>();
  readonly onDidChangeProjectIndex = this.onDidChangeEmitter.event;

  constructor(ports: Partial<ProjectSearchRuntimePorts> = {}) {
    this.ports = { ...DEFAULT_PROJECT_SEARCH_PORTS, ...ports };
    this.disposables.push(this.onDidChangeEmitter);
  }

  registerAdapter(adapter: ProjectSearchAdapter): ProjectSearchDisposable {
    const previous = this.adapters.get(adapter.partition);
    previous?.dispose?.();
    this.adapters.set(adapter.partition, adapter);
    return {
      dispose: () => {
        if (this.adapters.get(adapter.partition) === adapter) {
          this.adapters.delete(adapter.partition);
        }
        adapter.dispose?.();
      },
    };
  }

  registerSemanticCoverageProvider(
    provider: ProjectSemanticCoverageProvider,
  ): ProjectSearchDisposable {
    const previous = this.coverageProviders.get(provider.providerId);
    previous?.dispose?.();
    this.coverageProviders.set(provider.providerId, provider);
    return {
      dispose: () => {
        if (this.coverageProviders.get(provider.providerId) === provider) {
          this.coverageProviders.delete(provider.providerId);
        }
        provider.dispose?.();
      },
    };
  }

  async ensureInitialized(projectRoot?: string): Promise<void> {
    const roots = projectRoot ? [projectRoot] : (this.ports.getWorkspaceRoots?.() ?? []);
    for (const root of roots) {
      if (this.initializedProjects.has(root)) continue;
      await Promise.allSettled(
        [...this.adapters.values()].map((adapter) => adapter.ensureInitialized(root)),
      );
      this.initializedProjects.add(root);
      this.emitChange(root, 'project-open', undefined, 'fresh');
    }
  }

  async resolveContext(query: ProjectSearchQuery): Promise<ProjectSearchQueryContext> {
    return this.ports.resolveContext(query);
  }

  async query(query: ProjectSearchQuery): Promise<{
    readonly context: ProjectSearchQueryContext;
    readonly items: readonly ProjectSearchItem[];
    readonly partitions: readonly ProjectSearchPartitionStatusSnapshot[];
    readonly freshness: ProjectIndexFreshness;
    readonly generation: number;
  }> {
    const context = await this.resolveContext(query);
    const projectRoot = context.projectRoot;
    if (!projectRoot) {
      return {
        context,
        items: [],
        partitions: [],
        freshness: 'failed',
        generation: this.generation,
      };
    }

    await this.ensureInitialized(projectRoot);
    const adapters = this.selectAdapters(query);
    const settled = await Promise.allSettled(
      adapters.map((adapter) => adapter.query(query, context)),
    );
    const items: ProjectSearchItem[] = [];

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        items.push(...result.value);
        return;
      }
      const adapter = adapters[index];
      this.ports.logger?.warn(
        `Project search partition failed: ${adapter?.partition ?? 'unknown'}`,
        {
          error: result.reason,
        },
      );
    });

    const filtered = items
      .filter((item) => (query.freshness === 'fresh-only' ? item.freshness === 'fresh' : true))
      .filter((item) => matchesProjectSearchItem(item, query));
    const ranked = rankProjectSearchItems(filtered, query).slice(0, query.limit ?? DEFAULT_LIMIT);
    const partitions = this.getStatus(projectRoot);

    return {
      context,
      items: ranked,
      partitions,
      freshness: aggregateFreshness(ranked, partitions),
      generation: this.generation,
    };
  }

  async querySemanticCoverage(
    query: ProjectSemanticCoverageQuery,
  ): Promise<ProjectSemanticCoverageResult> {
    const context = await this.resolveContext({
      text: '',
      mode: 'agent-tool',
      projectRoot: query.projectRoot,
      contextFilePath: query.contextFilePath,
      contextUri: query.contextUri,
    });
    const projectRoot = context.projectRoot;
    if (!projectRoot) {
      return {
        query,
        coverage: 'failed',
        freshness: 'failed',
        staleReasons: ['missing-provider'],
        diagnostics: [
          {
            severity: 'warning',
            code: 'semantic-coverage-missing-project-root',
            message: 'Semantic coverage requires a resolved project context.',
          },
        ],
        generation: this.generation,
      };
    }

    await this.ensureInitialized(projectRoot);
    const providers = this.selectSemanticCoverageProviders(query);
    const settled = await Promise.allSettled(
      providers.map((provider) => provider.querySemanticCoverage(query, context)),
    );
    return aggregateProjectSemanticCoverage({
      query,
      context,
      generation: this.generation,
      providerResults: settled,
      providerIds: providers.map((provider) => provider.providerId),
    });
  }

  async refresh(
    projectRoot: string,
    reason: ProjectIndexUpdateReason,
    options: {
      readonly partition?: ProjectSearchPartitionKind;
      readonly changedRefs?: readonly ProjectIndexChangedRef[];
    } = {},
  ): Promise<void> {
    const adapters = options.partition
      ? [this.adapters.get(options.partition)].filter((adapter): adapter is ProjectSearchAdapter =>
          Boolean(adapter),
        )
      : [...this.adapters.values()];
    await Promise.allSettled(
      adapters.map(
        (adapter) =>
          adapter.refresh?.({ projectRoot, reason, changedRefs: options.changedRefs }) ??
          Promise.resolve(),
      ),
    );
    this.initializedProjects.add(projectRoot);
    this.emitChange(projectRoot, reason, options.partition, 'fresh', options.changedRefs ?? []);
  }

  getStatus(projectRoot?: string): readonly ProjectSearchPartitionStatusSnapshot[] {
    const root = projectRoot ?? this.ports.getWorkspaceRoots?.()[0] ?? '';
    return [...this.adapters.values()].map((adapter) => adapter.getStatus(root));
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
    for (const adapter of this.adapters.values()) {
      adapter.dispose?.();
    }
    this.adapters.clear();
    for (const provider of this.coverageProviders.values()) {
      provider.dispose?.();
    }
    this.coverageProviders.clear();
    this.initializedProjects.clear();
  }

  private selectAdapters(query: ProjectSearchQuery): ProjectSearchAdapter[] {
    const kinds = new Set(query.kinds ?? []);
    const partitions = new Set(query.partitions ?? []);
    return [...this.adapters.values()].filter((adapter) => {
      if (partitions.size > 0 && !partitions.has(adapter.partition)) return false;
      if (kinds.size === 0) return true;
      return partitionMayReturnKind(adapter.partition, kinds);
    });
  }

  private selectSemanticCoverageProviders(
    query: ProjectSemanticCoverageQuery,
  ): ProjectSemanticCoverageProvider[] {
    const providers = [...this.coverageProviders.values()];
    if (!query.providerId) return providers;
    return providers.filter((provider) => provider.providerId === query.providerId);
  }

  private emitChange(
    projectRoot: string,
    reason: ProjectIndexUpdateReason,
    partition: ProjectSearchPartitionKind | undefined,
    freshness: ProjectIndexFreshness,
    changedRefs: readonly ProjectIndexChangedRef[] = [],
  ): void {
    this.generation += 1;
    this.onDidChangeEmitter.fire({
      projectRoot,
      ...(partition ? { partition } : {}),
      reason,
      changedRefs,
      generation: this.generation,
      freshness,
      updatedAt: (this.ports.now?.() ?? new Date()).toISOString(),
    });
  }
}

function partitionMayReturnKind(
  partition: ProjectSearchPartitionKind,
  kinds: ReadonlySet<string>,
): boolean {
  if (partition === 'story-symbols') {
    return kinds.has('story-scene') || kinds.has('story-section') || kinds.has('script-role');
  }
  if (partition === 'creative-entities') {
    return (
      kinds.has('creative-entity') || kinds.has('entity-candidate') || kinds.has('generated-asset')
    );
  }
  if (partition === 'media-library') return kinds.has('media') || kinds.has('document');
  if (partition === 'documents') return kinds.has('document');
  if (partition === 'generated-assets') return kinds.has('generated-asset');
  return false;
}

function aggregateFreshness(
  items: readonly ProjectSearchItem[],
  partitions: readonly ProjectSearchPartitionStatusSnapshot[],
): ProjectIndexFreshness {
  if (partitions.some((partition) => partition.freshness === 'failed')) return 'partial';
  if (items.some((item) => item.freshness === 'stale')) return 'stale';
  if (partitions.some((partition) => partition.freshness === 'building')) return 'building';
  return 'fresh';
}
