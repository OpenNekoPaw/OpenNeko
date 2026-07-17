import type { ProjectSearchQuery, ProjectSearchQueryContext } from '@neko/shared';
import type { ProjectSearchRuntimePorts } from './ports';

export const DEFAULT_PROJECT_SEARCH_PORTS: ProjectSearchRuntimePorts = {
  async resolveContext(query: ProjectSearchQuery): Promise<ProjectSearchQueryContext> {
    return {
      projectRoot: query.projectRoot,
      resolvedContextFilePath: query.contextFilePath,
      contextUri: query.contextUri,
      fallbackDerived: false,
    };
  },
  getWorkspaceRoots: () => [],
  logger: {
    warn: () => undefined,
  },
  now: () => new Date(),
};
