import * as path from 'node:path';
import type { WorkspaceFileContentLocator } from '@neko/content';
import {
  shouldIgnoreWorkspaceFile,
  type WorkspaceFileIgnoreRules,
} from '../../input/workspace-ignore';
import { isForbiddenUnmanagedPath } from './path-access-core';

export type FileAccessKind = 'read' | 'write' | 'list' | 'cwd';

export type ProtectedProjectDocumentOwner = 'canvas' | 'cut';

export interface CoreFileAccessPolicy {
  authorize(filePath: string, accessKind: FileAccessKind): CoreFileAccessDecision;
}

export type CoreFileAccessDecision =
  | {
      readonly allowed: true;
      readonly hostPath: string;
      readonly workspacePath: string;
      readonly contentLocator?: WorkspaceFileContentLocator;
    }
  | {
      readonly allowed: false;
      readonly path: string;
      readonly displayPath: string;
      readonly reason: CoreFileAccessDenialReason;
      readonly rule?: string;
      readonly protectedProjectOwner?: ProtectedProjectDocumentOwner;
    };

export type CoreFileAccessDenialReason =
  | 'missing-authorized-root'
  | 'invalid-workspace-relative-path'
  | 'forbidden-unmanaged-path'
  | 'outside-authorized-roots'
  | 'ignored-workspace-path'
  | 'protected-project-document';

export interface WorkspaceFileAccessPolicyOptions {
  readonly workspaceRoot: string;
  readonly ignoreRules?: WorkspaceFileIgnoreRules;
}

export function createWorkspaceFileAccessPolicy(
  options: WorkspaceFileAccessPolicyOptions,
): CoreFileAccessPolicy {
  return new WorkspaceFileAccessPolicy(options);
}

export function createNoWorkspaceFileAccessPolicy(): CoreFileAccessPolicy {
  return new NoWorkspaceFileAccessPolicy();
}

class WorkspaceFileAccessPolicy implements CoreFileAccessPolicy {
  private readonly workspaceRoot: string;
  private readonly workspaceSyntax: PathSyntax;
  private readonly ignoreRules: WorkspaceFileIgnoreRules;

  constructor(options: WorkspaceFileAccessPolicyOptions) {
    const normalizedRoot = normalizeAbsoluteWorkspaceRoot(options.workspaceRoot);
    this.workspaceRoot = normalizedRoot.path;
    this.workspaceSyntax = normalizedRoot.syntax;
    this.ignoreRules = options.ignoreRules ?? {};
  }

  authorize(filePath: string, accessKind: FileAccessKind): CoreFileAccessDecision {
    if (filePath.includes('\0')) {
      return denial(filePath, undefined, 'invalid-workspace-relative-path');
    }

    const absoluteInput = isAbsolutePathInput(filePath);
    let resolved: string;
    if (absoluteInput) {
      const normalized = normalizeAbsolutePath(filePath);
      if (normalized.syntax !== this.workspaceSyntax) {
        return denial(filePath, undefined, 'outside-authorized-roots');
      }
      resolved = normalized.path;
    } else {
      const validation = validateRelativeModelPath(filePath);
      if (validation !== undefined) {
        return denial(filePath, undefined, validation);
      }
      resolved = resolveRelativeAgainstRoot(filePath, this.workspaceRoot, this.workspaceSyntax);
    }

    const rootDecision = authorizeNormalizedPath(
      resolved,
      this.workspaceRoot,
      this.workspaceSyntax,
    );
    if (rootDecision.reason === 'forbidden-unmanaged-path') {
      return denial(
        filePath,
        resolved,
        'forbidden-unmanaged-path',
        this.workspaceRoot,
        this.workspaceSyntax,
      );
    }
    if (rootDecision.reason === 'outside-authorized-roots') {
      return denial(
        filePath,
        resolved,
        'outside-authorized-roots',
        this.workspaceRoot,
        this.workspaceSyntax,
      );
    }

    const relativePath = toWorkspaceRelativePath(
      resolved,
      this.workspaceRoot,
      this.workspaceSyntax,
    );
    if (relativePath === undefined) {
      return denial(
        filePath,
        resolved,
        'outside-authorized-roots',
        this.workspaceRoot,
        this.workspaceSyntax,
      );
    }

    if (relativePath !== '.') {
      const ignoreDecision = shouldIgnoreWorkspaceFile(relativePath, this.ignoreRules);
      if (ignoreDecision.ignored) {
        return {
          allowed: false,
          path: resolved,
          displayPath: relativePath,
          reason: 'ignored-workspace-path',
          ...(ignoreDecision.reason === 'gitignore' && ignoreDecision.rule
            ? { rule: ignoreDecision.rule }
            : {}),
        };
      }
      const protectedProjectOwner = protectedProjectOwnerForPath(relativePath);
      if (accessKind !== 'list' && protectedProjectOwner) {
        return {
          allowed: false,
          path: resolved,
          displayPath: relativePath,
          reason: 'protected-project-document',
          protectedProjectOwner,
        };
      }
    }

    return {
      allowed: true,
      hostPath: resolved,
      workspacePath: relativePath,
      ...(relativePath === '.'
        ? {}
        : {
            contentLocator: {
              kind: 'workspace-file' as const,
              path: relativePath,
            },
          }),
    };
  }
}

type PathSyntax = 'posix' | 'win32';

interface NormalizedAbsolutePath {
  readonly path: string;
  readonly syntax: PathSyntax;
}

function normalizeAbsoluteWorkspaceRoot(value: string): NormalizedAbsolutePath {
  if (isWindowsAbsolutePath(value) || isAbsolutePathInput(value)) {
    const normalized = normalizeAbsolutePath(value);
    if (!isAbsolutePathInput(normalized.path)) {
      throw new Error('Workspace file access policy requires an absolute Workspace root.');
    }
    return normalized;
  }
  return normalizeAbsolutePath(path.resolve(value));
}

function normalizeAbsolutePath(value: string): NormalizedAbsolutePath {
  if (isWindowsAbsolutePath(value)) {
    return {
      path: path.win32.normalize(value),
      syntax: 'win32',
    };
  }
  return {
    path: path.posix.normalize(value),
    syntax: 'posix',
  };
}

function isWindowsAbsolutePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(value) || /^\\\\[^\\]+\\[^\\]+/u.test(value);
}

function isAbsolutePathInput(value: string): boolean {
  return path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || /^[A-Za-z]:/u.test(value);
}

function validateRelativeModelPath(
  filePath: string,
): 'invalid-workspace-relative-path' | undefined {
  if (filePath === '' || filePath.includes('\\')) {
    return 'invalid-workspace-relative-path';
  }
  if (filePath !== '.' && path.posix.normalize(filePath) !== filePath) {
    return 'invalid-workspace-relative-path';
  }
  const segments = filePath.split('/');
  if (
    filePath.endsWith('/') ||
    (filePath !== '.' &&
      segments.some((segment) => segment === '' || segment === '.' || segment === '..'))
  ) {
    return 'invalid-workspace-relative-path';
  }
  return undefined;
}

function resolveRelativeAgainstRoot(
  filePath: string,
  workspaceRoot: string,
  syntax: PathSyntax,
): string {
  return syntax === 'win32'
    ? path.win32.resolve(workspaceRoot, filePath)
    : path.posix.resolve(workspaceRoot, filePath);
}

function authorizeNormalizedPath(
  candidate: string,
  root: string,
  syntax: PathSyntax,
): { readonly reason?: 'forbidden-unmanaged-path' | 'outside-authorized-roots' } {
  if (isForbiddenUnmanagedPath(candidate)) {
    return { reason: 'forbidden-unmanaged-path' };
  }
  if (!isPathInsideNormalizedRoot(candidate, root, syntax)) {
    return { reason: 'outside-authorized-roots' };
  }
  return {};
}

function isPathInsideNormalizedRoot(candidate: string, root: string, syntax: PathSyntax): boolean {
  const relative = relativeNormalized(candidate, root, syntax);
  if (relative === '') return true;
  if (relative === '..' || relative.startsWith(`..${syntax === 'win32' ? '\\' : '/'}`))
    return false;
  return !isAbsolutePathInput(relative);
}

function toWorkspaceRelativePath(
  candidate: string,
  root: string,
  syntax: PathSyntax,
): string | undefined {
  if (!isPathInsideNormalizedRoot(candidate, root, syntax)) return undefined;
  const relative = relativeNormalized(candidate, root, syntax);
  return relative === '' ? '.' : relative.split(/[\\/]/).join('/');
}

function relativeNormalized(candidate: string, root: string, syntax: PathSyntax): string {
  return syntax === 'win32'
    ? path.win32.relative(root, candidate)
    : path.posix.relative(root, candidate);
}

function denial(
  originalPath: string,
  resolvedPath: string | undefined,
  reason: CoreFileAccessDenialReason,
  workspaceRoot?: string,
  workspaceSyntax?: PathSyntax,
): Extract<CoreFileAccessDecision, { allowed: false }> {
  return {
    allowed: false,
    path: resolvedPath ?? originalPath,
    displayPath: displayPathForDenial(originalPath, resolvedPath, workspaceRoot, workspaceSyntax),
    reason,
  };
}

function displayPathForDenial(
  originalPath: string,
  resolvedPath: string | undefined,
  workspaceRoot: string | undefined,
  workspaceSyntax: PathSyntax | undefined,
): string {
  if (resolvedPath !== undefined && workspaceRoot !== undefined && workspaceSyntax !== undefined) {
    const relative = toWorkspaceRelativePath(resolvedPath, workspaceRoot, workspaceSyntax);
    if (relative) return relative;
  }
  if (isAbsolutePathInput(originalPath)) return '(absolute path omitted)';
  return portableSubmittedPath(originalPath);
}

function portableSubmittedPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function protectedProjectOwnerForPath(
  workspaceRelativePath: string,
): ProtectedProjectDocumentOwner | undefined {
  switch (path.extname(workspaceRelativePath).toLowerCase()) {
    case '.nkc':
      return 'canvas';
    case '.otio':
      return 'cut';
    default:
      return undefined;
  }
}

class NoWorkspaceFileAccessPolicy implements CoreFileAccessPolicy {
  authorize(filePath: string, _accessKind: FileAccessKind): CoreFileAccessDecision {
    return {
      allowed: false,
      path: filePath,
      displayPath: '(path omitted)',
      reason: 'missing-authorized-root',
    };
  }
}
