import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import type { GeneratedOutputContentLocator, WorkspaceFileContentLocator } from '@neko/content';
import {
  authorizeWorkspaceContainedPath,
  createNodeHostContentReadService,
  type WorkspacePathGuardDiagnosticCode,
} from '@neko/content/node';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';

export async function resolveWorkspaceContentLocator(
  workspace: AssetWorkspaceResolution,
  locator: WorkspaceFileContentLocator | GeneratedOutputContentLocator,
): Promise<string> {
  if (locator.kind === 'generated-output') {
    const content = await createNodeHostContentReadService({
      workspaceRoot: workspace.workspacePath,
    }).stat(locator);
    if (content.status !== 'ready') {
      throw new Error(`Generated output content is unavailable: ${content.diagnostic.code}.`);
    }
  }
  const requestedPath = path.join(workspace.workspacePath, ...locator.path.split('/'));
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
