import { DEFAULT_CANVAS_DATA } from '@neko/canvas-domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_CANVAS_CHANNELS } from '../shared/canvas-bridge-contract';

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
      locator: { kind: 'workspace-file' as const, path: 'data/project.json' },
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

function snapshot(generationNodes: readonly unknown[]) {
  return {
    identity,
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
