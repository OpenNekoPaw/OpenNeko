import {
  decodeRoomRecords,
  parseCharacterRoom,
  parseDialogueRun,
  parseRoomRun,
  parseRoomView,
} from '../room';
import { describe, expect, it } from 'vitest';
import {
  createCharacterRoomWorkbenchSnapshotRequest,
  parseCharacterRoomWorkbenchProjectionEvent,
  parseCharacterRoomWorkbenchSnapshotResult,
} from '../character-room-workbench-host';

const now = '2026-08-09T10:00:00.000Z';

function worldBinding() {
  return {
    worldVersionId: 'world-version-a',
    worldRunId: 'world-run-a',
    worldSaveId: 'world-save-a',
    branchId: 'branch-main',
  };
}

function participants() {
  return [
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
  ];
}

function baseRoomRun() {
  return {
    topology: 'chatroom',
    roomRunId: 'room-run-a',
    characterRoomId: 'room-a',
    roomRevision: 0,
    participants: participants(),
    schedulingPolicy: { kind: 'mentioned' },
    events: [],
    createdAt: now,
  };
}

describe('Dialogue and Chatroom canonical contracts', () => {
  it('accepts all topology and runtime-kind combinations without a Play branch', () => {
    const companionDialogue = parseDialogueRun({
      topology: 'dialogue',
      dialogueRunId: 'dialogue-companion',
      userParticipantId: 'user-participant',
      characterParticipantId: 'character-participant',
      characterRunId: 'character-run-a',
      runtimeKind: 'companion',
      relationshipIds: ['relationship-a'],
      createdAt: now,
    });
    const narrativeDialogue = parseDialogueRun({
      ...companionDialogue,
      dialogueRunId: 'dialogue-narrative',
      runtimeKind: 'narrative',
      relationshipIds: undefined,
      worldBinding: worldBinding(),
    });
    const companionRoom = parseRoomRun({
      ...baseRoomRun(),
      runtimeKind: 'companion',
      relationshipIds: ['relationship-a', 'relationship-b'],
    });
    const narrativeRoom = parseRoomRun({
      ...baseRoomRun(),
      roomRunId: 'room-run-narrative',
      runtimeKind: 'narrative',
      worldBinding: worldBinding(),
    });

    expect([companionDialogue.runtimeKind, narrativeDialogue.runtimeKind]).toEqual([
      'companion',
      'narrative',
    ]);
    expect([companionRoom.topology, narrativeRoom.topology]).toEqual(['chatroom', 'chatroom']);
    expect(companionRoom).not.toHaveProperty('worldBinding');
  });

  it('requires complete narrative authority and does not downgrade to companion', () => {
    expect(() =>
      parseDialogueRun({
        topology: 'dialogue',
        dialogueRunId: 'dialogue-invalid',
        userParticipantId: 'user-participant',
        characterParticipantId: 'character-participant',
        characterRunId: 'character-run-a',
        runtimeKind: 'narrative',
        worldBinding: {
          worldVersionId: 'world-version-a',
          worldRunId: 'world-run-a',
          branchId: 'branch-main',
        },
        createdAt: now,
      }),
    ).toThrow(/WorldSave/u);
  });

  it('binds every agent participant to a distinct CharacterRun and AgentSession', () => {
    const run = parseRoomRun({
      ...baseRoomRun(),
      runtimeKind: 'companion',
      relationshipIds: ['relationship-a', 'relationship-b'],
    });
    const agents = run.participants.filter(
      (participant) => participant.controller.kind === 'agent',
    );

    expect(agents.map((participant) => participant.controller)).toEqual([
      {
        kind: 'agent',
        characterRunId: 'character-run-a',
        primaryAgentSessionId: 'agent-session-a',
      },
      {
        kind: 'agent',
        characterRunId: 'character-run-b',
        primaryAgentSessionId: 'agent-session-b',
      },
    ]);
  });

  it('enforces ordered Room events and participant-scoped views', () => {
    const publicMessage = {
      kind: 'message',
      roomEventId: 'room-event-public',
      roomRunId: 'room-run-a',
      sequence: 1,
      createdAt: now,
      visibility: { kind: 'public' },
      authorParticipantId: 'participant-human',
      content: 'Hello.',
      mentionedParticipantIds: ['participant-agent-a'],
    };
    const privateMessage = {
      kind: 'message',
      roomEventId: 'room-event-private',
      roomRunId: 'room-run-a',
      sequence: 2,
      createdAt: now,
      visibility: { kind: 'private', participantId: 'participant-agent-a' },
      authorParticipantId: 'participant-human',
      content: 'Only Lin may see this.',
      mentionedParticipantIds: ['participant-agent-a'],
    };
    const run = parseRoomRun({
      ...baseRoomRun(),
      roomRevision: 2,
      events: [publicMessage, privateMessage],
      runtimeKind: 'companion',
      relationshipIds: ['relationship-a', 'relationship-b'],
    });

    expect(
      parseRoomView({
        roomRunId: run.roomRunId,
        roomRevision: run.roomRevision,
        participantId: 'participant-agent-a',
        participants: run.participants,
        events: run.events,
      }).events,
    ).toHaveLength(2);
    expect(() =>
      parseRoomView({
        roomRunId: run.roomRunId,
        roomRevision: run.roomRevision,
        participantId: 'participant-agent-b',
        participants: run.participants,
        events: run.events,
      }),
    ).toThrow(/outside participant visibility/u);
    expect(() => parseRoomRun({ ...run, roomRevision: 1 })).toThrow(/committed event count/u);
  });

  it('parses durable CharacterRoom templates without runtime AgentSession identities', () => {
    const room = parseCharacterRoom({
      characterRoomId: 'room-a',
      title: 'Archive desk',
      defaultRuntimeKind: 'companion',
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
      ],
      schedulingPolicy: { kind: 'turn-based', participantOrder: ['participant-agent-a'] },
      createdAt: now,
      updatedAt: now,
    });

    expect(room.participantTemplates[1]).not.toHaveProperty('primaryAgentSessionId');
  });

  it('isolates one invalid RoomRun while retaining valid siblings', () => {
    const valid = {
      ...baseRoomRun(),
      runtimeKind: 'companion',
      relationshipIds: ['relationship-a', 'relationship-b'],
    };
    const result = decodeRoomRecords(
      [valid, { ...valid, roomRunId: 'room-run-invalid', topology: 'play' }],
      'room-run',
      parseRoomRun,
      'roomRunId',
    );

    expect(result.records).toHaveLength(1);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ recordId: 'room-run-invalid', code: 'invalid-room-record' }),
    ]);
  });

  it('binds Room Workbench snapshots and events to one exact RoomView', () => {
    const request = createCharacterRoomWorkbenchSnapshotRequest('request-a', 'room-run-a');
    const projection = parseRoomView({
      roomRunId: 'room-run-a',
      roomRevision: 0,
      participantId: 'participant-human',
      participants: participants(),
      events: [],
    });

    expect(
      parseCharacterRoomWorkbenchSnapshotResult(
        { requestId: request.requestId, sequence: 0, projection },
        request,
      ),
    ).toEqual({ requestId: request.requestId, sequence: 0, projection });
    expect(
      parseCharacterRoomWorkbenchProjectionEvent({
        requestId: request.requestId,
        sequence: 1,
        projection,
      }),
    ).toEqual({
      requestId: request.requestId,
      sequence: 1,
      projection,
    });
    expect(() =>
      parseCharacterRoomWorkbenchSnapshotResult(
        {
          requestId: request.requestId,
          sequence: 0,
          projection: { ...projection, roomRunId: 'room-run-b' },
        },
        request,
      ),
    ).toThrow(/RoomRun identity does not match/u);
  });
});
