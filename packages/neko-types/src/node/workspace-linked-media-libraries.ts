import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import type { Dirent } from 'node:fs';
import { access, lstat, mkdir, readdir, rename, rm, stat, symlink } from 'node:fs/promises';
import * as path from 'node:path';
import {
  WORKSPACE_MEDIA_LIBRARY_DIRECTORY,
  assertWorkspaceLinkedMediaLibraryName,
  workspaceLinkedMediaLibraryPath,
  type CreateWorkspaceLinkedMediaLibraryInput,
  type RemoveWorkspaceLinkedMediaLibraryInput,
  type ReplaceWorkspaceLinkedMediaLibraryInput,
  type WorkspaceLinkedMediaLibrary,
  type WorkspaceLinkedMediaLibraryDiagnostic,
  type WorkspaceLinkedMediaLibraryMutationResult,
} from '../types';
import { ensureWorkspaceLinkedMediaLibraryGitExclude } from '../local-metadata/node-workspace-git-hygiene';

export class WorkspaceLinkedMediaLibraryError extends Error {
  constructor(readonly diagnostic: WorkspaceLinkedMediaLibraryDiagnostic) {
    super(diagnostic.message);
    this.name = 'WorkspaceLinkedMediaLibraryError';
  }
}

export async function createWorkspaceLinkedMediaLibrary(
  input: CreateWorkspaceLinkedMediaLibraryInput,
): Promise<WorkspaceLinkedMediaLibraryMutationResult> {
  return mutateWorkspaceLinkedMediaLibrary(input, 'create');
}

export async function replaceWorkspaceLinkedMediaLibrary(
  input: ReplaceWorkspaceLinkedMediaLibraryInput,
): Promise<WorkspaceLinkedMediaLibraryMutationResult> {
  return mutateWorkspaceLinkedMediaLibrary(input, 'replace');
}

export async function removeWorkspaceLinkedMediaLibrary(
  input: RemoveWorkspaceLinkedMediaLibraryInput,
): Promise<void> {
  assertWorkspaceLinkedMediaLibraryName(input.name);
  const linkPath = absoluteLibraryLinkPath(input.workspaceRoot, input.name);
  const entry = await readLinkStat(linkPath, input.name);
  if (!entry.isSymbolicLink()) {
    throw libraryError(
      'library-entry-not-link',
      input.name,
      'Media library removal refused because the workspace entry is not a link.',
    );
  }
  try {
    await rm(linkPath);
  } catch {
    throw libraryError(
      'library-link-operation-failed',
      input.name,
      'Media library link could not be removed.',
    );
  }
}

export async function listWorkspaceLinkedMediaLibraries(
  workspaceRoot: string,
): Promise<readonly WorkspaceLinkedMediaLibrary[]> {
  const assetsDirectory = path.join(workspaceRoot, ...WORKSPACE_MEDIA_LIBRARY_DIRECTORY.split('/'));
  let entries: Dirent[];
  try {
    entries = await readdir(assetsDirectory, { withFileTypes: true });
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return [];
    throw new WorkspaceLinkedMediaLibraryError({
      code: isErrorCode(error, 'EACCES')
        ? 'library-permission-denied'
        : 'library-link-operation-failed',
      severity: 'error',
      message: 'Media library links could not be enumerated.',
      workspacePath: WORKSPACE_MEDIA_LIBRARY_DIRECTORY,
    });
  }

  const libraries: WorkspaceLinkedMediaLibrary[] = [];
  for (const entry of entries) {
    if (!entry.isSymbolicLink()) continue;
    try {
      assertWorkspaceLinkedMediaLibraryName(entry.name);
    } catch {
      continue;
    }
    libraries.push(await inspectWorkspaceLinkedMediaLibrary(workspaceRoot, entry.name));
  }
  return libraries.sort((left, right) => left.name.localeCompare(right.name));
}

export async function inspectWorkspaceLinkedMediaLibrary(
  workspaceRoot: string,
  name: string,
): Promise<WorkspaceLinkedMediaLibrary> {
  assertWorkspaceLinkedMediaLibraryName(name);
  const workspacePath = workspaceLinkedMediaLibraryPath(name);
  const linkPath = absoluteLibraryLinkPath(workspaceRoot, name);
  try {
    const entry = await lstat(linkPath);
    if (!entry.isSymbolicLink()) {
      return unavailableLibrary(
        name,
        workspacePath,
        'library-entry-not-link',
        'Media library workspace entry is not a direct link.',
      );
    }
    const target = await stat(linkPath);
    if (!target.isDirectory()) {
      return unavailableLibrary(
        name,
        workspacePath,
        'library-target-not-directory',
        'Media library link target is not a directory.',
      );
    }
    await access(linkPath, constants.R_OK);
    return { name, workspacePath, availability: 'available' };
  } catch (error) {
    const diagnostic = unavailableDiagnosticForError(error, name, workspacePath);
    return { name, workspacePath, availability: 'unavailable', diagnostic };
  }
}

async function mutateWorkspaceLinkedMediaLibrary(
  input: CreateWorkspaceLinkedMediaLibraryInput,
  mode: 'create' | 'replace',
): Promise<WorkspaceLinkedMediaLibraryMutationResult> {
  assertWorkspaceLinkedMediaLibraryName(input.name);
  await assertReadableTargetDirectory(input.targetDirectory, input.name);
  await ensureWorkspaceLinkedMediaLibraryGitExclude({
    workDir: input.workspaceRoot,
    libraryName: input.name,
  });

  const assetsDirectory = path.join(
    input.workspaceRoot,
    ...WORKSPACE_MEDIA_LIBRARY_DIRECTORY.split('/'),
  );
  await mkdir(assetsDirectory, { recursive: true });
  await assertNoCaseConflict(assetsDirectory, input.name, mode === 'replace');

  const linkPath = absoluteLibraryLinkPath(input.workspaceRoot, input.name);
  const temporaryPath = path.join(assetsDirectory, `.neko-link-${randomUUID()}`);
  const backupPath = path.join(assetsDirectory, `.neko-link-backup-${randomUUID()}`);
  let backupCreated = false;

  try {
    const existing = await optionalLstat(linkPath);
    if (mode === 'create' && existing) {
      throw libraryError(
        'library-name-conflict',
        input.name,
        'A workspace entry already uses this media library name.',
      );
    }
    if (mode === 'replace' && (!existing || !existing.isSymbolicLink())) {
      throw libraryError(
        existing ? 'library-entry-not-link' : 'library-link-broken',
        input.name,
        existing
          ? 'Media library relink refused because the workspace entry is not a link.'
          : 'Media library relink requires an existing direct link.',
      );
    }

    await symlink(
      input.targetDirectory,
      temporaryPath,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    if (mode === 'replace' && process.platform === 'win32') {
      await rename(linkPath, backupPath);
      backupCreated = true;
    }
    await rename(temporaryPath, linkPath);
    if (backupCreated) {
      await rm(backupPath);
      backupCreated = false;
    }
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    if (backupCreated) {
      await rename(backupPath, linkPath).catch(() => undefined);
    }
    if (error instanceof WorkspaceLinkedMediaLibraryError) throw error;
    throw libraryError(
      'library-link-operation-failed',
      input.name,
      mode === 'create'
        ? 'Media library link could not be created.'
        : 'Media library link could not be replaced.',
    );
  }

  return { library: await inspectWorkspaceLinkedMediaLibrary(input.workspaceRoot, input.name) };
}

async function assertReadableTargetDirectory(targetDirectory: string, name: string): Promise<void> {
  if (!path.isAbsolute(targetDirectory)) {
    throw libraryError(
      'library-target-unavailable',
      name,
      'Media library target must be an accessible local directory.',
    );
  }
  try {
    const result = await stat(targetDirectory);
    if (!result.isDirectory()) {
      throw libraryError(
        'library-target-not-directory',
        name,
        'Media library target is not a directory.',
      );
    }
    await access(targetDirectory, constants.R_OK);
  } catch (error) {
    if (error instanceof WorkspaceLinkedMediaLibraryError) throw error;
    throw libraryError(
      isErrorCode(error, 'EACCES') ? 'library-permission-denied' : 'library-target-unavailable',
      name,
      isErrorCode(error, 'EACCES')
        ? 'Media library target cannot be read.'
        : 'Media library target is unavailable.',
    );
  }
}

async function assertNoCaseConflict(
  assetsDirectory: string,
  name: string,
  allowExact: boolean,
): Promise<void> {
  const names = await readdir(assetsDirectory);
  const lower = name.toLocaleLowerCase('en-US');
  const conflict = names.find(
    (candidate) =>
      candidate.toLocaleLowerCase('en-US') === lower && (!allowExact || candidate !== name),
  );
  if (conflict) {
    throw libraryError(
      'library-name-conflict',
      name,
      'A workspace entry already uses this media library name.',
    );
  }
}

function absoluteLibraryLinkPath(workspaceRoot: string, name: string): string {
  return path.join(workspaceRoot, ...workspaceLinkedMediaLibraryPath(name).split('/'));
}

async function readLinkStat(linkPath: string, name: string) {
  try {
    return await lstat(linkPath);
  } catch {
    throw libraryError('library-link-broken', name, 'Media library link is missing.');
  }
}

async function optionalLstat(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) return undefined;
    throw error;
  }
}

function unavailableLibrary(
  name: string,
  workspacePath: string,
  code: WorkspaceLinkedMediaLibraryDiagnostic['code'],
  message: string,
): WorkspaceLinkedMediaLibrary {
  return {
    name,
    workspacePath,
    availability: 'unavailable',
    diagnostic: { code, severity: 'error', message, libraryName: name, workspacePath },
  };
}

function unavailableDiagnosticForError(
  error: unknown,
  libraryName: string,
  workspacePath: string,
): WorkspaceLinkedMediaLibraryDiagnostic {
  const code = isErrorCode(error, 'EACCES')
    ? 'library-permission-denied'
    : isErrorCode(error, 'ELOOP')
      ? 'library-link-loop'
      : 'library-link-broken';
  const message =
    code === 'library-permission-denied'
      ? 'Media library link cannot be read.'
      : code === 'library-link-loop'
        ? 'Media library link contains a loop.'
        : 'Media library link target is unavailable.';
  return { code, severity: 'error', message, libraryName, workspacePath };
}

function libraryError(
  code: WorkspaceLinkedMediaLibraryDiagnostic['code'],
  libraryName: string,
  message: string,
): WorkspaceLinkedMediaLibraryError {
  return new WorkspaceLinkedMediaLibraryError({
    code,
    severity: 'error',
    message,
    libraryName,
    workspacePath: workspaceLinkedMediaLibraryPath(libraryName),
  });
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
