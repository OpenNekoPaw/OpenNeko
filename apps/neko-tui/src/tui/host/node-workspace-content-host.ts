import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  WORKSPACE_CONTENT_LOCAL_SETTINGS_SEGMENTS,
  WORKSPACE_CONTENT_SETTINGS_SEGMENTS,
  cloneHostContentPolicySnapshot,
  createHostContentPolicySnapshot,
  createMediaLibraryPathVariableMap,
  readMediaLibraryLocalSettings,
  readMediaLibrarySettings,
  resolveWorkspaceMediaLibrariesSync,
  type HostContentPolicySnapshot,
  type HostWorkspaceContentSnapshot,
} from '@neko/host';
import { PathResolver, type PathVariableMap } from '@neko/shared';
import {
  createNodeHostAdapter,
  createNodeHostPathVariables,
  type NodeHostAdapter,
  type NodeHostAdapterOptions,
} from './node-host-adapter';

export type NodeWorkspaceContentDiagnostic = Readonly<{
  readonly code: 'read-failed' | 'parse-failed';
  readonly filePath: string;
  readonly detail: string;
}>;

export class NodeWorkspaceContentError extends Error {
  constructor(readonly diagnostic: NodeWorkspaceContentDiagnostic) {
    super(`workspace-content:${diagnostic.code}`);
    this.name = 'NodeWorkspaceContentError';
  }
}

export function createNodeWorkspaceContentHostAdapter(
  options: NodeHostAdapterOptions,
): NodeHostAdapter {
  const contentPolicy = createNodeWorkspaceContentPolicy(options);
  const host = createNodeHostAdapter({
    ...options,
    extraPathVariables: contentPolicy.pathVariables,
  });
  return {
    ...host,
    contentPolicy: {
      getSnapshot: () => cloneHostContentPolicySnapshot(contentPolicy),
    },
  };
}

export function createNodeWorkspaceContentPolicy(
  options: NodeHostAdapterOptions,
): HostContentPolicySnapshot {
  const workspaceRoot = path.resolve(options.workDir);
  const homedir = path.resolve(options.homedir ?? os.homedir());
  const basePathVariables = createNodeHostPathVariables({
    workspaceRoot,
    homedir,
    extraPathVariables: options.extraPathVariables,
  });
  return readNodeWorkspaceContentPolicy({
    workspaceRoot,
    basePathVariables,
  });
}

function readNodeWorkspaceContentPolicy(input: {
  readonly workspaceRoot: string;
  readonly basePathVariables?: PathVariableMap | ReadonlyMap<string, string>;
}): HostContentPolicySnapshot {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const basePathVariables = new Map(input.basePathVariables ?? []);
  if (basePathVariables.size === 0) {
    basePathVariables.set('A', workspaceRoot);
    basePathVariables.set('WORKSPACE', workspaceRoot);
    basePathVariables.set('PROJECT', workspaceRoot);
  }
  return createHostContentPolicySnapshot(
    readNodeWorkspaceContentSnapshot({
      workspaceRoot,
      basePathVariables,
    }),
  );
}

function readNodeWorkspaceContentSnapshot(input: {
  readonly workspaceRoot: string;
  readonly basePathVariables: PathVariableMap | ReadonlyMap<string, string>;
}): HostWorkspaceContentSnapshot {
  const workspaceRoot = path.resolve(input.workspaceRoot);
  const settingsPath = path.join(workspaceRoot, ...WORKSPACE_CONTENT_SETTINGS_SEGMENTS);
  const localSettingsPath = path.join(workspaceRoot, ...WORKSPACE_CONTENT_LOCAL_SETTINGS_SEGMENTS);
  const settings = readMediaLibrarySettings(readOptionalJsonFile(settingsPath), settingsPath);
  const localSettings = readMediaLibraryLocalSettings(
    readOptionalJsonFile(localSettingsPath),
    localSettingsPath,
  );
  const libraries = resolveWorkspaceMediaLibrariesSync({
    settings,
    localSettings,
    workspaceRoot,
    resolvePath: (source, workspaceRoot) =>
      resolveNodeWorkspaceSourcePath(source, workspaceRoot, input.basePathVariables),
    checkAccessible: (resolvedPath) => isReadableDirectory(resolvedPath),
  });
  const mediaLibraryPathVariables = createMediaLibraryPathVariableMap(libraries);
  const pathVariables = new Map(input.basePathVariables);
  for (const [key, value] of mediaLibraryPathVariables) {
    pathVariables.set(key, value);
  }
  return {
    workspaceRoot,
    settings,
    localSettings,
    mediaLibraries: libraries,
    mediaLibraryPathVariables,
    pathVariables,
  };
}

function resolveNodeWorkspaceSourcePath(
  source: string,
  workspaceRoot: string,
  variables: PathVariableMap | ReadonlyMap<string, string>,
): string {
  const resolved = new PathResolver(new Map(variables)).resolveSource(source, workspaceRoot);
  return resolved.type === 'local' ? path.resolve(resolved.path) : source;
}

function readOptionalJsonFile(filePath: string): unknown | undefined {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (isMissingFileError(error)) {
      return undefined;
    }
    throw new NodeWorkspaceContentError({
      code: 'read-failed',
      filePath,
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  try {
    return JSON.parse(content) as unknown;
  } catch (error) {
    throw new NodeWorkspaceContentError({
      code: 'parse-failed',
      filePath,
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

function isReadableDirectory(dirPath: string): boolean {
  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return false;
    }
    fs.accessSync(dirPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error['code'] === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
