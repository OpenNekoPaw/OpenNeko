import {
  parseCharacterMemoryScope,
  parseCharacterRun,
  parseCharacterStorylineRun,
  type CharacterMemoryScope,
  type CharacterRun,
  type CharacterStorylineRun,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import {
  CharacterMemoryService,
  CharacterMemoryServiceError,
  type CharacterMemoryRepository,
} from '../application/character-memory-service';
import {
  UserCharacterRelationshipService,
  type UserCharacterRelationshipRepository,
} from '../application/user-character-relationship-service';
import { describe, expect, it } from 'vitest';

const now = '2026-08-10T00:00:00.000Z';

describe('CharacterMemoryService', () => {
  it('owns candidate acceptance, correction, and deletion under one exact Scope', async () => {
    const repository = preparedRepository();
    const service = new CharacterMemoryService(repository, { now: () => now });
    const scope = await service.createScope({
      characterMemoryScopeId: 'memory-scope-a',
      characterRunId: 'character-run-a',
      characterStorylineRunId: 'storyline-run-a',
    });
    const proposed = await service.propose(
      memoryCandidateInput(scope.characterMemoryScopeId, 'candidate-a', 0, 'First memory'),
    );
    const accepted = await service.accept({
      characterMemoryScopeId: scope.characterMemoryScopeId,
      characterMemoryCandidateId: 'candidate-a',
      characterMemoryEntryId: 'memory-entry-a',
      expectedMemoryRevision: proposed.memoryRevision,
    });
    const correctionCandidate = await service.propose(
      memoryCandidateInput(
        scope.characterMemoryScopeId,
        'candidate-correction',
        accepted.memoryRevision,
        'Corrected memory',
      ),
    );
    const corrected = await service.correct({
      characterMemoryScopeId: scope.characterMemoryScopeId,
      characterMemoryCandidateId: 'candidate-correction',
      correctedMemoryEntryId: 'memory-entry-a',
      replacementMemoryEntryId: 'memory-entry-b',
      expectedMemoryRevision: correctionCandidate.memoryRevision,
    });
    const deleted = await service.delete({
      characterMemoryScopeId: scope.characterMemoryScopeId,
      characterMemoryEntryId: 'memory-entry-b',
      expectedMemoryRevision: corrected.memoryRevision,
    });

    expect(deleted.memoryRevision).toBe(5);
    expect(deleted.entries).toEqual([
      expect.objectContaining({
        characterMemoryEntryId: 'memory-entry-a',
        status: 'corrected',
        correctedByMemoryEntryId: 'memory-entry-b',
      }),
      expect.objectContaining({
        characterMemoryEntryId: 'memory-entry-b',
        status: 'deleted',
        correctedFromMemoryEntryId: 'memory-entry-a',
      }),
    ]);
  });

  it('keeps Character memory and relationship memory independent for the same source', async () => {
    const memoryRepository = preparedRepository();
    const relationshipRepository = new InMemoryRelationshipRepository();
    const memoryService = new CharacterMemoryService(memoryRepository, { now: () => now });
    const relationshipService = new UserCharacterRelationshipService(relationshipRepository, {
      now: () => now,
    });
    await memoryService.createScope({
      characterMemoryScopeId: 'memory-scope-a',
      characterRunId: 'character-run-a',
    });
    await relationshipService.create({
      relationshipId: 'relationship-a',
      userId: 'user-a',
      characterVersionId: 'character-version-a',
    });
    const sourceRef = 'room-event:event-a';
    await memoryService.propose({
      ...memoryCandidateInput('memory-scope-a', 'candidate-a', 0, 'Lin felt trusted.'),
      sourceRef,
    });
    await relationshipService.propose({
      relationshipId: 'relationship-a',
      candidateId: 'relationship-candidate-a',
      content: 'The user promised to ask before opening the archive.',
      sourceRef,
    });

    expect(memoryRepository.scopes.get('memory-scope-a')?.candidates).toHaveLength(1);
    expect(relationshipRepository.records.get('relationship-a')?.candidates).toHaveLength(1);
    expect(memoryRepository.scopes.get('memory-scope-a')?.entries).toHaveLength(0);
    expect(relationshipRepository.records.get('relationship-a')?.memories).toHaveLength(0);
  });

  it('rejects stale or cross-run mutation and exposes no external save/branch operation', async () => {
    const repository = preparedRepository();
    repository.characterRuns.set('character-run-b', characterRun('character-run-b'));
    repository.storylineRuns.set(
      'storyline-run-b',
      storylineRun('storyline-run-b', 'character-run-b'),
    );
    const service = new CharacterMemoryService(repository, { now: () => now });

    await expect(
      service.createScope({
        characterMemoryScopeId: 'memory-scope-invalid',
        characterRunId: 'character-run-a',
        characterStorylineRunId: 'storyline-run-b',
      }),
    ).rejects.toMatchObject({
      code: 'character-memory-binding-mismatch',
    } satisfies Partial<CharacterMemoryServiceError>);
    await service.createScope({
      characterMemoryScopeId: 'memory-scope-a',
      characterRunId: 'character-run-a',
    });
    await service.propose(memoryCandidateInput('memory-scope-a', 'candidate-a', 0, 'Memory'));
    await expect(
      service.reject({
        characterMemoryScopeId: 'memory-scope-a',
        characterMemoryCandidateId: 'candidate-a',
        expectedMemoryRevision: 0,
      }),
    ).rejects.toMatchObject({
      code: 'character-memory-revision-stale',
    } satisfies Partial<CharacterMemoryServiceError>);
    expect(service).not.toHaveProperty('restoreSave');
    expect(service).not.toHaveProperty('deleteBranch');
    expect(repository.scopes.get('memory-scope-a')?.candidates[0]?.status).toBe('pending');
  });
});

class InMemoryCharacterMemoryRepository implements CharacterMemoryRepository {
  readonly characterRuns = new Map<string, CharacterRun>();
  readonly storylineRuns = new Map<string, CharacterStorylineRun>();
  readonly scopes = new Map<string, CharacterMemoryScope>();

  async readCharacterRun(id: string) {
    return cloneOptional(this.characterRuns.get(id));
  }
  async readStorylineRun(id: string) {
    return cloneOptional(this.storylineRuns.get(id));
  }
  async createMemoryScope(scope: CharacterMemoryScope) {
    if (this.scopes.has(scope.characterMemoryScopeId)) throw new Error('exists');
    this.scopes.set(scope.characterMemoryScopeId, copy(scope));
  }
  async readMemoryScope(id: string) {
    return cloneOptional(this.scopes.get(id));
  }
  async mutateMemoryScope(
    id: string,
    expectedMemoryRevision: number,
    mutation: (current: CharacterMemoryScope) => CharacterMemoryScope,
  ) {
    const current = this.scopes.get(id);
    if (!current || current.memoryRevision !== expectedMemoryRevision) {
      throw new Error('concurrent memory mutation');
    }
    const next = parseCharacterMemoryScope(mutation(copy(current)));
    if (next.memoryRevision !== expectedMemoryRevision + 1) {
      throw new Error('memory mutation must advance exactly once');
    }
    this.scopes.set(id, copy(next));
    return copy(next);
  }
}

class InMemoryRelationshipRepository implements UserCharacterRelationshipRepository {
  readonly records = new Map<string, UserCharacterRelationship>();

  async create(relationship: UserCharacterRelationship) {
    this.records.set(relationship.relationshipId, copy(relationship));
  }
  async read(id: string) {
    return cloneOptional(this.records.get(id));
  }
  async mutate(
    id: string,
    mutation: (current: UserCharacterRelationship) => UserCharacterRelationship,
  ) {
    const current = this.records.get(id);
    if (!current) throw new Error('missing relationship');
    const next = mutation(copy(current));
    this.records.set(id, copy(next));
    return copy(next);
  }
}

function preparedRepository(): InMemoryCharacterMemoryRepository {
  const repository = new InMemoryCharacterMemoryRepository();
  repository.characterRuns.set('character-run-a', characterRun('character-run-a'));
  repository.storylineRuns.set(
    'storyline-run-a',
    storylineRun('storyline-run-a', 'character-run-a'),
  );
  return repository;
}

function characterRun(characterRunId: string): CharacterRun {
  return parseCharacterRun({
    characterRunId,
    characterVersionId: 'character-version-a',
    participantId: `participant:${characterRunId}`,
    controller: { kind: 'agent', primaryAgentSessionId: `agent:${characterRunId}` },
    runtimeBinding: { kind: 'companion', relationshipId: `relationship:${characterRunId}` },
    createdAt: now,
  });
}

function storylineRun(
  characterStorylineRunId: string,
  characterRunId: string,
): CharacterStorylineRun {
  return parseCharacterStorylineRun({
    characterStorylineRunId,
    characterStorylineVersionId: 'storyline-version-a',
    characterRunId,
    currentStageId: 'guarded',
    acceptedTransitions: [],
    storylineRevision: 0,
    createdAt: now,
    updatedAt: now,
  });
}

function memoryCandidateInput(
  characterMemoryScopeId: string,
  characterMemoryCandidateId: string,
  expectedMemoryRevision: number,
  content: string,
) {
  return {
    characterMemoryScopeId,
    characterMemoryCandidateId,
    content,
    sourceRef: 'external-event:event-a',
    observerParticipantId: 'participant-a',
    observedAt: now,
    sensitivityTraits: ['private'],
    retentionTraits: ['milestone'],
    expectedMemoryRevision,
  } as const;
}

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}

function copy<T>(value: T): T {
  return structuredClone(value);
}
