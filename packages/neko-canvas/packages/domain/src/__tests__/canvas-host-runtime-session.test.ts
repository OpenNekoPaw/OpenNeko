import { createEmptyCanvasData } from '@neko/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  CanvasHostRuntimeSession,
  createCanvasHostIntentRequest,
  type CanvasHostRuntimeIdentity,
} from '../index';

const identity: CanvasHostRuntimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'view-1',
  viewEpoch: 1,
  documentId: 'document-1',
  sessionId: 'session-1',
  endpointEpoch: 'endpoint-1',
};

describe('CanvasHostRuntimeSession', () => {
  it('owns revisioned replace, undo, redo and atomic save effects', async () => {
    const saveDocument = vi.fn(async () => undefined);
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: { saveDocument },
    });
    const events: number[] = [];
    runtime.subscribe((event) => events.push(event.sequence));

    const replaced = await runtime.executeIntent(
      request('replace-1', 0, {
        type: 'replace-document',
        canvas: createEmptyCanvasData('Changed'),
      }),
    );
    expect(replaced.status).toBe('accepted');
    if (replaced.status !== 'accepted') throw new Error('Expected replace to succeed.');
    expect(replaced.snapshot).toMatchObject({
      revision: 1,
      dirty: true,
      canvas: { name: 'Changed' },
    });

    const undone = await runtime.executeIntent(request('undo-1', 1, { type: 'undo' }));
    expect(undone.status).toBe('accepted');
    if (undone.status !== 'accepted') throw new Error('Expected undo to succeed.');
    expect(undone.snapshot.canvas.name).toBe('Initial');

    const redone = await runtime.executeIntent(request('redo-1', 2, { type: 'redo' }));
    expect(redone.status).toBe('accepted');
    if (redone.status !== 'accepted') throw new Error('Expected redo to succeed.');
    expect(redone.snapshot.canvas.name).toBe('Changed');

    const saved = await runtime.executeIntent(request('save-1', 3, { type: 'save' }));
    expect(saved.status).toBe('accepted');
    if (saved.status !== 'accepted') throw new Error('Expected save to succeed.');
    expect(saved.snapshot).toMatchObject({ revision: 4, dirty: false });
    expect(saveDocument).toHaveBeenCalledWith({
      canvas: expect.objectContaining({ name: 'Changed' }),
      identity,
      expectedRevision: 3,
    });
    expect(events).toEqual([1, 2, 3, 4]);
  });

  it('rejects stale identity and revision without mutating state', async () => {
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: {},
    });

    const staleIdentity = await runtime.executeIntent({
      ...request('replace-stale-identity', 0, {
        type: 'replace-document',
        canvas: createEmptyCanvasData('Wrong'),
      }),
      identity: { ...identity, sessionId: 'session-other' },
    });
    expect(staleIdentity).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'canvas-runtime-stale-identity' },
    });

    const staleRevision = await runtime.executeIntent(
      request('replace-stale-revision', 7, {
        type: 'replace-document',
        canvas: createEmptyCanvasData('Wrong'),
      }),
    );
    expect(staleRevision).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'canvas-runtime-stale-revision' },
    });
    expect(await runtime.getSnapshot()).toMatchObject({
      revision: 0,
      dirty: false,
      canvas: { name: 'Initial' },
    });
  });

  it('deduplicates command identity and does not repeat content effects', async () => {
    const projectContent = vi.fn(async ({ canvas }) => ({
      ...canvas,
      name: 'Projected once',
    }));
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: { projectContent },
    });
    const intent = request('project-command', 0, {
      type: 'project-content',
      locator: { kind: 'workspace-file', path: 'media/cat.png' },
    });

    const first = await runtime.executeIntent(intent);
    const duplicate = await runtime.executeIntent({
      ...intent,
      requestId: 'request-project-command-retry',
      expectedRevision: 1,
    });

    expect(first.status).toBe('accepted');
    expect(duplicate.status).toBe('accepted');
    expect(duplicate.requestId).toBe('request-project-command-retry');
    expect(projectContent).toHaveBeenCalledTimes(1);
    expect(await runtime.getSnapshot()).toMatchObject({
      revision: 1,
      canvas: { name: 'Projected once' },
    });
  });

  it('never replays a completed command across a stale session identity', async () => {
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: {},
    });
    const command = request('identity-fenced-command', 0, {
      type: 'replace-document',
      canvas: createEmptyCanvasData('Changed'),
    });
    expect((await runtime.executeIntent(command)).status).toBe('accepted');

    const stale = await runtime.executeIntent({
      ...command,
      requestId: 'request-stale-command-retry',
      identity: { ...identity, endpointEpoch: 'endpoint-stale' },
    });
    expect(stale).toMatchObject({
      requestId: 'request-stale-command-retry',
      status: 'rejected',
      diagnostic: { code: 'canvas-runtime-stale-identity' },
    });
  });

  it('composes source selection with content projection and reports cancellation', async () => {
    const projectContent = vi.fn(async ({ canvas }) => ({ ...canvas, name: 'Added media' }));
    const requestSource = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ kind: 'workspace-file', path: 'media/clip.mp4' });
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: { projectContent, requestSource },
    });

    const cancelled = await runtime.executeIntent(
      request('source-cancelled', 0, { type: 'request-source', sourceKind: 'video' }),
    );
    expect(cancelled).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'canvas-runtime-source-cancelled' },
    });

    const accepted = await runtime.executeIntent(
      request('source-accepted', 0, { type: 'request-source', sourceKind: 'video' }),
    );
    expect(accepted.status).toBe('accepted');
    expect(projectContent).toHaveBeenCalledWith({
      canvas: expect.objectContaining({ name: 'Initial' }),
      identity,
      locator: { kind: 'workspace-file', path: 'media/clip.mp4' },
    });
  });

  it('isolates presentation state and releases listeners on dispose', async () => {
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: {},
    });
    const listener = vi.fn();
    runtime.subscribe(listener);

    const result = await runtime.executeIntent(
      request('presentation-1', 0, {
        type: 'update-presentation',
        presentation: {
          viewport: { pan: { x: 12, y: -4 }, zoom: 1.25 },
          selectedNodeIds: ['node-1'],
        },
      }),
    );
    expect(result.status).toBe('accepted');
    expect(listener).toHaveBeenCalledTimes(1);

    runtime.dispose();
    expect(() => runtime.subscribe(listener)).toThrow('disposed');
    await expect(runtime.getSnapshot()).rejects.toThrow('disposed');
  });
});

function request(
  commandId: string,
  expectedRevision: number,
  intent: Parameters<typeof createCanvasHostIntentRequest>[0]['intent'],
) {
  return createCanvasHostIntentRequest({
    requestId: `request-${commandId}`,
    commandId,
    expectedRevision,
    identity,
    intent,
  });
}
