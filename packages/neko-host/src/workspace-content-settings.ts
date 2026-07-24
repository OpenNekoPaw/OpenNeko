import {
  WORKSPACE_MEDIA_LIBRARY_DIRECTORY,
  validateWorkspaceLinkedMediaLibraryName,
  workspaceLinkedMediaLibraryPath,
  type PathVariableMap,
  type WorkspaceLinkedMediaLibrary,
} from '@neko/shared';
import type { NekoHostPorts } from './ports';

export interface HostWorkspacePathVariableInput {
  readonly workspaceRoot: string;
  readonly homedir?: string;
  readonly nekoHome?: string;
  readonly extraPathVariables?: PathVariableMap | ReadonlyMap<string, string>;
}

export interface HostWorkspaceContentSnapshot {
  readonly workspaceRoot?: string;
  readonly mediaLibraries: readonly WorkspaceLinkedMediaLibrary[];
  readonly pathVariables: PathVariableMap;
}

export interface HostContentPolicySnapshot {
  readonly workspaceRoot?: string;
  readonly pathVariables: PathVariableMap;
  readonly mediaLibraries: readonly WorkspaceLinkedMediaLibrary[];
  readonly authorizedReadRoots: readonly string[];
}

export function createHostWorkspacePathVariables(
  input: HostWorkspacePathVariableInput,
): PathVariableMap {
  const variables: PathVariableMap = new Map();
  variables.set('WORKSPACE', input.workspaceRoot);
  variables.set('PROJECT', input.workspaceRoot);
  if (input.nekoHome) variables.set('NEKO_HOME', input.nekoHome);
  if (input.homedir) variables.set('HOME', input.homedir);
  for (const [key, value] of input.extraPathVariables ?? []) variables.set(key, value);
  return variables;
}

export async function loadHostContentPolicySnapshot(input: {
  readonly host: NekoHostPorts;
}): Promise<HostContentPolicySnapshot> {
  const provided = await input.host.contentPolicy?.getSnapshot();
  if (provided) return cloneHostContentPolicySnapshot(provided);
  return createHostContentPolicySnapshot(await loadHostWorkspaceContentSnapshot(input));
}

export function createHostContentPolicySnapshot(
  snapshot: HostWorkspaceContentSnapshot,
): HostContentPolicySnapshot {
  return {
    ...(snapshot.workspaceRoot ? { workspaceRoot: snapshot.workspaceRoot } : {}),
    pathVariables: new Map(snapshot.pathVariables),
    mediaLibraries: snapshot.mediaLibraries.map((library) => ({ ...library })),
    authorizedReadRoots: snapshot.workspaceRoot ? [snapshot.workspaceRoot] : [],
  };
}

export function cloneHostContentPolicySnapshot(
  snapshot: HostContentPolicySnapshot,
): HostContentPolicySnapshot {
  return {
    ...(snapshot.workspaceRoot ? { workspaceRoot: snapshot.workspaceRoot } : {}),
    pathVariables: new Map(snapshot.pathVariables),
    mediaLibraries: snapshot.mediaLibraries.map((library) => ({ ...library })),
    authorizedReadRoots: [...snapshot.authorizedReadRoots],
  };
}

export async function loadHostWorkspaceContentSnapshot(input: {
  readonly host: NekoHostPorts;
}): Promise<HostWorkspaceContentSnapshot> {
  const workspace = await input.host.workspace.getWorkspace();
  const workspaceRoot = workspace.workspaceRoot;
  const pathVariables = new Map(workspace.pathVariables ?? []);
  if (!workspaceRoot) return { mediaLibraries: [], pathVariables };

  return {
    workspaceRoot,
    pathVariables,
    mediaLibraries: await listHostWorkspaceLinkedMediaLibraries(input.host, workspaceRoot),
  };
}

async function listHostWorkspaceLinkedMediaLibraries(
  host: NekoHostPorts,
  workspaceRoot: string,
): Promise<readonly WorkspaceLinkedMediaLibrary[]> {
  const assetsDirectory = host.paths.join(
    workspaceRoot,
    ...WORKSPACE_MEDIA_LIBRARY_DIRECTORY.split('/'),
  );
  let entries;
  try {
    entries = await host.files.readDirectory(assetsDirectory);
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }

  const libraries: WorkspaceLinkedMediaLibrary[] = [];
  for (const entry of entries) {
    if (entry.type !== 'symlink' || validateWorkspaceLinkedMediaLibraryName(entry.name)) continue;
    const workspacePath = workspaceLinkedMediaLibraryPath(entry.name);
    try {
      const target = await host.files.stat(
        host.paths.join(workspaceRoot, ...workspacePath.split('/')),
      );
      if (target.type === 'directory') {
        libraries.push({ name: entry.name, workspacePath, availability: 'available' });
      } else {
        libraries.push({
          name: entry.name,
          workspacePath,
          availability: 'unavailable',
          diagnostic: {
            code: 'library-target-not-directory',
            severity: 'error',
            message: 'Media library link target is not a directory.',
            libraryName: entry.name,
            workspacePath,
          },
        });
      }
    } catch {
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

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { readonly code?: unknown }).code === 'ENOENT'
  );
}
