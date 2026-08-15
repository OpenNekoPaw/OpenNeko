import { describe, expect, it } from 'vitest';
import {
  parseCharacterCompanionContinuity,
  parseCompanionMemoryProvenance,
} from '../character-companion-continuity';

const now = '2026-08-12T00:00:00.000Z';

describe('Character Companion continuity contracts', () => {
  it('owns one stable user and CharacterProject continuity independent from runtime identity', () => {
    const continuity = parseCharacterCompanionContinuity({
      companionContinuityId: 'companion-continuity:user-a:lin',
      userId: 'user-a',
      characterProjectId: 'character-project-lin',
      continuityRevision: 0,
      candidates: [],
      entries: [],
      createdAt: now,
      updatedAt: now,
    });

    expect(continuity.characterProjectId).toBe('character-project-lin');
    expect(continuity).not.toHaveProperty('characterRunId');
    expect(continuity).not.toHaveProperty('conversationId');
    expect(continuity).not.toHaveProperty('characterVersionId');
  });

  it('requires exact Conversation/Turn or RoomEvent provenance', () => {
    expect(
      parseCompanionMemoryProvenance({
        kind: 'conversation-turn',
        conversationId: 'conversation-a',
        turnId: 'turn-a',
      }),
    ).toEqual({ kind: 'conversation-turn', conversationId: 'conversation-a', turnId: 'turn-a' });
    expect(
      parseCompanionMemoryProvenance({
        kind: 'room-event',
        roomRunId: 'room-run-a',
        roomEventId: 'room-event-a',
      }),
    ).toEqual({ kind: 'room-event', roomRunId: 'room-run-a', roomEventId: 'room-event-a' });
    expect(() =>
      parseCompanionMemoryProvenance({
        kind: 'conversation-turn',
        conversationId: 'conversation-a',
        turnId: 'turn-a',
        roomEventId: 'room-event-a',
      }),
    ).toThrow(/cannot carry RoomEvent identity/u);
  });

  it('poisons the replaced CharacterRun-owned MemoryScope shape', () => {
    expect(() =>
      parseCharacterCompanionContinuity({
        characterMemoryScopeId: 'memory-scope-a',
        characterRunId: 'character-run-a',
        memoryRevision: 0,
        candidates: [],
        entries: [],
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow(/unsupported fields/u);
  });
});
