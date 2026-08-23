import { DEFAULT_CANVAS_DATA, type CanvasHostRuntimeIdentity } from '@neko/canvas-domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_CANVAS_CHANNELS } from '../shared/canvas-bridge-contract';

const electron = vi.hoisted(() => ({
  bridge: undefined as typeof window.openNekoDesktop | undefined,
  invoke: vi.fn(),
  listeners: new Map<string, (_event: unknown, value: unknown) => void>(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, bridge: typeof window.openNekoDesktop) => {
      electron.bridge = bridge;
    },
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: (channel: string, listener: (_event: unknown, value: unknown) => void) => {
      electron.listeners.set(channel, listener);
    },
    removeListener: vi.fn(),
  },
}));

await import('./index');

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'canvas-view-1',
  viewInstanceId: 'canvas-view-instance-1',
  documentId: 'canvas-document-1',
  sessionId: 'canvas-session-1',
  rendererSessionId: 'renderer-session-1',
} as const;

const staleProjection = {
  nodeId: 'generation-1',
  submissionId: 'submission-1',
  recipeInputFingerprint: 'sha256:recipe-1',
  phase: 'succeeded',
  recipeStale: true,
} as const;

describe('Desktop Canvas preload bridge', () => {
  beforeEach(() => {
    electron.invoke.mockReset();
  });

  it('preserves the canonical stale-Recipe projection from Main', async () => {
    electron.invoke.mockImplementation(async (channel: string, value: unknown) => {
      expect(channel).toBe(DESKTOP_CANVAS_CHANNELS.snapshotGet);
      expect(value).toEqual(identity);
      return snapshot([staleProjection]);
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.canvas.getSnapshot(identity)).resolves.toMatchObject({
      identity,
      generationNodes: [staleProjection],
    });
  });

  it('rejects a non-boolean stale-Recipe marker from Main', async () => {
    electron.invoke.mockResolvedValue(snapshot([{ ...staleProjection, recipeStale: 'true' }]));
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.canvas.getSnapshot(identity)).rejects.toThrow(
      'Canvas Generation Recipe stale marker is invalid.',
    );
  });

  it('accepts a newer full snapshot when the sequence skips and rejects stale/foreign events', async () => {
    electron.invoke.mockImplementation(async (channel: string, value: unknown) => {
      expect(channel).toBe(DESKTOP_CANVAS_CHANNELS.snapshotGet);
      expect(value).toEqual(identity);
      return snapshot([]);
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    const listener = vi.fn();
    const unsubscribe = bridge.canvas.subscribe(identity, listener);
    await bridge.canvas.getSnapshot(identity);

    const emitCanvasProjection = (
      sequence: number,
      eventIdentity: CanvasHostRuntimeIdentity = identity,
    ): void => {
      electron.listeners.get(DESKTOP_CANVAS_CHANNELS.projectionEvent)?.(
        {},
        { sequence, snapshot: snapshot([], eventIdentity) },
      );
    };

    // The Main session may have advanced its sequence before this preload registered; a newer
    // full authoritative snapshot must still update the exact Canvas owner.
    emitCanvasProjection(5);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ sequence: 5, snapshot: expect.objectContaining({ identity }) }),
    );

    // A stale or duplicate sequence is rejected without mutating the current snapshot.
    emitCanvasProjection(4);
    emitCanvasProjection(5);
    expect(listener).toHaveBeenCalledTimes(1);

    // A foreign Canvas owner is rejected before any listener runs.
    const foreignIdentity = { ...identity, sessionId: 'canvas-session-foreign' };
    emitCanvasProjection(6, foreignIdentity);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('projects strictly decoded Workspace index changes independently of Canvas sessions', () => {
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    const listener = vi.fn();
    const unsubscribe = bridge.canvas.subscribeWorkspaceIndex(listener);

    electron.listeners.get(DESKTOP_CANVAS_CHANNELS.workspaceIndexChangedEvent)?.(
      {},
      { workspaceId: 'workspace-1' },
    );
    expect(listener).toHaveBeenCalledWith({ workspaceId: 'workspace-1' });

    expect(() =>
      electron.listeners.get(DESKTOP_CANVAS_CHANNELS.workspaceIndexChangedEvent)?.(
        {},
        { workspaceId: 'workspace-1', extra: true },
      ),
    ).toThrow("unsupported field 'extra'");
    unsubscribe();
  });

  it('accepts the first projection from an exact Canvas session rebound by a new snapshot', async () => {
    const reboundIdentity = {
      ...identity,
      viewInstanceId: 'canvas-view-instance-rebound',
      sessionId: 'canvas-session-rebound',
    };
    electron.invoke.mockImplementation(async (channel: string, value: unknown) => {
      expect(channel).toBe(DESKTOP_CANVAS_CHANNELS.snapshotGet);
      expect(value).toEqual(reboundIdentity);
      return snapshot([], reboundIdentity);
    });
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    const listener = vi.fn();
    const unsubscribe = bridge.canvas.subscribe(reboundIdentity, listener);

    await bridge.canvas.getSnapshot(reboundIdentity);
    electron.listeners.get(DESKTOP_CANVAS_CHANNELS.projectionEvent)?.(
      {},
      { sequence: 8, snapshot: snapshot([], reboundIdentity) },
    );
    expect(listener).toHaveBeenCalledTimes(1);

    await bridge.canvas.getSnapshot(reboundIdentity);
    electron.listeners.get(DESKTOP_CANVAS_CHANNELS.projectionEvent)?.(
      {},
      { sequence: 1, snapshot: snapshot([], reboundIdentity) },
    );
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sequence: 1,
        snapshot: expect.objectContaining({ identity: reboundIdentity }),
      }),
    );
    unsubscribe();
  });

  it('requires an owner-bound snapshot and strictly parses text preview results', async () => {
    const textPreviewIdentity = {
      ...identity,
      viewInstanceId: 'canvas-text-preview-instance',
      sessionId: 'canvas-text-preview-session',
    };
    const request = {
      requestId: 'text-preview-1',
      identity: textPreviewIdentity,
      nodeId: 'file-1',
      locator: { file: { authority: 'workspace' as const, path: 'data/project.json' } },
    };
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await expect(bridge.canvas.readTextFilePreview(request)).rejects.toThrow(
      'current owner-bound snapshot',
    );
    expect(electron.invoke).not.toHaveBeenCalled();

    electron.invoke.mockImplementation(async (channel: string, value: unknown) => {
      if (channel === DESKTOP_CANVAS_CHANNELS.snapshotGet) {
        return { ...snapshot([]), identity: textPreviewIdentity };
      }
      expect(channel).toBe(DESKTOP_CANVAS_CHANNELS.textFilePreviewRead);
      expect(value).toEqual(request);
      return {
        requestId: request.requestId,
        nodeId: request.nodeId,
        status: 'ready',
        kind: 'json',
        text: '{\n  "ready": true\n}',
        truncated: false,
        empty: false,
      };
    });
    await bridge.canvas.getSnapshot(textPreviewIdentity);
    await expect(bridge.canvas.readTextFilePreview(request)).resolves.toMatchObject({
      status: 'ready',
      kind: 'json',
    });

    electron.invoke.mockResolvedValue({
      requestId: 'wrong-request',
      nodeId: request.nodeId,
      status: 'unsupported',
    });
    await expect(bridge.canvas.readTextFilePreview(request)).rejects.toThrow(
      'request identity does not match',
    );
  });
});

function snapshot(
  generationNodes: readonly unknown[],
  identityOverride: CanvasHostRuntimeIdentity = identity,
) {
  return {
    identity: identityOverride,
    dirty: false,
    canvas: DEFAULT_CANVAS_DATA,
    presentation: {
      viewport: {
        pan: { x: 0, y: 0 },
        zoom: 1,
      },
      selectedNodeIds: [],
    },
    authoringCapabilities: {
      sourceModes: ['import', 'reference'],
      generationKinds: ['prompt', 'image', 'audio', 'video'],
      generationModels: [],
    },
    generationNodes,
  };
}
