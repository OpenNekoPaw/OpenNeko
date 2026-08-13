import type {
  ResourceUsageAvailability,
  ResourceUsageProjectionRecord,
  ResourceUsageTarget,
} from '@neko/search-domain';
import {
  projectPublicationDependencyKey,
  type ProjectLocalTargetRef,
  type ProjectPublicationDependencyRef,
} from '../contracts/project-target';
import type { ProjectEntityCharacterAssociationFact } from '../contracts/project-entity-character-association';

export function projectResourceUsageProjections(input: {
  readonly projectId: string;
  readonly localTargets: readonly ProjectLocalTargetRef[];
  readonly dependencies: readonly ProjectPublicationDependencyRef[];
  readonly associations: readonly ProjectEntityCharacterAssociationFact[];
  readonly sourceFingerprint: string;
  readonly updatedAt: string;
  readonly availability: (target: ResourceUsageTarget) => ResourceUsageAvailability;
}): readonly ResourceUsageProjectionRecord[] {
  const source = {
    ownerId: 'project' as const,
    sourceId: input.projectId,
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

  for (const target of input.localTargets) {
    const usageTarget: ResourceUsageTarget =
      target.kind === 'character-project'
        ? { ownerId: 'character-project', resourceId: target.characterProjectId }
        : { ownerId: 'world-project', resourceId: target.worldProjectId };
    append(usageTarget, {
      occurrenceId: `project-member:${usageTarget.ownerId}:${usageTarget.resourceId}`,
      location: 'owner-project-scope',
    });
  }
  for (const dependency of input.dependencies) {
    const target = dependencyTarget(dependency);
    append(target, {
      occurrenceId: projectPublicationDependencyKey(dependency),
      location: 'owner-reference-readers',
    });
  }
  for (const association of input.associations) {
    if (association.projectId !== input.projectId) {
      throw new Error('Project resource usage received an association from another Project.');
    }
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

function dependencyTarget(dependency: ProjectPublicationDependencyRef): ResourceUsageTarget {
  switch (dependency.kind) {
    case 'character-version':
      return { ownerId: 'character-version', resourceId: dependency.characterVersionId };
    case 'world-experience-version':
      return { ownerId: 'world-version', resourceId: dependency.worldExperienceVersionId };
    case 'asset-revision':
      return { ownerId: 'asset', resourceId: `${dependency.assetId}:${dependency.revision}` };
    case 'media-library':
      return {
        ownerId: 'media-library',
        resourceId: `${dependency.libraryName}:${dependency.relativePath}`,
      };
    case 'package-resource':
      return {
        ownerId: 'package-resource',
        resourceId: `${dependency.packageId}:${dependency.revision}:${dependency.resourcePath}`,
      };
  }
}

function targetKey(target: ResourceUsageTarget): string {
  return `${target.ownerId}:${target.resourceId}`;
}
