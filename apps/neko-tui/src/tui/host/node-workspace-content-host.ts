import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  cloneHostContentPolicySnapshot,
  createHostContentPolicySnapshot,
  type HostContentPolicySnapshot,
} from '@neko/host';
import {
  WORKSPACE_MEDIA_LIBRARY_DIRECTORY,
  validateWorkspaceLinkedMediaLibraryName,
  workspaceLinkedMediaLibraryPath,
  type PathVariableMap,
  type WorkspaceLinkedMediaLibrary,
} from '@neko/shared';
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
    basePathVariables.set('WORKSPACE', workspaceRoot);
    basePathVariables.set('PROJECT', workspaceRoot);
  }
  return createHostContentPolicySnapshot({
    workspaceRoot,
    pathVariables: basePathVariables,
    mediaLibraries: listNodeWorkspaceLinkedMediaLibraries(workspaceRoot),
  });
}

function listNodeWorkspaceLinkedMediaLibraries(
  workspaceRoot: string,
): readonly WorkspaceLinkedMediaLibrary[] {
  const assetsDirectory = path.join(workspaceRoot, ...WORKSPACE_MEDIA_LIBRARY_DIRECTORY.split('/'));
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(assetsDirectory, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }

  const libraries: WorkspaceLinkedMediaLibrary[] = [];
  for (const entry of entries) {
    if (!entry.isSymbolicLink() || validateWorkspaceLinkedMediaLibraryName(entry.name)) continue;
    const workspacePath = workspaceLinkedMediaLibraryPath(entry.name);
    const runtimePath = path.join(workspaceRoot, ...workspacePath.split('/'));
    if (isReadableDirectory(runtimePath)) {
      libraries.push({ name: entry.name, workspacePath, availability: 'available' });
    } else {
      libraries.push({
        name: entry.name,
        workspacePath,
        availability: 'unavailable',
        diagnostic: {
          code: 'library-link-broken',
          severity: 'error',
          message: 'Media library link target is unavailable.',
          libraryName: entry.name,
          workspacePath,
        },
      });
    }
  }
  return libraries.sort((left, right) => left.name.localeCompare(right.name));
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
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}
