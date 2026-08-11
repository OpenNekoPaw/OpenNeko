import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterVersion,
  parseCharacterStorylineVersion,
  type CharacterRoom,
  type CharacterMemoryScope,
  type CharacterRun,
  type CharacterStorylineRun,
  type CharacterStorylineVersion,
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
  it('validates an exact published selection without creating formal runtime facts', async () => {
    const fixture = createFixture([publication('a')]);

    await expect(
      fixture.service.validateSelection({
        runtimeKind: 'companion',
        characters: [{ characterVersionId: 'version-a' }],
      }),
    ).resolves.toBeUndefined();

    expect(fixture.repository.characterRuns).toHaveLength(0);
    expect(fixture.repository.dialogues).toHaveLength(0);
    expect(fixture.createPrimarySession).not.toHaveBeenCalled();
  });

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
    expect(fixture.repository.memoryScopes).toEqual([
      expect.objectContaining({
        characterMemoryScopeId: 'character-memory-scope:launch:request-a:1',
        characterRunId: 'character-run:launch:request-a:1',
      }),
    ]);
    expect(fixture.createPrimarySession).toHaveBeenCalledTimes(1);
  });

  it('binds the selected role profile to the exact Dialogue AgentSession authority', async () => {
    const fixture = createFixture([publication('a')]);

    await fixture.service.launch({
      ...companionInput('request-role', ['version-a']),
      selection: {
        runtimeKind: 'companion',
        characters: [{ characterVersionId: 'version-a', roleProfileId: 'role-profile-a' }],
      },
    });

    expect(fixture.createPrimarySession).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: expect.objectContaining({ roleProfileId: 'role-profile-a' }),
      }),
      undefined,
    );
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
    expect(fixture.repository.memoryScopes).toHaveLength(2);
    expect(fixture.repository.roomRuns[0]?.schedulingPolicy).toEqual({
      kind: 'bounded-autonomous',
      maxResponsesPerCycle: 2,
      eligibleParticipantIds: ['participant:character:1', 'participant:character:2'],
    });
  });

  it('atomically binds an explicitly selected storyline and fresh memory scope to the CharacterRun', async () => {
    const fixture = createFixture([publication('a')]);
    fixture.repository.storylineVersions.push(storyline('a', 'version-a'));

    await fixture.service.launch({
      ...companionInput('request-storyline', ['version-a']),
      selection: {
        runtimeKind: 'companion',
        characters: [
          {
            characterVersionId: 'version-a',
            characterStorylineVersionId: 'storyline-version-a',
          },
        ],
      },
    });

    expect(fixture.repository.characterRuns[0]).toMatchObject({
      characterStorylineRunId: 'character-storyline-run:launch:request-storyline:1',
      characterMemoryScopeId: 'character-memory-scope:launch:request-storyline:1',
    });
    expect(fixture.repository.storylineRuns[0]).toMatchObject({
      characterStorylineVersionId: 'storyline-version-a',
      characterRunId: 'character-run:launch:request-storyline:1',
      currentStageId: 'stage-a',
      storylineRevision: 0,
    });
    expect(fixture.repository.memoryScopes[0]).toMatchObject({
      characterStorylineRunId: 'character-storyline-run:launch:request-storyline:1',
      memoryRevision: 0,
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

  it('rejects replay when the exact Character memory authority is missing', async () => {
    const fixture = createFixture([publication('a')]);
    const input = companionInput('request-corrupt-memory', ['version-a']);
    await fixture.service.launch(input);
    fixture.repository.memoryScopes.length = 0;

    await expect(fixture.service.launch(input)).rejects.toMatchObject({
      code: 'character-launch-conflict',
    });
    expect(fixture.createPrimarySession).toHaveBeenCalledTimes(1);
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
    publications: repository,
    agentSessions: {
      createPrimarySession,
      releaseUnboundSession,
      submitTurn: vi.fn(async () => ({ turnId: 'unused', content: 'unused' })),
    },
    now: () => NOW,
  });
  return { service, repository, createPrimarySession, releaseUnboundSession };
}

class MemoryLaunchRepository implements CharacterConversationLaunchRepository {
  readonly publications: CharacterVersion[];
  readonly relationships: UserCharacterRelationship[] = [];
  readonly characterRuns: CharacterRun[] = [];
  readonly storylineVersions: CharacterStorylineVersion[] = [];
  readonly storylineRuns: CharacterStorylineRun[] = [];
  readonly memoryScopes: CharacterMemoryScope[] = [];
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

  async readStorylineVersion(characterStorylineVersionId: string) {
    return clone(
      this.storylineVersions.find(
        (item) => item.characterStorylineVersionId === characterStorylineVersionId,
      ),
    );
  }

  async readStorylineRun(characterStorylineRunId: string) {
    return clone(
      this.storylineRuns.find((item) => item.characterStorylineRunId === characterStorylineRunId),
    );
  }

  async readMemoryScope(characterMemoryScopeId: string) {
    return clone(
      this.memoryScopes.find((item) => item.characterMemoryScopeId === characterMemoryScopeId),
    );
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
    this.storylineRuns.push(...structuredClone(aggregate.storylineRuns));
    this.memoryScopes.push(...structuredClone(aggregate.memoryScopes));
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
      backgroundStory: createEmptyCharacterBackgroundStory(),
      originSetting: createEmptyCharacterOriginSetting(),
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

function storyline(suffix: string, characterVersionId: string): CharacterStorylineVersion {
  return parseCharacterStorylineVersion({
    characterStorylineVersionId: `storyline-version-${suffix}`,
    characterVersionId,
    label: `Storyline ${suffix.toUpperCase()}`,
    premise: 'A sealed archive opens.',
    desire: 'Protect the record.',
    conflict: 'The record must be shared.',
    growthArc: 'Learn to trust a witness.',
    stages: [{ stageId: `stage-${suffix}`, title: 'Guarded', description: 'Keeps distance.' }],
    turningPoints: [],
    constraints: [],
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
