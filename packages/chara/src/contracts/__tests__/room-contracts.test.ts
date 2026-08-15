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
  it('keeps Room cover as an opaque identity reference', () => {
    expect(
      parseCharacterRoom({
        characterRoomId: 'room-a',
        title: 'Archive room',
        coverResourceRef: 'asset:room-cover-a',
        participantTemplates: [],
        schedulingPolicy: { kind: 'mentioned' },
        createdAt: now,
        updatedAt: now,
      }).coverResourceRef,
    ).toBe('asset:room-cover-a');
    expect(() =>
      parseCharacterRoom({
        characterRoomId: 'room-a',
        title: 'Archive room',
        coverResourceRef: 'file:///private/room.png',
        participantTemplates: [],
        schedulingPolicy: { kind: 'mentioned' },
        createdAt: now,
        updatedAt: now,
      }),
    ).toThrow(/opaque non-file reference/u);
  });

  it('accepts canonical Companion and Narrative modes and rejects external authority fields', () => {
    const companionDialogue = parseDialogueRun({
      topology: 'dialogue',
      dialogueRunId: 'dialogue-companion',
      userParticipantId: 'user-participant',
      characterParticipantId: 'character-participant',
      characterRunId: 'character-run-a',
      mode: 'companion',
      relationshipIds: ['relationship-a'],
      createdAt: now,
    });
    const companionRoom = parseRoomRun({
      ...baseRoomRun(),
      mode: 'companion',
      relationshipIds: ['relationship-a', 'relationship-b'],
    });
    expect(companionDialogue.mode).toBe('companion');
    expect(companionRoom.topology).toBe('chatroom');
    expect(companionRoom).not.toHaveProperty('worldBinding');
    expect(() =>
      parseDialogueRun({
        ...companionDialogue,
        mode: 'narrative',
        relationshipIds: undefined,
        worldBinding: { externalCompositionRef: 'composition:run-a' },
      }),
    ).toThrow(/unsupported fields.*worldBinding/u);
  });

  it('binds every agent participant to a distinct CharacterRun and AgentSession', () => {
    const run = parseRoomRun({
      ...baseRoomRun(),
      mode: 'companion',
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
      mode: 'companion',
      relationshipIds: ['relationship-a', 'relationship-b'],
    });

    expect(() =>
      parseRoomRun({
        ...baseRoomRun(),
        roomRevision: 1,
        events: [
          {
            ...publicMessage,
            storylineTransition: {
              characterStorylineVersionId: 'storyline-version-next',
              storylineNodeId: 'next-node',
            },
          },
        ],
        mode: 'narrative',
      }),
    ).toThrow(/unsupported fields.*storylineTransition/u);

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
      mode: 'companion',
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
