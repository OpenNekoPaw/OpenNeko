import * as path from 'path';
import { fileURLToPath } from 'url';
import * as vscode from 'vscode';
import type { ProjectSearchQuery, ProjectSearchQueryContext } from '@neko/shared';

const URI_SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/;
const PROJECT_ROOT_MARKERS = [path.join('neko', 'settings.json'), '.neko', '.git'] as const;

export interface VSCodeProjectSearchContextResolverOptions {
  readonly resolvePath?: (filePath: string) => Promise<string>;
}

export function createVSCodeProjectSearchContextResolver(
  options: VSCodeProjectSearchContextResolverOptions = {},
): (query: ProjectSearchQuery) => Promise<ProjectSearchQueryContext> {
  return (query) => resolveProjectSearchContext(query, options);
}

export async function resolveProjectSearchContext(
  query: ProjectSearchQuery,
  options: VSCodeProjectSearchContextResolverOptions = {},
): Promise<ProjectSearchQueryContext> {
  if (query.projectRoot) {
    return {
      projectRoot: normalizeLocalPath(query.projectRoot),
      resolvedContextFilePath: await resolveOptionalContextPath(query.contextFilePath, options),
      contextUri: query.contextUri,
      fallbackDerived: false,
    };
  }

  const contextPath = await resolveOptionalContextPath(
    query.contextFilePath ?? query.contextUri,
    options,
  );
  const markedProjectRoot = contextPath
    ? await findMarkedProjectRootForPath(contextPath)
    : undefined;
  if (markedProjectRoot) {
    return {
      projectRoot: markedProjectRoot,
      resolvedContextFilePath: contextPath,
      contextUri: query.contextUri,
      fallbackDerived: false,
    };
  }

  const contextRoot = contextPath ? findWorkspaceRootForPath(contextPath) : undefined;
  if (contextRoot) {
    return {
      projectRoot: contextRoot,
      resolvedContextFilePath: contextPath,
      contextUri: query.contextUri,
      fallbackDerived: true,
    };
  }

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  return {
    projectRoot: workspaceRoot,
    resolvedContextFilePath: contextPath,
    contextUri: query.contextUri,
    fallbackDerived: Boolean(workspaceRoot),
  };
}

export async function resolveProjectRootForUri(uri: vscode.Uri): Promise<string | undefined> {
  const markedProjectRoot = await findMarkedProjectRootForPath(normalizeLocalPath(uri.fsPath));
  return markedProjectRoot ?? findWorkspaceRootForPath(uri.fsPath);
}

async function resolveOptionalContextPath(
  value: string | undefined,
  options: VSCodeProjectSearchContextResolverOptions,
): Promise<string | undefined> {
  if (!value) return undefined;
  const localPath = toLocalFilesystemPath(value) ?? value;
  try {
    const resolved = options.resolvePath ? await options.resolvePath(localPath) : localPath;
    return normalizeLocalPath(resolved);
  } catch {
    return normalizeLocalPath(localPath);
  }
}

function findWorkspaceRootForPath(filePath: string): string | undefined {
  let best: string | undefined;
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const root = normalizeLocalPath(folder.uri.fsPath);
    if (isPathInside(filePath, root) && (!best || root.length > best.length)) {
      best = root;
    }
  }
  return best;
}

async function findMarkedProjectRootForPath(filePath: string): Promise<string | undefined> {
  let current = path.dirname(filePath);
  let previous: string | undefined;
  while (current && current !== previous) {
    if (await hasProjectRootMarker(current)) {
      return normalizeLocalPath(current);
    }
    previous = current;
    current = path.dirname(current);
  }
  return undefined;
}

async function hasProjectRootMarker(directory: string): Promise<boolean> {
  for (const marker of PROJECT_ROOT_MARKERS) {
    if (await pathExists(path.join(directory, marker))) {
      return true;
    }
  }
  return false;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(filePath));
    return true;
  } catch {
    return false;
  }
}

function isPathInside(filePath: string, root: string): boolean {
  const relative = path.relative(root, filePath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function toLocalFilesystemPath(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (WINDOWS_DRIVE_RE.test(trimmed) || trimmed.startsWith('/')) return trimmed;
  if (!URI_SCHEME_RE.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'file:' ? fileURLToPath(url) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeLocalPath(value: string): string {
  return path.normalize(value);
}
