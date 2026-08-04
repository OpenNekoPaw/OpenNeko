import {
  projectEntityManagement,
  type EntityBindingAvailabilityProjectionValue,
  type ProjectEntityCandidateProjection,
  type ProjectEntityManagementProjection,
  type ProjectEntityRecord,
} from '@neko/entity-domain';
import { NodeProjectEntityRepository } from './node-project-entity-repository';

export interface ProjectEntityResources {
  readonly entities: readonly ProjectEntityRecord[];
}

export interface ProjectEntityManagementResources {
  readonly projectRevision: number;
  readonly projections: readonly ProjectEntityManagementProjection[];
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

export async function readProjectEntityManagementResources(input: {
  readonly workspace: { readonly workspaceId: string; readonly workspacePath: string };
  readonly candidates?: readonly ProjectEntityCandidateProjection[];
  readonly bindingAvailability?: readonly EntityBindingAvailabilityProjectionValue[];
  readonly signal?: AbortSignal;
}): Promise<ProjectEntityManagementResources> {
  const document = await new NodeProjectEntityRepository({
    workspacePath: input.workspace.workspacePath,
    projectId: input.workspace.workspaceId,
  }).load(input.signal);
  return {
    projectRevision: document.revision,
    projections: projectEntityManagement({
      document,
      candidates: input.candidates ?? [],
      bindingAvailability: input.bindingAvailability ?? [],
    }),
  };
}
