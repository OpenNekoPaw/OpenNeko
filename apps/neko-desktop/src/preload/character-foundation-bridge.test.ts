import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHARACTER_FOUNDATION_HOST_CHANNEL,
  CHARACTER_ROOM_WORKBENCH_CHANNELS,
  type RoomView,
} from '@neko/chara/contracts';
import { WORLD_FOUNDATION_HOST_CHANNEL } from '@neko/world/contracts';

const electron = vi.hoisted(() => ({
  bridge: undefined as typeof window.openNekoDesktop | undefined,
  invoke: vi.fn(),
  on: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, bridge: typeof window.openNekoDesktop) => {
      electron.bridge = bridge;
    },
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: vi.fn(),
  },
}));

await import('./index');

function emptySnapshot() {
  return {
    character: {
      projects: [],
      versions: [],
      relationships: [],
      characterRuns: [],
      dialogueRuns: [],
      rooms: [],
      roomRuns: [],
      storylines: [],
      storylineDrafts: [],
      storylineVersions: [],
      companionContinuities: [],
      presentationConfigurations: [],
    },
    diagnostics: [],
  };
}

describe('Desktop Character Foundation preload bridge', () => {
  beforeEach(() => {
    electron.invoke.mockReset();
  });

  it('uses the owner channel and returns the strictly parsed snapshot', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        expect(channel).toBe(CHARACTER_FOUNDATION_HOST_CHANNEL);
        expect(request).toEqual({
          requestId: expect.stringMatching(/^character-foundation-/u),
          operation: 'snapshot-get',
        });
        return { requestId: request.requestId, snapshot: emptySnapshot() };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.characterFoundation.getSnapshot()).resolves.toEqual(emptySnapshot());
  });

  it('rejects a response from a different request identity', async () => {
    electron.invoke.mockResolvedValue({
      requestId: 'foreign-request',
      snapshot: emptySnapshot(),
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.characterFoundation.getSnapshot()).rejects.toThrow(
      /request identity mismatch/u,
    );
  });

  it('returns the strictly parsed Character conversation launch catalog', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        expect(channel).toBe(CHARACTER_FOUNDATION_HOST_CHANNEL);
        expect(request).toEqual({
          requestId: expect.stringMatching(/^character-conversation-launch-catalog-/u),
          operation: 'conversation-launch-catalog-get',
        });
        return {
          requestId: request.requestId,
          catalog: {
            targets: [
              {
                characterProjectId: 'character-project-a',
                characterVersionId: 'character-version-a',
                displayName: 'A',
                versionLabel: 'Published A',
                lineage: {
                  coverage: 'complete',
                  state: 'declared-root',
                  isHead: true,
                  path: [
                    {
                      characterVersionId: 'character-version-a',
                      label: 'Published A',
                    },
                  ],
                },
                storylines: [],
              },
            ],
            diagnostics: [],
          },
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.characterFoundation.getConversationLaunchCatalog()).resolves.toMatchObject({
      targets: [{ characterVersionId: 'character-version-a' }],
    });
  });

  it('strictly binds a Character command to its response identity', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        expect(channel).toBe(CHARACTER_FOUNDATION_HOST_CHANNEL);
        expect(request).toMatchObject({
          operation: 'character-project-set-review',
          input: { characterProjectId: 'character-project-a', reviewStatus: 'ready' },
        });
        return { requestId: request.requestId, snapshot: emptySnapshot() };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(
      bridge.characterFoundation.execute({
        operation: 'character-project-set-review',
        input: { characterProjectId: 'character-project-a', reviewStatus: 'ready' },
      }),
    ).resolves.toEqual(emptySnapshot());
  });

  it('strictly binds World Foundation snapshot and commands to the owner channel', async () => {
    const snapshot = { world: { projects: [], versions: [], runtimes: [] }, diagnostics: [] };
    electron.invoke.mockImplementation(
      async (channel: string, request: { readonly requestId: string }) => {
        expect(channel).toBe(WORLD_FOUNDATION_HOST_CHANNEL);
        return { requestId: request.requestId, snapshot };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.worldFoundation.getSnapshot()).resolves.toEqual(snapshot);
    await expect(
      bridge.worldFoundation.execute({
        operation: 'world-project-set-review',
        input: { worldProjectId: 'world-project-a', reviewStatus: 'ready' },
      }),
    ).resolves.toEqual(snapshot);
    expect(electron.invoke.mock.calls[1]?.[1]).toMatchObject({
      operation: 'world-project-set-review',
      input: { worldProjectId: 'world-project-a', reviewStatus: 'ready' },
    });
  });

  it('subscribes the exact RoomRun projection without accepting foreign events', async () => {
    const initial = roomProjection('room-run-preload', 0, []);
    let currentRequestId = '';
    electron.invoke.mockImplementation(
      async (
        channel: string,
        request: { readonly requestId: string; readonly roomRunId: string },
      ) => {
        expect(channel).toBe(CHARACTER_ROOM_WORKBENCH_CHANNELS.snapshotGet);
        expect(request.roomRunId).toBe(initial.roomRunId);
        currentRequestId = request.requestId;
        return { requestId: request.requestId, sequence: 0, projection: initial };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    const listener = vi.fn();
    const unsubscribe = bridge.characterRoomWorkbench.subscribe(initial.roomRunId, listener);

    await expect(bridge.characterRoomWorkbench.getSnapshot(initial.roomRunId)).resolves.toEqual(
      initial,
    );
    const initialRequestId = currentRequestId;
    emitRoomProjection({
      requestId: currentRequestId,
      sequence: 1,
      projection: roomProjection('room-run-foreign', 1, []),
    });
    expect(listener).not.toHaveBeenCalled();

    const reloaded = roomProjection('room-run-preload', 1, []);
    electron.invoke.mockImplementationOnce(
      async (
        channel: string,
        request: { readonly requestId: string; readonly roomRunId: string },
      ) => {
        expect(channel).toBe(CHARACTER_ROOM_WORKBENCH_CHANNELS.snapshotGet);
        emitRoomProjection({
          requestId: initialRequestId,
          sequence: 1,
          projection: roomProjection('room-run-preload', 99, []),
        });
        currentRequestId = request.requestId;
        emitRoomProjection({ requestId: request.requestId, sequence: 1, projection: reloaded });
        return { requestId: request.requestId, sequence: 1, projection: reloaded };
      },
    );
    await expect(bridge.characterRoomWorkbench.getSnapshot(initial.roomRunId)).resolves.toEqual(
      reloaded,
    );
    expect(listener).toHaveBeenLastCalledWith({
      requestId: currentRequestId,
      sequence: 1,
      projection: reloaded,
    });
    expect(listener).toHaveBeenCalledTimes(1);

    const updated = roomProjection('room-run-preload', 2, [
      {
        kind: 'message',
        roomEventId: 'room-event-a',
        roomRunId: 'room-run-preload',
        sequence: 1,
        createdAt: '2026-08-09T10:00:00.000Z',
        visibility: { kind: 'public' },
        authorParticipantId: 'participant-user',
        content: 'Hello room.',
        mentionedParticipantIds: [],
      },
    ]);
    emitRoomProjection({ requestId: currentRequestId, sequence: 2, projection: updated });
    expect(listener).toHaveBeenLastCalledWith({
      requestId: currentRequestId,
      sequence: 2,
      projection: updated,
    });
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});

function emitRoomProjection(event: unknown): void {
  const registration = electron.on.mock.calls.find(
    ([channel]) => channel === CHARACTER_ROOM_WORKBENCH_CHANNELS.projectionEvent,
  );
  const handler: unknown = registration?.[1];
  if (typeof handler !== 'function') {
    throw new Error('Character Room Workbench projection listener was not registered.');
  }
  handler({}, event);
}

function roomProjection(
  roomRunId: string,
  roomRevision: number,
  events: RoomView['events'],
): RoomView {
  return {
    roomRunId,
    roomRevision,
    participantId: 'participant-user',
    participants: [
      {
        participantId: 'participant-user',
        displayName: 'User',
        controller: { kind: 'human', userId: 'user:local' },
      },
    ],
    events,
  };
}
