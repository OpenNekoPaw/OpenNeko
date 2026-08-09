import {
  parseCharacterFoundationSnapshot,
  type CharacterFoundationSnapshot,
} from '@neko/chara/contracts';
import type { WorldDurableCatalogPort } from '@neko/world/application';
import type { CharacterDurableCatalogPort } from './character-durable-catalog';

export class CharacterFoundationService {
  constructor(
    private readonly options: {
      readonly characterCatalog: CharacterDurableCatalogPort;
      readonly worldCatalog: WorldDurableCatalogPort;
    },
  ) {}

  async getSnapshot(signal?: AbortSignal): Promise<CharacterFoundationSnapshot> {
    signal?.throwIfAborted();
    const [character, world] = await Promise.all([
      this.options.characterCatalog.readCatalog(signal),
      this.options.worldCatalog.readCatalog(signal),
    ]);
    return parseCharacterFoundationSnapshot({
      character: {
        projects: character.projects,
        versions: character.versions,
        relationships: character.relationships,
        characterRuns: character.characterRuns,
        dialogueRuns: character.dialogueRuns,
        rooms: character.rooms,
        roomRuns: character.roomRuns,
      },
      world: {
        projects: world.projects,
        versions: world.versions,
        runtimes: world.runtimes,
      },
      diagnostics: [
        ...character.diagnostics.map((diagnostic) => ({ owner: 'character', ...diagnostic })),
        ...world.diagnostics.map((diagnostic) => ({ owner: 'world', ...diagnostic })),
      ],
    });
  }
}
