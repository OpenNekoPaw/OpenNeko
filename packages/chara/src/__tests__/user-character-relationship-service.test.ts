import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterVersion,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import { describe, expect, it } from 'vitest';
import {
  UserCharacterRelationshipService,
  type UserCharacterRelationshipRepository,
} from '../application/user-character-relationship-service';

const now = '2026-08-12T00:00:00.000Z';

class MemoryRelationshipRepository implements UserCharacterRelationshipRepository {
  readonly records = new Map<string, UserCharacterRelationship>();
  readonly publications = new Map<string, CharacterVersion>([['version-a', publication()]]);

  async create(relationship: UserCharacterRelationship) {
    this.records.set(relationship.relationshipId, structuredClone(relationship));
  }
  async read(relationshipId: string) {
    return clone(this.records.get(relationshipId));
  }
  async readByOwner(userId: string, characterProjectId: string) {
    return clone(
      [...this.records.values()].find(
        (item) => item.userId === userId && item.characterProjectId === characterProjectId,
      ),
    );
  }
  async readPublication(characterVersionId: string) {
    return clone(this.publications.get(characterVersionId));
  }
  async mutate(
    relationshipId: string,
    expectedRelationshipRevision: number,
    mutation: (current: UserCharacterRelationship) => UserCharacterRelationship,
  ) {
    const current = this.records.get(relationshipId);
    if (!current || current.relationshipRevision !== expectedRelationshipRevision) {
      throw new Error('stale relationship');
    }
    const next = mutation(structuredClone(current));
    this.records.set(relationshipId, structuredClone(next));
    return structuredClone(next);
  }
}

describe('UserCharacterRelationshipService', () => {
  it('keeps stable project-scoped relationship memory with exact provenance', async () => {
    const repository = new MemoryRelationshipRepository();
    const service = new UserCharacterRelationshipService(repository, { now: () => now });
    await service.create({
      relationshipId: 'relationship-a',
      userId: 'user-a',
      characterProjectId: 'project-a',
    });
    await service.propose({
      relationshipId: 'relationship-a',
      candidateId: 'candidate-a',
      sourceCharacterVersionId: 'version-a',
      provenance: {
        kind: 'conversation-turn',
        conversationId: 'conversation-a',
        turnId: 'turn-a',
      },
      content: 'We promised to meet again.',
      expectedRelationshipRevision: 0,
    });
    const accepted = await service.accept({
      relationshipId: 'relationship-a',
      candidateId: 'candidate-a',
      memoryId: 'memory-a',
      expectedRelationshipRevision: 1,
    });

    expect(accepted.characterProjectId).toBe('project-a');
    expect(accepted.memories[0]).toEqual(
      expect.objectContaining({
        sourceCharacterVersionId: 'version-a',
        provenance: {
          kind: 'conversation-turn',
          conversationId: 'conversation-a',
          turnId: 'turn-a',
        },
      }),
    );
  });

  it('preserves correction and deletion history instead of rewriting accepted facts', async () => {
    const repository = new MemoryRelationshipRepository();
    const service = new UserCharacterRelationshipService(repository, { now: () => now });
    await service.create({
      relationshipId: 'relationship-a',
      userId: 'user-a',
      characterProjectId: 'project-a',
    });
    await propose(service, 'candidate-a', 'Original', 0, 'turn-a');
    await service.accept({
      relationshipId: 'relationship-a',
      candidateId: 'candidate-a',
      memoryId: 'memory-a',
      expectedRelationshipRevision: 1,
    });
    await propose(service, 'candidate-b', 'Corrected', 2, 'turn-b');
    const corrected = await service.correctMemory({
      relationshipId: 'relationship-a',
      candidateId: 'candidate-b',
      correctedMemoryId: 'memory-a',
      replacementMemoryId: 'memory-b',
      expectedRelationshipRevision: 3,
    });
    expect(corrected.memories).toEqual([
      expect.objectContaining({ memoryId: 'memory-a', status: 'corrected' }),
      expect.objectContaining({ memoryId: 'memory-b', status: 'active' }),
    ]);

    const deleted = await service.deleteMemory({
      relationshipId: 'relationship-a',
      memoryId: 'memory-b',
      expectedRelationshipRevision: 4,
    });
    expect(deleted.memories[1]).toEqual(
      expect.objectContaining({ memoryId: 'memory-b', status: 'deleted' }),
    );
  });
});

async function propose(
  service: UserCharacterRelationshipService,
  candidateId: string,
  content: string,
  expectedRelationshipRevision: number,
  turnId: string,
) {
  return service.propose({
    relationshipId: 'relationship-a',
    candidateId,
    sourceCharacterVersionId: 'version-a',
    provenance: { kind: 'conversation-turn', conversationId: 'conversation-a', turnId },
    content,
    expectedRelationshipRevision,
  });
}

function publication(): CharacterVersion {
  return {
    characterVersionId: 'version-a',
    characterProjectId: 'project-a',
    label: 'Lin',
    definition: {
      summary: 'Lin',
      backgroundStory: createEmptyCharacterBackgroundStory(),
      originSetting: createEmptyCharacterOriginSetting(),
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
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
