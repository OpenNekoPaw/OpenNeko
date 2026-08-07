import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH,
  ProjectEntityContractError,
  assertProjectEntityDocument,
  createEmptyProjectEntityDocument,
  decodeProjectEntityDocument,
  encodeProjectEntityDocument,
  type ProjectEntityDiagnostic,
  type ProjectEntityDocument,
  type ProjectEntityDocumentMutation,
  type ProjectEntityDocumentReadResult,
  type ProjectEntityDocumentRepository,
} from '@neko/entity-domain';

export interface NodeProjectEntityRepositoryOptions {
  readonly workspacePath: string;
  readonly projectId: string;
}

export interface ProjectEntityAvailableDocumentReader {
  readonly readAvailable: (signal?: AbortSignal) => Promise<ProjectEntityDocumentReadResult>;
}

export class NodeProjectEntityRepositoryError extends Error {
  readonly diagnostic: ProjectEntityDiagnostic;

  constructor(diagnostic: ProjectEntityDiagnostic, options?: ErrorOptions) {
    super(diagnostic.message, options);
    this.name = 'NodeProjectEntityRepositoryError';
    this.diagnostic = diagnostic;
  }
}

export class NodeProjectEntityRepository implements ProjectEntityDocumentRepository {
  private readonly workspacePath: string;
  private readonly entityPath: string;

  constructor(private readonly options: NodeProjectEntityRepositoryOptions) {
    this.workspacePath = path.resolve(options.workspacePath);
    this.entityPath = resolveProjectEntityDocumentPath(this.workspacePath);
    if (!isStableIdentity(options.projectId)) {
      throw repositoryError(
        'project-entity-path-unauthorized',
        'Project Entity repository requires a stable Project identity.',
      );
    }
  }

  async load(signal?: AbortSignal): Promise<ProjectEntityDocument> {
    const result = await this.readAvailable(signal);
    if (result.diagnostics.length > 0) {
      throw new ProjectEntityContractError(result.diagnostics);
    }
    return result.document;
  }

  async readAvailable(signal?: AbortSignal): Promise<ProjectEntityDocumentReadResult> {
    throwIfAborted(signal);
    await this.authorizeOwnedPath(false);
    let source: string;
    try {
      source = await readFile(this.entityPath, 'utf8');
    } catch (error: unknown) {
      if (hasNodeErrorCode(error, 'ENOENT')) {
        return {
          document: createEmptyProjectEntityDocument(this.options.projectId),
          diagnostics: [],
        };
      }
      throw repositoryError(
        'project-entity-io-failed',
        'Project Entity document could not be read.',
        error,
      );
    }
    throwIfAborted(signal);
    let parsed: unknown;
    try {
      parsed = JSON.parse(source);
    } catch (error: unknown) {
      throw repositoryError(
        'project-entity-io-failed',
        'Project Entity document contains invalid JSON.',
        error,
      );
    }
    const decoded = decodeProjectEntityDocument(parsed);
    if (!decoded.ok) throw new ProjectEntityContractError(decoded.diagnostics);
    if (decoded.document.projectId !== this.options.projectId) {
      return {
        document: createEmptyProjectEntityDocument(this.options.projectId),
        diagnostics: [
          ...decoded.diagnostics,
          {
            code: 'project-entity-owner-mismatch',
            message: `Project Entity document belongs to Project '${decoded.document.projectId}', not current Project '${this.options.projectId}'.`,
          },
        ],
      };
    }
    return { document: decoded.document, diagnostics: decoded.diagnostics };
  }

  mutate(
    mutation: ProjectEntityDocumentMutation,
    signal?: AbortSignal,
  ): Promise<ProjectEntityDocument> {
    return withProjectEntityPathLock(this.entityPath, async () => {
      throwIfAborted(signal);
      const current = await this.load(signal);
      const next = assertProjectEntityDocument(await mutation(current));
      if (next.projectId !== this.options.projectId) {
        throw repositoryError(
          'project-entity-path-unauthorized',
          'Project Entity mutation belongs to another Project identity.',
        );
      }
      if (next === current) return current;
      await this.writeAtomically(next, signal);
      return next;
    });
  }

  private async authorizeOwnedPath(createParent: boolean): Promise<void> {
    try {
      const workspaceRealPath = await realpath(this.workspacePath);
      if (createParent) {
        await mkdir(path.dirname(this.entityPath), { recursive: true });
      }
      let parentRealPath: string;
      try {
        parentRealPath = await realpath(path.dirname(this.entityPath));
      } catch (error: unknown) {
        if (!createParent && hasNodeErrorCode(error, 'ENOENT')) return;
        throw error;
      }
      if (!isInside(parentRealPath, workspaceRealPath)) {
        throw repositoryError(
          'project-entity-path-unauthorized',
          'Project Entity path escapes the authorized Workspace.',
        );
      }
      try {
        const target = await lstat(this.entityPath);
        if (target.isSymbolicLink()) {
          throw repositoryError(
            'project-entity-path-unauthorized',
            'Project Entity document must not be a symbolic link.',
          );
        }
      } catch (error: unknown) {
        if (!hasNodeErrorCode(error, 'ENOENT')) throw error;
      }
    } catch (error: unknown) {
      if (error instanceof NodeProjectEntityRepositoryError) throw error;
      throw repositoryError(
        'project-entity-path-unauthorized',
        'Project Entity path could not be authorized.',
        error,
      );
    }
  }

  private async writeAtomically(
    document: ProjectEntityDocument,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.authorizeOwnedPath(true);
    throwIfAborted(signal);
    const temporaryPath = path.join(path.dirname(this.entityPath), `.entities-${randomUUID()}.tmp`);
    let published = false;
    try {
      const handle = await open(temporaryPath, 'wx');
      try {
        await handle.writeFile(encodeProjectEntityDocument(document), 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      throwIfAborted(signal);
      await rename(temporaryPath, this.entityPath);
      published = true;
    } catch (error: unknown) {
      if (error instanceof NodeProjectEntityRepositoryError) throw error;
      if (error instanceof ProjectEntityContractError) throw error;
      throw repositoryError(
        'project-entity-io-failed',
        'Project Entity document could not be committed atomically.',
        error,
      );
    } finally {
      if (!published) await removeTemporaryFile(temporaryPath);
    }
  }
}

export function resolveProjectEntityDocumentPath(workspacePath: string): string {
  const workspace = path.resolve(workspacePath);
  const target = path.resolve(workspace, ...PROJECT_ENTITY_DOCUMENT_WORKSPACE_PATH.split('/'));
  if (!isInside(target, workspace)) {
    throw repositoryError(
      'project-entity-path-unauthorized',
      'Project Entity document path escapes the authorized Workspace.',
    );
  }
  return target;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw repositoryError(
    'project-entity-operation-cancelled',
    'Project Entity operation was cancelled before commit.',
    signal.reason,
  );
}

async function removeTemporaryFile(temporaryPath: string): Promise<void> {
  try {
    await rm(temporaryPath, { force: true });
  } catch (error: unknown) {
    throw repositoryError(
      'project-entity-io-failed',
      'Project Entity temporary file could not be removed after a failed commit.',
      error,
    );
  }
}

function repositoryError(
  code: ProjectEntityDiagnostic['code'],
  message: string,
  cause?: unknown,
): NodeProjectEntityRepositoryError {
  return new NodeProjectEntityRepositoryError(
    { code, message },
    cause === undefined ? undefined : { cause },
  );
}

function isInside(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function hasNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

function isStableIdentity(value: string): boolean {
  return value.trim().length > 0 && value.length <= 256 && !/[\\/\0]/u.test(value);
}

const projectEntityPathLocks = new Map<string, Promise<void>>();

async function withProjectEntityPathLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = projectEntityPathLocks.get(key) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.catch(() => undefined).then(() => gate);
  projectEntityPathLocks.set(key, next);
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release?.();
    if (projectEntityPathLocks.get(key) === next) projectEntityPathLocks.delete(key);
  }
}
