import type {
  ResourceUsageAvailability,
  ResourceUsageProjectionRecord,
  ResourceUsageTarget,
} from '@neko/search-domain';
import type { ContentProjectComposition } from '../contracts/project-composition';

export function projectCompositionResourceUsageProjections(input: {
  readonly composition: ContentProjectComposition;
  readonly sourceFingerprint: string;
  readonly updatedAt: string;
  readonly availability: (target: ResourceUsageTarget) => ResourceUsageAvailability;
}): readonly ResourceUsageProjectionRecord[] {
  const source = {
    ownerId: 'project' as const,
    sourceId: input.composition.contentProjectId,
  };
  const targets = new Map<
    string,
    {
      readonly target: ResourceUsageTarget;
      readonly occurrences: Array<{ readonly occurrenceId: string; readonly location: string }>;
      readonly dependencyOwners: Map<ResourceUsageTarget['ownerId'], number>;
    }
  >();

  const append = (
    target: ResourceUsageTarget,
    occurrence: { readonly occurrenceId: string; readonly location: string },
    dependency?: ResourceUsageTarget,
  ): void => {
    const key = targetKey(target);
    let current = targets.get(key);
    if (!current) {
      current = { target, occurrences: [], dependencyOwners: new Map() };
      targets.set(key, current);
    }
    current.occurrences.push(occurrence);
    if (dependency) {
      current.dependencyOwners.set(
        dependency.ownerId,
        (current.dependencyOwners.get(dependency.ownerId) ?? 0) + 1,
      );
    }
  };

  for (const target of input.composition.localTargets) {
    if (target.kind !== 'character-project') continue;
    append(
      { ownerId: 'character-project', resourceId: target.characterProjectId },
      {
        occurrenceId: `local-character:${target.characterProjectId}`,
        location: 'project-local-targets',
      },
    );
  }
  for (const dependency of input.composition.dependencies) {
    if (dependency.kind !== 'character-version') continue;
    append(
      { ownerId: 'character-version', resourceId: dependency.characterVersionId },
      {
        occurrenceId: `character-version:${dependency.characterVersionId}`,
        location: 'project-publication-dependencies',
      },
    );
  }
  for (const association of input.composition.entityCharacterAssociations) {
    const entity = { ownerId: 'project-entity' as const, resourceId: association.entityId };
    const character = {
      ownerId: 'character-project' as const,
      resourceId: association.characterProjectId,
    };
    append(
      entity,
      {
        occurrenceId: `entity-character:${association.entityId}`,
        location: 'project-entity-character-associations',
      },
      character,
    );
    append(
      character,
      {
        occurrenceId: `character-entity:${association.characterProjectId}`,
        location: 'project-entity-character-associations',
      },
      entity,
    );
  }

  return [...targets.values()]
    .sort((left, right) => targetKey(left.target).localeCompare(targetKey(right.target), 'en-US'))
    .map((entry): ResourceUsageProjectionRecord => ({
      projectionId: `${source.ownerId}:${source.sourceId}:${targetKey(entry.target)}`,
      source,
      target: entry.target,
      occurrences: entry.occurrences,
      usageCount: entry.occurrences.length,
      dependencies: [...entry.dependencyOwners.entries()]
        .sort(([left], [right]) => left.localeCompare(right, 'en-US'))
        .map(([targetOwnerId, count]) => ({ targetOwnerId, count })),
      availability: input.availability(entry.target),
      freshness: 'fresh',
      sourceFingerprint: input.sourceFingerprint,
      updatedAt: input.updatedAt,
    }));
}

function targetKey(target: ResourceUsageTarget): string {
  return `${target.ownerId}:${target.resourceId}`;
}
