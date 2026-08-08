import { mkdir } from 'node:fs/promises';
import * as path from 'node:path';
import type {
  AuthorizedWorkspaceDirectoryCreator,
  WorkspaceDirectoryCreateResult,
} from '../project-file-io/workspace-entry-creation';
import { normalizeWorkspaceContentPath } from '../contracts';
import {
  authorizeWorkspaceLinkedPath,
  type AuthorizeWorkspaceLinkedPathInput,
  type WorkspaceLinkedPathGuardResult,
} from './workspace-linked-path-guard';

export interface NodeAuthorizedWorkspaceDirectoryCreatorOptions {
  readonly workspaceRoot: string;
  readonly authorize?: (
    input: AuthorizeWorkspaceLinkedPathInput,
  ) => Promise<WorkspaceLinkedPathGuardResult>;
}

export class NodeAuthorizedWorkspaceDirectoryCreator implements AuthorizedWorkspaceDirectoryCreator {
  constructor(private readonly options: NodeAuthorizedWorkspaceDirectoryCreatorOptions) {
    if (!path.isAbsolute(options.workspaceRoot)) {
      throw new Error('Workspace directory creator requires an absolute Host workspace root.');
    }
  }

  async create(workspacePath: string): Promise<WorkspaceDirectoryCreateResult> {
    if (normalizeWorkspaceContentPath(workspacePath) !== workspacePath) {
      return unavailable(workspacePath, 'content-unauthorized');
    }
    const targetPath = path.join(this.options.workspaceRoot, ...workspacePath.split('/'));
    const authorization = await (this.options.authorize ?? authorizeWorkspaceLinkedPath)({
      workspaceRoot: this.options.workspaceRoot,
      requestedPath: path.dirname(targetPath),
    });
    if (!authorization.authorized) {
      return unavailable(
        workspacePath,
        authorization.diagnostic.code === 'workspace-path-unavailable'
          ? 'content-missing'
          : 'content-unauthorized',
      );
    }
    try {
      await mkdir(targetPath, { mode: 0o700 });
      return { status: 'created', path: workspacePath };
    } catch (error) {
      if (isNodeError(error, 'EEXIST')) return unavailable(workspacePath, 'content-conflict');
      if (isNodeError(error, 'ENOENT') || isNodeError(error, 'ENOTDIR')) {
        return unavailable(workspacePath, 'content-missing');
      }
      if (isNodeError(error, 'EACCES') || isNodeError(error, 'EPERM')) {
        return unavailable(workspacePath, 'content-unauthorized');
      }
      return unavailable(workspacePath, 'content-write-failed');
    }
  }
}

function unavailable(
  workspacePath: string,
  code: import('../contracts').ContentIoDiagnosticCode,
): Extract<WorkspaceDirectoryCreateResult, { status: 'unavailable' }> {
  return { status: 'unavailable', path: workspacePath, diagnostic: { code } };
}

function isNodeError(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}
