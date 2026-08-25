import type {
  CharacterAuthoringCatalog,
  CharacterAuthoringCatalogPort,
} from '@neko/chara-domain/application';
import type {
  WorldAuthoringCatalog,
  WorldAuthoringCatalogPort,
} from '@neko/world-domain/application';
import {
  projectLocalTargetKey,
  projectPublicationDependencyKey,
  type ProjectLocalTargetRef,
  type ProjectPublicationDependencyRef,
} from '../contracts/project-target';
import type { ProjectAuthoringNavigationItem } from '../contracts/project-authoring-navigation';
import {
  projectAuthoringNavigation,
  type ProjectTargetResolution,
} from './project-target-projection';
import type { ProjectContentReferenceReaderPort } from './project-dependency-projection';
import { ProjectDependencyService } from './project-dependency-service';

export class ProjectAuthoringNavigationService {
  constructor(
    private readonly options: {
      readonly characters: CharacterAuthoringCatalogPort;
      readonly worlds: WorldAuthoringCatalogPort;
      readonly references: ProjectContentReferenceReaderPort;
    },
  ) {}

  async read(input: {
    readonly projectId: string;
    readonly signal?: AbortSignal;
  }): Promise<readonly ProjectAuthoringNavigationItem[]> {
    const { characters, worlds, dependencies } = await new ProjectDependencyService(
      this.options,
    ).readWithOwners(input.projectId, input.signal);
    const localTargets: ProjectLocalTargetRef[] = [
      ...characters.projects.map((project) => ({
        kind: 'character-project' as const,
        characterProjectId: project.characterProjectId,
      })),
      ...worlds.projects.map((project) => ({
        kind: 'world-project' as const,
        worldProjectId: project.worldProjectId,
      })),
    ];
    const dependencyRefs = dependencies.dependencies.map((item) => item.dependency);
    return projectAuthoringNavigation({
      localTargets,
      dependencies: dependencyRefs,
      localTargetResolutions: localTargets.map((target) =>
        resolveLocalTarget(target, characters, worlds),
      ),
      dependencyResolutions: dependencyRefs.map((dependency) =>
        resolveDependency(dependency, characters, worlds),
      ),
    });
  }
}

function resolveDependency(
  dependency: ProjectPublicationDependencyRef,
  characters: CharacterAuthoringCatalog,
  worlds: WorldAuthoringCatalog,
): ProjectTargetResolution {
  const identity = projectPublicationDependencyKey(dependency);
  if (dependency.kind === 'character-version') {
    const publication = characters.versions.find(
      (item) => item.characterVersionId === dependency.characterVersionId,
    );
    return publication
      ? {
          identity,
          label: publication.label,
          sourceStudioTarget: {
            kind: 'character-studio',
            characterProjectId: publication.characterProjectId,
          },
        }
      : {
          identity,
          diagnostic: `CharacterVersion '${dependency.characterVersionId}' is unavailable.`,
        };
  }
  if (dependency.kind === 'world-experience-version') {
    const publication = worlds.versions.find(
      (item) => item.worldVersionId === dependency.worldExperienceVersionId,
    );
    return publication
      ? {
          identity,
          label: publication.label,
          sourceStudioTarget: {
            kind: 'world-studio',
            worldProjectId: publication.worldProjectId,
          },
        }
      : {
          identity,
          diagnostic: `WorldExperienceVersion '${dependency.worldExperienceVersionId}' is unavailable.`,
        };
  }
  return {
    identity,
    diagnostic: `Dependency '${identity}' requires its exact owner availability reader.`,
  };
}

function resolveLocalTarget(
  target: ProjectLocalTargetRef,
  characters: CharacterAuthoringCatalog,
  worlds: WorldAuthoringCatalog,
): ProjectTargetResolution {
  const identity = projectLocalTargetKey(target);
  if (target.kind === 'character-project') {
    const project = characters.projects.find(
      (item) => item.characterProjectId === target.characterProjectId,
    );
    const diagnostic = characters.diagnostics.find(
      (item) =>
        item.recordKind === 'character-project' && item.recordId === target.characterProjectId,
    );
    return project
      ? { identity, label: project.displayName, diagnostic: diagnostic?.message }
      : {
          identity,
          diagnostic:
            diagnostic?.message ??
            `CharacterProject '${target.characterProjectId}' is unavailable.`,
        };
  }
  const project = worlds.projects.find((item) => item.worldProjectId === target.worldProjectId);
  const diagnostic = worlds.diagnostics.find(
    (item) => item.recordKind === 'world-project' && item.recordId === target.worldProjectId,
  );
  return project
    ? { identity, label: project.title, diagnostic: diagnostic?.message }
    : {
        identity,
        diagnostic:
          diagnostic?.message ?? `WorldProject '${target.worldProjectId}' is unavailable.`,
      };
}
