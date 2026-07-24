import { lstat, realpath } from 'node:fs/promises';
import * as path from 'node:path';
import { validateWorkspaceLinkedMediaLibraryName } from '../../types/asset/workspace-linked-media-library';

export type WorkspaceLinkedPathGuardDiagnosticCode =
  | 'invalid-workspace-path'
  | 'workspace-path-unavailable'
  | 'library-link-broken'
  | 'library-link-loop'
  | 'library-permission-denied'
  | 'library-entry-not-link'
  | 'unmanaged-symlink'
  | 'nested-link-escape';

export interface WorkspaceLinkedPathGuardDiagnostic {
  readonly code: WorkspaceLinkedPathGuardDiagnosticCode;
  readonly message: string;
  readonly workspacePath?: string;
  readonly libraryName?: string;
}

export type WorkspaceLinkedPathGuardResult =
  | { readonly authorized: true }
  | {
      readonly authorized: false;
      readonly diagnostic: WorkspaceLinkedPathGuardDiagnostic;
    };

export interface WorkspaceLinkedPathGuardFileSystem {
  lstat(filePath: string): Promise<{ isSymbolicLink(): boolean }>;
  realpath(filePath: string): Promise<string>;
}

export interface AuthorizeWorkspaceLinkedPathInput {
  readonly workspaceRoot: string;
  readonly requestedPath: string;
  readonly fs?: WorkspaceLinkedPathGuardFileSystem;
}

const nodeFileSystem: WorkspaceLinkedPathGuardFileSystem = { lstat, realpath };

export async function authorizeWorkspaceLinkedPath(
  input: AuthorizeWorkspaceLinkedPathInput,
): Promise<WorkspaceLinkedPathGuardResult> {
  const fs = input.fs ?? nodeFileSystem;
  if (!path.isAbsolute(input.workspaceRoot) || !path.isAbsolute(input.requestedPath)) {
    return rejected(
      'invalid-workspace-path',
      'Workspace content path must be absolute internally.',
    );
  }

  const workspaceRoot = path.resolve(input.workspaceRoot);
  const requestedPath = path.resolve(input.requestedPath);
  const relative = path.relative(workspaceRoot, requestedPath);
  if (!isContainedRelativePath(relative)) {
    return rejected('invalid-workspace-path', 'Content path is outside the workspace namespace.');
  }

  const segments = relative.split(path.sep).filter(Boolean);
  const libraryName =
    segments[0] === 'neko' && segments[1] === 'assets' && segments.length >= 3
      ? segments[2]
      : undefined;

  try {
    const workspaceRealPath = await fs.realpath(workspaceRoot);
    if (!libraryName) {
      const finalRealPath = await fs.realpath(requestedPath);
      return isPathInsideOrEqual(finalRealPath, workspaceRealPath)
        ? { authorized: true }
        : rejected(
            'unmanaged-symlink',
            'Workspace content path crosses an unmanaged symlink.',
            toWorkspacePath(relative),
          );
    }

    if (validateWorkspaceLinkedMediaLibraryName(libraryName)) {
      return rejected(
        'invalid-workspace-path',
        'Media library path contains an invalid library name.',
        toWorkspacePath(relative),
      );
    }

    const nekoPath = path.join(workspaceRoot, 'neko');
    const assetsPath = path.join(nekoPath, 'assets');
    const linkPath = path.join(assetsPath, libraryName);
    if (
      (await fs.lstat(nekoPath)).isSymbolicLink() ||
      (await fs.lstat(assetsPath)).isSymbolicLink()
    ) {
      return rejected(
        'unmanaged-symlink',
        'Media library namespace crosses an unmanaged symlink.',
        toWorkspacePath(relative),
        libraryName,
      );
    }

    const linkStat = await fs.lstat(linkPath);
    if (!linkStat.isSymbolicLink()) {
      const finalRealPath = await fs.realpath(requestedPath);
      return isPathInsideOrEqual(finalRealPath, workspaceRealPath)
        ? { authorized: true }
        : rejected(
            'library-entry-not-link',
            'Media library workspace entry is not a direct link.',
            toWorkspacePath(relative),
            libraryName,
          );
    }

    const linkTargetRealPath = await fs.realpath(linkPath);
    const finalRealPath = await fs.realpath(requestedPath);
    return isPathInsideOrEqual(finalRealPath, linkTargetRealPath)
      ? { authorized: true }
      : rejected(
          'nested-link-escape',
          'Media library content path escapes its linked library.',
          toWorkspacePath(relative),
          libraryName,
        );
  } catch (error) {
    return rejected(
      diagnosticCodeForError(error, libraryName !== undefined),
      diagnosticMessageForError(error, libraryName !== undefined),
      toWorkspacePath(relative),
      libraryName,
    );
  }
}

function rejected(
  code: WorkspaceLinkedPathGuardDiagnosticCode,
  message: string,
  workspacePath?: string,
  libraryName?: string,
): WorkspaceLinkedPathGuardResult {
  return {
    authorized: false,
    diagnostic: {
      code,
      message,
      ...(workspacePath ? { workspacePath } : {}),
      ...(libraryName ? { libraryName } : {}),
    },
  };
}

function diagnosticCodeForError(
  error: unknown,
  isLibraryPath: boolean,
): WorkspaceLinkedPathGuardDiagnosticCode {
  if (isErrorCode(error, 'EACCES') || isErrorCode(error, 'EPERM')) {
    return 'library-permission-denied';
  }
  if (isErrorCode(error, 'ELOOP')) return 'library-link-loop';
  return isLibraryPath ? 'library-link-broken' : 'workspace-path-unavailable';
}

function diagnosticMessageForError(error: unknown, isLibraryPath: boolean): string {
  if (isErrorCode(error, 'EACCES') || isErrorCode(error, 'EPERM')) {
    return 'Workspace content path cannot be read.';
  }
  if (isErrorCode(error, 'ELOOP')) return 'Media library link contains a loop.';
  return isLibraryPath
    ? 'Media library link or requested content is unavailable.'
    : 'Workspace content path is unavailable.';
}

function isContainedRelativePath(relativePath: string): boolean {
  return (
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  return isContainedRelativePath(
    path.relative(path.resolve(rootPath), path.resolve(candidatePath)),
  );
}

function toWorkspacePath(relativePath: string): string | undefined {
  if (!relativePath) return undefined;
  return relativePath.split(path.sep).join('/');
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
