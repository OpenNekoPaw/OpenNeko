import {
  parseCharacterProject,
  parseCharacterWorkspaceGlobalLink,
  parseGlobalCharacter,
  parseGlobalCharacterCatalog,
  parseGlobalCharacterVersion,
  type CharacterDefinition,
  type CharacterProject,
  type CharacterWorkspaceGlobalLink,
  type GlobalCharacter,
  type GlobalCharacterCatalog,
  type GlobalCharacterVersion,
} from '@neko/chara-domain/contracts';

export interface CharacterGlobalCatalogRepository {
  readCatalog(signal?: AbortSignal): Promise<GlobalCharacterCatalog>;
  commitCatalog(
    input: {
      readonly expectedCurrentCharacterVersionId?: string;
      readonly character: GlobalCharacter;
      readonly version: GlobalCharacterVersion;
      readonly link: CharacterWorkspaceGlobalLink;
    },
    signal?: AbortSignal,
  ): Promise<void>;
  commitGlobalCatalog(
    input: {
      readonly expectedCurrentCharacterVersionId?: string;
      readonly character: GlobalCharacter;
      readonly version: GlobalCharacterVersion;
    },
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface CharacterWorkspaceProjectReader {
  readProject(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterProject | undefined>;
}

export interface CharacterDisplayNameReader {
  requireDisplayName(characterVersionId: string, signal?: AbortSignal): Promise<string>;
}

export type SynchronizeCharacterConflictChoice = 'base-on-current' | 'save-as-new';

export interface SynchronizeCharacterInput {
  readonly characterProjectId: string;
  readonly globalCharacterId: string;
  readonly characterVersionId: string;
  readonly label: string;
  readonly lastSyncedCharacterVersionId?: string;
  readonly conflictChoice?: SynchronizeCharacterConflictChoice;
}

export interface CharacterSynchronizationReceipt {
  readonly globalCharacter: GlobalCharacter;
  readonly characterVersion: GlobalCharacterVersion;
  readonly link: CharacterWorkspaceGlobalLink;
}

export interface CreateGlobalCharacterInput {
  readonly globalCharacterId: string;
  readonly characterVersionId: string;
  readonly displayName: string;
  readonly label: string;
  readonly definition: CharacterDefinition;
  readonly acceptedEvidenceIds?: readonly string[];
}

export interface PrepareCharacterWorkspaceCopyInput {
  readonly globalCharacterId: string;
  readonly characterVersionId: string;
  readonly characterProjectId: string;
}

export type ImportCharacterGlobalVersionInput =
  | {
      readonly target: { readonly kind: 'new'; readonly globalCharacterId: string };
      readonly displayName: string;
      readonly characterVersion: GlobalCharacterVersion;
    }
  | {
      readonly target: {
        readonly kind: 'existing';
        readonly globalCharacterId: string;
        readonly expectedCurrentCharacterVersionId: string;
      };
      readonly displayName: string;
      readonly characterVersion: GlobalCharacterVersion;
    };

export interface CharacterGlobalImportReceipt {
  readonly globalCharacter: GlobalCharacter;
  readonly characterVersion: GlobalCharacterVersion;
}

export class CharacterGlobalCatalogError extends Error {
  constructor(
    readonly code:
      | 'character-workspace-object-unavailable'
      | 'global-character-already-exists'
      | 'global-character-unavailable'
      | 'global-character-version-unavailable'
      | 'global-character-stale-base'
      | 'global-character-version-conflict'
      | 'global-character-conflict-choice-invalid'
      | 'global-character-import-target-mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'CharacterGlobalCatalogError';
  }
}

export class CharacterGlobalCatalogService implements CharacterDisplayNameReader {
  private readonly now: () => string;

  constructor(
    private readonly ports: {
      readonly workspace?: CharacterWorkspaceProjectReader;
      readonly repository: CharacterGlobalCatalogRepository;
      readonly now?: () => string;
    },
  ) {
    this.now = ports.now ?? (() => new Date().toISOString());
  }

  async readCatalog(signal?: AbortSignal): Promise<GlobalCharacterCatalog> {
    signal?.throwIfAborted();
    return parseGlobalCharacterCatalog(await this.ports.repository.readCatalog(signal));
  }

  async requireDisplayName(characterVersionId: string, signal?: AbortSignal): Promise<string> {
    const catalog = await this.readCatalog(signal);
    const version = catalog.versions.find(
      (candidate) => candidate.characterVersionId === characterVersionId,
    );
    if (!version) {
      throw new CharacterGlobalCatalogError(
        'global-character-version-unavailable',
        `CharacterVersion '${characterVersionId}' is unavailable in the GlobalCharacter catalog.`,
      );
    }
    const character = catalog.characters.find(
      (candidate) => candidate.globalCharacterId === version.globalCharacterId,
    );
    if (!character || !character.characterVersionIds.includes(characterVersionId)) {
      throw new CharacterGlobalCatalogError(
        'global-character-unavailable',
        `GlobalCharacter '${version.globalCharacterId}' does not own CharacterVersion '${characterVersionId}'.`,
      );
    }
    return character.displayName;
  }

  async synchronize(
    input: SynchronizeCharacterInput,
    signal?: AbortSignal,
  ): Promise<CharacterSynchronizationReceipt> {
    signal?.throwIfAborted();
    if (!this.ports.workspace) {
      throw new CharacterGlobalCatalogError(
        'character-workspace-object-unavailable',
        'Character synchronization requires an exact Project Workspace authority.',
      );
    }
    const project = await this.ports.workspace.readProject(input.characterProjectId, signal);
    if (!project) {
      throw new CharacterGlobalCatalogError(
        'character-workspace-object-unavailable',
        `CharacterProject '${input.characterProjectId}' is unavailable.`,
      );
    }
    const canonicalProject = parseCharacterProject(project);
    const catalog = await this.readCatalog(signal);
    const existing = catalog.characters.find(
      (character) => character.globalCharacterId === input.globalCharacterId,
    );
    const timestamp = this.now();
    const character = this.nextCharacter(input, canonicalProject, existing, timestamp);
    if (
      catalog.versions.some((version) => version.characterVersionId === input.characterVersionId)
    ) {
      throw new CharacterGlobalCatalogError(
        'global-character-version-conflict',
        `CharacterVersion '${input.characterVersionId}' already exists.`,
      );
    }
    const version = parseGlobalCharacterVersion({
      characterVersionId: input.characterVersionId,
      globalCharacterId: character.globalCharacterId,
      label: input.label,
      definition: canonicalProject.draft,
      acceptedEvidenceIds: canonicalProject.evidence.map((evidence) => evidence.evidenceId),
      publishedAt: timestamp,
    });
    const link = parseCharacterWorkspaceGlobalLink({
      characterProjectId: canonicalProject.characterProjectId,
      globalCharacterId: character.globalCharacterId,
      lastSyncedCharacterVersionId: version.characterVersionId,
    });
    await this.ports.repository.commitCatalog(
      {
        ...(existing === undefined
          ? {}
          : { expectedCurrentCharacterVersionId: existing.currentCharacterVersionId }),
        character,
        version,
        link,
      },
      signal,
    );
    return structuredClone({ globalCharacter: character, characterVersion: version, link });
  }

  async createGlobal(
    input: CreateGlobalCharacterInput,
    signal?: AbortSignal,
  ): Promise<CharacterGlobalImportReceipt> {
    signal?.throwIfAborted();
    const catalog = await this.readCatalog(signal);
    if (
      catalog.characters.some(
        (character) => character.globalCharacterId === input.globalCharacterId,
      )
    ) {
      throw new CharacterGlobalCatalogError(
        'global-character-already-exists',
        `GlobalCharacter '${input.globalCharacterId}' already exists.`,
      );
    }
    if (
      catalog.versions.some((version) => version.characterVersionId === input.characterVersionId)
    ) {
      throw new CharacterGlobalCatalogError(
        'global-character-version-conflict',
        `CharacterVersion '${input.characterVersionId}' already exists.`,
      );
    }
    const timestamp = this.now();
    const character = parseGlobalCharacter({
      globalCharacterId: input.globalCharacterId,
      displayName: input.displayName,
      currentCharacterVersionId: input.characterVersionId,
      characterVersionIds: [input.characterVersionId],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const version = parseGlobalCharacterVersion({
      characterVersionId: input.characterVersionId,
      globalCharacterId: input.globalCharacterId,
      label: input.label,
      definition: input.definition,
      acceptedEvidenceIds: input.acceptedEvidenceIds ?? [],
      publishedAt: timestamp,
    });
    await this.ports.repository.commitGlobalCatalog({ character, version }, signal);
    return structuredClone({ globalCharacter: character, characterVersion: version });
  }

  async prepareWorkspaceCopy(
    input: PrepareCharacterWorkspaceCopyInput,
    signal?: AbortSignal,
  ): Promise<CharacterProject> {
    signal?.throwIfAborted();
    const catalog = await this.readCatalog(signal);
    const character = catalog.characters.find(
      (candidate) => candidate.globalCharacterId === input.globalCharacterId,
    );
    const version = catalog.versions.find(
      (candidate) => candidate.characterVersionId === input.characterVersionId,
    );
    if (
      !character?.characterVersionIds.includes(input.characterVersionId) ||
      version?.globalCharacterId !== input.globalCharacterId
    ) {
      throw new CharacterGlobalCatalogError(
        'global-character-unavailable',
        `CharacterVersion '${input.characterVersionId}' does not belong to exact GlobalCharacter '${input.globalCharacterId}'.`,
      );
    }
    const timestamp = this.now();
    return parseCharacterProject({
      characterProjectId: input.characterProjectId,
      displayName: character.displayName,
      draft: version.definition,
      evidence: [],
      candidates: [],
      reviewStatus: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async importVersion(
    input: ImportCharacterGlobalVersionInput,
    signal?: AbortSignal,
  ): Promise<CharacterGlobalImportReceipt> {
    signal?.throwIfAborted();
    const version = parseGlobalCharacterVersion(input.characterVersion);
    const catalog = await this.readCatalog(signal);
    if (
      catalog.versions.some(
        (candidate) => candidate.characterVersionId === version.characterVersionId,
      )
    ) {
      throw new CharacterGlobalCatalogError(
        'global-character-version-conflict',
        `CharacterVersion '${version.characterVersionId}' already exists.`,
      );
    }
    const timestamp = this.now();
    const existing = catalog.characters.find(
      (character) => character.globalCharacterId === input.target.globalCharacterId,
    );
    let character: GlobalCharacter;
    if (input.target.kind === 'new') {
      if (existing) {
        throw new CharacterGlobalCatalogError(
          'global-character-already-exists',
          `GlobalCharacter '${input.target.globalCharacterId}' already exists.`,
        );
      }
      character = parseGlobalCharacter({
        globalCharacterId: input.target.globalCharacterId,
        displayName: input.displayName,
        currentCharacterVersionId: version.characterVersionId,
        characterVersionIds: [version.characterVersionId],
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } else {
      if (
        !existing ||
        existing.currentCharacterVersionId !== input.target.expectedCurrentCharacterVersionId
      ) {
        throw new CharacterGlobalCatalogError(
          'global-character-import-target-mismatch',
          `GlobalCharacter '${input.target.globalCharacterId}' does not match the confirmed current version.`,
        );
      }
      character = parseGlobalCharacter({
        ...existing,
        displayName: input.displayName,
        currentCharacterVersionId: version.characterVersionId,
        characterVersionIds: [...existing.characterVersionIds, version.characterVersionId],
        updatedAt: timestamp,
      });
    }
    await this.ports.repository.commitGlobalCatalog(
      {
        ...(input.target.kind === 'existing'
          ? { expectedCurrentCharacterVersionId: input.target.expectedCurrentCharacterVersionId }
          : {}),
        character,
        version,
      },
      signal,
    );
    return structuredClone({ globalCharacter: character, characterVersion: version });
  }

  private nextCharacter(
    input: SynchronizeCharacterInput,
    project: CharacterProject,
    existing: GlobalCharacter | undefined,
    timestamp: string,
  ): GlobalCharacter {
    if (!existing) {
      if (input.lastSyncedCharacterVersionId !== undefined) {
        throw new CharacterGlobalCatalogError(
          'global-character-unavailable',
          `GlobalCharacter '${input.globalCharacterId}' is unavailable.`,
        );
      }
      return parseGlobalCharacter({
        globalCharacterId: input.globalCharacterId,
        displayName: project.displayName,
        currentCharacterVersionId: input.characterVersionId,
        characterVersionIds: [input.characterVersionId],
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    if (input.lastSyncedCharacterVersionId === undefined) {
      throw new CharacterGlobalCatalogError(
        'global-character-already-exists',
        `GlobalCharacter '${existing.globalCharacterId}' already exists.`,
      );
    }
    const stale = input.lastSyncedCharacterVersionId !== existing.currentCharacterVersionId;
    if (stale && input.conflictChoice === undefined) {
      throw new CharacterGlobalCatalogError(
        'global-character-stale-base',
        `GlobalCharacter '${existing.globalCharacterId}' changed since CharacterVersion '${input.lastSyncedCharacterVersionId}'.`,
      );
    }
    if (stale && input.conflictChoice === 'save-as-new') {
      throw new CharacterGlobalCatalogError(
        'global-character-conflict-choice-invalid',
        'Save as new requires a fresh GlobalCharacter identity and no last-synchronized version.',
      );
    }
    return parseGlobalCharacter({
      ...existing,
      displayName: project.displayName,
      currentCharacterVersionId: input.characterVersionId,
      characterVersionIds: [...existing.characterVersionIds, input.characterVersionId],
      updatedAt: timestamp,
    });
  }
}
