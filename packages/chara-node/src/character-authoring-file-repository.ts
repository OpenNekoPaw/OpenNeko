import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { mkdir, open, readFile, readdir, realpath, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  parseCharacterAuthoringTestSnapshot,
  parseCharacterProject,
  parseCharacterVersion,
  type CharacterAuthoringTestSnapshot,
  type CharacterProject,
  type CharacterVersion,
} from '@neko/chara/contracts';
import type {
  CharacterAuthoringCatalogPort,
  CharacterAuthoringCatalogScope,
  CharacterAuthoringRepository,
  CharacterDurableRecordDiagnostic,
} from '@neko/chara/application';

export interface CharacterPublicationFilePort {
  readPublication(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
}

export interface CharacterAuthoringFileRepository
  extends
    CharacterAuthoringRepository,
    CharacterPublicationFilePort,
    CharacterAuthoringCatalogPort {}

export class CharacterAuthoringStorageError extends Error {
  constructor(
    readonly code:
      | 'character-workspace-unavailable'
      | 'character-workspace-path-escape'
      | 'character-record-invalid'
      | 'character-record-read-failed'
      | 'character-record-write-failed'
      | 'character-publication-conflict',
    readonly operation: string,
    readonly recordId: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CharacterAuthoringStorageError';
  }
}

export function createCharacterAuthoringFileRepository(options: {
  readonly workspaceRoot: string;
  readonly scope: CharacterAuthoringCatalogScope;
}): CharacterAuthoringFileRepository {
  requireAbsoluteRoot(options.workspaceRoot);
  return {
    readProject: (identity, signal) =>
      readRecord(
        options.workspaceRoot,
        characterProjectPath(identity),
        identity,
        parseCharacterProject,
        signal,
      ),
    saveProject: (project, signal) => {
      const canonical = parseCharacterProject(project);
      return writeRecord(
        options.workspaceRoot,
        characterProjectPath(canonical.characterProjectId),
        canonical.characterProjectId,
        canonical,
        signal,
      );
    },
    readPublication: (identity, signal) => findPublication(options.workspaceRoot, identity, signal),
    async storePublication(publication, signal) {
      const canonical = parseCharacterVersion(publication);
      const existing = await readRecord(
        options.workspaceRoot,
        characterVersionPath(canonical.characterProjectId, canonical.characterVersionId),
        canonical.characterVersionId,
        parseCharacterVersion,
        signal,
      );
      if (existing) {
        if (isDeepStrictEqual(existing, canonical)) return;
        throw new CharacterAuthoringStorageError(
          'character-publication-conflict',
          'store-publication',
          canonical.characterVersionId,
          `Immutable CharacterVersion '${canonical.characterVersionId}' already exists with different facts.`,
        );
      }
      await writeRecord(
        options.workspaceRoot,
        characterVersionPath(canonical.characterProjectId, canonical.characterVersionId),
        canonical.characterVersionId,
        canonical,
        signal,
      );
    },
    async saveAuthoringTestSnapshot(snapshot, signal) {
      const canonical = parseCharacterAuthoringTestSnapshot(snapshot);
      const path = characterAuthoringTestPath(
        canonical.characterProjectId,
        canonical.authoringTestSnapshotId,
      );
      const existing = await readRecord(
        options.workspaceRoot,
        path,
        canonical.authoringTestSnapshotId,
        parseCharacterAuthoringTestSnapshot,
        signal,
      );
      if (existing && !isDeepStrictEqual(existing, canonical)) {
        throw new CharacterAuthoringStorageError(
          'character-publication-conflict',
          'save-authoring-test',
          canonical.authoringTestSnapshotId,
          `Immutable Character authoring test '${canonical.authoringTestSnapshotId}' already exists with different facts.`,
        );
      }
      if (!existing) {
        await writeRecord(
          options.workspaceRoot,
          path,
          canonical.authoringTestSnapshotId,
          canonical,
          signal,
        );
      }
    },
    readAuthoringCatalog: (signal) => readCatalog(options, signal),
  };
}

export function characterProjectPath(characterProjectId: string): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/project.json`;
}

export function characterVersionPath(
  characterProjectId: string,
  characterVersionId: string,
): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/versions/${pathIdentity(characterVersionId)}.json`;
}

export function characterAuthoringTestPath(
  characterProjectId: string,
  authoringTestSnapshotId: string,
): string {
  return `neko/characters/${pathIdentity(characterProjectId)}/authoring-tests/${pathIdentity(authoringTestSnapshotId)}.json`;
}

async function findPublication(
  workspaceRoot: string,
  characterVersionId: string,
  signal?: AbortSignal,
): Promise<CharacterVersion | undefined> {
  let found: CharacterVersion | undefined;
  for (const projectId of await listDirectories(workspaceRoot, 'neko/characters')) {
    signal?.throwIfAborted();
    const publication = await readRecord(
      workspaceRoot,
      characterVersionPath(projectId, characterVersionId),
      characterVersionId,
      parseCharacterVersion,
      signal,
    );
    if (!publication) continue;
    if (found) {
      throw new CharacterAuthoringStorageError(
        'character-record-invalid',
        'read-publication',
        characterVersionId,
        `CharacterVersion '${characterVersionId}' exists under multiple CharacterProject roots.`,
      );
    }
    found = publication;
  }
  return found;
}

async function readCatalog(
  options: { readonly workspaceRoot: string; readonly scope: CharacterAuthoringCatalogScope },
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const projects: CharacterProject[] = [];
  const versions: CharacterVersion[] = [];
  const authoringTestSnapshots: CharacterAuthoringTestSnapshot[] = [];
  const diagnostics: CharacterDurableRecordDiagnostic[] = [];
  for (const projectId of await listDirectories(options.workspaceRoot, 'neko/characters')) {
    signal?.throwIfAborted();
    await collect(
      readRecord(
        options.workspaceRoot,
        `neko/characters/${projectId}/project.json`,
        projectId,
        parseCharacterProject,
        signal,
      ),
      projects,
      diagnostics,
      'character-project',
      projectId,
    );
    for (const file of await listJsonFiles(
      options.workspaceRoot,
      `neko/characters/${projectId}/versions`,
    )) {
      const identity = file.slice(0, -5);
      await collect(
        readRecord(
          options.workspaceRoot,
          `neko/characters/${projectId}/versions/${file}`,
          identity,
          parseCharacterVersion,
          signal,
        ),
        versions,
        diagnostics,
        'character-version',
        identity,
      );
    }
    for (const file of await listJsonFiles(
      options.workspaceRoot,
      `neko/characters/${projectId}/authoring-tests`,
    )) {
      const identity = file.slice(0, -5);
      await collect(
        readRecord(
          options.workspaceRoot,
          `neko/characters/${projectId}/authoring-tests/${file}`,
          identity,
          parseCharacterAuthoringTestSnapshot,
          signal,
        ),
        authoringTestSnapshots,
        diagnostics,
        'authoring-test-snapshot',
        identity,
      );
    }
  }
  return { scope: options.scope, projects, versions, authoringTestSnapshots, diagnostics };
}

async function collect<T>(
  pending: Promise<T | undefined>,
  records: T[],
  diagnostics: CharacterDurableRecordDiagnostic[],
  recordKind: CharacterDurableRecordDiagnostic['recordKind'],
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
    throw storageError('character-record-read-failed', 'read', recordId, cause);
  }
  try {
    return parse(JSON.parse(source));
  } catch (cause) {
    throw storageError('character-record-invalid', 'read', recordId, cause);
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
    if (cause instanceof CharacterAuthoringStorageError) throw cause;
    throw storageError('character-record-write-failed', 'write', recordId, cause);
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
    throw storageError('character-record-read-failed', 'catalog', relativePath, cause);
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
    throw storageError('character-record-read-failed', 'catalog', relativePath, cause);
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
    throw storageError('character-workspace-unavailable', operation, recordId, cause);
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
  throw new CharacterAuthoringStorageError(
    'character-workspace-path-escape',
    operation,
    recordId,
    `Character authoring path for '${recordId}' escapes the authorized Workspace root.`,
  );
}

function pathIdentity(identity: string): string {
  if (!/^[A-Za-z0-9._:-]+$/u.test(identity) || identity === '.' || identity === '..') {
    throw new CharacterAuthoringStorageError(
      'character-record-invalid',
      'resolve-path',
      identity,
      `Character identity '${identity}' is not valid in a Workspace-relative path.`,
    );
  }
  return identity;
}

function requireAbsoluteRoot(root: string): void {
  if (!isAbsolute(root)) {
    throw new CharacterAuthoringStorageError(
      'character-workspace-unavailable',
      'construct',
      'workspace',
      'Character Workspace root must be an absolute Host-authorized path.',
    );
  }
}

function storageError(
  code: CharacterAuthoringStorageError['code'],
  operation: string,
  recordId: string,
  cause: unknown,
): CharacterAuthoringStorageError {
  return new CharacterAuthoringStorageError(
    code,
    operation,
    recordId,
    `Character authoring ${operation} failed for '${recordId}'.`,
    { cause },
  );
}

function isErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
