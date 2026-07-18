import * as path from 'path';
import * as vscode from 'vscode';
import type {
  ProjectSearchAdapter,
  ProjectSearchAdapterRefreshOptions,
  ProjectSearchItem,
  ProjectSearchPartitionStatusSnapshot,
  ProjectSearchProviderCapabilities,
  ProjectSearchQuery,
  ProjectSearchQueryContext,
} from '@neko/shared';
import {
  createCompatibilityProjectSearchAdapters,
  type CompatibilityProjectSearchAdaptersOptions,
} from '@neko/search/host-vscode';
import {
  aggregateProjectSearchPartitionStatus,
  dedupeCreativeEntityProjectSearchItems,
  matchesProjectSearchItem,
} from '@neko/search/core';
import {
  createEntitySearchAdapter,
  extractScriptCharacterCandidates,
  scriptCharacterCandidateToProjectSearchItem,
} from '@neko/entity/projections';
import { createVSCodeEntityServices } from '@neko/entity/host-vscode';

export interface AgentEntitySearchAdapterFactoryOptions {
  readonly projectRoot: string;
  readonly automaticCandidateProjection?: CompatibilityProjectSearchAdaptersOptions['entityAssetProjection'];
  readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
}

export interface AgentProjectSearchAdapterDependencies {
  readonly createCompatibilityAdapters?: (
    options: CompatibilityProjectSearchAdaptersOptions,
  ) => readonly ProjectSearchAdapter[];
  readonly createEntityAdapter?: (
    options: AgentEntitySearchAdapterFactoryOptions,
  ) => ProjectSearchAdapter;
  readonly readTextFile?: (filePath: string) => Promise<string>;
}

export function createAgentProjectSearchAdapters(
  options: CompatibilityProjectSearchAdaptersOptions = {},
  dependencies: AgentProjectSearchAdapterDependencies = {},
): readonly ProjectSearchAdapter[] {
  const createCompatibilityAdapters =
    dependencies.createCompatibilityAdapters ?? createCompatibilityProjectSearchAdapters;
  const createEntityAdapter = dependencies.createEntityAdapter ?? createDefaultEntitySearchAdapter;
  const compatibilityAdapters = createCompatibilityAdapters(options);
  const adapters: ProjectSearchAdapter[] = [];

  for (const adapter of compatibilityAdapters) {
    if (adapter.partition === 'creative-entities') {
      adapter.dispose?.();
      continue;
    }
    adapters.push(adapter);
  }

  adapters.push(
    new AgentCreativeEntityProjectSearchAdapter({
      createEntityAdapter,
      readTextFile: dependencies.readTextFile ?? readVSCodeTextFile,
      automaticCandidateProjection: options.entityAssetProjection,
      logger: options.logger,
    }),
  );

  return adapters;
}

class AgentCreativeEntityProjectSearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;

  private readonly entityAdaptersByProject = new Map<string, ProjectSearchAdapter>();
  private readonly contextScriptCandidateAdapter: ProjectSearchAdapter;

  constructor(
    private readonly options: {
      readonly createEntityAdapter: (
        options: AgentEntitySearchAdapterFactoryOptions,
      ) => ProjectSearchAdapter;
      readonly readTextFile: (filePath: string) => Promise<string>;
      readonly automaticCandidateProjection?: CompatibilityProjectSearchAdaptersOptions['entityAssetProjection'];
      readonly logger?: CompatibilityProjectSearchAdaptersOptions['logger'];
    },
  ) {
    this.contextScriptCandidateAdapter = new ContextScriptEntityCandidateProjectSearchAdapter({
      readTextFile: options.readTextFile,
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
    const adapters: ProjectSearchAdapter[] = [this.contextScriptCandidateAdapter];
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
      ...(this.options.automaticCandidateProjection
        ? { automaticCandidateProjection: this.options.automaticCandidateProjection }
        : {}),
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

class ContextScriptEntityCandidateProjectSearchAdapter implements ProjectSearchAdapter {
  readonly partition = 'creative-entities' as const;

  private readonly statusByProject = new Map<string, ProjectSearchPartitionStatusSnapshot>();

  constructor(
    private readonly options: {
      readonly readTextFile: (filePath: string) => Promise<string>;
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

    const candidates = extractScriptCharacterCandidates(text);
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
    ...(options.automaticCandidateProjection
      ? { automaticCandidateProjection: options.automaticCandidateProjection }
      : {}),
    providerId: 'neko-entity',
  });
}

const COMBINED_CREATIVE_ENTITY_PROVIDER = {
  providerId: 'agent-creative-entities',
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

async function readVSCodeTextFile(filePath: string): Promise<string> {
  const raw = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
  return new TextDecoder().decode(raw);
}

function isStoryFile(filePath: string): boolean {
  return filePath.endsWith('.fountain');
}

function isPathInside(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
