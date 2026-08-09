import type {
  CharacterProject,
  CharacterRoom,
  CharacterRun,
  CharacterVersion,
  DialogueRun,
  RoomRun,
  UserCharacterRelationship,
} from '@neko/chara/contracts';

export interface CharacterDurableRecordDiagnostic {
  readonly recordKind:
    | 'character-project'
    | 'character-version'
    | 'relationship'
    | 'character-run'
    | 'dialogue-run'
    | 'character-room'
    | 'room-run';
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
  readonly diagnostics: readonly CharacterDurableRecordDiagnostic[];
}

export interface CharacterDurableCatalogPort {
  readCatalog(signal?: AbortSignal): Promise<CharacterDurableCatalog>;
}
