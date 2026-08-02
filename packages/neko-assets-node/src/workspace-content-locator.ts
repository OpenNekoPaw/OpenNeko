import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import type { ContentLocator } from '@neko/content';
import { listWorkspaceLinkedMediaLibraries } from './workspace-linked-media-libraries';
import type { AssetWorkspaceResolution } from '@neko-assets/domain/contracts';

export async function resolveWorkspaceContentLocator(
  workspace: AssetWorkspaceResolution,
  locator: ContentLocator,
): Promise<string> {
  if (locator.kind !== 'workspace-file') {
    throw new Error('Workspace content operation requires a workspace-file ContentLocator.');
  }
  const requestedPath = path.join(workspace.workspacePath, ...locator.path.split('/'));
  const resolvedPath = await realpath(requestedPath);
  const workspaceRoot = await realpath(workspace.workspacePath);
  if (isInside(resolvedPath, workspaceRoot)) return resolvedPath;

  const libraries = await listWorkspaceLinkedMediaLibraries(workspace.workspacePath);
  for (const library of libraries) {
    if (library.availability !== 'available') continue;
    if (
      locator.path !== library.workspacePath &&
      !locator.path.startsWith(`${library.workspacePath}/`)
    ) {
      continue;
    }
    const libraryRoot = await realpath(
      path.join(workspace.workspacePath, ...library.workspacePath.split('/')),
    );
    if (isInside(resolvedPath, libraryRoot)) return resolvedPath;
  }
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
