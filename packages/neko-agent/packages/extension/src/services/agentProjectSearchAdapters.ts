import * as path from 'path';
import * as vscode from 'vscode';
import type {
  NekoStoryAPI,
  ProjectSearchAdapter,
  ProjectSearchAdapterRefreshOptions,
  ProjectSearchItem,
  ProjectSearchPartitionStatusSnapshot,
  ProjectSearchProviderCapabilities,
  ProjectSearchQuery,
  ProjectSearchQueryContext,
} from '@neko/shared';
import {
  DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  DASHBOARD_CREATIVE_ENTITY_STATE_COMMAND,
  DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
  isDashboardCreativeEntityRow,
  isDashboardCreativeEntitySourceStatus,
  isDashboardCreativeEntitySnapshot,
  isDashboardCreativeEntitySource,
  type DashboardCreativeEntityRow,
  type DashboardCreativeEntitySourceRequest,
  type DashboardCreativeEntityState,
  type DashboardCreativeEntitySource,
} from '@neko/shared/types/dashboard-creative-entity';
import {
  createCompatibilityProjectSearchAdapters,
  type CompatibilityProjectSearchAdaptersOptions,
} from '@neko/search/host-vscode';
import {
  aggregateProjectSearchFreshnessValues,
  aggregateProjectSearchItemsFreshness,
  aggregateProjectSearchPartitionStatus,
  dedupeCreativeEntityProjectSearchItems,
  matchesProjectSearchItem,
} from '@neko/search/core';
import {
  createEntitySearchAdapter,
  dashboardCreativeEntityRowsToProjectSearchItems,
  dashboardCreativeEntityStateFreshnessValues,
  extractScriptCharacterCandidates,
  scriptCharacterCandidateToProjectSearchItem,
} from '@neko/entity/projections';
import { createVSCodeEntityServices } from '@neko/entity/host-vscode';

export interface AgentEntitySearchAdapterFactoryOptions {
  readonly projectRoot: string;
  readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
}

export type AgentDashboardCreativeEntitySourceRequest = DashboardCreativeEntitySourceRequest;

export interface AgentProjectSearchAdapterDependencies {
  readonly createCompatibilityAdapters?: (
    options: CompatibilityProjectSearchAdaptersOptions,
  ) => readonly ProjectSearchAdapter[];
  readonly createEntityAdapter?: (
    options: AgentEntitySearchAdapterFactoryOptions,
  ) => ProjectSearchAdapter;
  readonly loadDashboardCreativeEntitySources?: (
    request: AgentDashboardCreativeEntitySourceRequest,
  ) => Promise<readonly DashboardCreativeEntitySource[]>;
  readonly loadDashboardCreativeEntityState?: (
    request: AgentDashboardCreativeEntitySourceRequest,
  ) => Promise<DashboardCreativeEntityState | undefined>;
  readonly readTextFile?: (filePath: string) => Promise<string>;
  readonly getStoryApi?: () => NekoStoryAPI | undefined;
}

export function createAgentProjectSearchAdapters(
  options: CompatibilityProjectSearchAdaptersOptions = {},
  dependencies: AgentProjectSearchAdapterDependencies = {},
): readonly ProjectSearchAdapter[] {
  const createCompatibilityAdapters =
    dependencies.createCompatibilityAdapters ?? createCompatibilityProjectSearchAdapters;
  const createEntityAdapter = dependencies.createEntityAdapter ?? createDefaultEntitySearchAdapter;
  const compatibilityAdapters = createCompatibilityAdapters(options);
  const creativeEntityCompatibilityAdapters: ProjectSearchAdapter[] = [];
  const adapters: ProjectSearchAdapter[] = [];

  for (const adapter of compatibilityAdapters) {
    if (adapter.partition === 'creative-entities') {
      creativeEntityCompatibilityAdapters.push(adapter);
      continue;
    }
    adapters.push(adapter);
  }

  adapters.push(
    new AgentCreativeEntityProjectSearchAdapter({
      compatibilityAdapters: creativeEntityCompatibilityAdapters,
      createEntityAdapter,
      loadDashboardCreativeEntitySources:
        dependencies.loadDashboardCreativeEntitySources ??
        loadDashboardCreativeEntitySourcesFromCommands,
      loadDashboardCreativeEntityState:
        dependencies.loadDashboardCreativeEntityState ??
        loadDashboardCreativeEntityStateFromCommand,
      readTextFile: dependencies.readTextFile ?? readVSCodeTextFile,
      getStoryApi: dependencies.getStoryApi ?? getStoryApi,
      logger: options.logger,
    }),
  );

  return adapters;
}

class AgentCreativeEntityProjectSearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;

  private readonly entityAdaptersByProject = new Map<string, ProjectSearchAdapter>();
  private readonly dashboardSourceAdapter: ProjectSearchAdapter;
  private readonly contextScriptCandidateAdapter: ProjectSearchAdapter;

  constructor(
    private readonly options: {
      readonly compatibilityAdapters: readonly ProjectSearchAdapter[];
      readonly createEntityAdapter: (
        options: AgentEntitySearchAdapterFactoryOptions,
      ) => ProjectSearchAdapter;
      readonly loadDashboardCreativeEntitySources: (
        request: AgentDashboardCreativeEntitySourceRequest,
      ) => Promise<readonly DashboardCreativeEntitySource[]>;
      readonly loadDashboardCreativeEntityState: (
        request: AgentDashboardCreativeEntitySourceRequest,
      ) => Promise<DashboardCreativeEntityState | undefined>;
      readonly readTextFile: (filePath: string) => Promise<string>;
      readonly getStoryApi: () => NekoStoryAPI | undefined;
      readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
    },
  ) {
    this.dashboardSourceAdapter = new DashboardCreativeEntitySourceProjectSearchAdapter({
      loadSources: options.loadDashboardCreativeEntitySources,
      loadState: options.loadDashboardCreativeEntityState,
      logger: options.logger,
    });
    this.contextScriptCandidateAdapter = new ContextScriptEntityCandidateProjectSearchAdapter({
      readTextFile: options.readTextFile,
      getStoryApi: options.getStoryApi,
      logger: options.logger,
    });
  }

  async ensureInitialized(projectRoot: string): Promise<void> {
    const adapters = this.adaptersForProjectRoot(projectRoot);
    await this.runSettled('ensureInitialized', adapters, (adapter) =>
      adapter.ensureInitialized(projectRoot),
    );
  }

  async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    if (query.partitions && !query.partitions.includes(this.partition)) {
      return [];
    }

    const adapters = this.adaptersForQuery(query, context);
    const settled = await Promise.allSettled(
      adapters.map((adapter) => adapter.query(query, context)),
    );
    const items: ProjectSearchItem[] = [];

    settled.forEach((result, index) => {
      const adapter = adapters[index];
      if (!adapter) return;
      if (result.status === 'fulfilled') {
        items.push(...result.value);
        return;
      }
      this.logAdapterFailure('query', adapter, result.reason);
    });

    return dedupeCreativeEntityProjectSearchItems(items);
  }

  async refresh(options: ProjectSearchAdapterRefreshOptions): Promise<void> {
    const adapters = this.adaptersForProjectRoot(options.projectRoot);
    await this.runSettled(
      'refresh',
      adapters,
      (adapter) => adapter.refresh?.(options) ?? adapter.ensureInitialized(options.projectRoot),
    );
  }

  getStatus(projectRoot: string): ProjectSearchPartitionStatusSnapshot {
    const snapshots = this.adaptersForProjectRoot(projectRoot).map((adapter) =>
      adapter.getStatus(projectRoot),
    );
    return aggregateProjectSearchPartitionStatus(snapshots, {
      partition: 'creative-entities',
      provider: COMBINED_CREATIVE_ENTITY_PROVIDER,
    });
  }

  dispose(): void {
    for (const adapter of this.options.compatibilityAdapters) {
      adapter.dispose?.();
    }
    this.dashboardSourceAdapter.dispose?.();
    this.contextScriptCandidateAdapter.dispose?.();
    for (const adapter of this.entityAdaptersByProject.values()) {
      adapter.dispose?.();
    }
    this.entityAdaptersByProject.clear();
  }

  private adaptersForQuery(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): readonly ProjectSearchAdapter[] {
    return this.adaptersForProjectRoot(query.projectRoot ?? context.projectRoot);
  }

  private adaptersForProjectRoot(projectRoot: string | undefined): readonly ProjectSearchAdapter[] {
    const adapters: ProjectSearchAdapter[] = [
      ...this.options.compatibilityAdapters,
      this.dashboardSourceAdapter,
      this.contextScriptCandidateAdapter,
    ];
    if (projectRoot) {
      adapters.push(this.entityAdapterForProject(projectRoot));
    }
    return adapters;
  }

  private entityAdapterForProject(projectRoot: string): ProjectSearchAdapter {
    const existing = this.entityAdaptersByProject.get(projectRoot);
    if (existing) return existing;

    const adapter = this.options.createEntityAdapter({
      projectRoot,
      logger: this.options.logger,
    });
    this.entityAdaptersByProject.set(projectRoot, adapter);
    return adapter;
  }

  private async runSettled(
    operation: string,
    adapters: readonly ProjectSearchAdapter[],
    run: (adapter: ProjectSearchAdapter) => Promise<void>,
  ): Promise<void> {
    const settled = await Promise.allSettled(adapters.map((adapter) => run(adapter)));
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') return;
      const adapter = adapters[index];
      if (!adapter) return;
      this.logAdapterFailure(operation, adapter, result.reason);
    });
  }

  private logAdapterFailure(
    operation: string,
    adapter: ProjectSearchAdapter,
    error: unknown,
  ): void {
    this.options.logger?.warn('Creative entity search adapter failed', {
      operation,
      partition: adapter.partition,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

class DashboardCreativeEntitySourceProjectSearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;

  private readonly statusByProject = new Map<string, ProjectSearchPartitionStatusSnapshot>();

  constructor(
    private readonly options: {
      readonly loadSources: (
        request: AgentDashboardCreativeEntitySourceRequest,
      ) => Promise<readonly DashboardCreativeEntitySource[]>;
      readonly loadState: (
        request: AgentDashboardCreativeEntitySourceRequest,
      ) => Promise<DashboardCreativeEntityState | undefined>;
      readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
    },
  ) {}

  async ensureInitialized(_projectRoot: string): Promise<void> {
    return undefined;
  }

  async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    if (query.partitions && !query.partitions.includes(this.partition)) {
      return [];
    }
    const projectRoot = query.projectRoot ?? context.projectRoot;
    if (!projectRoot) return [];

    const request = {
      projectRoot,
      contextFilePath: context.resolvedContextFilePath ?? query.contextFilePath,
      contextUri: query.contextUri ?? context.contextUri,
    };
    const state = await this.loadState(request);
    const items: ProjectSearchItem[] = [];

    if (state && state.rows.length > 0) {
      items.push(...this.itemsFromRows(state.rows, projectRoot));
      this.statusByProject.set(projectRoot, {
        partition: this.partition,
        status: 'ready',
        freshness: aggregateProjectSearchFreshnessValues(
          dashboardCreativeEntityStateFreshnessValues(state, items),
          'fresh',
        ),
        itemCount: items.length,
        updatedAt: new Date().toISOString(),
        provider: DASHBOARD_CREATIVE_ENTITY_PROVIDER,
      });
      return items.filter((item) => matchesProjectSearchItem(item, query));
    }

    const sources = await this.loadSources(request);
    const settled = await Promise.allSettled(sources.map(async (source) => source.getSnapshot()));

    settled.forEach((result, index) => {
      const source = sources[index];
      if (!source) return;
      if (result.status === 'rejected') {
        this.options.logger?.warn('Dashboard creative entity snapshot failed', {
          source: source.source,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
        return;
      }
      if (!isDashboardCreativeEntitySnapshot(result.value)) {
        this.options.logger?.warn('Ignoring invalid dashboard creative entity snapshot', {
          source: source.source,
        });
        return;
      }
      items.push(...this.itemsFromRows(result.value.rows, projectRoot));
    });

    const filtered = items.filter((item) => matchesProjectSearchItem(item, query));
    this.statusByProject.set(projectRoot, {
      partition: this.partition,
      status: 'ready',
      freshness: aggregateProjectSearchItemsFreshness(items),
      itemCount: items.length,
      updatedAt: new Date().toISOString(),
      provider: DASHBOARD_CREATIVE_ENTITY_PROVIDER,
    });
    return filtered;
  }

  async refresh(options: ProjectSearchAdapterRefreshOptions): Promise<void> {
    this.statusByProject.delete(options.projectRoot);
  }

  getStatus(projectRoot: string): ProjectSearchPartitionStatusSnapshot {
    return (
      this.statusByProject.get(projectRoot) ?? {
        partition: this.partition,
        status: 'idle',
        freshness: 'stale',
        provider: DASHBOARD_CREATIVE_ENTITY_PROVIDER,
      }
    );
  }

  private async loadSources(
    request: AgentDashboardCreativeEntitySourceRequest,
  ): Promise<readonly DashboardCreativeEntitySource[]> {
    try {
      return await this.options.loadSources(request);
    } catch (error) {
      this.options.logger?.warn('Dashboard creative entity source discovery failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  private async loadState(
    request: AgentDashboardCreativeEntitySourceRequest,
  ): Promise<DashboardCreativeEntityState | undefined> {
    try {
      return await this.options.loadState(request);
    } catch (error) {
      this.options.logger?.warn('Dashboard creative entity state discovery failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private itemsFromRows(
    rows: readonly DashboardCreativeEntityRow[],
    projectRoot: string,
  ): readonly ProjectSearchItem[] {
    return dashboardCreativeEntityRowsToProjectSearchItems(rows, projectRoot);
  }
}

class ContextScriptEntityCandidateProjectSearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;

  private readonly statusByProject = new Map<string, ProjectSearchPartitionStatusSnapshot>();

  constructor(
    private readonly options: {
      readonly readTextFile: (filePath: string) => Promise<string>;
      readonly getStoryApi: () => NekoStoryAPI | undefined;
      readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
    },
  ) {}

  async ensureInitialized(_projectRoot: string): Promise<void> {
    return undefined;
  }

  async query(
    query: ProjectSearchQuery,
    context: ProjectSearchQueryContext,
  ): Promise<readonly ProjectSearchItem[]> {
    if (query.partitions && !query.partitions.includes(this.partition)) {
      return [];
    }
    if (query.kinds && !query.kinds.includes('entity-candidate')) {
      return [];
    }

    const projectRoot = query.projectRoot ?? context.projectRoot;
    const contextFilePath = context.resolvedContextFilePath ?? query.contextFilePath;
    if (!projectRoot || !contextFilePath || !isStoryFile(contextFilePath)) {
      return [];
    }
    if (!isPathInside(contextFilePath, projectRoot)) {
      return [];
    }

    const text = await this.readTextFile(contextFilePath);
    if (!text) return [];

    const storyApi = this.options.getStoryApi();
    const candidates = extractScriptCharacterCandidates(
      text,
      storyApi ? (content) => storyApi.parseScript(content) : undefined,
    );
    const items = candidates.map((candidate) =>
      scriptCharacterCandidateToProjectSearchItem(candidate, {
        projectRoot,
        filePath: contextFilePath,
        uri: vscode.Uri.file(contextFilePath).toString(),
        projectRelativePath: path.relative(projectRoot, contextFilePath),
      }),
    );
    const filtered = items.filter((item) => matchesProjectSearchItem(item, query));
    this.statusByProject.set(projectRoot, {
      partition: this.partition,
      status: 'ready',
      freshness: 'fresh',
      itemCount: items.length,
      updatedAt: new Date().toISOString(),
      provider: CONTEXT_SCRIPT_ENTITY_PROVIDER,
    });
    return filtered;
  }

  async refresh(options: ProjectSearchAdapterRefreshOptions): Promise<void> {
    this.statusByProject.delete(options.projectRoot);
  }

  getStatus(projectRoot: string): ProjectSearchPartitionStatusSnapshot {
    return (
      this.statusByProject.get(projectRoot) ?? {
        partition: this.partition,
        status: 'idle',
        freshness: 'stale',
        provider: CONTEXT_SCRIPT_ENTITY_PROVIDER,
      }
    );
  }

  private async readTextFile(filePath: string): Promise<string> {
    try {
      return await this.options.readTextFile(filePath);
    } catch (error) {
      this.options.logger?.warn('Failed to read context script for entity search', {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
  }
}

function createDefaultEntitySearchAdapter(
  options: AgentEntitySearchAdapterFactoryOptions,
): ProjectSearchAdapter {
  const { service } = createVSCodeEntityServices({
    projectRoot: options.projectRoot,
    logger: options.logger,
  });
  return createEntitySearchAdapter({
    projectRoot: options.projectRoot,
    service,
    providerId: 'neko-entity',
  });
}

const COMBINED_CREATIVE_ENTITY_PROVIDER = {
  providerId: 'agent-creative-entities',
  modes: ['mention', 'global', 'entity-picker', 'agent-tool'],
  itemKinds: ['creative-entity', 'entity-candidate', 'generated-asset'],
  partitions: ['creative-entities'],
} satisfies ProjectSearchProviderCapabilities;

const DASHBOARD_CREATIVE_ENTITY_PROVIDER = {
  providerId: 'dashboard-creative-entities',
  modes: ['mention', 'global', 'entity-picker', 'agent-tool'],
  itemKinds: ['creative-entity', 'entity-candidate'],
  partitions: ['creative-entities'],
} satisfies ProjectSearchProviderCapabilities;

const CONTEXT_SCRIPT_ENTITY_PROVIDER = {
  providerId: 'agent-context-script-entities',
  modes: ['mention', 'global', 'entity-picker', 'agent-tool'],
  itemKinds: ['entity-candidate'],
  partitions: ['creative-entities'],
} satisfies ProjectSearchProviderCapabilities;

const DASHBOARD_SOURCE_COMMANDS = [
  DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
  DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function loadDashboardCreativeEntityStateFromCommand(
  request: AgentDashboardCreativeEntitySourceRequest,
): Promise<DashboardCreativeEntityState | undefined> {
  try {
    const candidate = await vscode.commands.executeCommand<unknown>(
      DASHBOARD_CREATIVE_ENTITY_STATE_COMMAND,
      request,
    );
    return readDashboardCreativeEntitySearchState(candidate);
  } catch {
    return undefined;
  }
}

function readDashboardCreativeEntitySearchState(
  value: unknown,
): DashboardCreativeEntityState | undefined {
  if (!isRecord(value)) return undefined;
  const rows = value['rows'];
  const statuses = value['statuses'];
  if (!Array.isArray(rows) || !rows.every(isDashboardCreativeEntityRow)) {
    return undefined;
  }
  if (!Array.isArray(statuses) || !statuses.every(isDashboardCreativeEntitySourceStatus)) {
    return undefined;
  }
  return { rows, statuses };
}

async function loadDashboardCreativeEntitySourcesFromCommands(
  request: AgentDashboardCreativeEntitySourceRequest,
): Promise<readonly DashboardCreativeEntitySource[]> {
  const settled = await Promise.allSettled(
    DASHBOARD_SOURCE_COMMANDS.map((command) =>
      vscode.commands.executeCommand<unknown>(command, request),
    ),
  );
  return settled.flatMap((result) =>
    result.status === 'fulfilled' && isDashboardCreativeEntitySource(result.value)
      ? [result.value]
      : [],
  );
}

async function readVSCodeTextFile(filePath: string): Promise<string> {
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  return new TextDecoder().decode(raw);
}

function getStoryApi(): NekoStoryAPI | undefined {
  try {
    const extension = vscode.extensions.getExtension<NekoStoryAPI>('neko.neko-story');
    return extension?.isActive ? extension.exports : undefined;
  } catch {
    return undefined;
  }
}

function isStoryFile(filePath: string): boolean {
  return filePath.endsWith('.fountain') || filePath.endsWith('.nks') || filePath.endsWith('.story');
}

function isPathInside(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
