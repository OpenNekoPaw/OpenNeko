import type { CharacterAuthoringCatalogPort } from '@neko/chara/application';
import type { WorldAuthoringCatalogPort } from '@neko/world/application';
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

  async read(contentProjectId: string, signal?: AbortSignal): Promise<ProjectContentProjection> {
    signal?.throwIfAborted();
    const [associations, characters, worlds, entities] = await Promise.all([
      this.ports.associations.list(),
      this.ports.characters.readAuthoringCatalog(signal),
      this.ports.worlds.readAuthoringCatalog(signal),
      this.ports.entities.readProjectContentEntities(signal),
    ]);
    return projectContentProjection({
      projectId: contentProjectId,
      associations,
      characters,
      characterAssociations: projectEntityCharacterResourceProjections({
        projectId: contentProjectId,
        associations: associations.associations,
        characters,
      }),
      entities,
      worlds,
    });
  }
}
