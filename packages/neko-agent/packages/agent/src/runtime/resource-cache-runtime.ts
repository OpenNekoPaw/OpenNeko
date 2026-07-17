import { resolveStorageLayout } from '@neko/shared';

export interface AgentProjectResourceCacheTarget {
  readonly scope: 'project';
  readonly cacheRoot: string;
  readonly manifestPath: string;
  readonly projectRoot: string;
}

export function createAgentProjectResourceCacheTarget(input: {
  readonly workspaceRoot: string;
  readonly homedir: string;
}): AgentProjectResourceCacheTarget {
  const workspaceRoot = input.workspaceRoot.trim();
  if (!workspaceRoot) {
    throw new Error('Project resource cache target requires a workspace root');
  }
  const layout = resolveStorageLayout(workspaceRoot, input.homedir || workspaceRoot);
  return {
    scope: 'project',
    cacheRoot: layout.project.local.cache.resources,
    manifestPath: layout.project.local.cache.resourceManifest,
    projectRoot: workspaceRoot,
  };
}
