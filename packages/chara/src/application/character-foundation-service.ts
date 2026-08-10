import {
  parseCharacterFoundationSnapshot,
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
        storylineVersions: character.storylineVersions,
        storylineRuns: character.storylineRuns,
        storylineObservationCandidates: character.storylineObservationCandidates,
        memoryScopes: character.memoryScopes,
        presentationConfigurations: character.presentationConfigurations,
      },
      diagnostics: character.diagnostics.map((diagnostic) => ({
        owner: 'character',
        ...diagnostic,
      })),
    });
  }
}
