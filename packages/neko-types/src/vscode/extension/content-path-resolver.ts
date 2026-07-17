import * as path from 'node:path';
import * as os from 'node:os';
import type * as vscode from 'vscode';
import {
  PathResolver,
  contractWorkspaceMediaPath,
  resolveWorkspaceMediaPathAsync,
  type PathVariableMap,
  type WorkspaceMediaPathContext,
} from '../../path';
import { NEKO_EXTENSION_IDS, type NekoAssetsAPI } from '../../types/extension-api';

export interface HostContentPathResolverOptions {
  readonly workspaceRoot?: string;
  readonly documentUri?: vscode.Uri;
  readonly workspaceFolders?: readonly vscode.WorkspaceFolder[];
  readonly allowedRoots?: readonly string[];
  readonly fileExists?: (filePath: string) => boolean | Promise<boolean>;
  readonly getExtension?: <T>(id: string) => vscode.Extension<T> | undefined;
  readonly logger?: {
    warn(message: string, metadata?: Record<string, unknown>): void;
  };
}

export interface HostContentPathPolicy {
  readonly pathVariables: PathVariableMap;
  readonly pathResolver: PathResolver;
  readonly mediaLibraryRoots: readonly string[];
  readonly authorizedReadRoots: readonly string[];
}

export async function loadHostContentPathPolicy(
  options: HostContentPathResolverOptions = {},
): Promise<HostContentPathPolicy> {
  const workspaceRoot = resolveWorkspaceRoot(options);
  const variables = createWorkspacePathVariables(workspaceRoot);
  const assetsApi = await getNekoAssetsApi(options);
  const assetVariables = await assetsApi?.getPathVariables?.();
  for (const [key, value] of assetVariables ?? []) {
    if (key && value) {
      variables.set(key, value);
    }
  }
  const mediaLibraryRoots = dedupeNonEmptyPaths((await assetsApi?.getMediaLibraryRoots?.()) ?? []);
  const assetVariableRoots = (assetVariables ?? [])
    .map(([, value]) => value)
    .filter((value): value is string => Boolean(value));
  const authorizedReadRoots = dedupeNonEmptyPaths([
    ...(workspaceRoot ? [workspaceRoot] : []),
    ...mediaLibraryRoots,
    ...assetVariableRoots,
    ...(options.allowedRoots ?? []),
  ]);
  return {
    pathVariables: new Map(variables),
    pathResolver: new PathResolver(variables),
    mediaLibraryRoots,
    authorizedReadRoots,
  };
}

export async function createHostContentPathResolver(
  options: HostContentPathResolverOptions = {},
): Promise<PathResolver> {
  return (await loadHostContentPathPolicy(options)).pathResolver;
}

export function createWorkspaceContentPathResolver(
  options: Pick<HostContentPathResolverOptions, 'workspaceRoot'> = {},
): PathResolver {
  return new PathResolver(createWorkspacePathVariables(options.workspaceRoot));
}

export async function getHostContentAuthorizedReadRoots(
  options: HostContentPathResolverOptions = {},
): Promise<string[]> {
  return [...(await loadHostContentPathPolicy(options)).authorizedReadRoots];
}

export async function createHostContentMediaPathContext(
  options: HostContentPathResolverOptions = {},
): Promise<WorkspaceMediaPathContext> {
  const policy = await loadHostContentPathPolicy(options);
  const workspaceRoot = resolveWorkspaceRoot(options);
  const documentFsPath =
    options.documentUri?.scheme === 'file' ? options.documentUri.fsPath : undefined;
  const documentDir = documentFsPath ? path.dirname(documentFsPath) : undefined;
  const workspaceRoots = dedupeNonEmptyPaths([
    ...(options.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? []),
    ...(workspaceRoot ? [workspaceRoot] : []),
  ]);
  const owningWorkspaceRoot = documentFsPath
    ? findOwningWorkspaceRoot(documentFsPath, workspaceRoots)
    : workspaceRoot ?? workspaceRoots[0];
  const pathVariables = new Map(policy.pathVariables);
  if (owningWorkspaceRoot) {
    pathVariables.set('WORKSPACE', owningWorkspaceRoot);
    pathVariables.set('PROJECT', owningWorkspaceRoot);
  }
  return {
    ...(options.documentUri ? { sourceDocumentUri: options.documentUri.toString() } : {}),
    ...(owningWorkspaceRoot ? { owningWorkspaceRoot } : {}),
    workspaceRoots,
    ...(documentDir ? { documentDir } : {}),
    pathVariables,
    allowedRoots: policy.authorizedReadRoots,
  };
}

export async function resolveHostContentMediaPath(
  source: string,
  options: HostContentPathResolverOptions = {},
): Promise<string> {
  if (!options.fileExists) {
    throw new Error('Host content media path resolution requires an explicit fileExists probe.');
  }
  const context = await createHostContentMediaPathContext(options);
  const result = await resolveWorkspaceMediaPathAsync({
    source,
    context,
    fileExists: options.fileExists,
    isPathAuthorized: (filePath) => isPathAuthorized(filePath, context.allowedRoots),
  });
  if (result.status === 'resolved-local') return result.path;
  if (result.status === 'remote') return result.url;
  const diagnostic =
    result.diagnostics.find(
      (item) => item.code === 'unknown-variable' || item.code === 'unauthorized-path',
    ) ?? result.diagnostics[result.diagnostics.length - 1];
  throw new Error(diagnostic?.message ?? `Unable to resolve content media path: ${source}`);
}

export async function contractHostContentMediaPath(
  absoluteOrRemotePath: string,
  options: HostContentPathResolverOptions = {},
): Promise<string | undefined> {
  const context = await createHostContentMediaPathContext(options);
  const contracted = contractWorkspaceMediaPath(absoluteOrRemotePath, context);
  if (
    contracted.format === 'workspace-relative' ||
    contracted.format === 'variable' ||
    contracted.format === 'remote-url'
  ) {
    return contracted.path;
  }
  return undefined;
}

function createWorkspacePathVariables(workspaceRoot: string | undefined): Map<string, string> {
  const variables = new Map<string, string>();
  if (workspaceRoot) {
    variables.set('WORKSPACE', workspaceRoot);
    variables.set('PROJECT', workspaceRoot);
  }
  const home = os.homedir();
  variables.set('HOME', home);
  variables.set('NEKO_HOME', path.join(home, '.neko'));
  return variables;
}

function resolveWorkspaceRoot(options: HostContentPathResolverOptions): string | undefined {
  if (options.workspaceRoot) return options.workspaceRoot;
  const workspaceRoots = options.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
  if (options.documentUri?.scheme === 'file') {
    return findOwningWorkspaceRoot(options.documentUri.fsPath, workspaceRoots);
  }
  return workspaceRoots[0];
}

async function getNekoAssetsApi(
  options: HostContentPathResolverOptions,
): Promise<NekoAssetsAPI | undefined> {
  const getExtension = options.getExtension;
  const extension = getExtension
    ? getExtension<NekoAssetsAPI>(NEKO_EXTENSION_IDS.NEKO_ASSETS)
    : undefined;
  if (!extension) return undefined;
  try {
    return extension.isActive ? extension.exports : await extension.activate();
  } catch (error) {
    options.logger?.warn('Failed to activate neko-assets for content path variables', { error });
    return undefined;
  }
}

function findOwningWorkspaceRoot(
  documentFsPath: string,
  workspaceRoots: readonly string[],
): string | undefined {
  return workspaceRoots
    .filter((root) => isPathInsideOrEqual(documentFsPath, root))
    .sort((left, right) => right.length - left.length)[0];
}

function isPathAuthorized(filePath: string, roots: readonly string[] | undefined): boolean {
  if (!roots || roots.length === 0) return false;
  return roots.some((root) => isPathInsideOrEqual(filePath, root));
}

function isPathInsideOrEqual(candidatePath: string, rootPath: string): boolean {
  const candidate = path.normalize(candidatePath);
  const root = path.normalize(rootPath);
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function dedupeNonEmptyPaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of paths) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
