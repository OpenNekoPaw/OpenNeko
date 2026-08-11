import {
  parseCharacterConversationLaunchCatalog,
  parseCharacterFoundationSnapshot,
  type CharacterConversationLaunchCatalog,
  type CharacterFoundationSnapshot,
} from '@neko/chara/contracts';
import type { CharacterDurableCatalogPort } from './character-durable-catalog';

export class CharacterFoundationService {
  constructor(
    private readonly options: {
      readonly characterCatalog: CharacterDurableCatalogPort;
    },
  ) {}

  async getSnapshot(signal?: AbortSignal): Promise<CharacterFoundationSnapshot> {
    signal?.throwIfAborted();
    const character = await this.options.characterCatalog.readCatalog(signal);
    return parseCharacterFoundationSnapshot({
      character: {
        projects: character.projects,
        versions: character.versions,
        relationships: character.relationships,
        characterRuns: character.characterRuns,
        dialogueRuns: character.dialogueRuns,
        rooms: character.rooms,
        roomRuns: character.roomRuns,
        storylines: character.storylines,
        storylineDrafts: character.storylineDrafts,
        storylineVersions: character.storylineVersions,
        companionContinuities: character.companionContinuities,
        presentationConfigurations: character.presentationConfigurations,
      },
      diagnostics: character.diagnostics.map((diagnostic) => ({
        owner: 'character',
        ...diagnostic,
      })),
    });
  }

  async getConversationLaunchCatalog(
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchCatalog> {
    signal?.throwIfAborted();
    const character = await this.options.characterCatalog.readCatalog(signal);
    const projects = new Map(
      character.projects.map((project) => [project.characterProjectId, project] as const),
    );
    const storylinesByPublicationId = new Map<string, typeof character.storylineVersions>();
    for (const storyline of character.storylineVersions) {
      const current = storylinesByPublicationId.get(storyline.characterVersionId) ?? [];
      storylinesByPublicationId.set(storyline.characterVersionId, [...current, storyline]);
    }
    const targets: CharacterConversationLaunchCatalog['targets'][number][] = [];
    const diagnostics: CharacterConversationLaunchCatalog['diagnostics'][number][] = [];
    for (const publication of character.versions) {
      const project = projects.get(publication.characterProjectId);
      if (!project) {
        diagnostics.push({
          characterVersionId: publication.characterVersionId,
          message: `CharacterVersion '${publication.characterVersionId}' references unavailable CharacterProject '${publication.characterProjectId}'.`,
        });
        continue;
      }
      targets.push({
        characterProjectId: project.characterProjectId,
        characterVersionId: publication.characterVersionId,
        displayName: project.displayName,
        versionLabel: publication.label,
        storylines: (storylinesByPublicationId.get(publication.characterVersionId) ?? []).map(
          (storyline) => ({
            characterStorylineVersionId: storyline.characterStorylineVersionId,
            label: storyline.label,
          }),
        ),
      });
    }
    return parseCharacterConversationLaunchCatalog({ targets, diagnostics });
  }
}
