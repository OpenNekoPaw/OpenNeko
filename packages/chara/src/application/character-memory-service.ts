import {
  parseCharacterMemoryCandidate,
  parseCharacterMemoryScope,
  type CharacterMemoryCandidate,
  type CharacterMemoryEntry,
  type CharacterMemoryScope,
  type CharacterRun,
  type CharacterStorylineRun,
} from '@neko/chara/contracts';

export interface CharacterMemoryRepository {
  readCharacterRun(characterRunId: string, signal?: AbortSignal): Promise<CharacterRun | undefined>;
  readStorylineRun(
    characterStorylineRunId: string,
    signal?: AbortSignal,
  ): Promise<CharacterStorylineRun | undefined>;
  createMemoryScope(scope: CharacterMemoryScope, signal?: AbortSignal): Promise<void>;
  readMemoryScope(
    characterMemoryScopeId: string,
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope | undefined>;
  mutateMemoryScope(
    characterMemoryScopeId: string,
    expectedMemoryRevision: number,
    mutation: (current: CharacterMemoryScope) => CharacterMemoryScope,
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope>;
}

export type CharacterMemoryServiceDiagnosticCode =
  | 'character-run-unavailable'
  | 'character-storyline-run-unavailable'
  | 'character-memory-scope-unavailable'
  | 'character-memory-binding-mismatch'
  | 'character-memory-candidate-already-exists'
  | 'character-memory-candidate-unavailable'
  | 'character-memory-entry-already-exists'
  | 'character-memory-entry-unavailable'
  | 'character-memory-revision-stale';

export class CharacterMemoryServiceError extends Error {
  constructor(
    readonly code: CharacterMemoryServiceDiagnosticCode,
    message: string,
    readonly recordId?: string,
  ) {
    super(message);
    this.name = 'CharacterMemoryServiceError';
  }
}

export class CharacterMemoryService {
  private readonly now: () => string;

  constructor(
    private readonly repository: CharacterMemoryRepository,
    options: { readonly now?: () => string } = {},
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async createScope(
    input: {
      readonly characterMemoryScopeId: string;
      readonly characterRunId: string;
      readonly characterStorylineRunId?: string;
    },
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope> {
    const characterRun = await this.repository.readCharacterRun(input.characterRunId, signal);
    if (!characterRun) {
      throw memoryError(
        'character-run-unavailable',
        `CharacterRun '${input.characterRunId}' is unavailable.`,
        input.characterRunId,
      );
    }
    if (input.characterStorylineRunId !== undefined) {
      const storylineRun = await this.repository.readStorylineRun(
        input.characterStorylineRunId,
        signal,
      );
      if (!storylineRun) {
        throw memoryError(
          'character-storyline-run-unavailable',
          `CharacterStorylineRun '${input.characterStorylineRunId}' is unavailable.`,
          input.characterStorylineRunId,
        );
      }
      if (storylineRun.characterRunId !== characterRun.characterRunId) {
        throw memoryError(
          'character-memory-binding-mismatch',
          `CharacterStorylineRun '${storylineRun.characterStorylineRunId}' belongs to another CharacterRun.`,
          input.characterMemoryScopeId,
        );
      }
    }
    const timestamp = this.now();
    const scope = parseCharacterMemoryScope({
      characterMemoryScopeId: input.characterMemoryScopeId,
      characterRunId: characterRun.characterRunId,
      ...(input.characterStorylineRunId === undefined
        ? {}
        : { characterStorylineRunId: input.characterStorylineRunId }),
      memoryRevision: 0,
      candidates: [],
      entries: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await this.repository.createMemoryScope(scope, signal);
    return clone(scope);
  }

  async propose(
    input: {
      readonly characterMemoryScopeId: string;
      readonly characterMemoryCandidateId: string;
      readonly content: string;
      readonly sourceRef: string;
      readonly observerParticipantId?: string;
      readonly observedAt: string;
      readonly sensitivityTraits: readonly string[];
      readonly retentionTraits: readonly string[];
      readonly expectedMemoryRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope> {
    return this.mutate(
      input.characterMemoryScopeId,
      input.expectedMemoryRevision,
      (scope) => {
        if (
          scope.candidates.some(
            (candidate) =>
              candidate.characterMemoryCandidateId === input.characterMemoryCandidateId,
          )
        ) {
          throw memoryError(
            'character-memory-candidate-already-exists',
            `Character memory candidate '${input.characterMemoryCandidateId}' already exists.`,
            input.characterMemoryCandidateId,
          );
        }
        const candidate = parseCharacterMemoryCandidate({
          ...input,
          status: 'pending',
        });
        return advance(scope, { candidates: [...scope.candidates, candidate] }, this.now());
      },
      signal,
    );
  }

  async accept(
    input: {
      readonly characterMemoryScopeId: string;
      readonly characterMemoryCandidateId: string;
      readonly characterMemoryEntryId: string;
      readonly expectedMemoryRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope> {
    return this.mutate(
      input.characterMemoryScopeId,
      input.expectedMemoryRevision,
      (scope) => {
        const candidate = requirePendingCandidate(scope, input.characterMemoryCandidateId);
        requireNewEntry(scope, input.characterMemoryEntryId);
        const acceptedAt = this.now();
        const entry: CharacterMemoryEntry = {
          characterMemoryEntryId: input.characterMemoryEntryId,
          characterMemoryScopeId: scope.characterMemoryScopeId,
          sourceCandidateId: candidate.characterMemoryCandidateId,
          content: candidate.content,
          sourceRef: candidate.sourceRef,
          ...(candidate.observerParticipantId === undefined
            ? {}
            : { observerParticipantId: candidate.observerParticipantId }),
          observedAt: candidate.observedAt,
          sensitivityTraits: candidate.sensitivityTraits,
          retentionTraits: candidate.retentionTraits,
          status: 'active',
          acceptedAt,
        };
        return advance(
          scope,
          {
            candidates: scope.candidates.map((item) =>
              item.characterMemoryCandidateId === candidate.characterMemoryCandidateId
                ? {
                    ...item,
                    status: 'accepted',
                    reviewedAt: acceptedAt,
                    acceptedMemoryEntryId: entry.characterMemoryEntryId,
                  }
                : item,
            ),
            entries: [...scope.entries, entry],
          },
          acceptedAt,
        );
      },
      signal,
    );
  }

  async reject(
    input: {
      readonly characterMemoryScopeId: string;
      readonly characterMemoryCandidateId: string;
      readonly expectedMemoryRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope> {
    return this.mutate(
      input.characterMemoryScopeId,
      input.expectedMemoryRevision,
      (scope) => {
        const candidate = requirePendingCandidate(scope, input.characterMemoryCandidateId);
        const reviewedAt = this.now();
        return advance(
          scope,
          {
            candidates: scope.candidates.map((item) =>
              item.characterMemoryCandidateId === candidate.characterMemoryCandidateId
                ? { ...item, status: 'rejected', reviewedAt }
                : item,
            ),
          },
          reviewedAt,
        );
      },
      signal,
    );
  }

  async correct(
    input: {
      readonly characterMemoryScopeId: string;
      readonly characterMemoryCandidateId: string;
      readonly correctedMemoryEntryId: string;
      readonly replacementMemoryEntryId: string;
      readonly expectedMemoryRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope> {
    return this.mutate(
      input.characterMemoryScopeId,
      input.expectedMemoryRevision,
      (scope) => {
        const candidate = requirePendingCandidate(scope, input.characterMemoryCandidateId);
        const corrected = requireActiveEntry(scope, input.correctedMemoryEntryId);
        requireNewEntry(scope, input.replacementMemoryEntryId);
        const correctedAt = this.now();
        const replacement: CharacterMemoryEntry = {
          characterMemoryEntryId: input.replacementMemoryEntryId,
          characterMemoryScopeId: scope.characterMemoryScopeId,
          sourceCandidateId: candidate.characterMemoryCandidateId,
          content: candidate.content,
          sourceRef: candidate.sourceRef,
          ...(candidate.observerParticipantId === undefined
            ? {}
            : { observerParticipantId: candidate.observerParticipantId }),
          observedAt: candidate.observedAt,
          sensitivityTraits: candidate.sensitivityTraits,
          retentionTraits: candidate.retentionTraits,
          status: 'active',
          acceptedAt: correctedAt,
          correctedFromMemoryEntryId: corrected.characterMemoryEntryId,
        };
        return advance(
          scope,
          {
            candidates: scope.candidates.map((item) =>
              item.characterMemoryCandidateId === candidate.characterMemoryCandidateId
                ? {
                    ...item,
                    status: 'accepted',
                    reviewedAt: correctedAt,
                    acceptedMemoryEntryId: replacement.characterMemoryEntryId,
                  }
                : item,
            ),
            entries: [
              ...scope.entries.map((entry) =>
                entry.characterMemoryEntryId === corrected.characterMemoryEntryId
                  ? {
                      ...entry,
                      status: 'corrected' as const,
                      correctedByMemoryEntryId: replacement.characterMemoryEntryId,
                      correctedAt,
                    }
                  : entry,
              ),
              replacement,
            ],
          },
          correctedAt,
        );
      },
      signal,
    );
  }

  async delete(
    input: {
      readonly characterMemoryScopeId: string;
      readonly characterMemoryEntryId: string;
      readonly expectedMemoryRevision: number;
    },
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope> {
    return this.mutate(
      input.characterMemoryScopeId,
      input.expectedMemoryRevision,
      (scope) => {
        const entry = requireActiveEntry(scope, input.characterMemoryEntryId);
        const deletedAt = this.now();
        return advance(
          scope,
          {
            entries: scope.entries.map((item) =>
              item.characterMemoryEntryId === entry.characterMemoryEntryId
                ? { ...item, status: 'deleted', deletedAt }
                : item,
            ),
          },
          deletedAt,
        );
      },
      signal,
    );
  }

  private async mutate(
    characterMemoryScopeId: string,
    expectedMemoryRevision: number,
    mutation: (scope: CharacterMemoryScope) => CharacterMemoryScope,
    signal?: AbortSignal,
  ): Promise<CharacterMemoryScope> {
    const current = await this.repository.readMemoryScope(characterMemoryScopeId, signal);
    if (!current) {
      throw memoryError(
        'character-memory-scope-unavailable',
        `CharacterMemoryScope '${characterMemoryScopeId}' is unavailable.`,
        characterMemoryScopeId,
      );
    }
    if (current.memoryRevision !== expectedMemoryRevision) {
      throw memoryError(
        'character-memory-revision-stale',
        `CharacterMemoryScope '${characterMemoryScopeId}' is not at expected revision ${String(expectedMemoryRevision)}.`,
        characterMemoryScopeId,
      );
    }
    return this.repository.mutateMemoryScope(
      characterMemoryScopeId,
      expectedMemoryRevision,
      (stored) => parseCharacterMemoryScope(mutation(stored)),
      signal,
    );
  }
}

function advance(
  scope: CharacterMemoryScope,
  change: {
    readonly candidates?: readonly CharacterMemoryCandidate[];
    readonly entries?: readonly CharacterMemoryEntry[];
  },
  updatedAt: string,
): CharacterMemoryScope {
  return parseCharacterMemoryScope({
    ...scope,
    ...(change.candidates === undefined ? {} : { candidates: change.candidates }),
    ...(change.entries === undefined ? {} : { entries: change.entries }),
    memoryRevision: scope.memoryRevision + 1,
    updatedAt,
  });
}

function requirePendingCandidate(
  scope: CharacterMemoryScope,
  characterMemoryCandidateId: string,
): CharacterMemoryCandidate {
  const candidate = scope.candidates.find(
    (item) => item.characterMemoryCandidateId === characterMemoryCandidateId,
  );
  if (!candidate || candidate.status !== 'pending') {
    throw memoryError(
      'character-memory-candidate-unavailable',
      `Pending Character memory candidate '${characterMemoryCandidateId}' is unavailable.`,
      characterMemoryCandidateId,
    );
  }
  return candidate;
}

function requireActiveEntry(
  scope: CharacterMemoryScope,
  characterMemoryEntryId: string,
): CharacterMemoryEntry {
  const entry = scope.entries.find(
    (item) => item.characterMemoryEntryId === characterMemoryEntryId,
  );
  if (!entry || entry.status !== 'active') {
    throw memoryError(
      'character-memory-entry-unavailable',
      `Active Character memory entry '${characterMemoryEntryId}' is unavailable.`,
      characterMemoryEntryId,
    );
  }
  return entry;
}

function requireNewEntry(scope: CharacterMemoryScope, characterMemoryEntryId: string): void {
  if (scope.entries.some((entry) => entry.characterMemoryEntryId === characterMemoryEntryId)) {
    throw memoryError(
      'character-memory-entry-already-exists',
      `Character memory entry '${characterMemoryEntryId}' already exists.`,
      characterMemoryEntryId,
    );
  }
}

function memoryError(
  code: CharacterMemoryServiceDiagnosticCode,
  message: string,
  recordId?: string,
): CharacterMemoryServiceError {
  return new CharacterMemoryServiceError(code, message, recordId);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
