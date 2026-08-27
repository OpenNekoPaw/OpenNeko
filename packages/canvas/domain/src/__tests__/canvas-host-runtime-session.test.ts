import {
  createCanvasGenerationNode,
  createEmptyCanvasData,
  updateCanvasGenerationNodeRecipe,
  type CanvasMaterialActionDescriptor,
  type MediaCanvasNode,
} from '@neko/canvas-domain';
import { resolveGenerationModelParameterProfile } from '@neko/generation-domain';
import { describe, expect, it, vi } from 'vitest';
import {
  CanvasHostVisibleEffectError,
  CanvasHostRuntimeSession,
  createCanvasHostPresentationSnapshotStore,
  createCanvasHostIntentRequest,
  type CanvasHostRuntimeSessionEffects,
  type CanvasHostRuntimeIdentity,
} from '../index';

const identity: CanvasHostRuntimeIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'view-1',
  viewInstanceId: 'view-instance-1',
  documentId: 'document-1',
  sessionId: 'session-1',
  rendererSessionId: 'endpoint-1',
};

describe('CanvasHostRuntimeSession', () => {
  it('owns serialized replace, undo, redo and atomic save effects', async () => {
    const saveDocument = vi.fn(async () => undefined);
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: { saveDocument },
    });
    const events: number[] = [];
    runtime.subscribe((event) => events.push(event.sequence));

    const replaced = await runtime.executeIntent(
      request('replace-1', {
        type: 'replace-document',
        canvas: createEmptyCanvasData('Changed'),
        removedNodeIds: ['removed-node-1'],
      }),
    );
    expect(replaced.status).toBe('accepted');
    if (replaced.status !== 'accepted') throw new Error('Expected replace to succeed.');
    expect(replaced.snapshot).toMatchObject({
      dirty: true,
      canvas: { name: 'Changed' },
    });

    const undone = await runtime.executeIntent(request('undo-1', { type: 'undo' }));
    expect(undone.status).toBe('accepted');
    if (undone.status !== 'accepted') throw new Error('Expected undo to succeed.');
    expect(undone.snapshot.canvas.name).toBe('Initial');

    const redone = await runtime.executeIntent(request('redo-1', { type: 'redo' }));
    expect(redone.status).toBe('accepted');
    if (redone.status !== 'accepted') throw new Error('Expected redo to succeed.');
    expect(redone.snapshot.canvas.name).toBe('Changed');

    const saved = await runtime.executeIntent(request('save-1', { type: 'save' }));
    expect(saved.status).toBe('accepted');
    if (saved.status !== 'accepted') throw new Error('Expected save to succeed.');
    expect(saved.snapshot).toMatchObject({ dirty: false });
    expect(saveDocument).toHaveBeenCalledWith({
      canvas: expect.objectContaining({ name: 'Changed' }),
      identity,
      removedNodeIds: ['removed-node-1'],
    });
    expect(events).toEqual([1, 2, 3, 4]);
  });

  it('coalesces continuous document replacements into one trailing autosave', async () => {
    vi.useFakeTimers();
    try {
      const saveDocument = vi.fn(async () => undefined);
      const runtime = new CanvasHostRuntimeSession({
        identity,
        initialCanvas: createEmptyCanvasData('Initial'),
        effects: { saveDocument },
      });

      await runtime.executeIntent(
        request('autosave-first', {
          type: 'replace-document',
          canvas: createEmptyCanvasData('First'),
          removedNodeIds: ['removed-1'],
        }),
      );
      await vi.advanceTimersByTimeAsync(400);
      await runtime.executeIntent(
        request('autosave-latest', {
          type: 'replace-document',
          canvas: createEmptyCanvasData('Latest'),
          removedNodeIds: ['removed-1', 'removed-2'],
        }),
      );

      await vi.advanceTimersByTimeAsync(799);
      expect(saveDocument).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(await runtime.getSnapshot()).toMatchObject({
        dirty: false,
        canvas: { name: 'Latest' },
      });
      expect(saveDocument).toHaveBeenCalledTimes(1);
      expect(saveDocument).toHaveBeenCalledWith({
        canvas: expect.objectContaining({ name: 'Latest' }),
        identity,
        removedNodeIds: ['removed-1', 'removed-2'],
      });
      runtime.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes immediately on explicit save and does not rewrite a clean Canvas', async () => {
    vi.useFakeTimers();
    try {
      const saveDocument = vi.fn(async () => undefined);
      const runtime = new CanvasHostRuntimeSession({
        identity,
        initialCanvas: createEmptyCanvasData('Initial'),
        effects: { saveDocument },
      });
      await runtime.executeIntent(
        request('manual-flush-edit', {
          type: 'replace-document',
          canvas: createEmptyCanvasData('Changed'),
          removedNodeIds: [],
        }),
      );

      expect((await runtime.executeIntent(request('manual-flush', { type: 'save' }))).status).toBe(
        'accepted',
      );
      expect(saveDocument).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(800);
      await runtime.getSnapshot();
      expect(saveDocument).toHaveBeenCalledTimes(1);

      expect((await runtime.executeIntent(request('clean-flush', { type: 'save' }))).status).toBe(
        'accepted',
      );
      expect(saveDocument).toHaveBeenCalledTimes(1);
      runtime.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps dirty state and removal evidence after autosave failure for an explicit retry', async () => {
    vi.useFakeTimers();
    try {
      const saveDocument = vi
        .fn<NonNullable<CanvasHostRuntimeSessionEffects['saveDocument']>>()
        .mockRejectedValueOnce(new CanvasHostVisibleEffectError('Canvas file is read-only.'))
        .mockResolvedValue(undefined);
      const runtime = new CanvasHostRuntimeSession({
        identity,
        initialCanvas: createEmptyCanvasData('Initial'),
        effects: { saveDocument },
      });
      const events: import('../index').CanvasHostProjectionEvent[] = [];
      runtime.subscribe((event) => events.push(event));
      await runtime.executeIntent(
        request('failed-autosave-edit', {
          type: 'replace-document',
          canvas: createEmptyCanvasData('Changed'),
          removedNodeIds: ['removed-1'],
        }),
      );

      await vi.advanceTimersByTimeAsync(800);
      expect(await runtime.getSnapshot()).toMatchObject({ dirty: true });
      expect(events).toContainEqual(
        expect.objectContaining({
          diagnostic: {
            code: 'canvas-autosave-failed',
            message: 'Canvas file is read-only.',
          },
        }),
      );

      const retry = await runtime.executeIntent(request('failed-autosave-retry', { type: 'save' }));
      expect(retry).toMatchObject({ status: 'accepted', snapshot: { dirty: false } });
      expect(saveDocument).toHaveBeenLastCalledWith({
        canvas: expect.objectContaining({ name: 'Changed' }),
        identity,
        removedNodeIds: ['removed-1'],
      });
      runtime.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not autosave presentation-only changes and cancels a pending save on dispose', async () => {
    vi.useFakeTimers();
    try {
      const saveDocument = vi.fn(async () => undefined);
      const presentationOnly = new CanvasHostRuntimeSession({
        identity,
        initialCanvas: createEmptyCanvasData('Initial'),
        effects: { saveDocument },
      });
      await presentationOnly.executeIntent(
        request('autosave-presentation-only', {
          type: 'update-presentation',
          presentation: {
            viewport: { pan: { x: 20, y: 30 }, zoom: 1.2 },
            selectedNodeIds: [],
          },
        }),
      );
      await vi.advanceTimersByTimeAsync(800);
      expect(saveDocument).not.toHaveBeenCalled();
      presentationOnly.dispose();

      const disposedDirty = new CanvasHostRuntimeSession({
        identity,
        initialCanvas: createEmptyCanvasData('Initial'),
        effects: { saveDocument },
      });
      await disposedDirty.executeIntent(
        request('autosave-disposed-edit', {
          type: 'replace-document',
          canvas: createEmptyCanvasData('Changed'),
          removedNodeIds: [],
        }),
      );
      disposedDirty.dispose();
      await vi.advanceTimersByTimeAsync(800);
      expect(saveDocument).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects another session identity without mutating state', async () => {
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: {},
    });

    const staleIdentity = await runtime.executeIntent({
      ...request('replace-stale-identity', {
        type: 'replace-document',
        canvas: createEmptyCanvasData('Wrong'),
        removedNodeIds: [],
      }),
      identity: { ...identity, sessionId: 'session-other' },
    });
    expect(staleIdentity).toMatchObject({
      status: 'rejected',
      diagnostic: { code: 'canvas-runtime-stale-identity' },
    });

    expect(await runtime.getSnapshot()).toMatchObject({
      dirty: false,
      canvas: { name: 'Initial' },
    });
  });

  it('authorizes embedded preview only for the exact node, output and locator', () => {
    const firstLocator = {
      file: { authority: 'workspace' as const, path: 'neko/generated/output-1.png' },
    };
    const secondLocator = {
      file: { authority: 'workspace' as const, path: 'neko/generated/output-2.png' },
    };
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: {
        ...createEmptyCanvasData('Embedded preview'),
        nodes: [
          {
            id: 'generation-1',
            type: 'generation',
            position: { x: 0, y: 0 },
            size: { width: 240, height: 180 },
            zIndex: 1,
            data: {
              recipe: { kind: 'image', prompt: 'Character', count: 2 },
              outputs: [
                {
                  outputId: 'output-1',
                  jobRef: { kind: 'generation', jobId: 'job-1' },
                  locator: firstLocator,
                  kind: 'image',
                  recipeInputFingerprint: 'recipe-1',
                },
                {
                  outputId: 'output-2',
                  jobRef: { kind: 'generation', jobId: 'job-1' },
                  locator: secondLocator,
                  kind: 'image',
                  recipeInputFingerprint: 'recipe-1',
                },
              ],
              selectedOutputId: 'output-1',
            },
          },
        ],
      },
      effects: {},
    });

    expect(() =>
      runtime.authorizePreviewSource({
        nodeId: 'generation-1',
        outputId: 'output-1',
        locator: firstLocator,
        contentKind: 'image',
      }),
    ).not.toThrow();
    expect(() =>
      runtime.authorizePreviewSource({
        nodeId: 'generation-1',
        outputId: 'output-1',
        locator: {
          ...firstLocator,
          file: { ...firstLocator.file, path: 'neko/generated/other.png' },
        },
        contentKind: 'image',
      }),
    ).toThrow('output "output-1" is stale');
    expect(() =>
      runtime.authorizePreviewSource({
        nodeId: 'generation-1',
        outputId: 'output-2',
        locator: secondLocator,
        contentKind: 'image',
      }),
    ).not.toThrow();
  });

  it('authorizes a generated Prompt output through the text preview kind', () => {
    const locator = {
      file: { authority: 'workspace' as const, path: 'neko/generated/notes.md' },
    };
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: {
        ...createEmptyCanvasData('Generated text preview'),
        nodes: [
          {
            id: 'generation-prompt',
            type: 'generation',
            position: { x: 0, y: 0 },
            size: { width: 240, height: 180 },
            zIndex: 1,
            data: {
              recipe: { kind: 'prompt', prompt: 'Write notes' },
              outputs: [
                {
                  outputId: 'prompt-output',
                  jobRef: { kind: 'generation', jobId: 'prompt-job' },
                  locator,
                  kind: 'prompt',
                  recipeInputFingerprint: 'recipe-1',
                },
              ],
              selectedOutputId: 'prompt-output',
            },
          },
        ],
      },
      effects: {},
    });

    expect(() =>
      runtime.authorizePreviewSource({
        nodeId: 'generation-prompt',
        outputId: 'prompt-output',
        locator,
        contentKind: 'text',
      }),
    ).not.toThrow();
    expect(() =>
      runtime.authorizePreviewSource({
        nodeId: 'generation-prompt',
        outputId: 'prompt-output',
        locator,
        contentKind: 'document',
      }),
    ).toThrow('output "prompt-output" kind is stale');
  });

  it('authorizes text preview effects against the exact current File locator', async () => {
    const readTextFilePreview = vi.fn(async (input) => ({
      requestId: input.requestId,
      nodeId: input.nodeId,
      status: 'ready' as const,
      kind: 'json' as const,
      text: '{\n  "ready": true\n}',
      truncated: false,
      empty: false,
    }));
    const locator = {
      file: { authority: 'workspace' as const, path: 'data/project.json' },
    };
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: {
        ...createEmptyCanvasData('Initial'),
        nodes: [
          {
            id: 'file-1',
            type: 'file',
            position: { x: 0, y: 0 },
            size: { width: 280, height: 180 },
            zIndex: 1,
            data: {
              path: locator.file.path,
              title: 'project.json',
              mediaType: 'application/json',
              contentLocator: locator,
            },
          },
        ],
      },
      effects: { readTextFilePreview },
    });

    await expect(
      runtime.readTextFilePreview({
        requestId: 'stale',
        identity,
        nodeId: 'file-1',
        locator: { file: { authority: 'workspace', path: 'data/other.json' } },
      }),
    ).resolves.toEqual({
      requestId: 'stale',
      nodeId: 'file-1',
      status: 'unavailable',
      diagnostic: { code: 'canvas-text-preview-stale-node' },
    });
    expect(readTextFilePreview).not.toHaveBeenCalled();

    await expect(
      runtime.readTextFilePreview({ requestId: 'ready', identity, nodeId: 'file-1', locator }),
    ).resolves.toMatchObject({ status: 'ready', kind: 'json' });
    expect(readTextFilePreview).toHaveBeenCalledOnce();
    expect(readTextFilePreview).toHaveBeenCalledWith({
      requestId: 'ready',
      identity,
      nodeId: 'file-1',
      locator,
      path: locator.file.path,
      mediaType: 'application/json',
    });
    const snapshot = await runtime.getSnapshot();
    expect(snapshot.canvas.nodes[0]).toMatchObject({
      id: 'file-1',
      data: {
        path: locator.file.path,
        title: 'project.json',
        mediaType: 'application/json',
        contentLocator: locator,
      },
    });
    expect(snapshot.canvas.nodes[0]?.data).not.toHaveProperty('preview');
    expect(snapshot.canvas.nodes[0]?.data).not.toHaveProperty('previewText');
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
    const intent = request('project-command', {
      type: 'author-material',
      request: directReference('media/cat.png', 'image'),
    });

    const first = await runtime.executeIntent(intent);
    const duplicate = await runtime.executeIntent({
      ...intent,
      requestId: 'request-project-command-retry',
    });

    expect(first.status).toBe('accepted');
    expect(duplicate.status).toBe('accepted');
    expect(duplicate.requestId).toBe('request-project-command-retry');
    expect(authorMaterial).toHaveBeenCalledTimes(1);
    expect(await runtime.getSnapshot()).toMatchObject({
      canvas: { name: 'Projected once' },
    });
  });

  it('serializes overlapping authoring intents within the owning session', async () => {
    let releaseFirst = (): void => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstStarted = (): void => {};
    const firstStartedPromise = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    const authorMaterial = vi.fn(async ({ canvas, request }) => {
      if (authorMaterial.mock.calls.length === 1) {
        firstStarted();
        await firstGate;
      }
      return {
        ...canvas,
        name:
          request.locator.file.authority === 'workspace' ? request.locator.file.path : 'projected',
      };
    });
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: { authorMaterial },
    });

    const first = runtime.executeIntent(
      request('serialize-first', {
        type: 'author-material',
        request: directReference('media/first.png', 'image'),
      }),
    );
    await firstStartedPromise;
    const second = runtime.executeIntent(
      request('serialize-second', {
        type: 'author-material',
        request: directReference('media/second.png', 'image'),
      }),
    );
    await Promise.resolve();
    expect(authorMaterial).toHaveBeenCalledTimes(1);

    releaseFirst();
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: 'accepted' }),
      expect.objectContaining({ status: 'accepted' }),
    ]);
    expect(authorMaterial).toHaveBeenCalledTimes(2);
    expect((await runtime.getSnapshot()).canvas.name).toBe('media/second.png');
  });

  it('never replays a completed command across a stale session identity', async () => {
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: {},
    });
    const command = request('identity-fenced-command', {
      type: 'replace-document',
      canvas: createEmptyCanvasData('Changed'),
      removedNodeIds: [],
    });
    expect((await runtime.executeIntent(command)).status).toBe('accepted');

    const stale = await runtime.executeIntent({
      ...command,
      requestId: 'request-stale-command-retry',
      identity: { ...identity, rendererSessionId: 'endpoint-stale' },
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
      request('source-cancelled', {
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
      request('source-accepted', {
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

  it('atomically authors and connects a reference to the exact Generation node', async () => {
    const generationCanvas = createCanvasGenerationNode({
      canvas: createEmptyCanvasData('Initial'),
      nodeId: 'generation-image',
      kind: 'image',
      position: { x: 400, y: 160 },
    });
    const source = referencedImageNode();
    const requestSource = vi.fn(async () => directReference('media/cat.png', 'image'));
    const authorMaterial = vi.fn(async ({ canvas }) => ({
      ...canvas,
      nodes: [...canvas.nodes, source],
    }));
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: generationCanvas,
      effects: { authorMaterial, requestSource },
    });

    const result = await runtime.executeIntent(
      request('attach-generation-reference', {
        type: 'attach-generation-reference',
        nodeId: 'generation-image',
        sourceKind: 'image',
        sourceMode: 'reference',
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error('Expected reference attach to succeed.');
    expect(requestSource).toHaveBeenCalledWith({
      identity,
      sourceKind: 'image',
      sourceMode: 'reference',
    });
    expect(authorMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({ position: { x: 40, y: 160 } }),
      }),
    );
    expect(result.snapshot.canvas.connections).toEqual([
      {
        id: 'generation-reference:media-image:generation-image',
        sourceId: 'media-image',
        targetId: 'generation-image',
        type: 'reference',
        sourceEndpoint: { nodeId: 'media-image', scope: 'node' },
        targetEndpoint: { nodeId: 'generation-image', scope: 'port', portId: 'reference' },
      },
    ]);
  });

  it('authors a dropped Workspace material without reopening a picker', async () => {
    const generationCanvas = createCanvasGenerationNode({
      canvas: createEmptyCanvasData('Initial'),
      nodeId: 'generation-image',
      kind: 'image',
      position: { x: 400, y: 160 },
    });
    const source = referencedImageNode();
    const requestSource = vi.fn();
    const authorMaterial = vi.fn(async ({ canvas }) => ({
      ...canvas,
      nodes: [...canvas.nodes, source],
    }));
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: generationCanvas,
      effects: { authorMaterial, requestSource },
    });

    const result = await runtime.executeIntent(
      request('attach-dropped-generation-reference', {
        type: 'attach-generation-reference-material',
        nodeId: 'generation-image',
        request: directReference('media/cat.png', 'image'),
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error('Expected dropped reference to succeed.');
    expect(requestSource).not.toHaveBeenCalled();
    expect(authorMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        identity,
        request: expect.objectContaining({
          kind: 'direct-reference',
          locator: { file: { authority: 'workspace', path: 'media/cat.png' } },
          mediaKind: 'image',
        }),
      }),
    );
    expect(result.snapshot.canvas.connections).toEqual([
      expect.objectContaining({
        sourceId: 'media-image',
        targetId: 'generation-image',
        type: 'reference',
      }),
    ]);
  });

  it('leaves the Generation document unchanged when reference selection is cancelled', async () => {
    const generationCanvas = createCanvasGenerationNode({
      canvas: createEmptyCanvasData('Initial'),
      nodeId: 'generation-image',
      kind: 'image',
      position: { x: 400, y: 160 },
    });
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: generationCanvas,
      effects: { requestSource: async () => undefined },
    });

    const result = await runtime.executeIntent(
      request('cancel-generation-reference', {
        type: 'attach-generation-reference',
        nodeId: 'generation-image',
        sourceKind: 'image',
        sourceMode: 'reference',
      }),
    );

    expect(result).toMatchObject({ status: 'accepted', snapshot: { dirty: false } });
    expect((await runtime.getSnapshot()).canvas).toEqual(generationCanvas);
  });

  it('rejects unsupported Generation reference source kinds at the contract boundary', () => {
    expect(() =>
      createCanvasHostIntentRequest({
        requestId: 'request-invalid-reference-kind',
        commandId: 'invalid-reference-kind',
        identity,
        intent: {
          type: 'attach-generation-reference',
          nodeId: 'generation-image',
          sourceKind: 'model' as never,
          sourceMode: 'reference',
        },
      }),
    ).toThrow('reference source kind is invalid');
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
      request('source-model', {
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

  it.each([
    ['prompt', { width: 120, height: 80 }],
    ['image', { width: 120, height: 90 }],
    ['audio', { width: 240, height: 100 }],
    ['video', { width: 120, height: 90 }],
  ] as const)(
    'creates an empty canonical %s Generation Node with the matching content size',
    async (kind, size) => {
      const runtime = new CanvasHostRuntimeSession({
        identity,
        initialCanvas: createEmptyCanvasData('Initial'),
        effects: { generation: unusedGenerationEffects() },
      });

      const result = await runtime.executeIntent(
        request('generation-create', {
          type: 'create-generation-node',
          kind,
          position: { x: 240, y: 180 },
        }),
      );

      expect(result.status).toBe('accepted');
      if (result.status !== 'accepted') throw new Error(result.diagnostic.message);
      expect(result.snapshot.canvas.nodes).toEqual([
        expect.objectContaining({
          type: 'generation',
          position: { x: 240, y: 180 },
          size,
          data: expect.objectContaining({
            recipe: expect.objectContaining({ kind, prompt: '' }),
            outputs: [],
          }),
        }),
      ]);
      expect(result.snapshot.canvas.nodes).toHaveLength(1);
    },
  );

  it('does not reuse a deleted Generation node identity within one document session', async () => {
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      effects: { generation: unusedGenerationEffects() },
    });

    const first = await runtime.executeIntent(
      request('generation-create-first', {
        type: 'create-generation-node',
        kind: 'video',
      }),
    );
    expect(first.status).toBe('accepted');
    if (first.status !== 'accepted') throw new Error(first.diagnostic.message);
    const firstNode = first.snapshot.canvas.nodes[0];
    if (!firstNode) throw new Error('First Generation node was not created.');

    const removed = await runtime.executeIntent(
      request('generation-remove-first', {
        type: 'replace-document',
        canvas: createEmptyCanvasData('Initial'),
        removedNodeIds: [firstNode.id],
      }),
    );
    expect(removed.status).toBe('accepted');

    const second = await runtime.executeIntent(
      request('generation-create-second', {
        type: 'create-generation-node',
        kind: 'video',
      }),
    );
    expect(second.status).toBe('accepted');
    if (second.status !== 'accepted') throw new Error(second.diagnostic.message);
    expect(second.snapshot.canvas.nodes[0]?.id).toBe('generation-2');
  });

  it('drops a deleted run projection and rejects its late observation after an identity collision', async () => {
    const run = {
      submissionId: 'submission-old',
      recipeInputFingerprint: 'sha256:old',
      jobRef: { kind: 'generation' as const, jobId: 'job-old' },
    };
    const initialCanvas = generationCanvasWithRun('generation-1', run);
    let releaseObservation: (() => void) | undefined;
    let finishObservation: (() => void) | undefined;
    const observationReleased = new Promise<void>((resolve) => {
      releaseObservation = resolve;
    });
    const observationFinished = new Promise<void>((resolve) => {
      finishObservation = resolve;
    });
    const effects: NonNullable<CanvasHostRuntimeSessionEffects['generation']> = {
      ...unusedGenerationEffects(),
      resumeNode: async ({ canvas }) => ({
        canvas,
        projection: {
          nodeId: 'generation-1',
          submissionId: run.submissionId,
          recipeInputFingerprint: run.recipeInputFingerprint,
          jobRef: run.jobRef,
          phase: 'running',
        },
      }),
      observeNode: async function* () {
        try {
          await observationReleased;
          yield {
            nodeId: 'generation-1',
            submissionId: run.submissionId,
            recipeInputFingerprint: run.recipeInputFingerprint,
            jobRef: run.jobRef,
            phase: 'failed',
            recipeStale: true,
            diagnostic: { code: 'old-provider-failure', message: 'Old provider failure.' },
          };
        } finally {
          finishObservation?.();
        }
      },
    };
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas,
      createGenerationNodeIdentity: () => 'generation-1',
      effects: { generation: effects },
    });
    await runtime.reattachGenerationNodes();
    expect((await runtime.getSnapshot()).generationNodes).toHaveLength(1);

    const removed = await runtime.executeIntent(
      request('generation-remove-running', {
        type: 'replace-document',
        canvas: createEmptyCanvasData('Initial'),
        removedNodeIds: ['generation-1'],
      }),
    );
    expect(removed.status).toBe('accepted');
    if (removed.status !== 'accepted') throw new Error(removed.diagnostic.message);
    expect(removed.snapshot.generationNodes).toEqual([]);

    const recreated = await runtime.executeIntent(
      request('generation-recreate-collision', {
        type: 'create-generation-node',
        kind: 'video',
      }),
    );
    expect(recreated.status).toBe('accepted');
    if (recreated.status !== 'accepted') throw new Error(recreated.diagnostic.message);
    expect(recreated.snapshot.canvas.nodes[0]).toMatchObject({
      id: 'generation-1',
      type: 'generation',
      data: { recipe: { kind: 'video', prompt: '' }, outputs: [] },
    });

    releaseObservation?.();
    await observationFinished;
    expect((await runtime.getSnapshot()).generationNodes).toEqual([]);
  });

  it('reprojects only the exact Generation run restored by undo', async () => {
    const run = {
      submissionId: 'submission-undo',
      recipeInputFingerprint: 'sha256:undo',
      jobRef: { kind: 'generation' as const, jobId: 'job-undo' },
    };
    const resumeNode = vi.fn(async ({ canvas }) => ({
      canvas,
      projection: {
        nodeId: 'generation-undo',
        submissionId: run.submissionId,
        recipeInputFingerprint: run.recipeInputFingerprint,
        jobRef: run.jobRef,
        phase: 'failed' as const,
        diagnostic: { code: 'provider-failure', message: 'Provider failure.' },
      },
    }));
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: generationCanvasWithRun('generation-undo', run),
      effects: {
        generation: {
          ...unusedGenerationEffects(),
          resumeNode,
          observeNode: async function* () {},
        },
      },
    });
    await runtime.reattachGenerationNodes();

    const removed = await runtime.executeIntent(
      request('generation-remove-before-undo', {
        type: 'replace-document',
        canvas: createEmptyCanvasData('Initial'),
        removedNodeIds: ['generation-undo'],
      }),
    );
    expect(removed.status).toBe('accepted');
    if (removed.status !== 'accepted') throw new Error(removed.diagnostic.message);
    expect(removed.snapshot.generationNodes).toEqual([]);

    const restored = await runtime.executeIntent(
      request('generation-undo-removal', { type: 'undo' }),
    );
    expect(restored.status).toBe('accepted');
    if (restored.status !== 'accepted') throw new Error(restored.diagnostic.message);
    expect(restored.snapshot.canvas.nodes[0]?.id).toBe('generation-undo');
    expect(restored.snapshot.generationNodes).toEqual([
      expect.objectContaining({
        nodeId: 'generation-undo',
        jobRef: run.jobRef,
        recipeInputFingerprint: run.recipeInputFingerprint,
        phase: 'failed',
      }),
    ]);
    expect(resumeNode).toHaveBeenCalledTimes(2);
  });

  it('marks the current Generation projection stale when its submitted Recipe is edited', async () => {
    const configured = updateCanvasGenerationNodeRecipe({
      canvas: createCanvasGenerationNode({
        canvas: createEmptyCanvasData('Initial'),
        nodeId: 'generation-1',
        kind: 'image',
        position: { x: 0, y: 0 },
      }),
      nodeId: 'generation-1',
      recipe: {
        kind: 'image',
        prompt: 'Original prompt',
        model: {
          purpose: 'image.generate',
          providerId: 'provider-1',
          modelId: 'model-1',
        },
      },
    });
    const node = configured.nodes[0];
    if (!node || node.type !== 'generation') throw new Error('Generation fixture is invalid.');
    const run = {
      submissionId: 'submission-1',
      recipeInputFingerprint: 'sha256:original',
      jobRef: { kind: 'generation' as const, jobId: 'job-1' },
    };
    const initialCanvas = {
      ...configured,
      nodes: [{ ...node, data: { ...node.data, latestRun: run } }],
    };
    const effects: NonNullable<CanvasHostRuntimeSessionEffects['generation']> = {
      ...unusedGenerationEffects(),
      resumeNode: async ({ canvas }) => ({
        canvas,
        projection: {
          nodeId: 'generation-1',
          submissionId: run.submissionId,
          recipeInputFingerprint: run.recipeInputFingerprint,
          jobRef: run.jobRef,
          phase: 'succeeded',
        },
      }),
      observeNode: async function* () {},
    };
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas,
      effects: { generation: effects },
    });
    await runtime.reattachGenerationNodes();

    const result = await runtime.executeIntent(
      request('generation-edit-stale', {
        type: 'update-generation-recipe',
        nodeId: 'generation-1',
        recipe: {
          kind: 'image',
          prompt: 'Changed prompt',
          model: {
            purpose: 'image.generate',
            providerId: 'provider-1',
            modelId: 'model-1',
          },
        },
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error(result.diagnostic.message);
    expect(result.snapshot.generationNodes).toEqual([
      expect.objectContaining({ nodeId: 'generation-1', recipeStale: true }),
    ]);
  });

  it('keeps an Agent-created Generation Job running when the durable run has no submission identity', async () => {
    const configured = updateCanvasGenerationNodeRecipe({
      canvas: createCanvasGenerationNode({
        canvas: createEmptyCanvasData('Agent Generation'),
        nodeId: 'generation-agent',
        kind: 'image',
        position: { x: 0, y: 0 },
      }),
      nodeId: 'generation-agent',
      recipe: {
        kind: 'image',
        prompt: 'Agent prompt',
        model: {
          purpose: 'image.generate',
          providerId: 'provider-1',
          modelId: 'model-1',
        },
      },
    });
    const node = configured.nodes[0];
    if (!node || node.type !== 'generation') throw new Error('Generation fixture is invalid.');
    const run = {
      recipeInputFingerprint: 'sha256:agent',
      jobRef: { kind: 'generation' as const, jobId: 'job-agent' },
    };
    const initialCanvas = {
      ...configured,
      nodes: [{ ...node, data: { ...node.data, latestRun: run } }],
    };
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas,
      effects: {
        generation: {
          ...unusedGenerationEffects(),
          resumeNode: async ({ canvas }) => ({
            canvas,
            projection: {
              nodeId: 'generation-agent',
              recipeInputFingerprint: run.recipeInputFingerprint,
              jobRef: run.jobRef,
              phase: 'running',
            },
          }),
          observeNode: async function* () {},
        },
      },
    });

    await runtime.reattachGenerationNodes();

    expect((await runtime.getSnapshot()).generationNodes).toEqual([
      expect.objectContaining({
        nodeId: 'generation-agent',
        jobRef: run.jobRef,
        phase: 'running',
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
      resolveGenerationModels: () => [
        {
          binding: {
            purpose: 'image.generate',
            providerId: 'provider-1',
            modelId: 'image-model-1',
          },
          label: 'Image Model',
          providerLabel: 'Provider One',
          isDefault: true,
        },
      ],
      effects: {
        requestSource: async () => undefined,
        generation: unusedGenerationEffects(),
      },
    });

    expect((await unavailable.getSnapshot()).authoringCapabilities).toEqual({
      sourceModes: [],
      generationKinds: [],
      generationModels: [],
    });
    expect((await available.getSnapshot()).authoringCapabilities).toEqual({
      sourceModes: ['import', 'reference'],
      generationKinds: ['prompt', 'image', 'audio', 'video'],
      generationModels: [
        {
          binding: {
            purpose: 'image.generate',
            providerId: 'provider-1',
            modelId: 'image-model-1',
          },
          label: 'Image Model',
          providerLabel: 'Provider One',
          isDefault: true,
        },
      ],
    });
  });

  it('initializes a new Generation node from the exact configured default model and typed parameters', async () => {
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Defaults'),
      resolveGenerationModels: () => [
        {
          binding: {
            purpose: 'image.generate',
            providerId: 'provider-1',
            modelId: 'image-model-1',
          },
          label: 'Image Model',
          providerLabel: 'Provider One',
          isDefault: true,
        },
        {
          binding: {
            purpose: 'image.generate',
            providerId: 'provider-2',
            modelId: 'image-model-2',
          },
          label: 'Alternate Image Model',
          providerLabel: 'Provider Two',
          isDefault: false,
        },
      ],
      effects: { generation: unusedGenerationEffects() },
    });

    const result = await runtime.executeIntent(
      request('create-default-generation', {
        type: 'create-generation-node',
        kind: 'image',
        position: { x: 40, y: 60 },
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error('Expected Generation creation to succeed.');
    const node = result.snapshot.canvas.nodes[0];
    if (node?.type !== 'generation') throw new Error('Expected a Generation node.');
    expect(node).toMatchObject({
      type: 'generation',
      data: {
        recipe: {
          kind: 'image',
          prompt: '',
          model: {
            purpose: 'image.generate',
            providerId: 'provider-1',
            modelId: 'image-model-1',
          },
          aspectRatio: '1:1',
          width: 1024,
          height: 1024,
          count: 1,
          quality: 'standard',
        },
        outputs: [],
      },
    });
  });

  it('initializes a video node from the selected model parameter profile', async () => {
    const parameterProfile = resolveGenerationModelParameterProfile({
      providerType: 'minimax',
      modelName: 'MiniMax-H3',
    });
    if (!parameterProfile) throw new Error('Expected the MiniMax H3 parameter profile.');
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Video defaults'),
      resolveGenerationModels: () => [
        {
          binding: {
            purpose: 'video.generate',
            providerId: 'minimax-provider',
            modelId: 'minimax-h3',
          },
          label: 'MiniMax H3',
          providerLabel: 'MiniMax',
          isDefault: true,
          parameterProfile,
        },
      ],
      effects: { generation: unusedGenerationEffects() },
    });

    const result = await runtime.executeIntent(
      request('create-video-generation', {
        type: 'create-generation-node',
        kind: 'video',
      }),
    );

    expect(result.status).toBe('accepted');
    if (result.status !== 'accepted') throw new Error('Expected Generation creation to succeed.');
    const node = result.snapshot.canvas.nodes[0];
    if (node?.type !== 'generation') throw new Error('Expected a Generation node.');
    expect(node).toMatchObject({
      type: 'generation',
      data: {
        recipe: {
          kind: 'video',
          prompt: '',
          model: {
            purpose: 'video.generate',
            providerId: 'minimax-provider',
            modelId: 'minimax-h3',
          },
          aspectRatio: '16:9',
          resolution: '768P',
          duration: 5,
        },
        outputs: [],
      },
    });
    expect(node.data.recipe).not.toHaveProperty('fps');
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
      request('preview-image', {
        type: 'execute-material-action',
        action: {
          identity: {
            projectId: identity.projectId,
            canvasId: identity.documentId,
            canvasSessionId: identity.sessionId,
          },
          actionId: descriptor.id,
          selectedNodeIds: [node.id],
          payload: {},
        },
      }),
    );

    expect(result.status).toBe('accepted');
    expect(resolveMaterialActions).toHaveBeenCalledWith({
      canvas: expect.objectContaining({ nodes: [node] }),
      identity,
      targets: [
        {
          nodeId: node.id,
          mediaKind: 'image',
          origin: 'referenced',
          locator: { file: { authority: 'workspace', path: 'media/cat.png' } },
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
          locator: { file: { authority: 'workspace', path: 'media/cat.png' } },
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
      selectedNodeIds: [node.id],
      payload: {},
    } as const;

    await expect(
      runtime.executeIntent(
        request('stale-action-identity', {
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
        request('unavailable-action', {
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

  it('rejects a target-sensitive action when its resolved execution payload changed', async () => {
    const node = referencedImageNode();
    const executeMaterialAction = vi.fn(async () => ({}));
    const resolveMaterialActions = vi.fn(async () => [
      {
        id: 'cut:add-resource',
        ownerId: 'cut',
        label: 'Add to Cut',
        mediaKinds: ['image'] as const,
        origins: ['referenced'] as const,
        selection: { minimum: 1, maximum: 1 },
        effect: 'handoff' as const,
        executionPayload: {
          target: { kind: 'existing', viewId: 'cut-view-current' },
        },
      },
    ]);
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: { ...createEmptyCanvasData('Initial'), nodes: [node] },
      effects: { resolveMaterialActions, executeMaterialAction },
    });

    const result = await runtime.executeIntent(
      request('stale-cut-target', {
        type: 'execute-material-action',
        action: {
          identity: {
            projectId: identity.projectId,
            canvasId: identity.documentId,
            canvasSessionId: identity.sessionId,
          },
          actionId: 'cut:add-resource',
          selectedNodeIds: [node.id],
          payload: { target: { kind: 'existing', viewId: 'cut-view-previous' } },
        },
      }),
    );

    expect(result).toMatchObject({
      status: 'rejected',
      diagnostic: {
        code: 'canvas-runtime-stale-identity',
        message: 'Canvas material action target changed before execution.',
      },
    });
    expect(executeMaterialAction).not.toHaveBeenCalled();
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
      request('presentation-1', {
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

  it('reconstructs presentation from the package snapshot after runtime release', async () => {
    const presentationSnapshots = createCanvasHostPresentationSnapshotStore();
    const first = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: createEmptyCanvasData('Initial'),
      presentationSnapshots,
      effects: {},
    });
    await first.executeIntent(
      request('presentation-reconstruct', {
        type: 'update-presentation',
        presentation: {
          viewport: { pan: { x: 24, y: -10 }, zoom: 1.5 },
          selectedNodeIds: ['node-1'],
        },
      }),
    );
    first.dispose();

    const reconstructed = new CanvasHostRuntimeSession({
      identity: { ...identity, rendererSessionId: 'endpoint-2' },
      initialCanvas: createEmptyCanvasData('Initial'),
      presentationSnapshots,
      effects: {},
    });

    await expect(reconstructed.getSnapshot()).resolves.toMatchObject({
      presentation: {
        viewport: { pan: { x: 24, y: -10 }, zoom: 1.5 },
        selectedNodeIds: ['node-1'],
      },
    });
    expect(JSON.stringify(await reconstructed.getSnapshot())).not.toContain('/Users/');
    reconstructed.dispose();
  });
});

function request(
  commandId: string,
  intent: Parameters<typeof createCanvasHostIntentRequest>[0]['intent'],
) {
  return createCanvasHostIntentRequest({
    requestId: `request-${commandId}`,
    commandId,
    identity,
    intent,
  });
}

function unusedGenerationEffects(): NonNullable<CanvasHostRuntimeSessionEffects['generation']> {
  return {
    startNode: async () => {
      throw new Error('Generation execution is not used by this test.');
    },
    resumeNode: async () => {
      throw new Error('Generation recovery is not used by this test.');
    },
    observeNode: async function* () {
      yield* [];
      throw new Error('Generation observation is not used by this test.');
    },
    cancelNode: async () => {
      throw new Error('Generation cancellation is not used by this test.');
    },
  };
}

function generationCanvasWithRun(
  nodeId: string,
  run: {
    readonly submissionId: string;
    readonly recipeInputFingerprint: string;
    readonly jobRef: { readonly kind: 'generation'; readonly jobId: string };
  },
) {
  const configured = updateCanvasGenerationNodeRecipe({
    canvas: createCanvasGenerationNode({
      canvas: createEmptyCanvasData('Initial'),
      nodeId,
      kind: 'video',
      position: { x: 0, y: 0 },
    }),
    nodeId,
    recipe: {
      kind: 'video',
      prompt: 'Old prompt',
      model: {
        purpose: 'video.generate',
        providerId: 'provider-old',
        modelId: 'model-old',
      },
    },
  });
  const node = configured.nodes[0];
  if (!node || node.type !== 'generation') throw new Error('Generation fixture is invalid.');
  return { ...configured, nodes: [{ ...node, data: { ...node.data, latestRun: run } }] };
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
    locator: { file: { authority: 'workspace' as const, path } },
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
      contentLocator: { file: { authority: 'workspace', path: 'media/cat.png' } },
    },
  };
}
