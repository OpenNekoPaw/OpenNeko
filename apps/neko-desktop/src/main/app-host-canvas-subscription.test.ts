import {
  DEFAULT_CANVAS_DATA,
  type CanvasHostProjectionEvent,
  type CanvasHostRuntimeIdentity,
  type CanvasHostSnapshot,
} from '@neko/canvas-domain';
import { describe, expect, it, vi } from 'vitest';
import { DesktopAppHost } from './app-host';
import type { DesktopCanvasRuntime } from './desktop-canvas-runtime';
import type { DesktopSenderIdentity } from './window-registry';

const identity: CanvasHostRuntimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'canvas-view-1',
  viewInstanceId: 'canvas-view-instance-1',
  documentId: 'neko/boards/workspace.nkc',
  sessionId: 'canvas-session-1',
  rendererSessionId: 'renderer-session-1',
};

describe('Desktop AppHost Canvas subscription binding', () => {
  it('replaces a stale exact subscription before reading the rebound session snapshot', async () => {
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const subscribe = vi
      .fn<DesktopCanvasRuntime['subscribe']>()
      .mockResolvedValueOnce(firstDispose)
      .mockResolvedValueOnce(secondDispose);
    const getSnapshot = vi
      .fn<DesktopCanvasRuntime['getSnapshot']>()
      .mockResolvedValue(createSnapshot());
    const host = createHost({ subscribe, getSnapshot });
    const sender: DesktopSenderIdentity = { webContentsId: 7, frameUrl: 'openneko://desktop' };
    const publish = vi.fn<(event: CanvasHostProjectionEvent) => void>();

    await getCanvasSnapshot(host, sender, publish);
    await getCanvasSnapshot(host, sender, publish);

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe.mock.invocationCallOrder[1]).toBeLessThan(
      getSnapshot.mock.invocationCallOrder[1] ?? Number.POSITIVE_INFINITY,
    );
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).not.toHaveBeenCalled();
  });

  it('removes the replacement subscription when rebound snapshot loading fails', async () => {
    const dispose = vi.fn();
    const subscribe = vi.fn<DesktopCanvasRuntime['subscribe']>().mockResolvedValue(dispose);
    const getSnapshot = vi
      .fn<DesktopCanvasRuntime['getSnapshot']>()
      .mockRejectedValue(new Error('snapshot failed'));
    const host = createHost({ subscribe, getSnapshot });

    await expect(
      getCanvasSnapshot(host, { webContentsId: 8, frameUrl: 'openneko://desktop' }, vi.fn()),
    ).rejects.toThrow('snapshot failed');
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

function createHost(runtime: Pick<DesktopCanvasRuntime, 'getSnapshot' | 'subscribe'>): object {
  return Object.assign(Object.create(DesktopAppHost.prototype), {
    disposed: false,
    windows: { resolveSender: () => ({ windowId: identity.windowId }) },
    canvas: runtime,
    canvasSubscriptions: new Map(),
  });
}

async function getCanvasSnapshot(
  host: object,
  sender: DesktopSenderIdentity,
  publish: (event: CanvasHostProjectionEvent) => void,
): Promise<unknown> {
  return Reflect.apply(DesktopAppHost.prototype.getCanvasSnapshot, host, [
    sender,
    identity,
    publish,
  ]);
}

function createSnapshot(): CanvasHostSnapshot {
  return {
    identity,
    dirty: false,
    canvas: DEFAULT_CANVAS_DATA,
    presentation: {
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      selectedNodeIds: [],
    },
    authoringCapabilities: {
      sourceModes: ['import', 'reference'],
      generationKinds: ['prompt', 'image', 'audio', 'video'],
      generationModels: [],
    },
    generationNodes: [],
  };
}
