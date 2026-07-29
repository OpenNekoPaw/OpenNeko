// @vitest-environment jsdom
import {
  createCanvasHostIntentRequest,
  type CanvasHostIntent,
  type CanvasHostRuntime,
} from '@neko-canvas/domain';
import { DEFAULT_CANVAS_DATA } from '@neko/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const vscodeApi = vi.hoisted(() => ({
  postMessage: vi.fn(),
  getState: vi.fn(),
  setState: vi.fn(),
}));

vi.mock('@neko/shared/vscode', () => ({
  getVSCodeAPI: () => vscodeApi,
}));

import { createVscodeCanvasHostRuntime } from './vscode-canvas-host-runtime';

describe('createVscodeCanvasHostRuntime', () => {
  beforeEach(() => {
    vscodeApi.postMessage.mockClear();
  });

  it('loads snapshot-first and preserves authoring, preview, save and stale-revision effects', async () => {
    const runtime = createVscodeCanvasHostRuntime();
    const snapshotPromise = runtime.getSnapshot();
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({ type: 'ready' });

    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'update', data: DEFAULT_CANVAS_DATA },
      }),
    );
    const initial = await snapshotPromise;
    expect(initial.revision).toBe(0);

    const projected = await execute(runtime, initial.revision, {
      type: 'project-content',
      locator: { kind: 'workspace-file', path: 'media/cat.png' },
      position: { x: 120, y: 80 },
    });
    expect(projected.status).toBe('accepted');
    if (projected.status !== 'accepted') throw new Error('Expected accepted projection.');
    expect(projected.snapshot).toMatchObject({
      revision: 1,
      dirty: true,
      canvas: {
        nodes: [
          expect.objectContaining({
            type: 'media',
            data: expect.objectContaining({
              contentLocator: { kind: 'workspace-file', path: 'media/cat.png' },
            }),
          }),
        ],
      },
    });
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      type: 'canvasStatus',
      data: projected.snapshot.canvas,
    });

    const preview = await execute(runtime, projected.snapshot.revision, {
      type: 'preview-resource',
      locator: { kind: 'workspace-file', path: 'media/cat.png' },
    });
    expect(preview.status).toBe('accepted');
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({
      type: 'openDocument',
      docPath: 'media/cat.png',
    });

    const stale = await execute(runtime, initial.revision, { type: 'save' });
    expect(stale).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'canvas-runtime-stale-revision' },
    });

    const saved = await execute(runtime, projected.snapshot.revision, { type: 'save' });
    expect(saved).toMatchObject({
      status: 'accepted',
      snapshot: { revision: 2, dirty: false },
    });
    expect(vscodeApi.postMessage).toHaveBeenCalledWith({ type: 'requestSave' });

    runtime.dispose?.();
    await expect(runtime.getSnapshot()).rejects.toThrow('disposed');
  });
});

function execute(runtime: CanvasHostRuntime, expectedRevision: number, intent: CanvasHostIntent) {
  return runtime.executeIntent(
    createCanvasHostIntentRequest({
      requestId: `request:${expectedRevision}:${intent.type}`,
      commandId: `command:${expectedRevision}:${intent.type}`,
      expectedRevision,
      identity: runtime.identity,
      intent,
    }),
  );
}
