import {
  createEmptyCanvasData,
  type CanvasMaterialActionDescriptor,
  type MediaCanvasNode,
} from '@neko/shared';
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
    const authorMaterial = vi.fn(async ({ canvas }) => ({
      ...canvas,
      name: 'Projected once',
    }));
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: { authorMaterial },
    });
    const intent = request('project-command', 0, {
      type: 'author-material',
      request: directReference('media/cat.png', 'image'),
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
    expect(authorMaterial).toHaveBeenCalledTimes(1);
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
    const authorMaterial = vi.fn(async ({ canvas }) => ({ ...canvas, name: 'Added media' }));
    const requestSource = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(directReference('media/clip.mp4', 'video'));
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: { authorMaterial, requestSource },
    });

    const cancelled = await runtime.executeIntent(
      request('source-cancelled', 0, {
        type: 'request-source',
        sourceKind: 'video',
        sourceMode: 'import',
      }),
    );
    expect(cancelled).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'canvas-runtime-source-cancelled' },
    });

    const accepted = await runtime.executeIntent(
      request('source-accepted', 0, {
        type: 'request-source',
        sourceKind: 'video',
        sourceMode: 'reference',
      }),
    );
    expect(accepted.status).toBe('accepted');
    expect(authorMaterial).toHaveBeenCalledWith({
      canvas: expect.objectContaining({ name: 'Initial' }),
      identity,
      request: directReference('media/clip.mp4', 'video'),
    });
    expect(requestSource).toHaveBeenNthCalledWith(1, {
      identity,
      sourceKind: 'video',
      sourceMode: 'import',
    });
    expect(requestSource).toHaveBeenNthCalledWith(2, {
      identity,
      sourceKind: 'video',
      sourceMode: 'reference',
    });
  });

  it('preserves the model source kind for the shared 3D Director action', async () => {
    const requestSource = vi.fn(async () => directReference('models/character.glb', 'model'));
    const authorMaterial = vi.fn(async ({ canvas }) => canvas);
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: { authorMaterial, requestSource },
    });

    const result = await runtime.executeIntent(
      request('source-model', 0, {
        type: 'request-source',
        sourceKind: 'model',
        sourceMode: 'reference',
      }),
    );

    expect(result.status).toBe('accepted');
    expect(requestSource).toHaveBeenCalledWith({
      identity,
      sourceKind: 'model',
      sourceMode: 'reference',
    });
    expect(authorMaterial).toHaveBeenCalledWith({
      canvas: expect.objectContaining({ name: 'Initial' }),
      identity,
      request: directReference('models/character.glb', 'model'),
    });
  });

  it('projects an empty material request as a Generation-owned Job without a source-less node', async () => {
    const requestGenerationDraft = vi.fn(async () => ({
      ref: { kind: 'generation' as const, jobId: 'generation-1' },
      phase: 'pending' as const,
      revision: 1,
      title: 'Generate image',
      inputNodeIds: [],
      mediaKind: 'image' as const,
      summary: { prompt: 'Describe the image to generate' },
    }));
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: { requestGenerationDraft },
    });

    const result = await runtime.executeIntent(
      request('generation-draft', 0, {
        type: 'request-generation-draft',
        mediaKind: 'image',
        position: { x: 240, y: 180 },
        inputNodeIds: [],
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error(result.diagnostic.message);
    expect(requestGenerationDraft).toHaveBeenCalledWith({
      identity,
      mediaKind: 'image',
      position: { x: 240, y: 180 },
      inputNodeIds: [],
    });
    expect(result.snapshot.canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'job',
        position: { x: 240, y: 180 },
        data: expect.objectContaining({
          jobRef: { kind: 'generation', jobId: 'generation-1' },
          status: 'queued',
          outputRefs: [],
        }),
      }),
    ]);
  });

  it('projects only executable add-surface capabilities into the runtime snapshot', async () => {
    const unavailable = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Unavailable'),
      effects: {},
    });
    const available = new CanvasHostRuntimeSession({
      identity: { ...identity, sessionId: 'session-capabilities' },
      initialCanvas: createEmptyCanvasData('Available'),
      effects: {
        requestSource: async () => undefined,
        requestGenerationDraft: async () => undefined,
      },
    });

    expect((await unavailable.getSnapshot()).authoringCapabilities).toEqual({
      sourceModes: [],
      generationMediaKinds: [],
    });
    expect((await available.getSnapshot()).authoringCapabilities).toEqual({
      sourceModes: ['import', 'reference'],
      generationMediaKinds: ['image', 'video', 'audio', 'model', 'document'],
    });
  });

  it('routes an exact owner action descriptor with canonical selection targets', async () => {
    const node = referencedImageNode();
    const descriptor: CanvasMaterialActionDescriptor = {
      id: 'preview:open',
      ownerId: 'preview',
      label: 'Preview',
      mediaKinds: ['image'],
      origins: ['referenced', 'generated'],
      selection: { minimum: 1, maximum: 1 },
      effect: 'read',
    };
    const executeMaterialAction = vi.fn(async () => ({}));
    const resolveMaterialActions = vi.fn(async () => [descriptor]);
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: {
        ...createEmptyCanvasData('Initial'),
        nodes: [node],
      },
      effects: { resolveMaterialActions, executeMaterialAction },
    });

    const result = await runtime.executeIntent(
      request('preview-image', 0, {
        type: 'execute-material-action',
        action: {
          identity: {
            projectId: identity.projectId,
            canvasId: identity.documentId,
            canvasSessionId: identity.sessionId,
          },
          actionId: descriptor.id,
          expectedCanvasRevision: 0,
          selectedNodeIds: [node.id],
          payload: {},
        },
      }),
    );

    expect(result.status).toBe('accepted');
    expect(resolveMaterialActions).toHaveBeenCalledWith({
      canvas: expect.objectContaining({ nodes: [node] }),
      identity,
      revision: 0,
      targets: [
        {
          nodeId: node.id,
          mediaKind: 'image',
          origin: 'referenced',
          locator: { kind: 'workspace-file', path: 'media/cat.png' },
        },
      ],
    });
    expect(executeMaterialAction).toHaveBeenCalledWith({
      canvas: expect.objectContaining({ nodes: [node] }),
      identity,
      descriptor,
      action: expect.objectContaining({
        actionId: descriptor.id,
        selectedNodeIds: [node.id],
      }),
      targets: [
        {
          nodeId: node.id,
          mediaKind: 'image',
          origin: 'referenced',
          locator: { kind: 'workspace-file', path: 'media/cat.png' },
        },
      ],
    });
  });

  it('rejects stale embedded action identity and unavailable descriptors before effects', async () => {
    const node = referencedImageNode();
    const executeMaterialAction = vi.fn(async () => ({}));
    const resolveMaterialActions = vi.fn(async () => []);
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: {
        ...createEmptyCanvasData('Initial'),
        nodes: [node],
      },
      effects: { resolveMaterialActions, executeMaterialAction },
    });
    const action = {
      identity: {
        projectId: identity.projectId,
        canvasId: identity.documentId,
        canvasSessionId: identity.sessionId,
      },
      actionId: 'preview:open',
      expectedCanvasRevision: 0,
      selectedNodeIds: [node.id],
      payload: {},
    } as const;

    await expect(
      runtime.executeIntent(
        request('stale-action-identity', 0, {
          type: 'execute-material-action',
          action: {
            ...action,
            identity: { ...action.identity, canvasSessionId: 'session-stale' },
          },
        }),
      ),
    ).resolves.toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'canvas-runtime-stale-identity' },
    });
    await expect(
      runtime.executeIntent(
        request('unavailable-action', 0, {
          type: 'execute-material-action',
          action,
        }),
      ),
    ).resolves.toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'canvas-runtime-unsupported-intent' },
    });
    expect(executeMaterialAction).not.toHaveBeenCalled();
    expect(resolveMaterialActions).toHaveBeenCalledTimes(1);
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
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ originCommandId: 'presentation-1' }),
    );

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

function directReference(
  path: string,
  mediaKind: 'image' | 'video' | 'audio' | 'document' | 'model' | 'other',
) {
  return {
    kind: 'direct-reference' as const,
    identity: {
      projectId: identity.projectId,
      canvasId: identity.documentId,
      canvasSessionId: identity.sessionId,
    },
    locator: { kind: 'workspace-file' as const, path },
    mediaKind,
  };
}

function referencedImageNode(): MediaCanvasNode {
  return {
    id: 'media-image',
    type: 'media',
    position: { x: 20, y: 30 },
    size: { width: 320, height: 180 },
    zIndex: 1,
    data: {
      assetPath: 'media/cat.png',
      mediaType: 'image',
      contentLocator: { kind: 'workspace-file', path: 'media/cat.png' },
    },
  };
}
