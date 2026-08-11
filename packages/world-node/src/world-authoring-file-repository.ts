import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import {
  parseWorldProject,
  parseWorldVersion,
  type WorldProject,
  type WorldVersion,
} from '@neko/world/contracts';
import type {
  WorldAuthoringCatalogPort,
  WorldAuthoringCatalogScope,
  WorldAuthoringRepository,
  WorldDurableRecordDiagnostic,
} from '@neko/world/application';

export interface WorldPublicationFilePort {
  readPublication(worldVersionId: string, signal?: AbortSignal): Promise<WorldVersion | undefined>;
}

export interface WorldAuthoringFileRepository
  extends WorldAuthoringRepository, WorldPublicationFilePort, WorldAuthoringCatalogPort {}

export class WorldAuthoringStorageError extends Error {
  constructor(
    readonly code:
      | 'world-workspace-unavailable'
      | 'world-workspace-path-escape'
      | 'world-record-invalid'
      | 'world-record-read-failed'
      | 'world-record-write-failed'
      | 'world-publication-conflict',
    readonly operation: string,
    readonly recordId: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'WorldAuthoringStorageError';
  }
}

export function createWorldAuthoringFileRepository(options: {
  readonly workspaceRoot: string;
  readonly scope: WorldAuthoringCatalogScope;
}): WorldAuthoringFileRepository {
  requireAbsoluteRoot(options.workspaceRoot);
  return {
    readProject: (identity, signal) =>
      readRecord(
        options.workspaceRoot,
        worldProjectPath(identity),
        identity,
        parseWorldProject,
        signal,
      ),
    saveProject: (project, signal) => {
      const canonical = parseWorldProject(project);
      return writeRecord(
        options.workspaceRoot,
        worldProjectPath(canonical.worldProjectId),
        canonical.worldProjectId,
        canonical,
        signal,
      );
    },
    readPublication: (identity, signal) => findPublication(options.workspaceRoot, identity, signal),
    async storePublication(publication, signal) {
      const canonical = parseWorldVersion(publication);
      const path = worldVersionPath(canonical.worldProjectId, canonical.worldVersionId);
      const existing = await readRecord(
        options.workspaceRoot,
        path,
        canonical.worldVersionId,
        parseWorldVersion,
        signal,
      );
      if (existing) {
        if (isDeepStrictEqual(existing, canonical)) return;
        throw new WorldAuthoringStorageError(
          'world-publication-conflict',
          'store-publication',
          canonical.worldVersionId,
          `Immutable WorldVersion '${canonical.worldVersionId}' already exists with different facts.`,
        );
      }
      await writeRecord(options.workspaceRoot, path, canonical.worldVersionId, canonical, signal);
    },
    readAuthoringCatalog: (signal) => readCatalog(options, signal),
  };
}

export function worldProjectPath(worldProjectId: string): string {
  return `neko/worlds/${pathIdentity(worldProjectId)}/project.json`;
}

export function worldVersionPath(worldProjectId: string, worldVersionId: string): string {
  return `neko/worlds/${pathIdentity(worldProjectId)}/publications/${pathIdentity(worldVersionId)}.json`;
}

async function findPublication(
  workspaceRoot: string,
  worldVersionId: string,
  signal?: AbortSignal,
): Promise<WorldVersion | undefined> {
  let found: WorldVersion | undefined;
  for (const projectId of await listDirectories(workspaceRoot, 'neko/worlds')) {
    signal?.throwIfAborted();
    const publication = await readRecord(
      workspaceRoot,
      worldVersionPath(projectId, worldVersionId),
      worldVersionId,
      parseWorldVersion,
      signal,
    );
    if (!publication) continue;
    if (found) {
      throw new WorldAuthoringStorageError(
        'world-record-invalid',
        'read-publication',
        worldVersionId,
        `WorldVersion '${worldVersionId}' exists under multiple WorldProject roots.`,
      );
    }
    found = publication;
  }
  return found;
}

async function readCatalog(
  options: { readonly workspaceRoot: string; readonly scope: WorldAuthoringCatalogScope },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const projects: WorldProject[] = [];
  const versions: WorldVersion[] = [];
  const diagnostics: WorldDurableRecordDiagnostic[] = [];
  for (const projectId of await listDirectories(options.workspaceRoot, 'neko/worlds')) {
    signal?.throwIfAborted();
    await collect(
      readRecord(
        options.workspaceRoot,
        worldProjectPath(projectId),
        projectId,
        parseWorldProject,
        signal,
      ),
      projects,
      diagnostics,
      'world-project',
      projectId,
    );
    for (const file of await listJsonFiles(
      options.workspaceRoot,
      `neko/worlds/${projectId}/publications`,
    )) {
      const identity = file.slice(0, -5);
      await collect(
        readRecord(
          options.workspaceRoot,
          `neko/worlds/${projectId}/publications/${file}`,
          identity,
          parseWorldVersion,
          signal,
        ),
        versions,
        diagnostics,
        'world-version',
        identity,
      );
    }
  }
  return { scope: options.scope, projects, versions, diagnostics };
}

async function collect<T>(
  pending: Promise<T | undefined>,
  records: T[],
  diagnostics: WorldDurableRecordDiagnostic[],
  recordKind: WorldDurableRecordDiagnostic['recordKind'],
  recordId: string,
): Promise<void> {
  try {
    const record = await pending;
    if (record) records.push(record);
  } catch (error) {
    diagnostics.push({
      recordKind,
      recordId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function readRecord<T>(
  workspaceRoot: string,
  relativePath: string,
  recordId: string,
  parse: (value: unknown) => T,
  signal?: AbortSignal,
): Promise<T | undefined> {
  signal?.throwIfAborted();
  const target = await resolveWorkspacePath(workspaceRoot, relativePath, 'read', recordId, false);
  let source: string;
  try {
    source = await readFile(target, 'utf8');
  } catch (cause) {
    if (isErrorCode(cause, 'ENOENT')) return undefined;
    throw storageError('world-record-read-failed', 'read', recordId, cause);
  }
  try {
    return parse(JSON.parse(source));
  } catch (cause) {
    throw storageError('world-record-invalid', 'read', recordId, cause);
  }
}

async function writeRecord(
  workspaceRoot: string,
  relativePath: string,
  recordId: string,
  value: unknown,
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted();
  const target = await resolveWorkspacePath(workspaceRoot, relativePath, 'write', recordId, true);
  const parent = dirname(target);
  const temporary = join(parent, `.${recordId}.${randomUUID()}.tmp`);
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
      await file.sync();
    } finally {
      await file.close();
    }
    signal?.throwIfAborted();
    await rename(temporary, target);
  } catch (cause) {
    await rm(temporary, { force: true });
    if (cause instanceof WorldAuthoringStorageError) throw cause;
    throw storageError('world-record-write-failed', 'write', recordId, cause);
  }
}

async function listDirectories(workspaceRoot: string, relativePath: string): Promise<string[]> {
  const target = await resolveWorkspacePath(
    workspaceRoot,
    relativePath,
    'catalog',
    relativePath,
    false,
  );
  try {
    const entries = await readdir(target, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => entry.name)
      .sort();
  } catch (cause) {
    if (isErrorCode(cause, 'ENOENT')) return [];
    throw storageError('world-record-read-failed', 'catalog', relativePath, cause);
  }
}

async function listJsonFiles(workspaceRoot: string, relativePath: string): Promise<string[]> {
  const target = await resolveWorkspacePath(
    workspaceRoot,
    relativePath,
    'catalog',
    relativePath,
    false,
  );
  try {
    const entries = await readdir(target, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();
  } catch (cause) {
    if (isErrorCode(cause, 'ENOENT')) return [];
    throw storageError('world-record-read-failed', 'catalog', relativePath, cause);
  }
}

async function resolveWorkspacePath(
  workspaceRoot: string,
  relativePath: string,
  operation: string,
  recordId: string,
  createParent: boolean,
): Promise<string> {
  let root: string;
  try {
    root = await realpath(resolve(workspaceRoot));
  } catch (cause) {
    throw storageError('world-workspace-unavailable', operation, recordId, cause);
  }
  const target = resolve(root, relativePath);
  assertContained(root, target, operation, recordId);
  if (createParent) {
    await mkdir(dirname(target), { recursive: true });
    const parent = await realpath(dirname(target));
    assertContained(root, parent, operation, recordId);
  }
  return target;
}

function assertContained(root: string, target: string, operation: string, recordId: string): void {
  const path = relative(root, target);
  if (path !== '' && !path.startsWith('..') && !isAbsolute(path)) return;
  throw new WorldAuthoringStorageError(
    'world-workspace-path-escape',
    operation,
    recordId,
    `World authoring path for '${recordId}' escapes the authorized Workspace root.`,
  );
}

function pathIdentity(identity: string): string {
  if (!/^[A-Za-z0-9._:-]+$/u.test(identity) || identity === '.' || identity === '..') {
    throw new WorldAuthoringStorageError(
      'world-record-invalid',
      'resolve-path',
      identity,
      `World identity '${identity}' is not valid in a Workspace-relative path.`,
    );
  }
  return identity;
}

function requireAbsoluteRoot(root: string): void {
  if (!isAbsolute(root)) {
    throw new WorldAuthoringStorageError(
      'world-workspace-unavailable',
      'construct',
      'workspace',
      'World Workspace root must be an absolute Host-authorized path.',
    );
  }
}

function storageError(
  code: WorldAuthoringStorageError['code'],
  operation: string,
  recordId: string,
  cause: unknown,
): WorldAuthoringStorageError {
  return new WorldAuthoringStorageError(
    code,
    operation,
    recordId,
    `World authoring ${operation} failed for '${recordId}'.`,
    { cause },
  );
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
