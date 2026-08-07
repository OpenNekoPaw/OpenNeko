import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createNodeDocumentAccessService } from '@neko/content/document/node';
import type { IDocumentAccessService } from '@neko/content/document';
import {
  SemanticSourceCoordinator,
  TextEntityAnalyzer,
  extractSemanticDocument,
  extractSemanticText,
  isExcludedSemanticPath,
  semanticFormat,
  type SemanticEntitySnapshot,
  type SemanticSourceFileObservation,
} from '@neko/search-domain';
import type { NodeWorkspaceSemanticEntityMetadataBinding } from './node-workspace-semantic-entity-metadata-binding';

const MAX_SEMANTIC_SOURCE_FILES = 5_000;

export interface NodeWorkspaceSemanticEntityRuntime {
  refresh(): Promise<{
    readonly processed: number;
    readonly skipped: number;
    readonly deleted: number;
    readonly diagnosticCount: number;
  }>;
  dispose(): void;
}

export async function createNodeWorkspaceSemanticEntityRuntime(options: {
  readonly workspace: {
    readonly workspaceId: string;
    readonly workspacePath: string;
  };
  readonly projection: NodeWorkspaceSemanticEntityMetadataBinding;
  readonly getEntitySnapshot: () => Promise<SemanticEntitySnapshot>;
  readonly documentAccess?: IDocumentAccessService;
  readonly now?: () => string;
}): Promise<NodeWorkspaceSemanticEntityRuntime> {
  if (options.projection.workspaceId !== options.workspace.workspaceId) {
    throw new Error('Semantic Entity projection Workspace identity does not match its runtime.');
  }
  const root = await realpath(options.workspace.workspacePath);
  const discovery = new NodeWorkspaceSemanticSourceDiscovery(root);
  const documentAccess = options.documentAccess ?? createNodeDocumentAccessService();
  const coordinator = new SemanticSourceCoordinator(
    {
      discovery,
      projection: options.projection,
      getEntitySnapshot: options.getEntitySnapshot,
      extractText: ({ source, content, signal }) =>
        extractSemanticText({ source, content, signal }),
      extractDocument: async ({ source, file, signal }) =>
        (
          await extractSemanticDocument({
            source,
            runtimePath: file.runtimePath,
            documentAccess,
            signal,
          })
        ).segments,
      ...(options.now ? { now: options.now } : {}),
    },
    new TextEntityAnalyzer(),
  );
  coordinator.setScopes([
    {
      workspaceId: options.workspace.workspaceId,
      rootId: 'workspace',
      rootKind: 'workspace',
      portableRoot: '${WORKSPACE}',
      runtimeRoot: root,
      analysisMode: 'discover-candidates',
      priority: 0,
    },
  ]);
  return {
    async refresh() {
      let processed = 0;
      let skipped = 0;
      let deleted = 0;
      let diagnosticCount = 0;
      while (true) {
        const result = await coordinator.reconcile('workspace');
        processed += result.processed;
        skipped += result.skipped;
        deleted += result.deleted;
        diagnosticCount += result.diagnostics.length;
        if (!result.continuation) break;
      }
      return { processed, skipped, deleted, diagnosticCount };
    },
    dispose: () => coordinator.dispose(),
  };
}

class NodeWorkspaceSemanticSourceDiscovery {
  private reconciliationPaths: readonly string[] | undefined;

  constructor(private readonly root: string) {}

  async listFiles(input: {
    readonly continuation?: string;
    readonly limit: number;
    readonly signal: AbortSignal;
  }) {
    const paths =
      input.continuation === undefined
        ? await listSemanticFiles(this.root, input.signal)
        : this.requireReconciliationPaths();
    this.reconciliationPaths = paths;
    const start = parseContinuation(input.continuation, paths.length);
    const selected = paths.slice(start, start + input.limit);
    const files = await Promise.all(
      selected.map((relativePath) => this.observeRequired(relativePath, input.signal)),
    );
    const next = start + selected.length;
    if (next >= paths.length) this.reconciliationPaths = undefined;
    return {
      files,
      ...(next < paths.length ? { continuation: String(next) } : {}),
    };
  }

  private requireReconciliationPaths(): readonly string[] {
    if (!this.reconciliationPaths) {
      throw new Error('Semantic source continuation has no active reconciliation snapshot.');
    }
    return this.reconciliationPaths;
  }

  async observeFile(_scope: unknown, relativePath: string) {
    return this.observe(relativePath);
  }

  async readFile(file: SemanticSourceFileObservation, signal: AbortSignal): Promise<Uint8Array> {
    const resolved = await resolveContainedFile(this.root, file.relativePath);
    return new Uint8Array(await readFile(resolved, { signal }));
  }

  async readFingerprint(file: SemanticSourceFileObservation): Promise<string | null> {
    try {
      return await fingerprintFile(await resolveContainedFile(this.root, file.relativePath));
    } catch (error: unknown) {
      if (isMissingPath(error)) return null;
      throw error;
    }
  }

  private async observeRequired(
    relativePath: string,
    signal: AbortSignal,
  ): Promise<SemanticSourceFileObservation> {
    if (signal.aborted) throw new Error('Semantic source discovery was cancelled.');
    const observation = await this.observe(relativePath);
    if (!observation) {
      throw new Error(`Semantic source '${relativePath}' changed during discovery.`);
    }
    return observation;
  }

  private async observe(relativePath: string): Promise<SemanticSourceFileObservation | null> {
    try {
      const runtimePath = await resolveContainedFile(this.root, relativePath);
      const metadata = await stat(runtimePath);
      return {
        relativePath: normalizeRelativePath(relativePath),
        runtimePath,
        sizeBytes: metadata.size,
        modifiedAtMs: metadata.mtimeMs,
        fingerprint: await fingerprintFile(runtimePath),
      };
    } catch (error: unknown) {
      if (isMissingPath(error)) return null;
      throw error;
    }
  }
}

async function listSemanticFiles(root: string, signal: AbortSignal): Promise<readonly string[]> {
  const files: string[] = [];
  const pending = [''];
  while (pending.length > 0) {
    if (signal.aborted) throw new Error('Semantic source discovery was cancelled.');
    const relativeDirectory = pending.pop();
    if (relativeDirectory === undefined) break;
    const absoluteDirectory = relativeDirectory
      ? path.join(root, ...relativeDirectory.split('/'))
      : root;
    const entries = await readdir(absoluteDirectory, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const relativePath = normalizeRelativePath(
        relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name,
      );
      if (isExcludedSemanticPath(relativePath) || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        pending.push(relativePath);
        continue;
      }
      if (!entry.isFile() || !semanticFormat(relativePath)) continue;
      files.push(relativePath);
      if (files.length > MAX_SEMANTIC_SOURCE_FILES) {
        throw new Error(
          `Semantic source discovery exceeds ${MAX_SEMANTIC_SOURCE_FILES} eligible files.`,
        );
      }
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

async function resolveContainedFile(root: string, relativePath: string): Promise<string> {
  const normalized = normalizeRelativePath(relativePath);
  const candidate = path.resolve(root, ...normalized.split('/'));
  const relative = path.relative(root, candidate);
  if (
    !relative ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error('Semantic source path escapes its authorized Workspace.');
  }
  const metadata = await lstat(candidate);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error('Semantic source must be a regular Workspace file.');
  }
  const physical = await realpath(candidate);
  const physicalRelative = path.relative(root, physical);
  if (
    physicalRelative === '..' ||
    physicalRelative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(physicalRelative)
  ) {
    throw new Error('Semantic source real path escapes its authorized Workspace.');
  }
  return physical;
}

async function fingerprintFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return `sha256:${hash.digest('hex')}`;
}

function normalizeRelativePath(value: string): string {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) {
    throw new Error('Semantic source requires a normalized Workspace-relative path.');
  }
  return normalized;
}

function parseContinuation(value: string | undefined, length: number): number {
  if (value === undefined) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > length) {
    throw new Error('Semantic source continuation is invalid.');
  }
  return parsed;
}

function isMissingPath(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}
