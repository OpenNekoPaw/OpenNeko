import { realpath } from 'node:fs/promises';
import * as path from 'node:path';

export type WorkspacePathGuardDiagnosticCode =
  | 'invalid-workspace-path'
  | 'workspace-path-unavailable'
  | 'retired-linked-media-path'
  | 'unmanaged-symlink';

export interface WorkspacePathGuardDiagnostic {
  readonly code: WorkspacePathGuardDiagnosticCode;
  readonly message: string;
  readonly workspacePath?: string;
}

export type WorkspacePathGuardResult =
  | { readonly authorized: true }
  | {
      readonly authorized: false;
      readonly diagnostic: WorkspacePathGuardDiagnostic;
    };

export interface WorkspacePathGuardFileSystem {
  realpath(filePath: string): Promise<string>;
}

export interface AuthorizeWorkspacePathInput {
  readonly workspaceRoot: string;
  readonly requestedPath: string;
  readonly fs?: WorkspacePathGuardFileSystem;
}

const nodeFileSystem: WorkspacePathGuardFileSystem = { realpath };

export async function authorizeWorkspaceContainedPath(
  input: AuthorizeWorkspacePathInput,
): Promise<WorkspacePathGuardResult> {
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

  const workspacePath = toWorkspacePath(relative);
  if (workspacePath === 'neko/assets' || workspacePath?.startsWith('neko/assets/')) {
    return rejected(
      'retired-linked-media-path',
      'The retired linked Media Library workspace path is not a readable content source.',
      workspacePath,
    );
  }
  if (workspacePath === '.neko' || workspacePath?.startsWith('.neko/')) {
    return rejected(
      'invalid-workspace-path',
      'Project-local state is not a Workspace content source.',
      workspacePath,
    );
  }

  try {
    const workspaceRealPath = await fs.realpath(workspaceRoot);
    const finalRealPath = await fs.realpath(requestedPath);
    return isPathInsideOrEqual(finalRealPath, workspaceRealPath)
      ? { authorized: true }
      : rejected(
          'unmanaged-symlink',
          'Workspace content path crosses an unmanaged symlink.',
          workspacePath,
        );
  } catch (error) {
    return rejected(
      'workspace-path-unavailable',
      isPermissionError(error)
        ? 'Workspace content path cannot be read.'
        : 'Workspace content path is unavailable.',
      workspacePath,
    );
  }
}

function rejected(
  code: WorkspacePathGuardDiagnosticCode,
  message: string,
  workspacePath?: string,
): WorkspacePathGuardResult {
  return {
    authorized: false,
    diagnostic: {
      code,
      message,
      ...(workspacePath ? { workspacePath } : {}),
    },
  };
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

function isPermissionError(error: unknown): boolean {
  return isErrorCode(error, 'EACCES') || isErrorCode(error, 'EPERM');
}

function isErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === code
  );
}
