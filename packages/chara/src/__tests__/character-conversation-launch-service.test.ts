import {
  parseCharacterVersion,
  type CharacterRoom,
  type CharacterRun,
  type CharacterVersion,
  type DialogueRun,
  type RoomRun,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  CharacterConversationLaunchService,
  type CharacterConversationLaunchAggregate,
  type CharacterConversationLaunchRepository,
} from '../application/character-conversation-launch-service';
import type { CharacterPrimaryAgentSessionPort } from '../application/character-interaction-service';

const NOW = '2026-08-09T12:00:00.000Z';

describe('CharacterConversationLaunchService', () => {
  it('creates one companion Dialogue with one exact primary AgentSession', async () => {
    const fixture = createFixture([publication('a')]);

    const result = await fixture.service.launch(companionInput('request-a', ['version-a']));

    expect(result).toEqual({
      topology: 'dialogue',
      runtimeKind: 'companion',
      characterProjectId: 'project-a',
      characterVersionId: 'version-a',
      characterRunId: 'character-run:launch:request-a:1',
      dialogueRunId: 'dialogue-run:launch:request-a',
      primaryAgentSessionId: 'conversation:character:character-run:launch:request-a:1',
    });
    expect(fixture.repository.dialogues).toHaveLength(1);
    expect(fixture.repository.rooms).toHaveLength(0);
    expect(fixture.createPrimarySession).toHaveBeenCalledTimes(1);
  });

  it('atomically creates a Room and isolated participant AgentSessions for multiple Characters', async () => {
    const fixture = createFixture([publication('a'), publication('b')]);

    const result = await fixture.service.launch(
      companionInput('request-room', ['version-a', 'version-b']),
    );

    expect(result).toMatchObject({
      topology: 'chatroom',
      characterRoomId: 'character-room:launch:request-room',
      roomRunId: 'room-run:launch:request-room',
      participants: [
        {
          characterVersionId: 'version-a',
          primaryAgentSessionId: 'conversation:character:character-run:launch:request-room:1',
        },
        {
          characterVersionId: 'version-b',
          primaryAgentSessionId: 'conversation:character:character-run:launch:request-room:2',
        },
      ],
    });
    expect(
      new Set(
        result.topology === 'chatroom'
          ? result.participants.map((participant) => participant.primaryAgentSessionId)
          : [],
      ).size,
    ).toBe(2);
    expect(fixture.repository.rooms).toHaveLength(1);
    expect(fixture.repository.roomRuns).toHaveLength(1);
    expect(fixture.repository.characterRuns).toHaveLength(2);
    expect(fixture.repository.roomRuns[0]?.schedulingPolicy).toEqual({
      kind: 'bounded-autonomous',
      maxResponsesPerCycle: 2,
      eligibleParticipantIds: ['participant:character:1', 'participant:character:2'],
    });
  });

  it('rejects duplicate or unavailable CharacterVersions before creating any owner', async () => {
    const fixture = createFixture([publication('a')]);

    await expect(
      fixture.service.launch(companionInput('request-duplicate', ['version-a', 'version-a'])),
    ).rejects.toThrow('contains duplicate identity');
    await expect(
      fixture.service.launch(companionInput('request-missing', ['version-missing'])),
    ).rejects.toMatchObject({ code: 'character-launch-version-unavailable' });
    expect(fixture.createPrimarySession).not.toHaveBeenCalled();
    expect(fixture.repository.characterRuns).toHaveLength(0);
  });

  it('releases every new AgentSession on aggregate failure and reuses an exact committed launch', async () => {
    const fixture = createFixture([publication('a'), publication('b')]);
    fixture.repository.failCommit = true;

    await expect(
      fixture.service.launch(companionInput('request-fail', ['version-a', 'version-b'])),
    ).rejects.toThrow('aggregate failed');
    expect(fixture.releaseUnboundSession).toHaveBeenCalledTimes(2);
    expect(fixture.repository.characterRuns).toHaveLength(0);

    fixture.repository.failCommit = false;
    const first = await fixture.service.launch(companionInput('request-retry', ['version-a']));
    fixture.createPrimarySession.mockClear();
    const retry = await fixture.service.launch(companionInput('request-retry', ['version-a']));
    expect(retry).toEqual(first);
    expect(fixture.createPrimarySession).not.toHaveBeenCalled();
  });
});

function createFixture(publications: readonly CharacterVersion[]) {
  const repository = new MemoryLaunchRepository(publications);
  const createPrimarySession = vi.fn<CharacterPrimaryAgentSessionPort['createPrimarySession']>(
    async ({ characterRunId }) => ({
      primaryAgentSessionId: `conversation:character:${characterRunId}`,
    }),
  );
  const releaseUnboundSession = vi.fn<CharacterPrimaryAgentSessionPort['releaseUnboundSession']>(
    async () => undefined,
  );
  const service = new CharacterConversationLaunchService({
    repository,
    agentSessions: {
      createPrimarySession,
      releaseUnboundSession,
      submitTurn: vi.fn(async () => ({ turnId: 'unused', content: 'unused' })),
    },
    world: { validateBinding: vi.fn(async () => undefined) },
    now: () => NOW,
  });
  return { service, repository, createPrimarySession, releaseUnboundSession };
}

class MemoryLaunchRepository implements CharacterConversationLaunchRepository {
  readonly publications: CharacterVersion[];
  readonly relationships: UserCharacterRelationship[] = [];
  readonly characterRuns: CharacterRun[] = [];
  readonly dialogues: DialogueRun[] = [];
  readonly rooms: CharacterRoom[] = [];
  readonly roomRuns: RoomRun[] = [];
  failCommit = false;

  constructor(publications: readonly CharacterVersion[]) {
    this.publications = [...structuredClone(publications)];
  }

  async readPublication(characterVersionId: string) {
    return clone(this.publications.find((item) => item.characterVersionId === characterVersionId));
  }

  async readRelationship(relationshipId: string) {
    return clone(this.relationships.find((item) => item.relationshipId === relationshipId));
  }

  async readCharacterRun(characterRunId: string) {
    return clone(this.characterRuns.find((item) => item.characterRunId === characterRunId));
  }

  async readDialogueRun(dialogueRunId: string) {
    return clone(this.dialogues.find((item) => item.dialogueRunId === dialogueRunId));
  }

  async readRoom(characterRoomId: string) {
    return clone(this.rooms.find((item) => item.characterRoomId === characterRoomId));
  }

  async readRun(roomRunId: string) {
    return clone(this.roomRuns.find((item) => item.roomRunId === roomRunId));
  }

  async commitLaunch(aggregate: CharacterConversationLaunchAggregate): Promise<void> {
    if (this.failCommit) throw new Error('aggregate failed');
    this.relationships.push(...structuredClone(aggregate.relationships));
    if (aggregate.topology === 'dialogue') {
      this.characterRuns.push(structuredClone(aggregate.characterRun));
      this.dialogues.push(structuredClone(aggregate.dialogueRun));
      return;
    }
    this.rooms.push(structuredClone(aggregate.room));
    this.characterRuns.push(...structuredClone(aggregate.characterRuns));
    this.roomRuns.push(structuredClone(aggregate.roomRun));
  }
}

function publication(suffix: string): CharacterVersion {
  return parseCharacterVersion({
    characterVersionId: `version-${suffix}`,
    characterProjectId: `project-${suffix}`,
    label: `Character ${suffix.toUpperCase()}`,
    definition: {
      summary: `Character ${suffix}`,
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    },
    acceptedEvidenceIds: [],
    publishedAt: NOW,
  });
}

function companionInput(requestId: string, characterVersionIds: readonly string[]) {
  return {
    requestId,
    userId: 'user:local',
    userDisplayName: 'You',
    selection: {
      runtimeKind: 'companion' as const,
      characters: characterVersionIds.map((characterVersionId) => ({ characterVersionId })),
    },
  };
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
