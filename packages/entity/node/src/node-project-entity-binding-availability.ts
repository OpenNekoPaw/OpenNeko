import type {
  EntityAssetProjectionRepository,
  ProjectEntityBindingAvailabilityService,
  ProjectEntityDocumentRepository,
} from '@neko/entity-domain';
import type { EntityAssetProjectionPartition } from '@neko/entity-domain';

export interface RefreshProjectEntityBindingAvailabilityOptions {
  readonly documentRepository: ProjectEntityDocumentRepository;
  readonly availability: Pick<ProjectEntityBindingAvailabilityService, 'project'>;
  readonly projections: EntityAssetProjectionRepository;
  readonly partition: EntityAssetProjectionPartition;
}

export async function refreshProjectEntityBindingAvailability(
  options: RefreshProjectEntityBindingAvailabilityOptions,
  updatedAt: string,
  signal?: AbortSignal,
): Promise<void> {
  const document = await options.documentRepository.load(signal);
  const values = await options.availability.project(document, updatedAt, signal);
  const sourceId = bindingAvailabilitySourceId(document.projectId);
  await options.projections.replaceSource({
    partition: options.partition,
    sourceId,
    records: values.map((value) => ({
      projectionId: `binding:${value.bindingId}`,
      kind: 'binding-availability' as const,
      sourceId,
      entityId: value.entityId,
      freshness: 'fresh' as const,
      value,
      updatedAt,
    })),
    updatedAt,
  });
}

export function bindingAvailabilitySourceId(projectId: string): string {
  if (!projectId.trim() || /[\\/\0]/u.test(projectId)) {
    throw new Error('Project Entity binding availability requires a stable Project identity.');
  }
  return `project-entity-bindings:${projectId}`;
}
