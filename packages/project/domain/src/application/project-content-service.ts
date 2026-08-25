import type { CharacterAuthoringCatalogPort } from '@neko/chara-domain/application';
import type { WorldAuthoringCatalogPort } from '@neko/world-domain/application';
import type { ProjectContentEntityCatalog } from './project-content-projection';
import type { ProjectContentProjection } from '../contracts/project-content';
import { projectContentProjection } from './project-content-projection';
import { projectEntityCharacterResourceProjections } from './project-entity-character-resource-projection';
import type { ProjectEntityCharacterAssociationReaderPort } from './project-fact-ports';

export interface ProjectContentEntityCatalogPort {
  readProjectContentEntities(signal?: AbortSignal): Promise<ProjectContentEntityCatalog>;
}

export class ProjectContentService {
  constructor(
    private readonly ports: {
      readonly associations: ProjectEntityCharacterAssociationReaderPort;
      readonly characters: CharacterAuthoringCatalogPort;
      readonly worlds: WorldAuthoringCatalogPort;
      readonly entities: ProjectContentEntityCatalogPort;
    },
  ) {}

  async read(projectId: string, signal?: AbortSignal): Promise<ProjectContentProjection> {
    signal?.throwIfAborted();
    const [associations, characters, worlds, entities] = await Promise.all([
      this.ports.associations.list(),
      this.ports.characters.readAuthoringCatalog(signal),
      this.ports.worlds.readAuthoringCatalog(signal),
      this.ports.entities.readProjectContentEntities(signal),
    ]);
    return projectContentProjection({
      projectId,
      associations,
      characters,
      characterAssociations: projectEntityCharacterResourceProjections({
        projectId,
        associations: associations.associations,
        characters,
      }),
      entities,
      worlds,
    });
  }
}
