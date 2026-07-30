import * as path from 'node:path';
import {
  shouldIgnoreWorkspaceFile,
  type WorkspaceFileIgnoreRules,
} from '../../input/workspace-ignore';
import {
  authorizePathInsideRoots,
  isPathInsideRoot,
  normalizeAccessRoots,
} from './path-access-core';

export type FileAccessKind = 'read' | 'write' | 'cwd';

export interface CoreFileAccessPolicy {
  authorize(filePath: string, accessKind: FileAccessKind): CoreFileAccessDecision;
}

export type CoreFileAccessDecision =
  | {
      readonly allowed: true;
      readonly path: string;
    }
  | {
      readonly allowed: false;
      readonly path: string;
      readonly reason: CoreFileAccessDenialReason;
      readonly rule?: string;
    };

export type CoreFileAccessDenialReason =
  | 'missing-authorized-root'
  | 'relative-path-without-root'
  | 'forbidden-unmanaged-path'
  | 'outside-authorized-roots'
  | 'ignored-workspace-path';

export interface WorkspaceFileAccessPolicyOptions {
  readonly workspaceRoot: string;
  readonly readRoots?: readonly string[];
  readonly writeRoots?: readonly string[];
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
  private readonly readRoots: readonly string[];
  private readonly writeRoots: readonly string[];
  private readonly ignoreRules: WorkspaceFileIgnoreRules;

  constructor(options: WorkspaceFileAccessPolicyOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.readRoots = normalizeAccessRoots(options.readRoots ?? [this.workspaceRoot]);
    this.writeRoots = normalizeAccessRoots(options.writeRoots ?? [this.workspaceRoot]);
    this.ignoreRules = options.ignoreRules ?? {};
  }

  authorize(filePath: string, accessKind: FileAccessKind): CoreFileAccessDecision {
    const resolved = resolveAgainstRoot(filePath, this.workspaceRoot);
    if (!resolved) {
      return {
        allowed: false,
        path: filePath,
        reason: 'relative-path-without-root',
      };
    }

    const roots = accessKind === 'write' ? this.writeRoots : this.readRoots;
    const rootDecision = authorizePathInsideRoots(resolved, roots);
    if (rootDecision.reason === 'forbidden-unmanaged-path') {
      return {
        allowed: false,
        path: resolved,
        reason: 'forbidden-unmanaged-path',
      };
    }
    if (rootDecision.reason === 'outside-authorized-roots') {
      return {
        allowed: false,
        path: resolved,
        reason: 'outside-authorized-roots',
      };
    }

    const relativePath = toWorkspaceRelativePath(resolved, this.workspaceRoot);
    if (relativePath) {
      const ignoreDecision = shouldIgnoreWorkspaceFile(relativePath, this.ignoreRules);
      if (ignoreDecision.ignored) {
        return {
          allowed: false,
          path: resolved,
          reason: 'ignored-workspace-path',
          ...(ignoreDecision.reason === 'gitignore' && ignoreDecision.rule
            ? { rule: ignoreDecision.rule }
            : {}),
        };
      }
    }

    return {
      allowed: true,
      path: resolved,
    };
  }
}

class NoWorkspaceFileAccessPolicy implements CoreFileAccessPolicy {
  authorize(filePath: string, _accessKind: FileAccessKind): CoreFileAccessDecision {
    return {
      allowed: false,
      path: filePath,
      reason: 'missing-authorized-root',
    };
  }
}

function resolveAgainstRoot(filePath: string, root: string): string | undefined {
  if (path.isAbsolute(filePath)) {
    return path.normalize(filePath);
  }
  if (!filePath.trim()) {
    return undefined;
  }
  return path.resolve(root, filePath);
}

function toWorkspaceRelativePath(filePath: string, workspaceRoot: string): string | undefined {
  if (!isPathInsideRoot(filePath, workspaceRoot)) {
    return undefined;
  }
  const relativePath = path.relative(workspaceRoot, filePath);
  return relativePath && !relativePath.startsWith('..') ? relativePath : undefined;
}
