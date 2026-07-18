import { stat, readFile, readdir } from 'node:fs/promises';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { extractSemanticText } from '@neko/content';
import type { CreativeEntityService } from '@neko/entity/core';
import {
  SemanticSourceCoordinator,
  type SemanticSourceDiscoveryPort,
  type SemanticSourceFileBatch,
  type SemanticSourceFileObservation,
  type SemanticSourceProjectionPort,
  type SemanticSourceRuntimeScope,
} from '@neko/search/core';
import type {
  AutomaticEntityCandidateReviewItem,
  CreativeEntityCandidate,
  SemanticSourceDescriptor,
  SemanticSourceAnalysisResult,
  SemanticTextSegment,
} from '@neko/shared';
import {
  createNodeWorkspaceSemanticEntityMetadataBinding,
  type NodeWorkspaceSemanticEntityMetadataBinding,
} from '@neko/shared/local-metadata/node';
import { TextEntityAnalyzer } from '@neko/entity/core';
import { projectAutomaticEntityCandidateReview } from '@neko/entity/core';
import { isExcludedSemanticPath, semanticFormat } from '@neko/search/core';
import type { MediaLibrarySettingsService } from './MediaLibrarySettingsService';
import { getLogger } from '../utils/logger';

const logger = getLogger('SemanticSourceDiscovery');
const MAX_SOURCE_BYTES = 1_000_000;
const RECONCILE_BATCH_SIZE = 64;
const RECONCILE_INTERVAL_MS = 60_000;

export interface SemanticSourceDiscoveryServiceOptions {
  readonly workspaceRoot: string;
  readonly settingsService: MediaLibrarySettingsService;
  readonly entityService: CreativeEntityService;
  readonly homedir: string;
}

export class SemanticSourceDiscoveryService implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly watchers: vscode.FileSystemWatcher[] = [];
  private readonly walkStates = new Map<string, string[]>();
  private readonly coordinator: SemanticSourceCoordinator;
  private binding: NodeWorkspaceSemanticEntityMetadataBinding | undefined;
  private scopes: readonly SemanticSourceRuntimeScope[] = [];
  private reconcileTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(private readonly options: SemanticSourceDiscoveryServiceOptions) {
    this.coordinator = new SemanticSourceCoordinator(
      {
        discovery: new NodeSemanticSourceDiscovery(this.walkStates),
        projection: new BindingSemanticSourceProjection(() => this.requireBinding()),
        getEntitySnapshot: async () => {
          const entities = await options.entityService.list({ status: 'confirmed' });
          return {
            revision: createEntityRevision(entities),
            entities,
          };
        },
        extractText: ({ source, content, signal }) =>
          extractSemanticText({ source, content, maxBytes: MAX_SOURCE_BYTES, signal }),
        now: () => new Date().toISOString(),
      },
      new TextEntityAnalyzer(),
    );
    this.disposables.push(
      options.settingsService.onDidChange(() => {
        void this.refreshScopes('settings-change');
      }),
      vscode.window.onDidChangeWindowState((event) => {
        if (event.focused) void this.reconcileAll('focus-recovery');
      }),
    );
  }

  async start(): Promise<void> {
    this.assertActive();
    this.binding = await createNodeWorkspaceSemanticEntityMetadataBinding({
      homedir: this.options.homedir,
      workDir: this.options.workspaceRoot,
    });
    this.disposables.push({
      dispose: () => {
        void this.binding
          ?.dispose()
          .catch((error) =>
            logger.warn('Failed to dispose semantic/entity metadata binding', { error }),
          );
      },
    });
    await this.refreshScopes('project-open');
  }

  async refresh(): Promise<void> {
    await this.reconcileAll('manual-refresh');
  }

  async listCandidateReviews(): Promise<readonly AutomaticEntityCandidateReviewItem[]> {
    const candidates = await this.requireBinding().listAutomaticCandidates();
    return projectAutomaticEntityCandidateReview(candidates).filter(
      (item) => item.reviewStatus === 'suggested' || item.reviewStatus === 'ambiguous',
    );
  }

  async saveCandidateForReview(candidateId: string): Promise<CreativeEntityCandidate> {
    const candidate = await this.requireAutomaticCandidate(candidateId);
    return this.options.entityService.proposeCandidate({
      id: candidate.id,
      kind: candidate.kind,
      name: candidate.name,
      aliases: candidate.aliases,
      identityBasis: candidate.identityBasis,
      confidence: candidate.confidence,
      provenance: candidate.provenance,
      sourceRefs: candidate.sourceRefs,
      metadata: candidate.metadata,
    });
  }

  async dismissCandidate(candidateId: string): Promise<unknown> {
    const candidate = await this.saveCandidateForReview(candidateId);
    return this.options.entityService.dismissCandidate(candidate.id);
  }

  async promoteCandidate(candidateId: string): Promise<unknown> {
    const candidate = await this.saveCandidateForReview(candidateId);
    return this.options.entityService.confirmCandidate({ candidateId: candidate.id });
  }

  async rejectCandidate(candidateId: string): Promise<unknown> {
    const candidate = await this.saveCandidateForReview(candidateId);
    return this.options.entityService.rejectCandidate(candidate.id);
  }

  async mergeCandidate(candidateId: string, entityId: string, asAlias = true): Promise<unknown> {
    const candidate = await this.saveCandidateForReview(candidateId);
    return this.options.entityService.mergeCandidateIntoExisting({
      candidateId: candidate.id,
      entityId,
      asAlias,
    });
  }

  async provideDocumentSymbols(
    document: vscode.TextDocument,
  ): Promise<readonly vscode.DocumentSymbol[]> {
    const scope = this.scopeForPath(document.uri.fsPath);
    if (
      !scope ||
      !semanticFormat(document.uri.fsPath) ||
      isExcludedSemanticPath(document.uri.fsPath)
    ) {
      return [];
    }
    const source = sourceForDocument(scope, document);
    const persisted = await this.requireBinding().getSource(source.sourceId);
    const currentFingerprint = await fingerprintForPath(document.uri.fsPath);
    const mentions =
      persisted?.sourceFingerprint === currentFingerprint
        ? (persisted.index.entityMentions ?? [])
        : await this.analyzeUnsavedDocument(source, document);
    return mentions.flatMap((mention) => {
      const range = mention.range;
      if (!range?.startLine || !range.startColumn || !range.endLine || !range.endColumn) return [];
      const start = new vscode.Position(
        Math.max(0, range.startLine - 1),
        Math.max(0, range.startColumn - 1),
      );
      const end = new vscode.Position(
        Math.max(0, range.endLine - 1),
        Math.max(0, range.endColumn - 1),
      );
      return [
        new vscode.DocumentSymbol(
          mention.text ?? mention.candidateName ?? mention.mentionId,
          mention.entityRef?.entityId ?? mention.candidateId ?? 'entity-mention',
          vscode.SymbolKind.Class,
          new vscode.Range(start, end),
          new vscode.Range(start, end),
        ),
      ];
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers.length = 0;
    this.coordinator.dispose();
    this.walkStates.clear();
    for (const disposable of this.disposables) disposable.dispose();
    this.disposables.length = 0;
  }

  private async refreshScopes(reason: string): Promise<void> {
    this.assertActive();
    const previous = this.scopes;
    const next = await this.resolveScopes();
    const nextIds = new Set(next.map((scope) => scope.rootId));
    for (const scope of previous) {
      if (nextIds.has(scope.rootId)) continue;
      for (const source of await this.requireBinding().listSources(scope.rootId)) {
        await this.requireBinding().deleteSource(source.sourceId, new Date().toISOString());
      }
    }
    this.disposeWatchers();
    const diagnostics = this.coordinator.setScopes(next);
    this.scopes = this.coordinator.getScopes();
    if (diagnostics.length > 0) logger.warn('Semantic source root diagnostics', { diagnostics });
    for (const scope of this.scopes) this.installWatcher(scope);
    await this.reconcileAll(reason);
  }

  private async reconcileAll(reason: string): Promise<void> {
    if (this.disposed || this.scopes.length === 0) return;
    let hasContinuation = false;
    for (const scope of this.scopes) {
      try {
        const result = await this.coordinator.reconcile(scope.rootId, RECONCILE_BATCH_SIZE);
        if (result.continuation) {
          hasContinuation = true;
        }
      } catch (error) {
        logger.warn('Semantic source reconciliation failed', {
          rootId: scope.rootId,
          reason,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.scheduleReconcile(hasContinuation ? reason : 'periodic');
  }

  private scheduleReconcile(reason: string): void {
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.reconcileTimer = setTimeout(
      () => {
        this.reconcileTimer = undefined;
        void this.reconcileAll(reason);
      },
      reason === 'periodic' ? RECONCILE_INTERVAL_MS : 0,
    );
  }

  private async resolveScopes(): Promise<readonly SemanticSourceRuntimeScope[]> {
    if (!vscode.workspace.isTrusted) {
      logger.warn('Semantic source discovery is disabled for an untrusted workspace');
      return [];
    }
    const scopes: SemanticSourceRuntimeScope[] = [
      {
        workspaceId: this.requireBinding().workspaceId,
        rootId: 'workspace',
        rootKind: 'workspace',
        portableRoot: '${WORKSPACE}',
        runtimeRoot: this.options.workspaceRoot,
        analysisMode: 'link-existing',
        priority: 0,
      },
    ];
    const libraries = await this.options.settingsService.getResolvedLibraries();
    for (const [index, library] of libraries.entries()) {
      if (!library.enabled || !library.accessible) continue;
      scopes.push({
        workspaceId: this.requireBinding().workspaceId,
        rootId: `media-library:${library.variable}`,
        rootKind: 'media-library',
        portableRoot: `\${${library.variable}}`,
        runtimeRoot: library.resolvedPath,
        analysisMode: 'link-existing',
        priority: index + 1,
      });
    }
    return scopes;
  }

  private installWatcher(scope: SemanticSourceRuntimeScope): void {
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(scope.runtimeRoot, '**/*'),
    );
    const handle = (uri: vscode.Uri, kind: 'create' | 'change' | 'delete') => {
      const relativePath = path.relative(scope.runtimeRoot, uri.fsPath).replace(/\\/gu, '/');
      if (!relativePath || relativePath.startsWith('../')) return;
      void this.coordinator.handleHint(scope.rootId, relativePath, kind).catch((error) =>
        logger.warn('Semantic source hint failed', {
          rootId: scope.rootId,
          relativePath,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    };
    this.watchers.push(watcher);
    this.disposables.push(
      watcher,
      watcher.onDidCreate((uri) => handle(uri, 'create')),
      watcher.onDidChange((uri) => handle(uri, 'change')),
      watcher.onDidDelete((uri) => handle(uri, 'delete')),
    );
  }

  private disposeWatchers(): void {
    for (const watcher of this.watchers) watcher.dispose();
    this.watchers.length = 0;
  }

  private scopeForPath(filePath: string): SemanticSourceRuntimeScope | undefined {
    return [...this.scopes]
      .filter((scope) => isPathInside(scope.runtimeRoot, filePath))
      .sort((left, right) => left.priority - right.priority)[0];
  }

  private async analyzeUnsavedDocument(
    source: SemanticSourceDescriptor,
    document: vscode.TextDocument,
  ) {
    const segments = extractSemanticText({
      source,
      content: document.getText(),
      maxBytes: MAX_SOURCE_BYTES,
    });
    const entities = await this.options.entityService.list({ status: 'confirmed' });
    const result = await new TextEntityAnalyzer().analyze({
      source,
      segments,
      entities: { revision: createEntityRevision(entities), entities },
      analyzedAt: new Date().toISOString(),
    });
    return result.mentions;
  }

  private async requireAutomaticCandidate(candidateId: string): Promise<CreativeEntityCandidate> {
    const candidate = (await this.requireBinding().listAutomaticCandidates()).find(
      (item) => item.id === candidateId,
    );
    if (!candidate) throw new Error(`Unknown automatic Entity candidate: ${candidateId}`);
    return candidate;
  }

  private requireBinding(): NodeWorkspaceSemanticEntityMetadataBinding {
    if (!this.binding) throw new Error('Semantic source service has not started.');
    return this.binding;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Semantic source discovery service is disposed.');
  }
}

class NodeSemanticSourceDiscovery implements SemanticSourceDiscoveryPort {
  constructor(private readonly walkStates: Map<string, string[]>) {}

  async listFiles(input: {
    readonly scope: SemanticSourceRuntimeScope;
    readonly continuation?: string;
    readonly limit: number;
    readonly signal: AbortSignal;
  }): Promise<SemanticSourceFileBatch> {
    const stack = input.continuation
      ? (this.walkStates.get(input.scope.rootId) ?? [])
      : [input.scope.runtimeRoot];
    if (!input.continuation) this.walkStates.set(input.scope.rootId, stack);
    const files: SemanticSourceFileObservation[] = [];
    while (stack.length > 0 && files.length < input.limit) {
      if (input.signal.aborted) throw new Error('Semantic source directory walk aborted.');
      const directory = stack.pop();
      if (!directory) continue;
      let entries: readonly import('node:fs').Dirent[];
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (input.signal.aborted) throw new Error('Semantic source directory walk aborted.');
        const runtimePath = path.join(directory, entry.name);
        const relativePath = path
          .relative(input.scope.runtimeRoot, runtimePath)
          .replace(/\\/gu, '/');
        if (entry.isDirectory()) {
          if (!isExcludedSemanticPath(relativePath)) stack.push(runtimePath);
          continue;
        }
        if (
          !entry.isFile() ||
          !semanticFormat(relativePath) ||
          isExcludedSemanticPath(relativePath)
        ) {
          continue;
        }
        const observed = await observeRuntimeFile(
          input.scope.runtimeRoot,
          runtimePath,
          relativePath,
        );
        if (observed) files.push(observed);
        if (files.length >= input.limit) break;
      }
    }
    if (stack.length === 0) {
      this.walkStates.delete(input.scope.rootId);
      return { files };
    }
    this.walkStates.set(input.scope.rootId, stack);
    return { files, continuation: 'continue' };
  }

  async observeFile(
    scope: SemanticSourceRuntimeScope,
    relativePath: string,
  ): Promise<SemanticSourceFileObservation | null> {
    const normalized = relativePath.replace(/\\/gu, '/');
    if (!normalized || normalized.startsWith('../') || path.isAbsolute(normalized)) return null;
    const runtimePath = path.resolve(scope.runtimeRoot, normalized);
    if (!isPathInside(scope.runtimeRoot, runtimePath)) return null;
    return observeRuntimeFile(scope.runtimeRoot, runtimePath, normalized);
  }

  async readFile(file: SemanticSourceFileObservation, signal: AbortSignal): Promise<Uint8Array> {
    if (signal.aborted) throw new Error('Semantic source read aborted.');
    const result = await stat(file.runtimePath);
    if (result.size > MAX_SOURCE_BYTES) throw new Error('semantic-text-oversized');
    return readFile(file.runtimePath);
  }

  async readFingerprint(file: SemanticSourceFileObservation): Promise<string | null> {
    try {
      const result = await stat(file.runtimePath);
      return `${result.size}:${result.mtimeMs}`;
    } catch {
      return null;
    }
  }
}

class BindingSemanticSourceProjection implements SemanticSourceProjectionPort {
  constructor(private readonly getBinding: () => NodeWorkspaceSemanticEntityMetadataBinding) {}

  async getSource(sourceId: string) {
    const source = await this.getBinding().getSource(sourceId);
    return source
      ? { sourceId: source.sourceId, sourceFingerprint: source.sourceFingerprint }
      : null;
  }

  listSources(rootId: string) {
    return this.getBinding().listSources(rootId);
  }

  replaceSource(input: {
    readonly source: SemanticSourceDescriptor;
    readonly result: SemanticSourceAnalysisResult;
    readonly expectedStoredFingerprint: string | null;
    readonly updatedAt: string;
  }) {
    return this.getBinding().replaceSource(input);
  }

  deleteSource(sourceId: string, updatedAt: string) {
    return this.getBinding().deleteSource(sourceId, updatedAt);
  }

  markSourceStale(sourceId: string, diagnostic: string, updatedAt: string) {
    return this.getBinding().markSourceStale(sourceId, diagnostic, updatedAt);
  }
}

async function observeRuntimeFile(
  runtimeRoot: string,
  runtimePath: string,
  relativePath: string,
): Promise<SemanticSourceFileObservation | null> {
  if (!isPathInside(runtimeRoot, runtimePath)) return null;
  try {
    const result = await stat(runtimePath);
    if (!result.isFile()) return null;
    return {
      relativePath,
      runtimePath,
      sizeBytes: result.size,
      modifiedAtMs: result.mtimeMs,
      fingerprint: `${result.size}:${result.mtimeMs}`,
    };
  } catch {
    return null;
  }
}

function sourceForDocument(
  scope: SemanticSourceRuntimeScope,
  document: vscode.TextDocument,
): SemanticSourceDescriptor {
  const relativePath = path.relative(scope.runtimeRoot, document.uri.fsPath).replace(/\\/gu, '/');
  const format = semanticFormat(relativePath);
  if (!format) throw new Error(`Unsupported semantic document: ${document.uri.fsPath}`);
  return {
    sourceId: `${scope.rootId}:${relativePath}`,
    workspaceId: scope.workspaceId,
    rootId: scope.rootId,
    rootKind: scope.rootKind,
    relativePath,
    portablePath: `${scope.portableRoot.replace(/\/+$/u, '')}/${relativePath}`,
    format,
    analysisMode: format === 'fountain' ? 'discover-candidates' : scope.analysisMode,
    fingerprint: `${Buffer.byteLength(document.getText(), 'utf8')}:unsaved`,
    sizeBytes: Buffer.byteLength(document.getText(), 'utf8'),
    modifiedAtMs: 0,
  };
}

async function fingerprintForPath(filePath: string): Promise<string | null> {
  try {
    const result = await stat(filePath);
    return `${result.size}:${result.mtimeMs}`;
  } catch {
    return null;
  }
}

function createEntityRevision(entities: readonly unknown[]): string {
  return JSON.stringify(entities);
}

function isPathInside(root: string, filePath: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(filePath));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
