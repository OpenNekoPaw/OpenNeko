import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import type { GeneratedOutputContentLocator, WorkspaceFileContentLocator } from '@neko/content';
import { createNodeHostContentReadService } from '@neko/content/node';
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
  const resolvedPath = await realpath(requestedPath);
  const workspaceRoot = await realpath(workspace.workspacePath);
  if (isInside(resolvedPath, workspaceRoot)) return resolvedPath;
  throw new Error('ContentLocator is outside its authorized workspace source.');
}

function isInside(targetPath: string, rootPath: string): boolean {
  if (targetPath === rootPath) return true;
  const relativePath = path.relative(rootPath, targetPath);
  return (
    relativePath.length > 0 &&
    relativePath !== '..' &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  );
}
