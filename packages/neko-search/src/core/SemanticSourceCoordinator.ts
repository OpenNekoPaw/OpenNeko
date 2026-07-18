import type {
  SemanticEntitySnapshot,
  SemanticSourceAnalysisResult,
  SemanticSourceAnalyzer,
  SemanticSourceDescriptor,
  SemanticSourceDiagnostic,
  SemanticSourceFormat,
  SemanticSourceScope,
  SemanticTextSegment,
} from '@neko/shared';

const DEFAULT_RECONCILE_BATCH_SIZE = 128;

export interface SemanticSourceRuntimeScope extends SemanticSourceScope {
  readonly runtimeRoot: string;
}

export interface SemanticSourceFileObservation {
  readonly relativePath: string;
  readonly runtimePath: string;
  readonly sizeBytes: number;
  readonly modifiedAtMs: number;
  readonly fingerprint: string;
}

export interface SemanticSourceFileBatch {
  readonly files: readonly SemanticSourceFileObservation[];
  readonly continuation?: string;
}

export interface SemanticSourceStoredRecord {
  readonly sourceId: string;
  readonly sourceFingerprint: string;
}

export interface SemanticSourceDiscoveryPort {
  listFiles(input: {
    readonly scope: SemanticSourceRuntimeScope;
    readonly continuation?: string;
    readonly limit: number;
    readonly signal: AbortSignal;
  }): Promise<SemanticSourceFileBatch>;
  observeFile(
    scope: SemanticSourceRuntimeScope,
    relativePath: string,
  ): Promise<SemanticSourceFileObservation | null>;
  readFile(file: SemanticSourceFileObservation, signal: AbortSignal): Promise<Uint8Array>;
  readFingerprint(file: SemanticSourceFileObservation): Promise<string | null>;
}

export interface SemanticSourceProjectionPort {
  getSource(sourceId: string): Promise<SemanticSourceStoredRecord | null>;
  listSources(rootId: string): Promise<readonly SemanticSourceDescriptor[]>;
  replaceSource(input: {
    readonly source: SemanticSourceDescriptor;
    readonly result: SemanticSourceAnalysisResult;
    readonly expectedStoredFingerprint: string | null;
    readonly updatedAt: string;
  }): Promise<void>;
  deleteSource(sourceId: string, updatedAt: string): Promise<boolean>;
  markSourceStale(sourceId: string, diagnostic: string, updatedAt: string): Promise<void>;
}

export interface SemanticSourceCoordinatorPorts {
  readonly discovery: SemanticSourceDiscoveryPort;
  readonly projection: SemanticSourceProjectionPort;
  readonly getEntitySnapshot: () => Promise<SemanticEntitySnapshot>;
  readonly extractText: (input: {
    readonly source: SemanticSourceDescriptor;
    readonly content: Uint8Array;
    readonly signal: AbortSignal;
  }) => readonly SemanticTextSegment[];
  readonly now?: () => string;
}

export interface SemanticSourceReconcileResult {
  readonly rootId: string;
  readonly processed: number;
  readonly skipped: number;
  readonly deleted: number;
  readonly continuation?: string;
  readonly diagnostics: readonly SemanticSourceDiagnostic[];
}

export class SemanticSourceCoordinator {
  private readonly scopes = new Map<string, SemanticSourceRuntimeScope>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly inFlight = new Map<string, Promise<'processed' | 'skipped'>>();
  private readonly reconcileSeen = new Map<string, Set<string>>();
  private readonly reconcileContinuation = new Map<string, string>();
  private diagnostics: readonly SemanticSourceDiagnostic[] = [];
  private disposed = false;

  constructor(
    private readonly ports: SemanticSourceCoordinatorPorts,
    private readonly analyzer: SemanticSourceAnalyzer,
  ) {}

  setScopes(scopes: readonly SemanticSourceRuntimeScope[]): readonly SemanticSourceDiagnostic[] {
    this.assertActive();
    const next = selectNonOverlappingScopes(scopes);
    const nextIds = new Set(next.scopes.map((scope) => scope.rootId));
    for (const rootId of this.scopes.keys()) {
      if (nextIds.has(rootId)) continue;
      this.controllers.get(rootId)?.abort();
      this.controllers.delete(rootId);
      this.reconcileSeen.delete(rootId);
      this.reconcileContinuation.delete(rootId);
    }
    this.scopes.clear();
    for (const scope of next.scopes) this.scopes.set(scope.rootId, scope);
    this.diagnostics = next.diagnostics;
    return this.diagnostics;
  }

  getDiagnostics(): readonly SemanticSourceDiagnostic[] {
    return this.diagnostics;
  }

  getScopes(): readonly SemanticSourceRuntimeScope[] {
    return [...this.scopes.values()];
  }

  async reconcile(
    rootId: string,
    limit = DEFAULT_RECONCILE_BATCH_SIZE,
  ): Promise<SemanticSourceReconcileResult> {
    this.assertActive();
    if (!Number.isSafeInteger(limit) || limit <= 0) {
      throw new RangeError(`Semantic reconciliation limit must be positive: ${limit}`);
    }
    const scope = this.requireScope(rootId);
    const controller = this.replaceController(rootId);
    const continuation = this.reconcileContinuation.get(rootId);
    const seen = continuation
      ? (this.reconcileSeen.get(rootId) ?? new Set<string>())
      : new Set<string>();
    this.reconcileSeen.set(rootId, seen);
    const batch = await this.ports.discovery.listFiles({
      scope,
      ...(continuation ? { continuation } : {}),
      limit,
      signal: controller.signal,
    });
    let processed = 0;
    let skipped = 0;
    const diagnostics: SemanticSourceDiagnostic[] = [];
    for (const file of batch.files) {
      if (controller.signal.aborted) break;
      const source = descriptorFromObservation(scope, file);
      if (!source) continue;
      seen.add(source.sourceId);
      try {
        const outcome = await this.process(scope, file, source, controller.signal);
        if (outcome === 'processed') processed += 1;
        else skipped += 1;
      } catch (error) {
        const diagnostic = diagnosticFromError(source, error);
        diagnostics.push(diagnostic);
        await this.ports.projection.markSourceStale(source.sourceId, diagnostic.code, this.now());
      }
    }
    if (batch.continuation) {
      this.reconcileContinuation.set(rootId, batch.continuation);
      return {
        rootId,
        processed,
        skipped,
        deleted: 0,
        continuation: batch.continuation,
        diagnostics,
      };
    }

    this.reconcileContinuation.delete(rootId);
    this.reconcileSeen.delete(rootId);
    const stored = await this.ports.projection.listSources(rootId);
    let deleted = 0;
    for (const source of stored) {
      if (seen.has(source.sourceId)) continue;
      if (await this.ports.projection.deleteSource(source.sourceId, this.now())) deleted += 1;
    }
    return { rootId, processed, skipped, deleted, diagnostics };
  }

  async handleHint(
    rootId: string,
    relativePath: string,
    kind: 'create' | 'change' | 'delete',
  ): Promise<'processed' | 'skipped' | 'deleted'> {
    this.assertActive();
    const scope = this.requireScope(rootId);
    const sourceId = buildSourceId(scope.rootId, relativePath);
    if (kind === 'delete') {
      await this.ports.projection.deleteSource(sourceId, this.now());
      return 'deleted';
    }
    const file = await this.ports.discovery.observeFile(scope, relativePath);
    if (!file) {
      await this.ports.projection.deleteSource(sourceId, this.now());
      return 'deleted';
    }
    const source = descriptorFromObservation(scope, file);
    if (!source) return 'skipped';
    const controller = this.controllerFor(rootId);
    return this.process(scope, file, source, controller.signal);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const controller of this.controllers.values()) controller.abort();
    this.controllers.clear();
    this.scopes.clear();
    this.reconcileSeen.clear();
    this.reconcileContinuation.clear();
    this.inFlight.clear();
  }

  private process(
    scope: SemanticSourceRuntimeScope,
    file: SemanticSourceFileObservation,
    source: SemanticSourceDescriptor,
    signal: AbortSignal,
  ): Promise<'processed' | 'skipped'> {
    const key = `${source.sourceId}:${source.fingerprint}`;
    const current = this.inFlight.get(key);
    if (current) return current;
    const operation = this.processUnshared(scope, file, source, signal).finally(() => {
      if (this.inFlight.get(key) === operation) this.inFlight.delete(key);
    });
    this.inFlight.set(key, operation);
    return operation;
  }

  private async processUnshared(
    scope: SemanticSourceRuntimeScope,
    file: SemanticSourceFileObservation,
    source: SemanticSourceDescriptor,
    signal: AbortSignal,
  ): Promise<'processed' | 'skipped'> {
    if (signal.aborted) throw new Error(`Semantic source ${source.sourceId} processing aborted.`);
    const stored = await this.ports.projection.getSource(source.sourceId);
    if (stored?.sourceFingerprint === source.fingerprint) return 'skipped';
    const content = await this.ports.discovery.readFile(file, signal);
    const segments = this.ports.extractText({ source, content, signal });
    const entities = await this.ports.getEntitySnapshot();
    const updatedAt = this.now();
    const result = await this.analyzer.analyze({
      source,
      segments,
      entities,
      analyzedAt: updatedAt,
      signal,
    });
    const currentFingerprint = await this.ports.discovery.readFingerprint(file);
    if (currentFingerprint !== source.fingerprint) {
      await this.ports.projection.markSourceStale(
        source.sourceId,
        'semantic-source-changed-during-analysis',
        this.now(),
      );
      return 'skipped';
    }
    if (scope.rootId !== source.rootId) {
      throw new Error(`Semantic source ${source.sourceId} escaped its registered root.`);
    }
    await this.ports.projection.replaceSource({
      source,
      result,
      expectedStoredFingerprint: stored?.sourceFingerprint ?? null,
      updatedAt,
    });
    return 'processed';
  }

  private requireScope(rootId: string): SemanticSourceRuntimeScope {
    const scope = this.scopes.get(rootId);
    if (!scope) throw new Error(`Unknown semantic source root: ${rootId}`);
    return scope;
  }

  private controllerFor(rootId: string): AbortController {
    const existing = this.controllers.get(rootId);
    if (existing && !existing.signal.aborted) return existing;
    const controller = new AbortController();
    this.controllers.set(rootId, controller);
    return controller;
  }

  private replaceController(rootId: string): AbortController {
    this.controllers.get(rootId)?.abort();
    const controller = new AbortController();
    this.controllers.set(rootId, controller);
    return controller;
  }

  private now(): string {
    return (this.ports.now ?? (() => new Date().toISOString()))();
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('Semantic source coordinator is disposed.');
  }
}

function descriptorFromObservation(
  scope: SemanticSourceRuntimeScope,
  file: SemanticSourceFileObservation,
): SemanticSourceDescriptor | undefined {
  const relativePath = normalizeRelativePath(file.relativePath);
  const format = semanticFormat(relativePath);
  if (!format || isExcludedSemanticPath(relativePath)) return undefined;
  const analysisMode =
    scope.analysisMode === 'off'
      ? 'off'
      : format === 'fountain'
        ? 'discover-candidates'
        : scope.analysisMode;
  return {
    sourceId: buildSourceId(scope.rootId, relativePath),
    workspaceId: scope.workspaceId,
    rootId: scope.rootId,
    rootKind: scope.rootKind,
    relativePath,
    portablePath: joinPortablePath(scope.portableRoot, relativePath),
    format,
    analysisMode,
    fingerprint: file.fingerprint,
    sizeBytes: file.sizeBytes,
    modifiedAtMs: file.modifiedAtMs,
  };
}

export function semanticFormat(relativePath: string): SemanticSourceFormat | undefined {
  const lower = relativePath.toLocaleLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.txt')) return 'plain';
  if (lower.endsWith('.fountain') || lower.endsWith('.nks') || lower.endsWith('.story')) {
    return 'fountain';
  }
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  return undefined;
}

export function isExcludedSemanticPath(relativePath: string): boolean {
  const segments = normalizeRelativePath(relativePath).toLocaleLowerCase().split('/');
  const excludedSegments = new Set([
    '.git',
    '.neko',
    'node_modules',
    'dist',
    'build',
    'coverage',
    'target',
    'vendor',
    'logs',
    'cache',
  ]);
  if (segments.some((segment) => excludedSegments.has(segment))) return true;
  const fileName = segments[segments.length - 1] ?? '';
  return (
    fileName.startsWith('.env') ||
    /(?:^|[-_.])(secret|secrets|credential|credentials)(?:[-_.]|$)/u.test(fileName) ||
    /(?:package-lock|pnpm-lock|yarn\.lock|neko\.db(?:-wal|-shm)?)$/u.test(fileName)
  );
}

function selectNonOverlappingScopes(scopes: readonly SemanticSourceRuntimeScope[]): {
  readonly scopes: readonly SemanticSourceRuntimeScope[];
  readonly diagnostics: readonly SemanticSourceDiagnostic[];
} {
  const selected: SemanticSourceRuntimeScope[] = [];
  const diagnostics: SemanticSourceDiagnostic[] = [];
  const identities = new Set<string>();
  for (const scope of [...scopes].sort((left, right) => left.priority - right.priority)) {
    if (identities.has(scope.rootId)) {
      throw new Error(`Duplicate semantic source root identity: ${scope.rootId}`);
    }
    identities.add(scope.rootId);
    const runtimeRoot = normalizeRuntimeRoot(scope.runtimeRoot);
    const owner = selected.find((candidate) => rootsOverlap(candidate.runtimeRoot, runtimeRoot));
    if (owner) {
      diagnostics.push({
        severity: 'warning',
        code: 'semantic-source-root-overlap',
        message: `Semantic root ${scope.rootId} overlaps ${owner.rootId}; ${owner.rootId} owns the files.`,
        metadata: { rootId: scope.rootId, ownerRootId: owner.rootId },
      });
      continue;
    }
    selected.push({ ...scope, runtimeRoot });
  }
  return { scopes: selected, diagnostics };
}

function rootsOverlap(left: string, right: string): boolean {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function normalizeRuntimeRoot(value: string): string {
  const normalized = value.replace(/\\/gu, '/').replace(/\/+$/u, '');
  if (!normalized.startsWith('/')) {
    throw new Error(`Semantic source runtime root must be absolute: ${value}`);
  }
  return normalized || '/';
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/\/+/gu, '/');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error(`Semantic source path must remain root-relative: ${value}`);
  }
  return normalized;
}

function joinPortablePath(root: string, relativePath: string): string {
  return `${root.replace(/\/+$/u, '')}/${relativePath}`;
}

function buildSourceId(rootId: string, relativePath: string): string {
  return `${rootId}:${normalizeRelativePath(relativePath)}`;
}

function diagnosticFromError(
  source: SemanticSourceDescriptor,
  error: unknown,
): SemanticSourceDiagnostic {
  return {
    severity: 'error',
    code:
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string'
        ? error.code
        : 'semantic-source-analysis-failed',
    message: error instanceof Error ? error.message : String(error),
    sourceId: source.sourceId,
    relativePath: source.relativePath,
  };
}
