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

  async read(contentProjectId: string, signal?: AbortSignal): Promise<ProjectDependencySnapshot> {
    return (await this.readWithOwners(contentProjectId, signal)).dependencies;
  }

  async readWithOwners(
    contentProjectId: string,
    signal?: AbortSignal,
  ): Promise<{
    readonly characters: CharacterAuthoringCatalog;
    readonly worlds: WorldAuthoringCatalog;
    readonly dependencies: ProjectDependencySnapshot;
  }> {
    if (!contentProjectId.trim()) throw new Error('Content Project identity must be non-empty.');
    signal?.throwIfAborted();
    const [characters, worlds, contentReferences] = await Promise.all([
      this.options.characters.readAuthoringCatalog(signal),
      this.options.worlds.readAuthoringCatalog(signal),
      this.options.references.readReferences(contentProjectId, signal),
    ]);
    requireProjectScope(characters.scope, contentProjectId, 'Character');
    requireProjectScope(worlds.scope, contentProjectId, 'World');
    return {
      characters,
      worlds,
      dependencies: deriveProjectDependencySnapshot({
        projectId: contentProjectId,
        content: contentReferences,
        characters,
        worlds,
      }),
    };
  }
}

function requireProjectScope(
  scope: { readonly kind: string; readonly contentProjectId?: string },
  contentProjectId: string,
  owner: string,
): void {
  if (scope.kind !== 'content-project' || scope.contentProjectId !== contentProjectId) {
    throw new Error(`${owner} catalog does not belong to Content Project '${contentProjectId}'.`);
  }
}
