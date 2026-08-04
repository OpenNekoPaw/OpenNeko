import type { ProjectEntityRecord } from '@neko/entity-domain';
import { NodeProjectEntityRepository } from './node-project-entity-repository';

export interface ProjectEntityResources {
  readonly entities: readonly ProjectEntityRecord[];
}

export async function readProjectEntityResources(input: {
  readonly workspace: { readonly workspaceId: string; readonly workspacePath: string };
  readonly signal?: AbortSignal;
}): Promise<ProjectEntityResources> {
  const document = await new NodeProjectEntityRepository({
    workspacePath: input.workspace.workspacePath,
    projectId: input.workspace.workspaceId,
  }).load(input.signal);
  return {
    entities: document.entities.filter((entity) => entity.lifecycle.state === 'active'),
  };
}
