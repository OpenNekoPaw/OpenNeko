import type { CharacterRoom, RoomRun, RoomView } from '@neko/chara/contracts';
import { describe, expect, it } from 'vitest';
import {
  CharacterRoomService,
  type CharacterRoomRepository,
} from '../application/character-room-service';

const now = '2026-08-09T10:00:00.000Z';

function roomRun(schedulingPolicy: RoomRun['schedulingPolicy'] = { kind: 'mentioned' }): RoomRun {
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
      {
        participantId: 'participant-agent-a',
        displayName: 'Lin',
        characterVersionId: 'character-version-a',
        controller: {
          kind: 'agent',
          characterRunId: 'character-run-a',
          primaryAgentSessionId: 'agent-session-a',
        },
      },
      {
        participantId: 'participant-agent-b',
        displayName: 'Mira',
        characterVersionId: 'character-version-b',
        controller: {
          kind: 'agent',
          characterRunId: 'character-run-b',
          primaryAgentSessionId: 'agent-session-b',
        },
      },
    ],
    schedulingPolicy,
    events: [],
    runtimeKind: 'companion',
    relationshipIds: ['relationship-a', 'relationship-b'],
    createdAt: now,
  };
}

function room(
  schedulingPolicy: CharacterRoom['schedulingPolicy'] = { kind: 'mentioned' },
  defaultRuntimeKind: CharacterRoom['defaultRuntimeKind'] = 'companion',
): CharacterRoom {
  return {
    characterRoomId: 'room-a',
    title: 'Archive room',
    defaultRuntimeKind,
    participantTemplates: [
      {
        participantTemplateId: 'participant-human',
        displayName: 'User',
        controllerKind: 'human',
        userId: 'user-a',
      },
      {
        participantTemplateId: 'participant-agent-a',
        displayName: 'Lin',
        controllerKind: 'agent',
        characterVersionId: 'character-version-a',
      },
      {
        participantTemplateId: 'participant-agent-b',
        displayName: 'Mira',
        controllerKind: 'agent',
        characterVersionId: 'character-version-b',
      },
    ],
    schedulingPolicy,
    createdAt: now,
    updatedAt: now,
  };
}

class MemoryRoomRepository implements CharacterRoomRepository {
  readonly rooms = new Map<string, CharacterRoom>();
  readonly runs = new Map<string, RoomRun>();

  async createRoom(room: CharacterRoom): Promise<void> {
    if (this.rooms.has(room.characterRoomId)) throw new Error('duplicate room');
    this.rooms.set(room.characterRoomId, structuredClone(room));
  }

  async readRoom(characterRoomId: string): Promise<CharacterRoom | undefined> {
    const room = this.rooms.get(characterRoomId);
    return room === undefined ? undefined : structuredClone(room);
  }

  async createRun(run: RoomRun): Promise<void> {
    if (this.runs.has(run.roomRunId)) throw new Error(`RoomRun '${run.roomRunId}' already exists.`);
    this.runs.set(run.roomRunId, structuredClone(run));
  }

  async createRunAggregate(
    input: Parameters<CharacterRoomRepository['createRunAggregate']>[0],
  ): Promise<void> {
    await this.createRun(input.run);
  }

  async readRun(roomRunId: string): Promise<RoomRun | undefined> {
    const run = this.runs.get(roomRunId);
    return run === undefined ? undefined : structuredClone(run);
  }

  async mutateRun(roomRunId: string, mutation: (current: RoomRun) => RoomRun): Promise<RoomRun> {
    const current = this.runs.get(roomRunId);
    if (!current) throw new Error(`RoomRun '${roomRunId}' does not exist.`);
    const updated = mutation(structuredClone(current));
    this.runs.set(roomRunId, structuredClone(updated));
    return structuredClone(updated);
  }
}

describe('CharacterRoomService', () => {
  it('serializes commits and rejects a response prepared from a stale RoomView', async () => {
    const repository = new MemoryRoomRepository();
    const service = new CharacterRoomService(repository, { now: () => now });
    await service.createRoom(room());
    await service.createRun(roomRun());
    await service.commitEvent({
      roomRunId: 'room-run-a',
      expectedRoomRevision: 0,
      event: {
        kind: 'message',
        roomEventId: 'message-a',
        visibility: { kind: 'public' },
        authorParticipantId: 'participant-agent-a',
        content: 'First response.',
        mentionedParticipantIds: [],
      },
    });

    await expect(
      service.commitEvent({
        roomRunId: 'room-run-a',
        expectedRoomRevision: 0,
        event: {
          kind: 'message',
          roomEventId: 'message-b',
          visibility: { kind: 'public' },
          authorParticipantId: 'participant-agent-b',
          content: 'Stale response.',
          mentionedParticipantIds: [],
        },
      }),
    ).rejects.toMatchObject({ code: 'stale-room-revision', roomRunId: 'room-run-a' });
    expect(repository.runs.get('room-run-a')?.events.map((event) => event.roomEventId)).toEqual([
      'message-a',
    ]);
  });

  it('filters private events before materializing each participant RoomView', async () => {
    const repository = new MemoryRoomRepository();
    const service = new CharacterRoomService(repository, { now: () => now });
    await service.createRoom(room());
    await service.createRun(roomRun());
    await service.commitEvent({
      roomRunId: 'room-run-a',
      expectedRoomRevision: 0,
      event: {
        kind: 'message',
        roomEventId: 'private-a',
        visibility: { kind: 'private', participantId: 'participant-agent-a' },
        authorParticipantId: 'participant-human',
        content: 'Private context.',
        mentionedParticipantIds: ['participant-agent-a'],
      },
    });

    const participantA = await service.materializeView({
      roomRunId: 'room-run-a',
      participantId: 'participant-agent-a',
    });
    const participantB = await service.materializeView({
      roomRunId: 'room-run-a',
      participantId: 'participant-agent-b',
    });
    expect(participantA.events.map((event) => event.roomEventId)).toEqual(['private-a']);
    expect(participantB.events).toEqual([]);
  });

  it('publishes one user-filtered projection after each committed RoomRun change', async () => {
    const repository = new MemoryRoomRepository();
    const service = new CharacterRoomService(repository, { now: () => now });
    await service.createRoom(room());
    await service.createRun(roomRun());
    const projections: RoomView[] = [];
    const dispose = service.subscribeUserView('room-run-a', 'user-a', (view) => {
      projections.push(view);
    });

    await service.commitEvent({
      roomRunId: 'room-run-a',
      expectedRoomRevision: 0,
      event: {
        kind: 'message',
        roomEventId: 'private-agent-a',
        visibility: { kind: 'private', participantId: 'participant-agent-a' },
        authorParticipantId: 'participant-agent-a',
        content: 'Agent-only provisional context.',
        mentionedParticipantIds: [],
      },
    });
    await service.commitEvent({
      roomRunId: 'room-run-a',
      expectedRoomRevision: 1,
      event: {
        kind: 'message',
        roomEventId: 'public-agent-a',
        visibility: { kind: 'public' },
        authorParticipantId: 'participant-agent-a',
        content: 'Accepted public response.',
        mentionedParticipantIds: [],
      },
    });
    dispose();

    expect(projections.map((projection) => projection.roomRevision)).toEqual([1, 2]);
    expect(
      projections.map((projection) => projection.events.map((event) => event.roomEventId)),
    ).toEqual([[], ['public-agent-a']]);
    expect(
      await service.materializeUserView({ roomRunId: 'room-run-a', userId: 'user-a' }),
    ).toEqual(projections[1]);
  });

  it('returns only bounded eligible agent participants without starting execution', async () => {
    const repository = new MemoryRoomRepository();
    const service = new CharacterRoomService(repository, { now: () => now });
    await service.createRoom(
      room({
        kind: 'bounded-autonomous',
        maxResponsesPerCycle: 1,
        eligibleParticipantIds: ['participant-agent-a', 'participant-agent-b'],
      }),
    );
    await service.createRun(
      roomRun({
        kind: 'bounded-autonomous',
        maxResponsesPerCycle: 1,
        eligibleParticipantIds: ['participant-agent-a', 'participant-agent-b'],
      }),
    );

    expect(await service.selectEligibleParticipants('room-run-a')).toEqual(['participant-agent-a']);
    expect(repository.runs.get('room-run-a')?.events).toEqual([]);
  });

  it('keeps Room utterances non-authoritative for World state', async () => {
    const repository = new MemoryRoomRepository();
    const service = new CharacterRoomService(repository, { now: () => now });
    await service.createRoom(room());
    await service.createRun(roomRun());
    const updated = await service.commitEvent({
      roomRunId: 'room-run-a',
      expectedRoomRevision: 0,
      event: {
        kind: 'message',
        roomEventId: 'claim-door-open',
        visibility: { kind: 'public' },
        authorParticipantId: 'participant-agent-a',
        content: 'The tower door is open.',
        mentionedParticipantIds: [],
      },
    });

    expect(updated.events).toEqual([
      expect.objectContaining({ kind: 'message', roomEventId: 'claim-door-open' }),
    ]);
    expect(updated.events).not.toEqual([
      expect.objectContaining({ kind: 'world-event-reference' }),
    ]);
  });

  it('validates narrative World authority before persisting a RoomRun', async () => {
    const repository = new MemoryRoomRepository();
    const service = new CharacterRoomService(repository, {
      now: () => now,
      worldBindings: {
        validateBinding: async () => {
          throw new Error('Exact WorldSave branch is unavailable.');
        },
      },
    });
    const companion = roomRun();
    const narrative: RoomRun = {
      topology: 'chatroom',
      roomRunId: 'room-run-narrative',
      characterRoomId: companion.characterRoomId,
      roomRevision: companion.roomRevision,
      participants: companion.participants,
      schedulingPolicy: companion.schedulingPolicy,
      events: companion.events,
      runtimeKind: 'narrative',
      worldBinding: {
        worldVersionId: 'world-version-a',
        worldRunId: 'world-run-a',
        worldSaveId: 'world-save-a',
        branchId: 'branch-main',
      },
      createdAt: companion.createdAt,
    };
    await service.createRoom(room({ kind: 'mentioned' }, 'narrative'));

    await expect(service.createRun(narrative)).rejects.toMatchObject({
      code: 'narrative-world-unavailable',
      roomRunId: 'room-run-narrative',
    });
    expect(repository.runs.size).toBe(0);
  });
});
