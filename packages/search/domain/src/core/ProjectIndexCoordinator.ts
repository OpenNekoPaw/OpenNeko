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
} from '../contracts';
import { matchesProjectSearchItem, rankProjectSearchItems } from './normalization';
import type {
  ProjectSearchDisposable,
  ProjectSearchRuntimePorts,
  ProjectSemanticCoverageProvider,
} from './ports';
import { aggregateProjectSemanticCoverage } from './semanticCoverage';
import { SimpleEventEmitter } from './simpleEventEmitter';

const DEFAULT_LIMIT = 50;

export interface ProjectSearchCoordinationFailure {
  readonly identity: string;
  readonly operation: 'initialize' | 'refresh';
  readonly message: string;
  readonly cause: unknown;
}

export class ProjectSearchCoordinationError extends Error {
  constructor(
    readonly code:
      | 'invalid-runtime-ports'
      | 'duplicate-partition'
      | 'duplicate-provider'
      | 'missing-workspace-root'
      | 'missing-partition'
      | 'partition-operation-failed',
    message: string,
    readonly failures: readonly ProjectSearchCoordinationFailure[] = [],
  ) {
    super(message);
    this.name = 'ProjectSearchCoordinationError';
  }
}

export class ProjectIndexCoordinator implements ProjectSearchDisposable {
  private readonly adapters = new Map<ProjectSearchPartitionKind, ProjectSearchAdapter>();
  private readonly coverageProviders = new Map<string, ProjectSemanticCoverageProvider>();
  private readonly initializedProjects = new Set<string>();
  private readonly disposables: ProjectSearchDisposable[] = [];

  private readonly ports: ProjectSearchRuntimePorts;
  private readonly onDidChangeEmitter = new SimpleEventEmitter<ProjectIndexChangeEvent>();
  readonly onDidChangeProjectIndex = this.onDidChangeEmitter.event;

  constructor(ports: ProjectSearchRuntimePorts) {
    assertProjectSearchRuntimePorts(ports);
    this.ports = ports;
    this.disposables.push(this.onDidChangeEmitter);
  }

  registerAdapter(adapter: ProjectSearchAdapter): ProjectSearchDisposable {
    if (this.adapters.has(adapter.partition)) {
      throw new ProjectSearchCoordinationError(
        'duplicate-partition',
        `Project Search partition '${adapter.partition}' is already registered.`,
      );
    }
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
    if (this.coverageProviders.has(provider.providerId)) {
      throw new ProjectSearchCoordinationError(
        'duplicate-provider',
        `Project Search semantic provider '${provider.providerId}' is already registered.`,
      );
    }
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
    const roots = projectRoot ? [projectRoot] : this.ports.getWorkspaceRoots();
    for (const root of roots) {
      if (this.initializedProjects.has(root)) continue;
      const adapters = [...this.adapters.values()];
      const settled = await Promise.allSettled(
        adapters.map((adapter) => adapter.ensureInitialized(root)),
      );
      const failures = collectPartitionFailures(adapters, settled, 'initialize');
      if (failures.length > 0) {
        this.reportFailures(failures);
        throw partitionOperationError('initialize', failures);
      }
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
  }> {
    const context = await this.resolveContext(query);
    const projectRoot = context.projectRoot;
    if (!projectRoot) {
      return {
        context,
        items: [],
        partitions: [],
        freshness: 'failed',
      };
    }

    await this.ensureInitialized(projectRoot);
    const adapters = this.selectAdapters(query);
    const settled = await Promise.allSettled(
      adapters.map((adapter) => adapter.query(query, context)),
    );
    const items: ProjectSearchItem[] = [];
    const failedPartitions = new Map<ProjectSearchPartitionKind, string>();

    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        items.push(...result.value);
        return;
      }
      const adapter = adapters[index];
      if (!adapter) throw new Error('Project Search query result has no owning adapter.');
      const message = describeError(result.reason);
      failedPartitions.set(adapter.partition, message);
      this.ports.logger.warn(`Project search partition failed: ${adapter.partition}`, {
        error: result.reason,
      });
    });

    const filtered = items
      .filter((item) => (query.freshness === 'fresh-only' ? item.freshness === 'fresh' : true))
      .filter((item) => matchesProjectSearchItem(item, query));
    const ranked = rankProjectSearchItems(filtered, query).slice(0, query.limit ?? DEFAULT_LIMIT);
    const partitions = this.getStatus(projectRoot).map((partition) => {
      const error = failedPartitions.get(partition.partition);
      return error === undefined
        ? partition
        : { ...partition, status: 'failed' as const, freshness: 'failed' as const, error };
    });

    return {
      context,
      items: ranked,
      partitions,
      freshness: aggregateFreshness(ranked, partitions),
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
    const selected = options.partition ? this.adapters.get(options.partition) : undefined;
    if (options.partition && !selected) {
      throw new ProjectSearchCoordinationError(
        'missing-partition',
        `Project Search partition '${options.partition}' is not registered.`,
      );
    }
    const adapters = selected ? [selected] : [...this.adapters.values()];
    const settled = await Promise.allSettled(
      adapters.map(
        (adapter) =>
          adapter.refresh?.({ projectRoot, reason, changedRefs: options.changedRefs }) ??
          Promise.resolve(),
      ),
    );
    const failures = collectPartitionFailures(adapters, settled, 'refresh');
    if (failures.length > 0) {
      this.reportFailures(failures);
      throw partitionOperationError('refresh', failures);
    }
    this.initializedProjects.add(projectRoot);
    this.emitChange(projectRoot, reason, options.partition, 'fresh', options.changedRefs ?? []);
  }

  getStatus(projectRoot?: string): readonly ProjectSearchPartitionStatusSnapshot[] {
    const root = projectRoot ?? this.ports.getWorkspaceRoots()[0];
    if (!root) {
      throw new ProjectSearchCoordinationError(
        'missing-workspace-root',
        'Project Search status requires an exact Workspace root.',
      );
    }
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
    this.onDidChangeEmitter.fire({
      projectRoot,
      ...(partition ? { partition } : {}),
      reason,
      changedRefs,
      freshness,
      updatedAt: this.ports.now().toISOString(),
    });
  }

  private reportFailures(failures: readonly ProjectSearchCoordinationFailure[]): void {
    for (const failure of failures) {
      this.ports.logger.warn(
        `Project Search partition '${failure.identity}' failed to ${failure.operation}.`,
        { error: failure.cause },
      );
    }
  }
}

function assertProjectSearchRuntimePorts(ports: ProjectSearchRuntimePorts): void {
  if (
    typeof ports !== 'object' ||
    ports === null ||
    typeof ports.resolveContext !== 'function' ||
    typeof ports.getWorkspaceRoots !== 'function' ||
    typeof ports.logger?.warn !== 'function' ||
    typeof ports.now !== 'function'
  ) {
    throw new ProjectSearchCoordinationError(
      'invalid-runtime-ports',
      'Project Search requires resolveContext, getWorkspaceRoots, logger, and now runtime ports.',
    );
  }
}

function collectPartitionFailures(
  adapters: readonly ProjectSearchAdapter[],
  settled: readonly PromiseSettledResult<void>[],
  operation: ProjectSearchCoordinationFailure['operation'],
): readonly ProjectSearchCoordinationFailure[] {
  return settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return [];
    const adapter = adapters[index];
    if (!adapter) throw new Error('Project Search partition result has no owning adapter.');
    return [
      {
        identity: adapter.partition,
        operation,
        message: describeError(result.reason),
        cause: result.reason,
      },
    ];
  });
}

function partitionOperationError(
  operation: ProjectSearchCoordinationFailure['operation'],
  failures: readonly ProjectSearchCoordinationFailure[],
): ProjectSearchCoordinationError {
  return new ProjectSearchCoordinationError(
    'partition-operation-failed',
    `Project Search failed to ${operation} partition(s): ${failures
      .map((failure) => `${failure.identity}: ${failure.message}`)
      .join('; ')}.`,
    failures,
  );
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  if (partitions.length > 0 && partitions.every((partition) => partition.freshness === 'failed')) {
    return 'failed';
  }
  if (partitions.some((partition) => partition.freshness === 'failed')) return 'partial';
  if (items.some((item) => item.freshness === 'stale')) return 'stale';
  if (partitions.some((partition) => partition.freshness === 'building')) return 'building';
  return 'fresh';
}
