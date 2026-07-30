import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import type { ContentLocator } from '@neko/shared';
import { listWorkspaceLinkedMediaLibraries } from '@neko/shared/node/workspace-linked-media-libraries';
import type { DesktopWorkspaceResolution } from './desktop-workspace-registry';

export async function resolveDesktopWorkspaceContentLocator(
  workspace: DesktopWorkspaceResolution,
  locator: ContentLocator,
): Promise<string> {
  if (locator.kind !== 'workspace-file') {
    throw new Error('Desktop content operation requires a workspace-file ContentLocator.');
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
  throw new Error('Desktop ContentLocator is outside its authorized source.');
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
