import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterCompanionContinuity,
  type CharacterVersion,
} from '@neko/chara/contracts';
import { describe, expect, it } from 'vitest';
import {
  CharacterCompanionContinuityService,
  type CharacterCompanionContinuityRepository,
} from '../application/character-companion-continuity-service';

const now = '2026-08-12T00:00:00.000Z';

describe('CharacterCompanionContinuityService', () => {
  it('retains accepted memory across conversations with exact source provenance', async () => {
    const fixture = createFixture();
    const continuity = await fixture.service.create({
      companionContinuityId: 'continuity-a',
      userId: 'user-a',
      characterProjectId: 'project-a',
    });
    await fixture.service.propose({
      companionContinuityId: continuity.companionContinuityId,
      companionMemoryCandidateId: 'candidate-a',
      sourceCharacterVersionId: 'version-a',
      provenance: {
        kind: 'conversation-turn',
        conversationId: 'conversation-first',
        turnId: 'turn-first',
      },
      content: 'The user prefers tea.',
      compatibility: {
        requiredCanonFacts: ['Lin drinks tea.'],
        prohibitedKnowledgeBoundaries: [],
        requiredBehaviorPolicies: ['Honor stated preferences.'],
      },
      sensitivityTraits: [],
      retentionTraits: ['long-term'],
      expectedContinuityRevision: 0,
    });
    await fixture.service.accept({
      companionContinuityId: continuity.companionContinuityId,
      companionMemoryCandidateId: 'candidate-a',
      companionMemoryEntryId: 'entry-a',
      expectedContinuityRevision: 1,
    });

    const projected = await fixture.service.project({
      companionContinuityId: continuity.companionContinuityId,
      characterVersionId: 'version-b',
    });
    expect(projected.eligibleEntries).toEqual([
      expect.objectContaining({
        companionMemoryEntryId: 'entry-a',
        sourceCharacterVersionId: 'version-a',
        provenance: {
          kind: 'conversation-turn',
          conversationId: 'conversation-first',
          turnId: 'turn-first',
        },
      }),
    ]);
  });

  it('preserves but excludes incompatible entries with local diagnostics', async () => {
    const fixture = createFixture();
    await fixture.service.create({
      companionContinuityId: 'continuity-a',
      userId: 'user-a',
      characterProjectId: 'project-a',
    });
    await fixture.service.propose({
      companionContinuityId: 'continuity-a',
      companionMemoryCandidateId: 'candidate-a',
      sourceCharacterVersionId: 'version-a',
      provenance: { kind: 'room-event', roomRunId: 'room-a', roomEventId: 'event-a' },
      content: 'The old oath still applies.',
      compatibility: {
        requiredCanonFacts: ['Removed oath.'],
        prohibitedKnowledgeBoundaries: [],
        requiredBehaviorPolicies: [],
      },
      sensitivityTraits: [],
      retentionTraits: [],
      expectedContinuityRevision: 0,
    });
    await fixture.service.accept({
      companionContinuityId: 'continuity-a',
      companionMemoryCandidateId: 'candidate-a',
      companionMemoryEntryId: 'entry-a',
      expectedContinuityRevision: 1,
    });

    const projected = await fixture.service.project({
      companionContinuityId: 'continuity-a',
      characterVersionId: 'version-b',
    });
    expect(projected.eligibleEntries).toEqual([]);
    expect(projected.diagnostics).toEqual([
      expect.objectContaining({ companionMemoryEntryId: 'entry-a' }),
    ]);
    expect(fixture.continuities.get('continuity-a')?.entries).toHaveLength(1);
  });

  it('preserves explicit correction and deletion history with exact provenance', async () => {
    const fixture = createFixture();
    await fixture.service.create({
      companionContinuityId: 'continuity-a',
      userId: 'user-a',
      characterProjectId: 'project-a',
    });
    await propose(fixture.service, 'candidate-a', 'Original preference.', 0, 'turn-a');
    await fixture.service.accept({
      companionContinuityId: 'continuity-a',
      companionMemoryCandidateId: 'candidate-a',
      companionMemoryEntryId: 'entry-a',
      expectedContinuityRevision: 1,
    });
    await propose(fixture.service, 'candidate-b', 'Corrected preference.', 2, 'turn-b');
    const corrected = await fixture.service.correct({
      companionContinuityId: 'continuity-a',
      companionMemoryCandidateId: 'candidate-b',
      correctedMemoryEntryId: 'entry-a',
      replacementMemoryEntryId: 'entry-b',
      expectedContinuityRevision: 3,
    });
    expect(corrected.entries).toEqual([
      expect.objectContaining({
        companionMemoryEntryId: 'entry-a',
        status: 'corrected',
        correctedByMemoryEntryId: 'entry-b',
      }),
      expect.objectContaining({
        companionMemoryEntryId: 'entry-b',
        status: 'active',
        provenance: {
          kind: 'conversation-turn',
          conversationId: 'conversation-b',
          turnId: 'turn-b',
        },
      }),
    ]);

    const deleted = await fixture.service.delete({
      companionContinuityId: 'continuity-a',
      companionMemoryEntryId: 'entry-b',
      expectedContinuityRevision: 4,
    });
    expect(deleted.entries[1]).toMatchObject({
      companionMemoryEntryId: 'entry-b',
      status: 'deleted',
    });
  });
});

async function propose(
  service: CharacterCompanionContinuityService,
  companionMemoryCandidateId: string,
  content: string,
  expectedContinuityRevision: number,
  turnId: string,
) {
  return service.propose({
    companionContinuityId: 'continuity-a',
    companionMemoryCandidateId,
    sourceCharacterVersionId: 'version-a',
    provenance: {
      kind: 'conversation-turn',
      conversationId: turnId === 'turn-a' ? 'conversation-a' : 'conversation-b',
      turnId,
    },
    content,
    compatibility: {
      requiredCanonFacts: [],
      prohibitedKnowledgeBoundaries: [],
      requiredBehaviorPolicies: [],
    },
    sensitivityTraits: [],
    retentionTraits: [],
    expectedContinuityRevision,
  });
}

function createFixture() {
  const continuities = new Map<string, CharacterCompanionContinuity>();
  const publications = new Map([
    ['version-a', publication('version-a')],
    ['version-b', publication('version-b')],
  ]);
  const repository: CharacterCompanionContinuityRepository = {
    async createCompanionContinuity(continuity) {
      continuities.set(continuity.companionContinuityId, structuredClone(continuity));
    },
    async readCompanionContinuity(id) {
      return clone(continuities.get(id));
    },
    async readCompanionContinuityByOwner(userId, characterProjectId) {
      return clone(
        [...continuities.values()].find(
          (item) => item.userId === userId && item.characterProjectId === characterProjectId,
        ),
      );
    },
    async mutateCompanionContinuity(id, expectedRevision, mutation) {
      const current = continuities.get(id);
      if (!current || current.continuityRevision !== expectedRevision) {
        throw new Error('stale continuity');
      }
      const next = mutation(structuredClone(current));
      continuities.set(id, structuredClone(next));
      return structuredClone(next);
    },
    async readPublication(id) {
      return clone(publications.get(id));
    },
  };
  return {
    continuities,
    service: new CharacterCompanionContinuityService(repository, { now: () => now }),
  };
}

function publication(characterVersionId: string): CharacterVersion {
  return {
    characterVersionId,
    characterProjectId: 'project-a',
    label: characterVersionId,
    definition: {
      summary: 'Lin',
      backgroundStory: createEmptyCharacterBackgroundStory(),
      originSetting: createEmptyCharacterOriginSetting(),
      canon: ['Lin drinks tea.'],
      knowledgeBoundary: [],
      behaviorPolicy: ['Honor stated preferences.'],
      expressionPolicy: [],
      representationRefs: [],
    },
    acceptedEvidenceIds: [],
    publishedAt: now,
  };
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
