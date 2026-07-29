import { realpath } from 'node:fs/promises';
import * as path from 'node:path';
import type { ContentLocator } from '@neko/shared';
import {
  createWorkspaceLinkedMediaLibrary,
  listWorkspaceLinkedMediaLibraries,
} from '@neko/shared/node/workspace-linked-media-libraries';
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

export async function createDesktopWorkspaceFileLocator(
  workspace: DesktopWorkspaceResolution,
  absolutePath: string,
): Promise<ContentLocator> {
  const selectedPath = await realpath(absolutePath);
  const workspaceRoot = await realpath(workspace.workspacePath);
  if (isInside(selectedPath, workspaceRoot)) {
    return workspaceFileLocator(path.relative(workspaceRoot, selectedPath));
  }

  const libraries = await listWorkspaceLinkedMediaLibraries(workspace.workspacePath);
  for (const library of libraries) {
    if (library.availability !== 'available') continue;
    const libraryRoot = await realpath(
      path.join(workspace.workspacePath, ...library.workspacePath.split('/')),
    );
    if (isInside(selectedPath, libraryRoot)) {
      return workspaceFileLocator(
        path.posix.join(
          library.workspacePath,
          path.relative(libraryRoot, selectedPath).split(path.sep).join('/'),
        ),
      );
    }
  }

  const parentDirectory = path.dirname(selectedPath);
  const usedNames = new Set(libraries.map((library) => library.name.toLocaleLowerCase()));
  const baseName = portableLibraryName(path.basename(parentDirectory));
  let libraryName = baseName;
  let suffix = 2;
  while (usedNames.has(libraryName.toLocaleLowerCase())) {
    libraryName = `${baseName} ${suffix}`;
    suffix += 1;
  }
  const result = await createWorkspaceLinkedMediaLibrary({
    workspaceRoot: workspace.workspacePath,
    name: libraryName,
    targetDirectory: parentDirectory,
  });
  return workspaceFileLocator(
    path.posix.join(result.library.workspacePath, path.basename(selectedPath)),
  );
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

function workspaceFileLocator(relativePath: string): ContentLocator {
  const portablePath = relativePath.split(path.sep).join('/');
  if (
    portablePath.length === 0 ||
    portablePath === '..' ||
    portablePath.startsWith('../') ||
    path.posix.isAbsolute(portablePath)
  ) {
    throw new Error('Desktop selected source does not produce a portable ContentLocator.');
  }
  return { kind: 'workspace-file', path: portablePath };
}

function portableLibraryName(value: string): string {
  const normalized = value
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, ' ')
    .replace(/^[. ]+|[. ]+$/gu, '')
    .slice(0, 80);
  return normalized || 'Imported Media';
}
