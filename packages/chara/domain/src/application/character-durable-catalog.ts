import type {
  CharacterAuthoringTestSnapshot,
  CharacterProject,
  CharacterRoom,
  CharacterRun,
  CharacterCompanionContinuity,
  CharacterStoryline,
  CharacterStorylineDraft,
  CharacterStorylineVersion,
  CharacterRunPresentationConfiguration,
  CharacterVersion,
  DialogueRun,
  RoomRun,
  UserCharacterRelationship,
} from '@neko/chara-domain/contracts';

export type CharacterAuthoringCatalogScope = {
  readonly kind: 'project';
  readonly projectId: string;
};

export interface CharacterAuthoringCatalog {
  readonly scope: CharacterAuthoringCatalogScope;
  readonly projects: readonly CharacterProject[];
  readonly versions: readonly CharacterVersion[];
  readonly authoringTestSnapshots: readonly CharacterAuthoringTestSnapshot[];
  readonly diagnostics: readonly CharacterDurableRecordDiagnostic[];
}

export interface CharacterAuthoringCatalogPort {
  readAuthoringCatalog(signal?: AbortSignal): Promise<CharacterAuthoringCatalog>;
}

export interface CharacterDurableRecordDiagnostic {
  readonly recordKind:
    | 'character-project'
    | 'character-version'
    | 'authoring-test-snapshot'
    | 'relationship'
    | 'character-run'
    | 'dialogue-run'
    | 'character-room'
    | 'room-run'
    | 'character-storyline'
    | 'character-storyline-draft'
    | 'character-storyline-version'
    | 'character-storyline-run'
    | 'character-storyline-observation-candidate'
    | 'character-memory-scope'
    | 'character-companion-continuity'
    | 'character-presentation-configuration';
  readonly recordId: string;
  readonly message: string;
}

export interface CharacterDurableCatalog {
  readonly projects: readonly CharacterProject[];
  readonly versions: readonly CharacterVersion[];
  readonly relationships: readonly UserCharacterRelationship[];
  readonly characterRuns: readonly CharacterRun[];
  readonly dialogueRuns: readonly DialogueRun[];
  readonly rooms: readonly CharacterRoom[];
  readonly roomRuns: readonly RoomRun[];
  readonly storylines: readonly CharacterStoryline[];
  readonly storylineDrafts: readonly CharacterStorylineDraft[];
  readonly storylineVersions: readonly CharacterStorylineVersion[];
  readonly companionContinuities: readonly CharacterCompanionContinuity[];
  readonly presentationConfigurations: readonly CharacterRunPresentationConfiguration[];
  readonly diagnostics: readonly CharacterDurableRecordDiagnostic[];
}

export interface CharacterDurableCatalogPort {
  readCatalog(signal?: AbortSignal): Promise<CharacterDurableCatalog>;
}

export interface CharacterRuntimeCatalog {
  readonly relationships: readonly UserCharacterRelationship[];
  readonly characterRuns: readonly CharacterRun[];
  readonly dialogueRuns: readonly DialogueRun[];
  readonly rooms: readonly CharacterRoom[];
  readonly roomRuns: readonly RoomRun[];
  readonly storylines: readonly CharacterStoryline[];
  readonly storylineDrafts: readonly CharacterStorylineDraft[];
  readonly storylineVersions: readonly CharacterStorylineVersion[];
  readonly companionContinuities: readonly CharacterCompanionContinuity[];
  readonly presentationConfigurations: readonly CharacterRunPresentationConfiguration[];
  readonly diagnostics: readonly CharacterDurableRecordDiagnostic[];
}

export interface CharacterRuntimeCatalogPort {
  readRuntimeCatalog(signal?: AbortSignal): Promise<CharacterRuntimeCatalog>;
}

export function createCharacterDurableCatalogPort(options: {
  readonly authoring: CharacterAuthoringCatalogPort;
  readonly runtime: CharacterRuntimeCatalogPort;
}): CharacterDurableCatalogPort {
  return Object.freeze({
    async readCatalog(signal?: AbortSignal): Promise<CharacterDurableCatalog> {
      signal?.throwIfAborted();
      const [authoring, runtime] = await Promise.all([
        options.authoring.readAuthoringCatalog(signal),
        options.runtime.readRuntimeCatalog(signal),
      ]);
      return {
        projects: authoring.projects,
        versions: authoring.versions,
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
        diagnostics: [...authoring.diagnostics, ...runtime.diagnostics],
      };
    },
  });
}
