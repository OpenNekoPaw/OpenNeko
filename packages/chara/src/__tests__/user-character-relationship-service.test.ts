import type { UserCharacterRelationship } from '@neko/chara/contracts';
import { describe, expect, it } from 'vitest';
import {
  UserCharacterRelationshipService,
  type UserCharacterRelationshipRepository,
} from '../application/user-character-relationship-service';

const now = '2026-08-09T10:00:00.000Z';

class MemoryRelationshipRepository implements UserCharacterRelationshipRepository {
  readonly relationships = new Map<string, UserCharacterRelationship>();

  async create(relationship: UserCharacterRelationship): Promise<void> {
    if (this.relationships.has(relationship.relationshipId)) throw new Error('duplicate');
    this.relationships.set(relationship.relationshipId, structuredClone(relationship));
  }

  async read(relationshipId: string): Promise<UserCharacterRelationship | undefined> {
    const relationship = this.relationships.get(relationshipId);
    return relationship === undefined ? undefined : structuredClone(relationship);
  }

  async mutate(
    relationshipId: string,
    mutation: (current: UserCharacterRelationship) => UserCharacterRelationship,
  ): Promise<UserCharacterRelationship> {
    const current = this.relationships.get(relationshipId);
    if (!current) throw new Error('missing');
    const updated = mutation(structuredClone(current));
    this.relationships.set(relationshipId, structuredClone(updated));
    return structuredClone(updated);
  }
}

describe('UserCharacterRelationshipService', () => {
  it('keeps transcript evidence as a candidate until explicit acceptance', async () => {
    const repository = new MemoryRelationshipRepository();
    const service = new UserCharacterRelationshipService(repository, { now: () => now });
    await service.create({
      relationshipId: 'relationship-a',
      userId: 'user-a',
      characterVersionId: 'character-version-a',
    });
    const proposed = await service.propose({
      relationshipId: 'relationship-a',
      candidateId: 'candidate-a',
      content: 'The user prefers tea.',
      sourceRef: 'agent-session:turn-a',
    });

    expect(proposed.memories).toEqual([]);
    expect(proposed.candidates[0]?.status).toBe('pending');

    const accepted = await service.accept({
      relationshipId: 'relationship-a',
      candidateId: 'candidate-a',
      memoryId: 'memory-a',
    });
    expect(accepted.memories).toEqual([
      expect.objectContaining({
        memoryId: 'memory-a',
        sourceRef: 'agent-session:turn-a',
      }),
    ]);
    expect(accepted.candidates[0]?.status).toBe('accepted');
  });

  it('supports correction and deletion only through the relationship owner', async () => {
    const repository = new MemoryRelationshipRepository();
    const service = new UserCharacterRelationshipService(repository, { now: () => now });
    await service.create({
      relationshipId: 'relationship-a',
      userId: 'user-a',
      characterVersionId: 'character-version-a',
    });
    await service.propose({
      relationshipId: 'relationship-a',
      candidateId: 'candidate-a',
      content: 'The user prefers tea.',
      sourceRef: 'room-event:message-a',
    });
    await service.accept({
      relationshipId: 'relationship-a',
      candidateId: 'candidate-a',
      memoryId: 'memory-a',
    });
    const corrected = await service.correctMemory({
      relationshipId: 'relationship-a',
      memoryId: 'memory-a',
      content: 'The user prefers green tea.',
    });
    expect(corrected.memories[0]?.content).toBe('The user prefers green tea.');

    const removed = await service.deleteMemory({
      relationshipId: 'relationship-a',
      memoryId: 'memory-a',
    });
    expect(removed.memories).toEqual([]);
  });

  it('rejects a candidate without creating accepted memory', async () => {
    const repository = new MemoryRelationshipRepository();
    const service = new UserCharacterRelationshipService(repository, { now: () => now });
    await service.create({
      relationshipId: 'relationship-a',
      userId: 'user-a',
      characterVersionId: 'character-version-a',
    });
    await service.propose({
      relationshipId: 'relationship-a',
      candidateId: 'candidate-a',
      content: 'Unreliable inference.',
      sourceRef: 'room-event:message-a',
    });
    const rejected = await service.reject({
      relationshipId: 'relationship-a',
      candidateId: 'candidate-a',
    });

    expect(rejected.candidates[0]?.status).toBe('rejected');
    expect(rejected.memories).toEqual([]);
  });
});
