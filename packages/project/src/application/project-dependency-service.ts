import type {
  CharacterAuthoringCatalog,
  CharacterAuthoringCatalogPort,
} from '@neko/chara/application';
import type { WorldAuthoringCatalog, WorldAuthoringCatalogPort } from '@neko/world/application';
import type { ProjectDependencySnapshot } from '../contracts/project-dependency';
import {
  deriveProjectDependencySnapshot,
  type ProjectContentReferenceReaderPort,
} from './project-dependency-projection';

export class ProjectDependencyService {
  constructor(
    private readonly options: {
      readonly characters: CharacterAuthoringCatalogPort;
      readonly worlds: WorldAuthoringCatalogPort;
      readonly references: ProjectContentReferenceReaderPort;
    },
  ) {}

  async read(projectId: string, signal?: AbortSignal): Promise<ProjectDependencySnapshot> {
    return (await this.readWithOwners(projectId, signal)).dependencies;
  }

  async readWithOwners(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly characters: CharacterAuthoringCatalog;
    readonly worlds: WorldAuthoringCatalog;
    readonly dependencies: ProjectDependencySnapshot;
  }> {
    if (!projectId.trim()) throw new Error('Project identity must be non-empty.');
    signal?.throwIfAborted();
    const [characters, worlds, contentReferences] = await Promise.all([
      this.options.characters.readAuthoringCatalog(signal),
      this.options.worlds.readAuthoringCatalog(signal),
      this.options.references.readReferences(projectId, signal),
    ]);
    requireProjectScope(characters.scope, projectId, 'Character');
    requireProjectScope(worlds.scope, projectId, 'World');
    return {
      characters,
      worlds,
      dependencies: deriveProjectDependencySnapshot({
        projectId,
        content: contentReferences,
        characters,
        worlds,
      }),
    };
  }
}

function requireProjectScope(
  scope: { readonly kind: string; readonly projectId?: string },
  projectId: string,
  owner: string,
): void {
  if (scope.kind !== 'project' || scope.projectId !== projectId) {
    throw new Error(`${owner} catalog does not belong to Project '${projectId}'.`);
  }
}
