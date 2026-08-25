import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import type { WorkspaceFileContentLocator } from '@neko/content-domain';
import {
  authorizeWorkspaceContainedPath,
  type WorkspacePathGuardDiagnosticCode,
} from '@neko/content-domain/node';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';

export async function resolveWorkspaceContentLocator(
  workspace: AssetWorkspaceResolution,
  locator: WorkspaceFileContentLocator,
): Promise<string> {
  const requestedPath = path.join(workspace.workspacePath, ...locator.file.path.split('/'));
  const authorization = await authorizeWorkspaceContainedPath({
    workspaceRoot: workspace.workspacePath,
    requestedPath,
  });
  if (!authorization.authorized) {
    throw new WorkspaceContentLocatorResolutionError(
      authorization.diagnostic.code,
      `Workspace ContentLocator is unavailable: ${authorization.diagnostic.message}`,
    );
  }
  const resolvedPath = await realpath(requestedPath);
  return resolvedPath;
}

class WorkspaceContentLocatorResolutionError extends Error {
  constructor(
    readonly code: WorkspacePathGuardDiagnosticCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorkspaceContentLocatorResolutionError';
  }
}
