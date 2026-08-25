import {
  parseCharacterStoryline,
  parseCharacterStorylineDraft,
  parseCharacterStorylineVersion,
  type CharacterStoryline,
  type CharacterStorylineDraft,
  type CharacterStorylineVersion,
  type CharacterVersion,
} from '@neko/chara-domain/contracts';

export interface CharacterStorylineRepository {
  readCharacterProject(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<unknown | undefined>;
  readCharacterVersion(
    characterVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion | undefined>;
  createStoryline(
    storyline: CharacterStoryline,
    draft: CharacterStorylineDraft,
    signal?: AbortSignal,
  ): Promise<void>;
  updateStoryline(
    storyline: CharacterStoryline,
    draft: CharacterStorylineDraft,
    signal?: AbortSignal,
  ): Promise<void>;
  readStoryline(
    characterStorylineId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStoryline | undefined>;
  readStorylineDraft(
    characterStorylineId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineDraft | undefined>;
  storeStorylineVersion(version: CharacterStorylineVersion, signal?: AbortSignal): Promise<void>;
  readStorylineVersion(
    characterStorylineVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineVersion | undefined>;
  listStorylines(
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<readonly CharacterStoryline[]>;
  listStorylineVersions(
    characterStorylineId: string,
    signal?: AbortSignal,
  ): Promise<readonly CharacterStorylineVersion[]>;
  deleteStoryline(characterStorylineId: string, signal?: AbortSignal): Promise<void>;
}

export type CharacterStorylineDiagnosticCode =
  | 'character-project-unavailable'
  | 'character-version-unavailable'
  | 'character-storyline-unavailable'
  | 'character-storyline-draft-unavailable'
  | 'character-storyline-version-unavailable'
  | 'character-storyline-binding-mismatch';

export class CharacterStorylineError extends Error {
  constructor(
    readonly code: CharacterStorylineDiagnosticCode,
    message: string,
    readonly recordId?: string,
  ) {
    super(message);
    this.name = 'CharacterStorylineError';
  }
}

export interface CreateCharacterStorylineInput {
  readonly characterStorylineId: string;
  readonly characterProjectId: string;
  readonly displayName: string;
  readonly draft: Omit<CharacterStorylineDraft, 'characterStorylineId' | 'updatedAt'>;
}

export interface PublishCharacterStorylineInput {
  readonly characterStorylineId: string;
  readonly characterStorylineVersionId: string;
  readonly label: string;
}

export interface CharacterStorylineComparison {
  readonly characterStorylineId: string;
  readonly leftCharacterStorylineVersionId: string;
  readonly rightCharacterStorylineVersionId: string;
  readonly addedStorylineNodeIds: readonly string[];
  readonly removedStorylineNodeIds: readonly string[];
  readonly changedStorylineNodeIds: readonly string[];
}

export class CharacterStorylineService {
  private readonly now: () => string;

  constructor(
    private readonly repository: CharacterStorylineRepository,
    options: { readonly now?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async create(
    input: CreateCharacterStorylineInput,
    signal?: AbortSignal,
  ): Promise<{ readonly storyline: CharacterStoryline; readonly draft: CharacterStorylineDraft }> {
    await this.requireProject(input.characterProjectId, signal);
    await this.requireVersionOwnedByProject(
      input.draft.characterVersionId,
      input.characterProjectId,
      signal,
    );
    const timestamp = this.now();
    const storyline = parseCharacterStoryline({
      characterStorylineId: input.characterStorylineId,
      characterProjectId: input.characterProjectId,
      displayName: input.displayName,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const draft = parseCharacterStorylineDraft({
      ...input.draft,
      characterStorylineId: storyline.characterStorylineId,
      updatedAt: timestamp,
    });
    await this.repository.createStoryline(storyline, draft, signal);
    return { storyline: clone(storyline), draft: clone(draft) };
  }

  async updateDraft(
    input: {
      readonly characterStorylineId: string;
      readonly displayName?: string;
      readonly draft: Omit<CharacterStorylineDraft, 'characterStorylineId' | 'updatedAt'>;
    },
    signal?: AbortSignal,
  ): Promise<{ readonly storyline: CharacterStoryline; readonly draft: CharacterStorylineDraft }> {
    const storyline = await this.requireStoryline(input.characterStorylineId, signal);
    await this.requireVersionOwnedByProject(
      input.draft.characterVersionId,
      storyline.characterProjectId,
      signal,
    );
    const timestamp = this.now();
    const nextStoryline = parseCharacterStoryline({
      ...storyline,
      ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
      updatedAt: timestamp,
    });
    const draft = parseCharacterStorylineDraft({
      ...input.draft,
      characterStorylineId: storyline.characterStorylineId,
      updatedAt: timestamp,
    });
    await this.repository.updateStoryline(nextStoryline, draft, signal);
    return { storyline: clone(nextStoryline), draft: clone(draft) };
  }

  validateDraft(value: unknown): CharacterStorylineDraft {
    return clone(parseCharacterStorylineDraft(value));
  }

  async publish(
    input: PublishCharacterStorylineInput,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineVersion> {
    const [storyline, draft] = await Promise.all([
      this.requireStoryline(input.characterStorylineId, signal),
      this.requireDraft(input.characterStorylineId, signal),
    ]);
    await this.requireVersionOwnedByProject(
      draft.characterVersionId,
      storyline.characterProjectId,
      signal,
    );
    const version = deepFreeze(
      parseCharacterStorylineVersion({
        characterStorylineVersionId: input.characterStorylineVersionId,
        characterStorylineId: storyline.characterStorylineId,
        characterVersionId: draft.characterVersionId,
        label: input.label,
        premise: draft.premise,
        constraints: draft.constraints,
        nodeOrder: draft.nodeOrder,
        nodes: draft.nodes,
        edges: draft.edges,
        publishedAt: this.now(),
      }),
    );
    await this.repository.storeStorylineVersion(version, signal);
    return clone(version);
  }

  async readCatalog(characterProjectId: string, signal?: AbortSignal) {
    await this.requireProject(characterProjectId, signal);
    const storylines = await this.repository.listStorylines(characterProjectId, signal);
    return Promise.all(
      storylines.map(async (stored) => {
        const storyline = parseCharacterStoryline(stored);
        if (storyline.characterProjectId !== characterProjectId) {
          throw storylineError(
            'character-storyline-binding-mismatch',
            `CharacterStoryline '${storyline.characterStorylineId}' belongs to another CharacterProject.`,
            storyline.characterStorylineId,
          );
        }
        const [draft, versions] = await Promise.all([
          this.repository.readStorylineDraft(storyline.characterStorylineId, signal),
          this.repository.listStorylineVersions(storyline.characterStorylineId, signal),
        ]);
        return {
          storyline: clone(storyline),
          ...(draft === undefined ? {} : { draft: clone(parseCharacterStorylineDraft(draft)) }),
          versions: versions.map((version) => clone(parseCharacterStorylineVersion(version))),
        };
      }),
    );
  }

  async compare(
    input: {
      readonly characterStorylineId: string;
      readonly leftCharacterStorylineVersionId: string;
      readonly rightCharacterStorylineVersionId: string;
    },
    signal?: AbortSignal,
  ): Promise<CharacterStorylineComparison> {
    const [left, right] = await Promise.all([
      this.requirePublication(input.leftCharacterStorylineVersionId, signal),
      this.requirePublication(input.rightCharacterStorylineVersionId, signal),
    ]);
    if (
      left.characterStorylineId !== input.characterStorylineId ||
      right.characterStorylineId !== input.characterStorylineId
    ) {
      throw storylineError(
        'character-storyline-binding-mismatch',
        'Storyline comparison publications must belong to the exact CharacterStoryline.',
        input.characterStorylineId,
      );
    }
    const leftById = new Map(left.nodes.map((node) => [node.storylineNodeId, node]));
    const rightById = new Map(right.nodes.map((node) => [node.storylineNodeId, node]));
    return {
      characterStorylineId: input.characterStorylineId,
      leftCharacterStorylineVersionId: left.characterStorylineVersionId,
      rightCharacterStorylineVersionId: right.characterStorylineVersionId,
      addedStorylineNodeIds: right.nodeOrder.filter((id) => !leftById.has(id)),
      removedStorylineNodeIds: left.nodeOrder.filter((id) => !rightById.has(id)),
      changedStorylineNodeIds: right.nodeOrder.filter((id) => {
        const previous = leftById.get(id);
        return (
          previous !== undefined && JSON.stringify(previous) !== JSON.stringify(rightById.get(id))
        );
      }),
    };
  }

  async restoreAsDraft(
    input: {
      readonly characterStorylineId: string;
      readonly characterStorylineVersionId: string;
    },
    signal?: AbortSignal,
  ): Promise<CharacterStorylineDraft> {
    const [storyline, version] = await Promise.all([
      this.requireStoryline(input.characterStorylineId, signal),
      this.requirePublication(input.characterStorylineVersionId, signal),
    ]);
    if (version.characterStorylineId !== storyline.characterStorylineId) {
      throw storylineError(
        'character-storyline-binding-mismatch',
        `CharacterStorylineVersion '${version.characterStorylineVersionId}' belongs to another Storyline.`,
        version.characterStorylineVersionId,
      );
    }
    const timestamp = this.now();
    const draft = parseCharacterStorylineDraft({
      characterStorylineId: storyline.characterStorylineId,
      characterVersionId: version.characterVersionId,
      premise: version.premise,
      constraints: version.constraints,
      nodeOrder: version.nodeOrder,
      nodes: version.nodes,
      edges: version.edges,
      updatedAt: timestamp,
    });
    await this.repository.updateStoryline(
      parseCharacterStoryline({ ...storyline, updatedAt: timestamp }),
      draft,
      signal,
    );
    return clone(draft);
  }

  async delete(characterStorylineId: string, signal?: AbortSignal): Promise<void> {
    await this.requireStoryline(characterStorylineId, signal);
    await this.repository.deleteStoryline(characterStorylineId, signal);
  }

  private async requireProject(characterProjectId: string, signal?: AbortSignal): Promise<void> {
    if ((await this.repository.readCharacterProject(characterProjectId, signal)) === undefined) {
      throw storylineError(
        'character-project-unavailable',
        `CharacterProject '${characterProjectId}' is unavailable.`,
        characterProjectId,
      );
    }
  }

  private async requireVersionOwnedByProject(
    characterVersionId: string,
    characterProjectId: string,
    signal?: AbortSignal,
  ): Promise<CharacterVersion> {
    const version = await this.repository.readCharacterVersion(characterVersionId, signal);
    if (!version) {
      throw storylineError(
        'character-version-unavailable',
        `CharacterVersion '${characterVersionId}' is unavailable.`,
        characterVersionId,
      );
    }
    if (version.characterProjectId !== characterProjectId) {
      throw storylineError(
        'character-storyline-binding-mismatch',
        `CharacterVersion '${characterVersionId}' belongs to another CharacterProject.`,
        characterVersionId,
      );
    }
    return version;
  }

  private async requireStoryline(
    characterStorylineId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStoryline> {
    const storyline = await this.repository.readStoryline(characterStorylineId, signal);
    if (!storyline) {
      throw storylineError(
        'character-storyline-unavailable',
        `CharacterStoryline '${characterStorylineId}' is unavailable.`,
        characterStorylineId,
      );
    }
    return parseCharacterStoryline(storyline);
  }

  private async requireDraft(
    characterStorylineId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineDraft> {
    const draft = await this.repository.readStorylineDraft(characterStorylineId, signal);
    if (!draft) {
      throw storylineError(
        'character-storyline-draft-unavailable',
        `CharacterStorylineDraft '${characterStorylineId}' is unavailable.`,
        characterStorylineId,
      );
    }
    return parseCharacterStorylineDraft(draft);
  }

  private async requirePublication(
    characterStorylineVersionId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineVersion> {
    const version = await this.repository.readStorylineVersion(characterStorylineVersionId, signal);
    if (!version) {
      throw storylineError(
        'character-storyline-version-unavailable',
        `CharacterStorylineVersion '${characterStorylineVersionId}' is unavailable.`,
        characterStorylineVersionId,
      );
    }
    return parseCharacterStorylineVersion(version);
  }
}

function storylineError(
  code: CharacterStorylineDiagnosticCode,
  message: string,
  recordId?: string,
): CharacterStorylineError {
  return new CharacterStorylineError(code, message, recordId);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
