import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  parseCharacterVersion,
  parseCharacterStorylineVersion,
  type CharacterRoom,
  type CharacterCompanionContinuity,
  type CharacterRun,
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
import type { CharacterAgentConversationPort } from '../application/character-interaction-service';

const NOW = '2026-08-09T12:00:00.000Z';

describe('CharacterConversationLaunchService', () => {
  it('validates an exact published selection without creating formal runtime facts', async () => {
    const fixture = createFixture([publication('a')]);

    await expect(
      fixture.service.validateSelection({
        mode: 'companion',
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
      mode: 'companion',
      characterProjectId: 'project-a',
      characterVersionId: 'version-a',
      characterRunId: 'character-run:launch:request-a:1',
      dialogueRunId: 'dialogue-run:launch:request-a',
      primaryAgentSessionId: 'conversation:character:character-run:launch:request-a:1',
    });
    expect(fixture.repository.dialogues).toHaveLength(1);
    expect(fixture.repository.rooms).toHaveLength(0);
    expect(fixture.repository.companionContinuities).toEqual([
      expect.objectContaining({
        companionContinuityId: 'companion-continuity:user%3Alocal:project-a',
        characterProjectId: 'project-a',
      }),
    ]);
    expect(fixture.createPrimarySession).toHaveBeenCalledTimes(1);
  });

  it('reuses one stable Companion continuity and relationship across Conversations', async () => {
    const fixture = createFixture([publication('a')]);

    await fixture.service.launch(companionInput('request-first', ['version-a']));
    await fixture.service.launch(companionInput('request-second', ['version-a']));

    expect(fixture.repository.dialogues).toHaveLength(2);
    expect(fixture.repository.companionContinuities).toHaveLength(1);
    expect(fixture.repository.relationships).toHaveLength(1);
    expect(fixture.repository.characterRuns.map((run) => run.runtimeBinding)).toEqual([
      expect.objectContaining({
        kind: 'companion',
        companionContinuityId: 'companion-continuity:user%3Alocal:project-a',
        relationshipId: 'relationship:user%3Alocal:project-a',
      }),
      expect.objectContaining({
        kind: 'companion',
        companionContinuityId: 'companion-continuity:user%3Alocal:project-a',
        relationshipId: 'relationship:user%3Alocal:project-a',
      }),
    ]);
  });

  it('binds the selected role profile to the exact Dialogue AgentSession authority', async () => {
    const fixture = createFixture([publication('a')]);

    await fixture.service.launch({
      ...companionInput('request-role', ['version-a']),
      selection: {
        mode: 'companion',
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
    expect(fixture.repository.companionContinuities).toHaveLength(2);
    expect(fixture.repository.roomRuns[0]?.schedulingPolicy).toEqual({
      kind: 'bounded-autonomous',
      maxResponsesPerCycle: 2,
      eligibleParticipantIds: ['participant:character:1', 'participant:character:2'],
    });
  });

  it('rejects the removed Companion storyline field before creating runtime records', async () => {
    const fixture = createFixture([publication('a')]);
    fixture.repository.storylineVersions.push(storyline('a', 'version-a'));

    await expect(
      fixture.service.launch({
        ...companionInput('request-storyline', ['version-a']),
        selection: {
          mode: 'companion',
          characters: [
            {
              characterVersionId: 'version-a',
              characterStorylineVersionId: 'storyline-version-a',
            },
          ],
        },
      }),
    ).rejects.toThrow(/unsupported fields/u);

    expect(fixture.repository.characterRuns).toHaveLength(0);
    expect(fixture.repository.companionContinuities).toHaveLength(0);
  });

  it('creates node-bound Narrative without Companion memory or relationship authority', async () => {
    const fixture = createFixture([publication('a')]);
    fixture.repository.storylineVersions.push(storyline('a', 'version-a'));

    const result = await fixture.service.launch({
      requestId: 'request-narrative',
      userId: 'user:local',
      userDisplayName: 'You',
      selection: {
        mode: 'narrative',
        characters: [
          {
            characterVersionId: 'version-a',
            storyline: {
              characterStorylineId: 'storyline-a',
              characterStorylineVersionId: 'storyline-version-a',
              storylineNodeId: 'node-a',
            },
          },
        ],
      },
    });

    expect(result).toMatchObject({ topology: 'dialogue', mode: 'narrative' });
    expect(fixture.repository.relationships).toHaveLength(0);
    expect(fixture.repository.companionContinuities).toHaveLength(0);
    expect(fixture.repository.characterRuns[0]?.runtimeBinding).toEqual({
      kind: 'narrative',
      storyline: {
        characterStorylineId: 'storyline-a',
        characterStorylineVersionId: 'storyline-version-a',
        storylineNodeId: 'node-a',
      },
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

  it('rejects two versions of the same Character before creating a Room owner', async () => {
    const second = {
      ...publication('second'),
      characterProjectId: 'project-a',
    };
    const fixture = createFixture([publication('a'), second]);

    await expect(
      fixture.service.launch(
        companionInput('request-same-character', ['version-a', 'version-second']),
      ),
    ).rejects.toMatchObject({ code: 'character-launch-selection-invalid' });
    expect(fixture.repository.rooms).toHaveLength(0);
    expect(fixture.repository.characterRuns).toHaveLength(0);
    expect(fixture.createPrimarySession).not.toHaveBeenCalled();
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

  it('keeps the committed Conversation mode immutable for a reused request identity', async () => {
    const fixture = createFixture([publication('a')]);
    await fixture.service.launch(companionInput('request-mode', ['version-a']));

    await expect(
      fixture.service.launch({
        ...companionInput('request-mode', ['version-a']),
        selection: {
          mode: 'narrative',
          characters: [{ characterVersionId: 'version-a' }],
        },
      }),
    ).rejects.toMatchObject({ code: 'character-launch-conflict' });
    expect(fixture.repository.dialogues).toHaveLength(1);
    expect(fixture.repository.dialogues[0]?.mode).toBe('companion');
  });

  it('rejects replay when the exact Companion continuity authority is missing', async () => {
    const fixture = createFixture([publication('a')]);
    const input = companionInput('request-corrupt-memory', ['version-a']);
    await fixture.service.launch(input);
    fixture.repository.companionContinuities.length = 0;

    await expect(fixture.service.launch(input)).rejects.toMatchObject({
      code: 'character-launch-conflict',
    });
    expect(fixture.createPrimarySession).toHaveBeenCalledTimes(1);
  });
});

function createFixture(publications: readonly CharacterVersion[]) {
  const repository = new MemoryLaunchRepository(publications);
  const createPrimarySession = vi.fn<CharacterAgentConversationPort['createPrimarySession']>(
    async ({ characterRunId }) => ({
      primaryAgentSessionId: `conversation:character:${characterRunId}`,
    }),
  );
  const releaseUnboundSession = vi.fn<CharacterAgentConversationPort['releaseUnboundSession']>(
    async () => undefined,
  );
  const service = new CharacterConversationLaunchService({
    repository,
    publications: repository,
    agentConversations: {
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
  readonly companionContinuities: CharacterCompanionContinuity[] = [];
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

  async readCompanionContinuity(companionContinuityId: string) {
    return clone(
      this.companionContinuities.find(
        (item) => item.companionContinuityId === companionContinuityId,
      ),
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
    this.companionContinuities.push(...structuredClone(aggregate.companionContinuities));
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
    characterStorylineId: `storyline-${suffix}`,
    characterVersionId,
    label: `Storyline ${suffix.toUpperCase()}`,
    premise: 'A sealed archive opens.',
    constraints: [],
    nodeOrder: [`node-${suffix}`],
    nodes: [
      {
        storylineNodeId: `node-${suffix}`,
        title: 'Arrival',
        spoilerVisibility: 'visible',
        context: {
          situation: 'The archive opens.',
          allowedStoryFacts: [],
          forbiddenStoryFacts: [],
          narrativeMemories: [],
          knowledgeBoundary: [],
          behaviorConstraints: [],
          expressionConstraints: [],
          authorOnlyNotes: [],
        },
      },
    ],
    edges: [],
    publishedAt: NOW,
  });
}

function companionInput(requestId: string, characterVersionIds: readonly string[]) {
  return {
    requestId,
    userId: 'user:local',
    userDisplayName: 'You',
    selection: {
      mode: 'companion' as const,
      characters: characterVersionIds.map((characterVersionId) => ({ characterVersionId })),
    },
  };
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
