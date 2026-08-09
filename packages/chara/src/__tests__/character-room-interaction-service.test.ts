import { describe, expect, it, vi } from 'vitest';
import {
  parseCharacterRoom,
  parseCharacterVersion,
  parseUserCharacterRelationship,
  type CharacterRoom,
  type CharacterVersion,
  type UserCharacterRelationship,
} from '../contracts';
import {
  CharacterRoomInteractionService,
  type CharacterPreparedRoomRunPort,
} from '../application/character-room-interaction-service';
import type { CharacterPrimaryAgentSessionPort } from '../application/character-interaction-service';

const now = '2026-08-09T10:00:00.000Z';

describe('CharacterRoomInteractionService', () => {
  it('creates one exact primary AgentSession and CharacterRun per agent participant', async () => {
    const fixture = createFixture();
    const service = new CharacterRoomInteractionService({
      ...fixture.options,
      now: () => now,
    });

    const run = await service.createRun({
      roomRunId: 'room-run-a',
      characterRoomId: 'room-a',
      runtimeKind: 'companion',
      relationshipBindings: [
        { participantId: 'participant-a', relationshipId: 'relationship-a' },
        { participantId: 'participant-b', relationshipId: 'relationship-b' },
      ],
    });

    expect(fixture.createPrimarySession).toHaveBeenCalledTimes(2);
    expect(fixture.createPrimarySession.mock.calls.map(([input]) => input.owner)).toEqual([
      { kind: 'room', roomId: 'room-a', roomRunId: 'room-run-a' },
      { kind: 'room', roomId: 'room-a', roomRunId: 'room-run-a' },
    ]);
    expect(run.participants).toEqual([
      expect.objectContaining({
        participantId: 'participant-a',
        controller: expect.objectContaining({
          kind: 'agent',
          characterRunId: 'character-run:room-run-a:participant-a',
          primaryAgentSessionId: 'session:character-run:room-run-a:participant-a',
        }),
      }),
      expect.objectContaining({
        participantId: 'participant-b',
        controller: expect.objectContaining({
          kind: 'agent',
          characterRunId: 'character-run:room-run-a:participant-b',
          primaryAgentSessionId: 'session:character-run:room-run-a:participant-b',
        }),
      }),
    ]);
    expect(fixture.createPreparedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        characterRuns: [
          expect.objectContaining({ characterVersionId: 'character-version-a' }),
          expect.objectContaining({ characterVersionId: 'character-version-b' }),
        ],
      }),
      undefined,
    );
    expect(fixture.releaseUnboundSession).not.toHaveBeenCalled();
  });

  it('releases every created session when aggregate persistence fails', async () => {
    const fixture = createFixture();
    fixture.createPreparedRun.mockRejectedValueOnce(new Error('aggregate write failed'));
    const service = new CharacterRoomInteractionService({
      ...fixture.options,
      now: () => now,
    });

    await expect(
      service.createRun({
        roomRunId: 'room-run-a',
        characterRoomId: 'room-a',
        runtimeKind: 'companion',
        relationshipBindings: [
          { participantId: 'participant-a', relationshipId: 'relationship-a' },
          { participantId: 'participant-b', relationshipId: 'relationship-b' },
        ],
      }),
    ).rejects.toThrow('aggregate write failed');
    expect(fixture.releaseUnboundSession.mock.calls.map(([sessionId]) => sessionId)).toEqual([
      'session:character-run:room-run-a:participant-a',
      'session:character-run:room-run-a:participant-b',
    ]);
  });
});

function createFixture() {
  const room = characterRoom();
  const versions = new Map<string, CharacterVersion>([
    ['character-version-a', characterVersion('a')],
    ['character-version-b', characterVersion('b')],
  ]);
  const relationships = new Map<string, UserCharacterRelationship>([
    ['relationship-a', relationship('a')],
    ['relationship-b', relationship('b')],
  ]);
  const createPrimarySession = vi.fn<CharacterPrimaryAgentSessionPort['createPrimarySession']>(
    async (input: { readonly characterRunId: string }) => ({
      primaryAgentSessionId: `session:${input.characterRunId}`,
    }),
  );
  const releaseUnboundSession = vi.fn<CharacterPrimaryAgentSessionPort['releaseUnboundSession']>(
    async () => undefined,
  );
  const createPreparedRun = vi.fn<CharacterPreparedRoomRunPort['createPreparedRun']>(
    async ({ run }) => structuredClone(run),
  );
  return {
    createPrimarySession,
    releaseUnboundSession,
    createPreparedRun,
    options: {
      repository: {
        readRoom: async (roomId: string) =>
          roomId === room.characterRoomId ? structuredClone(room) : undefined,
        readPublication: async (versionId: string) => structuredClone(versions.get(versionId)),
        readRelationship: async (relationshipId: string) =>
          structuredClone(relationships.get(relationshipId)),
      },
      roomRuns: { createPreparedRun },
      agentSessions: {
        createPrimarySession,
        releaseUnboundSession,
        submitTurn: vi.fn(async () => ({ turnId: 'unused', content: 'unused' })),
      },
      worldBindings: { validateBinding: vi.fn(async () => undefined) },
    },
  };
}

function characterRoom(): CharacterRoom {
  return parseCharacterRoom({
    characterRoomId: 'room-a',
    title: 'Archive room',
    defaultRuntimeKind: 'companion',
    participantTemplates: [
      {
        participantTemplateId: 'participant-a',
        displayName: 'Lin',
        controllerKind: 'agent',
        characterVersionId: 'character-version-a',
      },
      {
        participantTemplateId: 'participant-b',
        displayName: 'Mira',
        controllerKind: 'agent',
        characterVersionId: 'character-version-b',
      },
    ],
    schedulingPolicy: { kind: 'mentioned' },
    createdAt: now,
    updatedAt: now,
  });
}

function characterVersion(suffix: string): CharacterVersion {
  return parseCharacterVersion({
    characterVersionId: `character-version-${suffix}`,
    characterProjectId: `character-project-${suffix}`,
    label: suffix,
    definition: {
      summary: suffix,
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    },
    acceptedEvidenceIds: [],
    publishedAt: now,
  });
}

function relationship(suffix: string): UserCharacterRelationship {
  return parseUserCharacterRelationship({
    relationshipId: `relationship-${suffix}`,
    userId: 'user-a',
    characterVersionId: `character-version-${suffix}`,
    memories: [],
    candidates: [],
    createdAt: now,
    updatedAt: now,
  });
}
