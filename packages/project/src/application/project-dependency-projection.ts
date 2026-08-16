import type { CharacterAuthoringCatalog } from '@neko/chara/application';
import type { ContentLocator } from '@neko/content';
import type { WorldAuthoringCatalog } from '@neko/world/application';
import {
  PROJECT_REFERENCE_OWNER_KINDS,
  projectDependencySnapshot,
  type ProjectDependencySnapshot,
  type ProjectReferenceDiagnostic,
  type ProjectReferenceOwnerKind,
  type ProjectReferenceOwnerSnapshot,
} from '../contracts/project-dependency';
import type { ProjectPublicationDependencyRef } from '../contracts/project-target';

export type ProjectContentReferenceOwnerKind = Extract<
  ProjectReferenceOwnerKind,
  'canvas' | 'cut' | 'entity-representation'
>;

export interface ProjectContentReferenceOwner {
  readonly ownerKind: ProjectContentReferenceOwnerKind;
  readonly ownerId: string;
  readonly sourceFingerprint: string;
  readonly references: readonly ContentLocator[];
}

export interface ProjectContentReferenceCatalog {
  readonly owners: readonly ProjectContentReferenceOwner[];
  readonly coveredOwnerKinds: readonly ProjectContentReferenceOwnerKind[];
  readonly diagnostics: readonly {
    readonly ownerKind: ProjectContentReferenceOwnerKind;
    readonly ownerId: string;
    readonly message: string;
  }[];
}

export interface ProjectContentReferenceReaderPort {
  readReferences(projectId: string, signal?: AbortSignal): Promise<ProjectContentReferenceCatalog>;
}

export function deriveProjectDependencySnapshot(input: {
  readonly projectId: string;
  readonly content: ProjectContentReferenceCatalog;
  readonly characters: CharacterAuthoringCatalog;
  readonly worlds: WorldAuthoringCatalog;
}): ProjectDependencySnapshot {
  requireScope(input.characters.scope, input.projectId, 'Character');
  requireScope(input.worlds.scope, input.projectId, 'World');
  const owners: ProjectReferenceOwnerSnapshot[] = input.content.owners.map((owner) => ({
    ownerKind: owner.ownerKind,
    ownerId: owner.ownerId,
    sourceFingerprint: owner.sourceFingerprint,
    references: owner.references.flatMap(contentDependency),
  }));
  owners.push(
    ...input.characters.projects.map((project) => ({
      ownerKind: 'character' as const,
      ownerId: project.characterProjectId,
      sourceFingerprint: project.updatedAt,
      references:
        project.draftBasisCharacterVersionId === undefined
          ? []
          : [
              {
                kind: 'character-version' as const,
                characterVersionId: project.draftBasisCharacterVersionId,
              },
            ],
    })),
    ...input.worlds.projects.map((project) => ({
      ownerKind: 'world' as const,
      ownerId: project.worldProjectId,
      sourceFingerprint: project.updatedAt,
      references: [],
    })),
  );
  const diagnostics: ProjectReferenceDiagnostic[] = [
    ...input.content.diagnostics,
    ...input.characters.diagnostics.map((diagnostic) => ({
      ownerKind: 'character' as const,
      ownerId: diagnostic.recordId,
      message: diagnostic.message,
    })),
    ...input.worlds.diagnostics.map((diagnostic) => ({
      ownerKind: 'world' as const,
      ownerId: diagnostic.recordId,
      message: diagnostic.message,
    })),
  ];
  const coveredOwnerKinds: ProjectReferenceOwnerKind[] = [
    ...input.content.coveredOwnerKinds,
    ...(input.characters.diagnostics.length === 0 ? (['character'] as const) : []),
    ...(input.worlds.diagnostics.length === 0 ? (['world'] as const) : []),
  ];
  return projectDependencySnapshot({
    projectId: input.projectId,
    owners,
    coverage: {
      expectedOwnerKinds: PROJECT_REFERENCE_OWNER_KINDS,
      coveredOwnerKinds,
    },
    diagnostics,
  });
}

function contentDependency(locator: ContentLocator): readonly ProjectPublicationDependencyRef[] {
  if (locator.kind === 'workspace-file') {
    const segments = locator.path.split('/');
    if (segments[0] === 'neko' && segments[1] === 'assets' && segments.length >= 4) {
      const libraryName = segments[2];
      const relativePath = segments.slice(3).join('/');
      if (libraryName && relativePath) {
        return [{ kind: 'media-library', libraryName, relativePath }];
      }
    }
  }
  if (locator.kind === 'package-resource') {
    return [
      {
        kind: 'asset-revision',
        assetId: locator.packageId,
        revision: locator.revision,
      },
      {
        kind: 'package-resource',
        packageId: locator.packageId,
        revision: locator.revision,
        resourcePath: locator.resourcePath,
      },
    ];
  }
  return [];
}

function requireScope(
  scope: { readonly kind: string; readonly projectId?: string },
  projectId: string,
  owner: string,
): void {
  if (scope.kind !== 'project' || scope.projectId !== projectId) {
    throw new Error(`${owner} catalog does not belong to Content Project '${projectId}'.`);
  }
}
