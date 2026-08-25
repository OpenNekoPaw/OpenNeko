import {
  parseCharacterConversationLaunchCatalog,
  parseCharacterFoundationSnapshot,
  type CharacterConversationLaunchCatalog,
  type CharacterFoundationSnapshot,
  type GlobalCharacterCatalog,
} from '@neko/chara-domain/contracts';
import type { CharacterRuntimeCatalogPort } from './character-durable-catalog';

export interface CharacterFoundationGlobalCatalogPort {
  readCatalog(signal?: AbortSignal): Promise<GlobalCharacterCatalog>;
}

export class CharacterFoundationService {
  constructor(
    private readonly options: {
      readonly globalCatalog: CharacterFoundationGlobalCatalogPort;
      readonly runtime: CharacterRuntimeCatalogPort;
    },
  ) {}

  async getSnapshot(signal?: AbortSignal): Promise<CharacterFoundationSnapshot> {
    signal?.throwIfAborted();
    const [global, runtime] = await Promise.all([
      this.options.globalCatalog.readCatalog(signal),
      this.options.runtime.readRuntimeCatalog(signal),
    ]);
    return parseCharacterFoundationSnapshot({
      character: {
        globalCharacters: global.characters,
        versions: global.versions,
        relationships: runtime.relationships,
        characterRuns: runtime.characterRuns,
        dialogueRuns: runtime.dialogueRuns,
        rooms: runtime.rooms,
        roomRuns: runtime.roomRuns,
        storylines: runtime.storylines,
        storylineDrafts: runtime.storylineDrafts,
        storylineVersions: runtime.storylineVersions,
        companionContinuities: runtime.companionContinuities,
        presentationConfigurations: runtime.presentationConfigurations,
      },
      diagnostics: [
        ...global.diagnostics.map((diagnostic) => ({
          owner: 'character' as const,
          recordKind: diagnostic.recordKind,
          recordId: diagnostic.recordId ?? '<invalid-identity>',
          message: diagnostic.message,
        })),
        ...runtime.diagnostics.map((diagnostic) => ({
          owner: 'character' as const,
          ...diagnostic,
        })),
      ],
    });
  }

  async getConversationLaunchCatalog(
    signal?: AbortSignal,
  ): Promise<CharacterConversationLaunchCatalog> {
    signal?.throwIfAborted();
    const catalog = await this.options.globalCatalog.readCatalog(signal);
    const versions = new Map(
      catalog.versions.map((version) => [version.characterVersionId, version] as const),
    );
    const targets: CharacterConversationLaunchCatalog['targets'][number][] = [];
    const diagnostics: CharacterConversationLaunchCatalog['diagnostics'][number][] = [];
    for (const character of catalog.characters) {
      const path: { characterVersionId: string; label: string }[] = [];
      for (const characterVersionId of character.characterVersionIds) {
        const version = versions.get(characterVersionId);
        if (!version) {
          diagnostics.push({
            characterVersionId,
            message: `GlobalCharacter '${character.globalCharacterId}' references unavailable CharacterVersion '${characterVersionId}'.`,
          });
          continue;
        }
        path.push({ characterVersionId, label: version.label });
        targets.push({
          globalCharacterId: character.globalCharacterId,
          characterVersionId,
          displayName: character.displayName,
          versionLabel: version.label,
          lineage: {
            coverage: 'complete',
            state: path.length === 1 ? 'declared-root' : 'linked',
            isHead: character.currentCharacterVersionId === characterVersionId,
            path: [...path],
          },
          storylines: [],
        });
      }
    }
    return parseCharacterConversationLaunchCatalog({ targets, diagnostics });
  }
}
