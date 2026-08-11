import {
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
  type CharacterRoom,
  type CharacterRun,
  type RoomParticipant,
  type RoomRun,
} from '@neko/chara/contracts';
import { describe, expect, it } from 'vitest';
import {
  CharacterRoomConversationService,
  CharacterRoomService,
  type CharacterRoomRepository,
  type PreparedCharacterAgentTurn,
} from '../application';

const NOW = '2026-08-09T14:00:00.000Z';

describe('CharacterRoomConversationService', () => {
  it('commits the user message and scheduling before accepting the exact participant response', async () => {
    const fixture = await createFixture();

    const first = await fixture.service.submitUserMessage({
      submissionId: 'submission-1',
      roomRunId: 'room-run-a',
      userId: 'user-a',
      message: 'First question.',
    });
    const second = await fixture.service.submitUserMessage({
      submissionId: 'submission-2',
      roomRunId: 'room-run-a',
      userId: 'user-a',
      message: 'Second question.',
    });

    expect(first.outcomes).toEqual([
      expect.objectContaining({ status: 'accepted', participantId: 'participant-agent-a' }),
    ]);
    expect(second.outcomes).toEqual([
      expect.objectContaining({ status: 'accepted', participantId: 'participant-agent-b' }),
    ]);
    expect(second.run.events.map((event) => [event.kind, event.roomEventId])).toEqual([
      ['message', 'room-event:submission-1:user'],
      ['scheduling', 'room-event:submission-1:scheduling'],
      ['message', 'room-event:submission-1:response:participant-agent-a'],
      ['message', 'room-event:submission-2:user'],
      ['scheduling', 'room-event:submission-2:scheduling'],
      ['message', 'room-event:submission-2:response:participant-agent-b'],
    ]);
    expect(fixture.preparedParticipants).toEqual([
      ['participant-agent-a', 2],
      ['participant-agent-b', 5],
    ]);
  });

  it('keeps a provider failure local after the authoritative user message is committed', async () => {
    const fixture = await createFixture({ failParticipantId: 'participant-agent-a' });

    const result = await fixture.service.submitUserMessage({
      submissionId: 'submission-failed',
      roomRunId: 'room-run-a',
      userId: 'user-a',
      message: 'Keep this message.',
    });

    expect(result.outcomes).toEqual([
      expect.objectContaining({
        status: 'rejected',
        participantId: 'participant-agent-a',
        diagnostic: expect.objectContaining({ code: 'participant-turn-failed' }),
      }),
    ]);
    expect(result.run.events.map((event) => event.roomEventId)).toEqual([
      'room-event:submission-failed:user',
      'room-event:submission-failed:scheduling',
    ]);
  });

  it('rejects a provisional response when another Room event wins its observed revision', async () => {
    const fixture = await createFixture({ insertConcurrentEvent: true });

    const result = await fixture.service.submitUserMessage({
      submissionId: 'submission-stale',
      roomRunId: 'room-run-a',
      userId: 'user-a',
      message: 'Race this response.',
    });

    expect(result.outcomes).toEqual([
      expect.objectContaining({
        status: 'rejected',
        participantId: 'participant-agent-a',
        diagnostic: expect.objectContaining({ code: 'stale-participant-response' }),
      }),
    ]);
    expect(result.run.events.map((event) => event.roomEventId)).toEqual([
      'room-event:submission-stale:user',
      'room-event:submission-stale:scheduling',
      'concurrent-message',
    ]);
  });
});

async function createFixture(
  options: {
    readonly failParticipantId?: string;
    readonly insertConcurrentEvent?: boolean;
  } = {},
) {
  const repository = new MemoryRoomRepository();
  const rooms = new CharacterRoomService(repository, { now: () => NOW });
  await rooms.createRoom(room());
  await rooms.createRun(roomRun());
  const preparedParticipants: [string, number][] = [];
  const interactions = {
    async prepareTurn(input: {
      readonly topology: 'chatroom';
      readonly roomRunId: string;
      readonly primaryAgentSessionId: string;
    }): Promise<PreparedCharacterAgentTurn> {
      const run = await rooms.readRun(input.roomRunId);
      const participant = run.participants.find(
        (candidate) =>
          candidate.controller.kind === 'agent' &&
          candidate.controller.primaryAgentSessionId === input.primaryAgentSessionId,
      );
      if (!participant || participant.controller.kind !== 'agent') {
        throw new Error('missing participant');
      }
      preparedParticipants.push([participant.participantId, run.roomRevision]);
      return preparedTurn(participant, run);
    },
    async submitPreparedTurn(prepared: PreparedCharacterAgentTurn) {
      const participantId = prepared.context.roomView?.participantId;
      if (participantId === options.failParticipantId) throw new Error('provider unavailable');
      if (options.insertConcurrentEvent) {
        await rooms.commitEvent({
          roomRunId: 'room-run-a',
          expectedRoomRevision: prepared.context.roomView!.roomRevision,
          event: {
            kind: 'message',
            roomEventId: 'concurrent-message',
            visibility: { kind: 'public' },
            authorParticipantId: 'participant-human',
            content: 'Concurrent message.',
            mentionedParticipantIds: [],
          },
        });
      }
      return {
        turnId: `turn:${participantId ?? 'unknown'}`,
        content: `Response from ${participantId ?? 'unknown'}.`,
      };
    },
  };
  return {
    rooms,
    preparedParticipants,
    service: new CharacterRoomConversationService({ rooms, interactions }),
  };
}

function preparedTurn(participant: RoomParticipant, run: RoomRun): PreparedCharacterAgentTurn {
  if (participant.controller.kind !== 'agent' || participant.characterVersionId === undefined) {
    throw new Error('Prepared participant must be Agent-controlled.');
  }
  return {
    primaryAgentSessionId: participant.controller.primaryAgentSessionId,
    characterRunId: participant.controller.characterRunId,
    mode: run.mode,
    context: {
      characterVersion: {
        characterVersionId: participant.characterVersionId,
        characterProjectId: `project:${participant.characterVersionId}`,
        label: participant.displayName,
        definition: {
          summary: participant.displayName,
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
      },
      roomView: {
        roomRunId: run.roomRunId,
        roomRevision: run.roomRevision,
        participantId: participant.participantId,
        participants: run.participants,
        events: run.events,
      },
    },
  };
}

class MemoryRoomRepository implements CharacterRoomRepository {
  readonly rooms = new Map<string, CharacterRoom>();
  readonly runs = new Map<string, RoomRun>();

  async createRoom(value: CharacterRoom): Promise<void> {
    this.rooms.set(value.characterRoomId, structuredClone(value));
  }

  async readRoom(characterRoomId: string): Promise<CharacterRoom | undefined> {
    return clone(this.rooms.get(characterRoomId));
  }

  async createRun(value: RoomRun): Promise<void> {
    this.runs.set(value.roomRunId, structuredClone(value));
  }

  async createRunAggregate(input: {
    readonly run: RoomRun;
    readonly characterRuns: readonly CharacterRun[];
  }): Promise<void> {
    await this.createRun(input.run);
  }

  async readRun(roomRunId: string): Promise<RoomRun | undefined> {
    return clone(this.runs.get(roomRunId));
  }

  async mutateRun(roomRunId: string, mutation: (current: RoomRun) => RoomRun): Promise<RoomRun> {
    const current = this.runs.get(roomRunId);
    if (!current) throw new Error(`RoomRun '${roomRunId}' is unavailable.`);
    const updated = mutation(structuredClone(current));
    this.runs.set(roomRunId, structuredClone(updated));
    return structuredClone(updated);
  }
}

function room(): CharacterRoom {
  return {
    characterRoomId: 'room-a',
    title: 'Room A',
    participantTemplates: [
      {
        participantTemplateId: 'participant-human',
        displayName: 'User',
        controllerKind: 'human',
        userId: 'user-a',
      },
      {
        participantTemplateId: 'participant-agent-a',
        displayName: 'A',
        controllerKind: 'agent',
        characterVersionId: 'character-version-a',
      },
      {
        participantTemplateId: 'participant-agent-b',
        displayName: 'B',
        controllerKind: 'agent',
        characterVersionId: 'character-version-b',
      },
    ],
    schedulingPolicy: {
      kind: 'turn-based',
      participantOrder: ['participant-agent-a', 'participant-agent-b'],
    },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function roomRun(): RoomRun {
  return {
    topology: 'chatroom',
    roomRunId: 'room-run-a',
    characterRoomId: 'room-a',
    roomRevision: 0,
    participants: [
      {
        participantId: 'participant-human',
        displayName: 'User',
        controller: { kind: 'human', userId: 'user-a' },
      },
      ...(['a', 'b'] as const).map((suffix) => ({
        participantId: `participant-agent-${suffix}`,
        displayName: suffix.toUpperCase(),
        characterVersionId: `character-version-${suffix}`,
        controller: {
          kind: 'agent' as const,
          characterRunId: `character-run-${suffix}`,
          primaryAgentSessionId: `agent-session-${suffix}`,
        },
      })),
    ],
    schedulingPolicy: {
      kind: 'turn-based',
      participantOrder: ['participant-agent-a', 'participant-agent-b'],
    },
    events: [],
    mode: 'companion',
    relationshipIds: ['relationship-a', 'relationship-b'],
    createdAt: NOW,
  };
}

function clone<T>(value: T | undefined): T | undefined {
  return value === undefined ? undefined : structuredClone(value);
}
