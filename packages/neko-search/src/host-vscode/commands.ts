import * as vscode from 'vscode';
import {
  validateProjectSemanticCoverageQuery,
  validateProjectSemanticCoverageResult,
} from '@neko/shared';
import type {
  ProjectIndexChangedRef,
  ProjectIndexUpdateReason,
  ProjectSearchAdapter,
  ProjectSearchPartitionKind,
  ProjectSearchQuery,
  ProjectSemanticCoverageQuery,
} from '@neko/shared';
import { ProjectCacheSearchService } from '../core/ProjectCacheSearchService';
import type { ProjectSearchLogger, ProjectSemanticCoverageProvider } from '../core/ports';
import { createCompatibilityProjectSearchAdapters } from './compatAdapters';
import {
  createVSCodeProjectSearchContextResolver,
  resolveProjectRootForUri,
} from './projectResolver';

export const PROJECT_SEARCH_QUERY_COMMAND = 'neko.projectSearch.query';
export const PROJECT_SEARCH_REFRESH_COMMAND = 'neko.projectSearch.refresh';
export const PROJECT_SEARCH_SEMANTIC_COVERAGE_COMMAND = 'neko.projectSearch.querySemanticCoverage';
const TEXT_DOCUMENT_REFRESH_DEBOUNCE_MS = 400;
const FILE_WATCHER_REFRESH_DEBOUNCE_MS = 300;

export function registerProjectSearchService(
  context: vscode.ExtensionContext,
  options: {
    readonly resolveThumbnailUri?: (filePath: string) => string | undefined;
    readonly resolvePath?: (filePath: string) => Promise<string>;
    readonly logger?: ProjectSearchLogger;
    readonly adapters?: readonly ProjectSearchAdapter[];
    readonly semanticCoverageProviders?: readonly ProjectSemanticCoverageProvider[];
  } = {},
): ProjectCacheSearchService {
  const service = ProjectCacheSearchService.create({
    resolveContext: createVSCodeProjectSearchContextResolver({ resolvePath: options.resolvePath }),
    getWorkspaceRoots: () =>
      (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath),
    logger: options.logger,
  });
  const adapters = options.adapters ?? createCompatibilityProjectSearchAdapters(options);
  for (const adapter of adapters) {
    context.subscriptions.push(service.registerAdapter(adapter));
  }
  for (const provider of options.semanticCoverageProviders ?? []) {
    context.subscriptions.push(service.registerSemanticCoverageProvider(provider));
  }

  const watcherDisposables = registerProjectSearchWatchers(context, service);

  context.subscriptions.push(
    service,
    ...watcherDisposables,
    vscode.commands.registerCommand(
      PROJECT_SEARCH_QUERY_COMMAND,
      async (query: ProjectSearchQuery) => service.query(query),
    ),
    vscode.commands.registerCommand(
      PROJECT_SEARCH_SEMANTIC_COVERAGE_COMMAND,
      async (query: ProjectSemanticCoverageQuery) => {
        const queryDiagnostics = validateProjectSemanticCoverageQuery(query);
        if (queryDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
          return {
            query,
            coverage: 'failed',
            freshness: 'failed',
            diagnostics: queryDiagnostics,
          };
        }
        const result = await service.querySemanticCoverage(query);
        const resultDiagnostics = validateProjectSemanticCoverageResult(result);
        if (resultDiagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
          return {
            query,
            coverage: 'failed',
            freshness: 'failed',
            diagnostics: resultDiagnostics,
            ...(result.projectRoot ? { projectRoot: result.projectRoot } : {}),
            ...(result.generation !== undefined ? { generation: result.generation } : {}),
          };
        }
        return result;
      },
    ),
    vscode.commands.registerCommand(
      PROJECT_SEARCH_REFRESH_COMMAND,
      async (projectRoot?: string) => {
        const root = projectRoot ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!root) return undefined;
        await service.refresh(root, 'manual-refresh');
        return service.getStatus(root);
      },
    ),
  );

  void service.ensureInitialized();
  return service;
}

export function registerProjectSearchWatchers(
  context: vscode.ExtensionContext,
  service: ProjectCacheSearchService,
): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];
  const debouncedRefresh = new PartitionRefreshDebouncer(service);
  const refresh = (
    uri: vscode.Uri,
    reason: ProjectIndexUpdateReason,
    partition: ProjectSearchPartitionKind,
    delayMs: number,
  ) => {
    const changedRefs: ProjectIndexChangedRef[] = [
      { kind: partition, filePath: uri.fsPath, uri: uri.toString() },
    ];
    void resolveProjectRootForUri(uri).then((root) => {
      if (!root) return;
      debouncedRefresh.schedule(root, reason, partition, changedRefs, delayMs);
    });
  };

  disposables.push(
    debouncedRefresh,
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (isStoryDocument(event.document)) {
        refresh(
          event.document.uri,
          'document-change',
          'story-symbols',
          TEXT_DOCUMENT_REFRESH_DEBOUNCE_MS,
        );
      }
    }),
  );

  for (const [pattern, partition] of [
    ['**/*.{fountain,nks,story}', 'story-symbols'],
    ['**/neko/assets/library.json', 'asset-library'],
    ['**/characters.json', 'creative-entities'],
    ['**/neko/entities/*.json', 'creative-entities'],
    ['**/neko/entity-asset-requirements.json', 'creative-entities'],
    ['**/neko/entity-bindings.json', 'creative-entities'],
    ['**/neko/visual-identity-drafts.json', 'creative-entities'],
    ['**/neko/settings.json', 'media-library'],
    ['**/.neko/settings.local.json', 'media-library'],
  ] as const) {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    disposables.push(
      watcher,
      watcher.onDidCreate((uri) =>
        refresh(uri, 'file-create', partition, FILE_WATCHER_REFRESH_DEBOUNCE_MS),
      ),
      watcher.onDidChange((uri) =>
        refresh(uri, 'file-change', partition, FILE_WATCHER_REFRESH_DEBOUNCE_MS),
      ),
      watcher.onDidDelete((uri) =>
        refresh(uri, 'file-delete', partition, FILE_WATCHER_REFRESH_DEBOUNCE_MS),
      ),
    );
  }

  context.subscriptions.push(...disposables);
  return disposables;
}

class PartitionRefreshDebouncer implements vscode.Disposable {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly refsByKey = new Map<string, ProjectIndexChangedRef[]>();

  constructor(private readonly service: ProjectCacheSearchService) {}

  schedule(
    projectRoot: string,
    reason: ProjectIndexUpdateReason,
    partition: ProjectSearchPartitionKind,
    changedRefs: readonly ProjectIndexChangedRef[],
    delayMs: number,
  ): void {
    const key = `${projectRoot}:${partition}:${reason}`;
    const refs = this.refsByKey.get(key) ?? [];
    refs.push(...changedRefs);
    this.refsByKey.set(key, refs);
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        const batchedRefs = this.refsByKey.get(key) ?? [];
        this.refsByKey.delete(key);
        void this.service.refresh(projectRoot, reason, { partition, changedRefs: batchedRefs });
      }, delayMs),
    );
  }

  dispose(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.refsByKey.clear();
  }
}

function isStoryDocument(document: vscode.TextDocument): boolean {
  return (
    document.languageId === 'nekostory' ||
    document.uri.fsPath.endsWith('.fountain') ||
    document.uri.fsPath.endsWith('.nks') ||
    document.uri.fsPath.endsWith('.story')
  );
}
