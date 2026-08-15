import { type PathVariableMap } from '@neko/shared';
import type { NekoHostPorts } from './ports';

export interface HostWorkspacePathVariableInput {
  readonly workspaceRoot: string;
  readonly homedir?: string;
  readonly nekoHome?: string;
  readonly extraPathVariables?: PathVariableMap | ReadonlyMap<string, string>;
}

export interface HostWorkspaceContentSnapshot {
  readonly workspaceRoot?: string;
  readonly pathVariables: PathVariableMap;
}

export interface HostContentPolicySnapshot {
  readonly workspaceRoot?: string;
  readonly pathVariables: PathVariableMap;
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
    authorizedReadRoots: snapshot.workspaceRoot ? [snapshot.workspaceRoot] : [],
  };
}

export function cloneHostContentPolicySnapshot(
  snapshot: HostContentPolicySnapshot,
): HostContentPolicySnapshot {
  return {
    ...(snapshot.workspaceRoot ? { workspaceRoot: snapshot.workspaceRoot } : {}),
    pathVariables: new Map(snapshot.pathVariables),
    authorizedReadRoots: [...snapshot.authorizedReadRoots],
  };
}

export async function loadHostWorkspaceContentSnapshot(input: {
  readonly host: NekoHostPorts;
}): Promise<HostWorkspaceContentSnapshot> {
  const workspace = await input.host.workspace.getWorkspace();
  const workspaceRoot = workspace.workspaceRoot;
  const pathVariables = new Map(workspace.pathVariables ?? []);
  if (!workspaceRoot) return { pathVariables };

  return {
    workspaceRoot,
    pathVariables,
  };
}
