import {
  ProjectEntityContractError,
  projectEntityManagement,
  type ProjectEntityProjectionPartition,
  type ProjectEntityProjectionRepository,
  type EntityBindingAvailabilityProjectionValue,
  type ProjectEntityCandidateProjection,
  type ProjectEntityDiagnostic,
  type ProjectEntityManagementProjection,
  type ProjectEntityRecord,
} from '@neko/entity-domain';
import { NodeProjectEntityRepository } from './node-project-entity-repository';

export interface ProjectEntityResources {
  readonly entities: readonly ProjectEntityRecord[];
  readonly diagnostics: readonly ProjectEntityDiagnostic[];
}

export interface ProjectEntityManagementResources {
  readonly projections: readonly ProjectEntityManagementProjection[];
  readonly diagnostics: readonly ProjectEntityDiagnostic[];
}

export async function readProjectEntityResources(input: {
  readonly workspace: { readonly workspaceId: string; readonly workspacePath: string };
  readonly signal?: AbortSignal;
}): Promise<ProjectEntityResources> {
  const result = await new NodeProjectEntityRepository({
    workspacePath: input.workspace.workspacePath,
    projectId: input.workspace.workspaceId,
  }).readAvailable(input.signal);
  const ownerMismatch = result.diagnostics.find(
    (diagnostic) => diagnostic.code === 'project-entity-owner-mismatch',
  );
  if (ownerMismatch) throw new ProjectEntityContractError([ownerMismatch]);
  return {
    entities: result.document.entities.filter((entity) => entity.lifecycle.state === 'active'),
    diagnostics: result.diagnostics,
  };
}

export async function readProjectEntityManagementResources(input: {
  readonly workspace: { readonly workspaceId: string; readonly workspacePath: string };
  readonly candidates?: readonly ProjectEntityCandidateProjection[];
  readonly bindingAvailability?: readonly EntityBindingAvailabilityProjectionValue[];
  readonly derivedProjection?: {
    readonly repository: Pick<ProjectEntityProjectionRepository, 'list'>;
    readonly partition: ProjectEntityProjectionPartition;
  };
  readonly signal?: AbortSignal;
}): Promise<ProjectEntityManagementResources> {
  const documentResult = await new NodeProjectEntityRepository({
    workspacePath: input.workspace.workspacePath,
    projectId: input.workspace.workspaceId,
  }).readAvailable(input.signal);
  const result = input.derivedProjection
    ? await input.derivedProjection.repository.list({
        partition: input.derivedProjection.partition,
        kinds: ['entity-candidate', 'binding-availability'],
      })
    : { records: [], diagnostics: [] };
  const records = result.records;
  const candidates = [
    ...(input.candidates ?? []),
    ...records.flatMap((record) =>
      record.kind === 'entity-candidate' && record.value.freshness !== 'failed'
        ? [record.value]
        : [],
    ),
  ];
  const bindingAvailability = [
    ...(input.bindingAvailability ?? []),
    ...records.flatMap((record) => (record.kind === 'binding-availability' ? [record.value] : [])),
  ];
  return {
    projections: projectEntityManagement({
      document: documentResult.document,
      candidates,
      bindingAvailability,
    }),
    diagnostics: documentResult.diagnostics,
  };
}
