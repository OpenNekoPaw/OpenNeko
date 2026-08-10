import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterRun,
  type CharacterRunPresentationConfiguration,
  type CharacterMemoryScope,
  type CharacterStorylineRun,
  type CharacterStorylineVersion,
  type CharacterVersion,
  type DialogueRun,
  type RoomRun,
  type RoomView,
  type UserCharacterRelationship,
} from '@neko/chara/contracts';
import { describe, expect, it } from 'vitest';
import {
  CharacterInteractionService,
  type CharacterAgentTurnContext,
  type CharacterInteractionRepository,
  type CharacterPrimaryAgentSessionPort,
  type CharacterRoomViewPort,
} from '../application/character-interaction-service';

const now = '2026-08-09T10:00:00.000Z';

function publication(characterVersionId = 'character-version-a'): CharacterVersion {
  return {
    characterVersionId,
    characterProjectId: `project:${characterVersionId}`,
    label: characterVersionId,
    definition: {
      summary: `Profile ${characterVersionId}`,
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

function relationship(
  relationshipId: string,
  characterVersionId: string,
): UserCharacterRelationship {
  return {
    relationshipId,
    userId: 'user-a',
    characterVersionId,
    memories: [],
    candidates: [],
    createdAt: now,
    updatedAt: now,
  };
}

class MemoryInteractionRepository implements CharacterInteractionRepository {
  readonly versions = new Map<string, CharacterVersion>();
  readonly relationships = new Map<string, UserCharacterRelationship>();
  readonly characterRuns = new Map<string, CharacterRun>();
  readonly dialogues = new Map<string, DialogueRun>();
  readonly rooms = new Map<string, RoomRun>();
  readonly storylineVersions = new Map<string, CharacterStorylineVersion>();
  readonly storylineRuns = new Map<string, CharacterStorylineRun>();
  readonly memoryScopes = new Map<string, CharacterMemoryScope>();

  async readPublication(characterVersionId: string): Promise<CharacterVersion | undefined> {
    return cloneOptional(this.versions.get(characterVersionId));
  }

  async readRelationship(relationshipId: string): Promise<UserCharacterRelationship | undefined> {
    return cloneOptional(this.relationships.get(relationshipId));
  }

  async createDialogue(input: {
    readonly characterRun: CharacterRun;
    readonly dialogueRun: DialogueRun;
  }): Promise<void> {
    this.characterRuns.set(input.characterRun.characterRunId, structuredClone(input.characterRun));
    this.dialogues.set(input.dialogueRun.dialogueRunId, structuredClone(input.dialogueRun));
  }

  async readCharacterRun(characterRunId: string): Promise<CharacterRun | undefined> {
    return cloneOptional(this.characterRuns.get(characterRunId));
  }

  async readDialogueRun(dialogueRunId: string): Promise<DialogueRun | undefined> {
    return cloneOptional(this.dialogues.get(dialogueRunId));
  }

  async readRoomRun(roomRunId: string): Promise<RoomRun | undefined> {
    return cloneOptional(this.rooms.get(roomRunId));
  }

  async readStorylineVersion(id: string): Promise<CharacterStorylineVersion | undefined> {
    return cloneOptional(this.storylineVersions.get(id));
  }

  async readStorylineRun(id: string): Promise<CharacterStorylineRun | undefined> {
    return cloneOptional(this.storylineRuns.get(id));
  }

  async readMemoryScope(id: string): Promise<CharacterMemoryScope | undefined> {
    return cloneOptional(this.memoryScopes.get(id));
  }
}

class RecordingAgentSessions implements CharacterPrimaryAgentSessionPort {
  readonly created: string[] = [];
  readonly released: string[] = [];
  readonly turns: {
    readonly primaryAgentSessionId: string;
    readonly characterRunId: string;
    readonly context: CharacterAgentTurnContext;
  }[] = [];

  async createPrimarySession(input: {
    readonly characterRunId: string;
  }): Promise<{ readonly primaryAgentSessionId: string }> {
    this.created.push(input.characterRunId);
    return { primaryAgentSessionId: `pi-session:${input.characterRunId}` };
  }

  async releaseUnboundSession(primaryAgentSessionId: string): Promise<void> {
    this.released.push(primaryAgentSessionId);
  }

  async submitTurn(input: {
    readonly primaryAgentSessionId: string;
    readonly characterRunId: string;
    readonly message: string;
    readonly context: CharacterAgentTurnContext;
    readonly onTurnStarted?: (turnId: string) => Promise<void>;
  }): Promise<{ readonly turnId: string; readonly content: string }> {
    this.turns.push({
      primaryAgentSessionId: input.primaryAgentSessionId,
      characterRunId: input.characterRunId,
      context: input.context,
    });
    const turnId = `turn:${input.characterRunId}`;
    await input.onTurnStarted?.(turnId);
    return { turnId, content: `Response to ${input.message}` };
  }
}

class StubRoomViews implements CharacterRoomViewPort {
  async materializeRoomView(roomRunId: string, participantId: string): Promise<RoomView> {
    return {
      roomRunId,
      roomRevision: 1,
      participantId,
      participants: [
        {
          participantId,
          displayName: participantId,
          characterVersionId: `character-version-${participantId.at(-1) ?? 'a'}`,
          controller: {
            kind: 'agent',
            characterRunId: `character-run-${participantId.at(-1) ?? 'a'}`,
            primaryAgentSessionId: `pi-session:character-run-${participantId.at(-1) ?? 'a'}`,
          },
        },
      ],
      events: [
        {
          kind: 'message',
          roomEventId: `private:${participantId}`,
          roomRunId,
          sequence: 1,
          createdAt: now,
          visibility: { kind: 'private', participantId },
          authorParticipantId: participantId,
          content: `Visible only to ${participantId}`,
          mentionedParticipantIds: [],
        },
      ],
    };
  }
}

function serviceFixture(presentationTurns?: {
  prepareNextTurn(
    characterRunId: string,
  ): Promise<CharacterRunPresentationConfiguration | undefined>;
  freezePreparedTurn(input: {
    readonly turnId: string;
    readonly configuration: CharacterRunPresentationConfiguration;
  }): Promise<unknown>;
}) {
  const repository = new MemoryInteractionRepository();
  const agentSessions = new RecordingAgentSessions();
  const roomViews = new StubRoomViews();
  const service = new CharacterInteractionService({
    repository,
    agentSessions,
    roomViews,
    ...(presentationTurns === undefined ? {} : { presentationTurns }),
    now: () => now,
  });
  return { repository, agentSessions, roomViews, service };
}

describe('CharacterInteractionService', () => {
  it('maps an agent-controlled companion Dialogue to one primary Pi AgentSession', async () => {
    const fixture = serviceFixture();
    fixture.repository.versions.set('character-version-a', publication());
    fixture.repository.relationships.set(
      'relationship-a',
      relationship('relationship-a', 'character-version-a'),
    );
    const created = await fixture.service.createDialogue({
      dialogueRunId: 'dialogue-a',
      characterRunId: 'character-run-a',
      characterVersionId: 'character-version-a',
      userParticipantId: 'participant-user',
      characterParticipantId: 'participant-character',
      controller: { kind: 'agent' },
      runtimeKind: 'companion',
      relationshipId: 'relationship-a',
    });
    const result = await fixture.service.submitTurn({
      topology: 'dialogue',
      dialogueRunId: 'dialogue-a',
      characterRunId: 'character-run-a',
      message: 'Hello.',
    });

    expect(fixture.agentSessions.created).toEqual(['character-run-a']);
    expect(created.characterRun.controller).toEqual({
      kind: 'agent',
      primaryAgentSessionId: 'pi-session:character-run-a',
    });
    expect(fixture.agentSessions.turns).toHaveLength(1);
    expect(fixture.agentSessions.turns[0]?.context.characterVersion.characterVersionId).toBe(
      'character-version-a',
    );
    expect(fixture.agentSessions.turns[0]?.context.relationship?.relationshipId).toBe(
      'relationship-a',
    );
    expect(result.turnId).toBe('turn:character-run-a');
  });

  it('materializes only the exact frozen StorylineRun and MemoryScope into a turn', async () => {
    const fixture = serviceFixture();
    fixture.repository.versions.set('character-version-a', publication());
    fixture.repository.relationships.set(
      'relationship-a',
      relationship('relationship-a', 'character-version-a'),
    );
    await fixture.service.createDialogue({
      dialogueRunId: 'dialogue-a',
      characterRunId: 'character-run-a',
      characterVersionId: 'character-version-a',
      userParticipantId: 'participant-user',
      characterParticipantId: 'participant-character',
      controller: { kind: 'agent' },
      runtimeKind: 'companion',
      relationshipId: 'relationship-a',
    });
    fixture.repository.characterRuns.set('character-run-a', {
      ...fixture.repository.characterRuns.get('character-run-a')!,
      characterStorylineRunId: 'storyline-run-a',
      characterMemoryScopeId: 'memory-scope-a',
    });
    fixture.repository.storylineVersions.set('storyline-version-a', {
      characterStorylineVersionId: 'storyline-version-a',
      characterVersionId: 'character-version-a',
      label: 'Arc A',
      premise: 'Learn to trust.',
      desire: 'Belonging',
      conflict: 'Suspicion',
      growthArc: 'From guarded to open.',
      stages: [{ stageId: 'guarded', title: 'Guarded', description: 'Keeps distance.' }],
      turningPoints: [],
      constraints: [],
      acceptedEvidenceIds: [],
      publishedAt: now,
    });
    fixture.repository.storylineRuns.set('storyline-run-a', {
      characterStorylineRunId: 'storyline-run-a',
      characterStorylineVersionId: 'storyline-version-a',
      characterRunId: 'character-run-a',
      currentStageId: 'guarded',
      acceptedTransitions: [],
      storylineRevision: 0,
      createdAt: now,
      updatedAt: now,
    });
    fixture.repository.memoryScopes.set('memory-scope-a', {
      characterMemoryScopeId: 'memory-scope-a',
      characterRunId: 'character-run-a',
      characterStorylineRunId: 'storyline-run-a',
      memoryRevision: 0,
      candidates: [],
      entries: [],
      createdAt: now,
      updatedAt: now,
    });

    await fixture.service.submitTurn({
      topology: 'dialogue',
      dialogueRunId: 'dialogue-a',
      characterRunId: 'character-run-a',
      message: 'Remember this exact context.',
    });

    const context = fixture.agentSessions.turns[0]?.context;
    expect(context?.characterStorylineRun?.characterStorylineRunId).toBe('storyline-run-a');
    expect(context?.characterMemoryScope?.characterMemoryScopeId).toBe('memory-scope-a');
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context?.characterStorylineRun)).toBe(true);

    fixture.repository.storylineRuns.set('storyline-run-a', {
      ...fixture.repository.storylineRuns.get('storyline-run-a')!,
      characterRunId: 'character-run-other',
    });
    await expect(
      fixture.service.submitTurn({
        topology: 'dialogue',
        dialogueRunId: 'dialogue-a',
        characterRunId: 'character-run-a',
        message: 'Do not cross run authority.',
      }),
    ).rejects.toMatchObject({ code: 'character-storyline-run-unavailable' });
  });

  it('freezes the presentation configuration prepared before the Agent turn starts', async () => {
    const frozen: { readonly turnId: string; readonly modelRef: string }[] = [];
    let configuration: CharacterRunPresentationConfiguration = {
      characterRunId: 'character-run-a',
      participantId: 'participant-character',
      chat: { providerRef: 'provider:chat-a', modelRef: 'model:chat-a' },
      tts: {
        providerRef: 'provider:tts-a',
        voiceRepresentationId: 'voice-a',
        speed: 1,
        autoRead: true,
      },
      updatedAt: now,
    };
    const fixture = serviceFixture({
      async prepareNextTurn() {
        return structuredClone(configuration);
      },
      async freezePreparedTurn(input) {
        frozen.push({ turnId: input.turnId, modelRef: input.configuration.chat.modelRef });
      },
    });
    fixture.repository.versions.set('character-version-a', publication());
    fixture.repository.relationships.set(
      'relationship-a',
      relationship('relationship-a', 'character-version-a'),
    );
    await fixture.service.createDialogue({
      dialogueRunId: 'dialogue-a',
      characterRunId: 'character-run-a',
      characterVersionId: 'character-version-a',
      userParticipantId: 'participant-user',
      characterParticipantId: 'participant-character',
      controller: { kind: 'agent' },
      runtimeKind: 'companion',
      relationshipId: 'relationship-a',
    });

    const prepared = await fixture.service.prepareTurn({
      topology: 'dialogue',
      dialogueRunId: 'dialogue-a',
      characterRunId: 'character-run-a',
    });
    configuration = {
      ...configuration,
      chat: { providerRef: 'provider:chat-next', modelRef: 'model:chat-next' },
    };
    await fixture.service.submitPreparedTurn(prepared, 'Use the prepared model.');

    expect(prepared.context.presentationConfiguration?.chat.modelRef).toBe('model:chat-a');
    expect(frozen).toEqual([{ turnId: 'turn:character-run-a', modelRef: 'model:chat-a' }]);
  });

  it('does not create a hidden AgentSession for a human-controlled Character', async () => {
    const fixture = serviceFixture();
    fixture.repository.versions.set('character-version-a', publication());
    fixture.repository.relationships.set(
      'relationship-a',
      relationship('relationship-a', 'character-version-a'),
    );
    await fixture.service.createDialogue({
      dialogueRunId: 'dialogue-human',
      characterRunId: 'character-run-human',
      characterVersionId: 'character-version-a',
      userParticipantId: 'participant-user',
      characterParticipantId: 'participant-character',
      controller: { kind: 'human', userId: 'user-a' },
      runtimeKind: 'companion',
      relationshipId: 'relationship-a',
    });

    expect(fixture.agentSessions.created).toEqual([]);
    await expect(
      fixture.service.submitTurn({
        topology: 'dialogue',
        dialogueRunId: 'dialogue-human',
        characterRunId: 'character-run-human',
        message: 'Hidden turn?',
      }),
    ).rejects.toMatchObject({ code: 'human-character-has-no-agent-session' });
  });

  it('keeps Room participant sessions and filtered contexts isolated', async () => {
    const fixture = serviceFixture();
    for (const suffix of ['a', 'b']) {
      fixture.repository.versions.set(
        `character-version-${suffix}`,
        publication(`character-version-${suffix}`),
      );
      fixture.repository.relationships.set(
        `relationship-${suffix}`,
        relationship(`relationship-${suffix}`, `character-version-${suffix}`),
      );
      fixture.repository.characterRuns.set(`character-run-${suffix}`, {
        characterRunId: `character-run-${suffix}`,
        characterVersionId: `character-version-${suffix}`,
        participantId: `participant-${suffix}`,
        controller: {
          kind: 'agent',
          primaryAgentSessionId: `pi-session:character-run-${suffix}`,
        },
        runtimeBinding: { kind: 'companion', relationshipId: `relationship-${suffix}` },
        createdAt: now,
      });
    }
    fixture.repository.rooms.set('room-run-a', {
      topology: 'chatroom',
      roomRunId: 'room-run-a',
      characterRoomId: 'room-a',
      roomRevision: 0,
      participants: ['a', 'b'].map((suffix) => ({
        participantId: `participant-${suffix}`,
        displayName: suffix,
        characterVersionId: `character-version-${suffix}`,
        controller: {
          kind: 'agent',
          characterRunId: `character-run-${suffix}`,
          primaryAgentSessionId: `pi-session:character-run-${suffix}`,
        },
      })),
      schedulingPolicy: { kind: 'mentioned' },
      events: [],
      runtimeKind: 'companion',
      relationshipIds: ['relationship-a', 'relationship-b'],
      createdAt: now,
    });

    for (const suffix of ['a', 'b']) {
      await fixture.service.submitTurn({
        topology: 'chatroom',
        roomRunId: 'room-run-a',
        primaryAgentSessionId: `pi-session:character-run-${suffix}`,
        message: `Respond as ${suffix}.`,
      });
    }

    expect(fixture.agentSessions.turns.map((turn) => turn.primaryAgentSessionId)).toEqual([
      'pi-session:character-run-a',
      'pi-session:character-run-b',
    ]);
    expect(
      fixture.agentSessions.turns.map((turn) => turn.context.roomView?.events[0]?.roomEventId),
    ).toEqual(['private:participant-a', 'private:participant-b']);
    expect(
      fixture.agentSessions.turns.map((turn) => turn.context.relationship?.characterVersionId),
    ).toEqual(['character-version-a', 'character-version-b']);
  });

  it('cannot start a formal run from an authoring-test snapshot identity', async () => {
    const fixture = serviceFixture();
    fixture.repository.relationships.set(
      'relationship-a',
      relationship('relationship-a', 'authoring-test-a'),
    );

    await expect(
      fixture.service.createDialogue({
        dialogueRunId: 'dialogue-a',
        characterRunId: 'character-run-a',
        characterVersionId: 'authoring-test-a',
        userParticipantId: 'participant-user',
        characterParticipantId: 'participant-character',
        controller: { kind: 'agent' },
        runtimeKind: 'companion',
        relationshipId: 'relationship-a',
      }),
    ).rejects.toMatchObject({ code: 'character-version-unavailable' });
    expect(fixture.agentSessions.created).toEqual([]);
  });
});

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
