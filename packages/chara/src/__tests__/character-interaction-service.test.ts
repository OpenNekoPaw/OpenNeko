import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterCompanionContinuity,
  type CharacterNarrativeTurnReceipt,
  type CharacterRun,
  type CharacterRunPresentationConfiguration,
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
  type CharacterAgentConversationPort,
  type CharacterInteractionRepository,
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
    characterProjectId: `project:${characterVersionId}`,
    relationshipRevision: 0,
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
  readonly companionContinuities = new Map<string, CharacterCompanionContinuity>();
  readonly narrativeTurnReceipts = new Map<string, CharacterNarrativeTurnReceipt>();

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

  async readCompanionContinuity(id: string): Promise<CharacterCompanionContinuity | undefined> {
    return cloneOptional(this.companionContinuities.get(id));
  }

  async freezeNarrativeTurnReceipt(receipt: CharacterNarrativeTurnReceipt): Promise<void> {
    if (this.narrativeTurnReceipts.has(receipt.turnId)) {
      throw new Error(`Narrative turn '${receipt.turnId}' already exists.`);
    }
    this.narrativeTurnReceipts.set(receipt.turnId, structuredClone(receipt));
  }

  async readNarrativeTurnReceipt(
    turnId: string,
  ): Promise<CharacterNarrativeTurnReceipt | undefined> {
    return cloneOptional(this.narrativeTurnReceipts.get(turnId));
  }
}

class RecordingAgentConversations implements CharacterAgentConversationPort {
  readonly created: string[] = [];
  readonly released: string[] = [];
  readonly turns: {
    readonly requestId: string;
    readonly primaryAgentSessionId: string;
    readonly characterRunId: string;
  }[] = [];

  async createPrimarySession(input: {
    readonly characterRunId: string;
  }): Promise<{ readonly primaryAgentSessionId: string }> {
    this.created.push(input.characterRunId);
    return { primaryAgentSessionId: `conversation:${input.characterRunId}` };
  }

  async releaseUnboundSession(primaryAgentSessionId: string): Promise<void> {
    this.released.push(primaryAgentSessionId);
  }

  async submitTurn(input: {
    readonly requestId: string;
    readonly primaryAgentSessionId: string;
    readonly characterRunId: string;
    readonly message: string;
  }): Promise<{ readonly turnId: string; readonly content: string }> {
    this.turns.push({
      requestId: input.requestId,
      primaryAgentSessionId: input.primaryAgentSessionId,
      characterRunId: input.characterRunId,
    });
    const turnId = `turn:${input.characterRunId}`;
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
            primaryAgentSessionId: `conversation:character-run-${participantId.at(-1) ?? 'a'}`,
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
  for (const suffix of ['a', 'b']) {
    repository.companionContinuities.set(`continuity-${suffix}`, {
      companionContinuityId: `continuity-${suffix}`,
      userId: 'user-a',
      characterProjectId: `project:character-version-${suffix}`,
      continuityRevision: 0,
      candidates: [],
      entries: [],
      createdAt: now,
      updatedAt: now,
    });
  }
  const agentConversations = new RecordingAgentConversations();
  const roomViews = new StubRoomViews();
  const service = new CharacterInteractionService({
    repository,
    agentConversations,
    roomViews,
    ...(presentationTurns === undefined ? {} : { presentationTurns }),
    now: () => now,
  });
  return { repository, agentConversations, roomViews, service };
}

describe('CharacterInteractionService', () => {
  it('maps an agent-controlled companion Dialogue to one primary Agent Conversation', async () => {
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
      mode: 'companion',
      companionContinuityId: 'continuity-a',
      relationshipId: 'relationship-a',
    });
    const result = await fixture.service.submitTurn({
      requestId: 'request-dialogue-a',
      topology: 'dialogue',
      dialogueRunId: 'dialogue-a',
      characterRunId: 'character-run-a',
      message: 'Hello.',
    });

    const prepared = await fixture.service.prepareTurn({
      topology: 'dialogue',
      dialogueRunId: 'dialogue-a',
      characterRunId: 'character-run-a',
    });
    expect(fixture.agentConversations.created).toEqual(['character-run-a']);
    expect(created.characterRun.controller).toEqual({
      kind: 'agent',
      primaryAgentSessionId: 'conversation:character-run-a',
    });
    expect(fixture.agentConversations.turns).toHaveLength(1);
    expect(prepared.context.characterVersion.characterVersionId).toBe('character-version-a');
    expect(prepared.context.relationship?.relationshipId).toBe('relationship-a');
    expect(result.turnId).toBe('turn:character-run-a');
    await expect(fixture.service.resolveAgentModeConstraint('character-run-a')).resolves.toEqual({
      mode: 'companion',
      skills: 'configured',
      tools: 'configured',
      externalReferences: 'configured',
    });
  });

  it('materializes only the exact bounded Narrative node context into a turn', async () => {
    const fixture = serviceFixture();
    fixture.repository.versions.set('character-version-a', publication());
    fixture.repository.characterRuns.set('character-run-a', {
      characterRunId: 'character-run-a',
      characterVersionId: 'character-version-a',
      participantId: 'participant-character',
      controller: { kind: 'agent', primaryAgentSessionId: 'conversation:character-run-a' },
      runtimeBinding: {
        kind: 'narrative',
        storyline: {
          characterStorylineId: 'storyline-a',
          characterStorylineVersionId: 'storyline-version-a',
          storylineNodeId: 'arrival',
        },
      },
      createdAt: now,
    });
    fixture.repository.dialogues.set('dialogue-a', {
      topology: 'dialogue',
      dialogueRunId: 'dialogue-a',
      userParticipantId: 'participant-user',
      characterParticipantId: 'participant-character',
      characterRunId: 'character-run-a',
      mode: 'narrative',
      createdAt: now,
    });
    fixture.repository.storylineVersions.set('storyline-version-a', {
      characterStorylineVersionId: 'storyline-version-a',
      characterStorylineId: 'storyline-a',
      characterVersionId: 'character-version-a',
      label: 'Arc A',
      premise: 'Learn to trust.',
      constraints: [],
      nodeOrder: ['arrival'],
      nodes: [
        {
          storylineNodeId: 'arrival',
          title: 'Arrival',
          spoilerVisibility: 'visible',
          context: {
            situation: 'The gate opens.',
            allowedStoryFacts: ['The gate is open.'],
            forbiddenStoryFacts: ['The messenger is the traitor.'],
            narrativeMemories: ['A promise was made here.'],
            knowledgeBoundary: ['The sender is unknown.'],
            behaviorConstraints: ['Stay cautious.'],
            expressionConstraints: ['Speak tersely.'],
            authorOnlyNotes: ['The messenger watches nearby.'],
          },
        },
      ],
      edges: [],
      publishedAt: now,
    });

    const bindingBefore = structuredClone(
      fixture.repository.characterRuns.get('character-run-a')?.runtimeBinding,
    );
    await expect(fixture.service.resolveAgentModeConstraint('character-run-a')).resolves.toEqual({
      mode: 'narrative',
      skills: 'none',
      tools: 'none',
      externalReferences: 'none',
    });
    const publicationBefore = structuredClone(
      fixture.repository.storylineVersions.get('storyline-version-a'),
    );
    const prepared = await fixture.service.prepareTurn({
      topology: 'dialogue',
      dialogueRunId: 'dialogue-a',
      characterRunId: 'character-run-a',
    });
    const result = await fixture.service.submitPreparedTurn(
      prepared,
      'request-narrative-a',
      'The gate scene is complete. Transition us to the successor node now.',
    );

    const context = prepared.context;
    expect(context?.narrative?.storylineNodeId).toBe('arrival');
    expect(context?.narrative?.node.situation).toBe('The gate opens.');
    expect(context?.narrative?.node).not.toHaveProperty('forbiddenStoryFacts');
    expect(context?.narrative?.node).not.toHaveProperty('authorOnlyNotes');
    expect(context).not.toHaveProperty('companionContinuity');
    expect(context).not.toHaveProperty('relationship');
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context?.narrative)).toBe(true);
    expect(result.content).toContain('Transition us to the successor node now.');
    expect(fixture.repository.narrativeTurnReceipts.get(result.turnId)).toEqual({
      turnId: result.turnId,
      primaryAgentSessionId: 'conversation:character-run-a',
      characterRunId: 'character-run-a',
      characterVersionId: 'character-version-a',
      conversation: { topology: 'dialogue', dialogueRunId: 'dialogue-a' },
      storyline: {
        characterStorylineId: 'storyline-a',
        characterStorylineVersionId: 'storyline-version-a',
        storylineNodeId: 'arrival',
      },
      startedAt: now,
    });
    expect(fixture.repository.characterRuns.get('character-run-a')?.runtimeBinding).toEqual(
      bindingBefore,
    );
    expect(fixture.repository.storylineVersions.get('storyline-version-a')).toEqual(
      publicationBefore,
    );

    fixture.repository.storylineVersions.delete('storyline-version-a');
    await expect(
      fixture.service.submitTurn({
        requestId: 'request-narrative-missing',
        topology: 'dialogue',
        dialogueRunId: 'dialogue-a',
        characterRunId: 'character-run-a',
        message: 'Do not cross run authority.',
      }),
    ).rejects.toMatchObject({ code: 'character-storyline-context-unavailable' });
  });

  it('freezes the presentation configuration prepared before the Agent turn starts', async () => {
    const frozen: { readonly turnId: string; readonly speed: number }[] = [];
    let configuration: CharacterRunPresentationConfiguration = {
      characterRunId: 'character-run-a',
      participantId: 'participant-character',
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
        frozen.push({ turnId: input.turnId, speed: input.configuration.tts.speed });
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
      mode: 'companion',
      companionContinuityId: 'continuity-a',
      relationshipId: 'relationship-a',
    });

    const prepared = await fixture.service.prepareTurn({
      topology: 'dialogue',
      dialogueRunId: 'dialogue-a',
      characterRunId: 'character-run-a',
    });
    configuration = {
      ...configuration,
      tts: { ...configuration.tts, speed: 1.25 },
    };
    await fixture.service.submitPreparedTurn(
      prepared,
      'request-presentation-a',
      'Use the prepared voice.',
    );

    expect(prepared.context.presentationConfiguration?.tts.speed).toBe(1);
    expect(frozen).toEqual([{ turnId: 'turn:character-run-a', speed: 1 }]);
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
      mode: 'companion',
      companionContinuityId: 'continuity-a',
      relationshipId: 'relationship-a',
    });

    expect(fixture.agentConversations.created).toEqual([]);
    await expect(
      fixture.service.submitTurn({
        requestId: 'request-human',
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
          primaryAgentSessionId: `conversation:character-run-${suffix}`,
        },
        runtimeBinding: {
          kind: 'companion',
          companionContinuityId: `continuity-${suffix}`,
          relationshipId: `relationship-${suffix}`,
        },
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
          primaryAgentSessionId: `conversation:character-run-${suffix}`,
        },
      })),
      schedulingPolicy: { kind: 'mentioned' },
      events: [],
      mode: 'companion',
      relationshipIds: ['relationship-a', 'relationship-b'],
      createdAt: now,
    });

    const preparedTurns = [];
    for (const suffix of ['a', 'b']) {
      const prepared = await fixture.service.prepareTurn({
        topology: 'chatroom',
        roomRunId: 'room-run-a',
        primaryAgentSessionId: `conversation:character-run-${suffix}`,
      });
      preparedTurns.push(prepared);
      await fixture.service.submitPreparedTurn(
        prepared,
        `request-room-${suffix}`,
        `Respond as ${suffix}.`,
      );
    }

    expect(fixture.agentConversations.turns.map((turn) => turn.primaryAgentSessionId)).toEqual([
      'conversation:character-run-a',
      'conversation:character-run-b',
    ]);
    expect(
      preparedTurns.map((prepared) => prepared.context.roomView?.events[0]?.roomEventId),
    ).toEqual(['private:participant-a', 'private:participant-b']);
    expect(
      preparedTurns.map((prepared) => prepared.context.relationship?.characterProjectId),
    ).toEqual(['project:character-version-a', 'project:character-version-b']);
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
        mode: 'companion',
        companionContinuityId: 'continuity-a',
        relationshipId: 'relationship-a',
      }),
    ).rejects.toMatchObject({ code: 'character-version-unavailable' });
    expect(fixture.agentConversations.created).toEqual([]);
  });
});

function cloneOptional<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
