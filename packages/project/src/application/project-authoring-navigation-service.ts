import type {
  CharacterAuthoringCatalog,
  CharacterAuthoringCatalogPort,
} from '@neko/chara/application';
import type { WorldAuthoringCatalog, WorldAuthoringCatalogPort } from '@neko/world/application';
import {
  projectLocalTargetKey,
  projectPublicationDependencyKey,
  type ProjectLocalTargetRef,
} from '../contracts/project-composition';
import type { ProjectAuthoringNavigationItem } from '../contracts/project-authoring-navigation';
import {
  ProjectCompositionService,
  type ProjectCompositionRepository,
} from './project-composition-service';
import {
  projectAuthoringNavigation,
  type ProjectTargetResolution,
} from './project-target-projection';

export class ProjectAuthoringNavigationService {
  private readonly compositions: ProjectCompositionService;

  constructor(
    private readonly options: {
      readonly composition: ProjectCompositionRepository;
      readonly characters: CharacterAuthoringCatalogPort;
      readonly worlds: WorldAuthoringCatalogPort;
    },
  ) {
    this.compositions = new ProjectCompositionService(options.composition);
  }

  async read(input: {
    readonly contentProjectId: string;
    readonly contentLabel: string;
    readonly signal?: AbortSignal;
  }): Promise<readonly ProjectAuthoringNavigationItem[]> {
    const composition = await this.compositions.require(input.contentProjectId, input.signal);
    const [characters, worlds] = await Promise.all([
      this.options.characters.readAuthoringCatalog(input.signal),
      this.options.worlds.readAuthoringCatalog(input.signal),
    ]);
    requireProjectScope(characters, input.contentProjectId, 'Character');
    requireProjectScope(worlds, input.contentProjectId, 'World');
    return projectAuthoringNavigation({
      composition,
      content: {
        identity: `content-project:${input.contentProjectId}`,
        label: input.contentLabel,
      },
      localTargetResolutions: composition.localTargets.map((target) =>
        resolveLocalTarget(target, characters, worlds),
      ),
      dependencyResolutions: composition.dependencies.map((dependency): ProjectTargetResolution => {
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
        return {
          identity,
          diagnostic: `WorldExperienceVersion '${dependency.worldExperienceVersionId}' is unavailable.`,
        };
      }),
      discoveredLocalTargets: [
        ...characters.projects.map((project): ProjectLocalTargetRef => ({
          kind: 'character-project',
          characterProjectId: project.characterProjectId,
        })),
        ...worlds.projects.map((project): ProjectLocalTargetRef => ({
          kind: 'world-project',
          worldProjectId: project.worldProjectId,
        })),
      ],
    });
  }
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

function requireProjectScope(
  catalog: CharacterAuthoringCatalog | WorldAuthoringCatalog,
  contentProjectId: string,
  owner: string,
): void {
  if (
    catalog.scope.kind !== 'content-project' ||
    catalog.scope.contentProjectId !== contentProjectId
  ) {
    throw new Error(
      `${owner} authoring catalog does not match Content Project '${contentProjectId}'.`,
    );
  }
}
