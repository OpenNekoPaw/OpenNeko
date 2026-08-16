import {
  CanvasHostRuntimeSession,
  createCanvasHostPresentationSnapshotStore,
  createCanvasHostIntentRequest,
  type CanvasHostRuntime,
} from '@neko/canvas-domain';
import {
  DEFAULT_CANVAS_DATA,
  type CanvasMaterialActionDescriptor,
  type MediaCanvasNode,
} from '@neko/canvas-domain';
import { describe, expect, it, vi } from 'vitest';
import { createCanvasWebviewHost } from './canvas-webview-host';

describe('createCanvasWebviewHost', () => {
  it('prepares one initial snapshot before UI subscription and replays it without refetching', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      rendererSessionId: 'endpoint-1',
    };
    let releaseSnapshot = (): void => undefined;
    const snapshotGate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    const session = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: {},
    });
    const getSnapshot = vi.fn(async () => {
      await snapshotGate;
      return session.getSnapshot();
    });
    const runtime: CanvasHostRuntime = {
      identity,
      getSnapshot,
      resolveMaterialActions: (request) => session.resolveMaterialActions(request),
      readTextFilePreview: (request) => session.readTextFilePreview(request),
      subscribe: (listener) => session.subscribe(listener),
      executeIntent: (request) => session.executeIntent(request),
    };
    const host = createCanvasWebviewHost(runtime);

    host.prepare();
    expect(getSnapshot).toHaveBeenCalledOnce();
    const messages: unknown[] = [];
    host.subscribe((message) => messages.push(message));
    host.postMessage({ type: 'ready' });
    expect(getSnapshot).toHaveBeenCalledOnce();

    releaseSnapshot();
    await vi.waitFor(() => {
      expect(messages).toContainEqual({ type: 'update', data: DEFAULT_CANVAS_DATA });
    });

    const replayed: unknown[] = [];
    host.subscribe((message) => replayed.push(message));
    expect(replayed).toContainEqual({ type: 'update', data: DEFAULT_CANVAS_DATA });
    expect(getSnapshot).toHaveBeenCalledOnce();
    host.dispose();
    session.dispose();
  });

  it('routes the Add menu source picker through the injected runtime', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      rendererSessionId: 'endpoint-1',
    };
    const requestSource = vi.fn(async () => ({
      kind: 'direct-reference' as const,
      identity: {
        projectId: identity.projectId,
        canvasId: identity.documentId,
        canvasSessionId: identity.sessionId,
      },
      locator: { kind: 'workspace-file' as const, path: 'media/cat.png' },
      mediaKind: 'image' as const,
    }));
    const authorMaterial = vi.fn(async ({ canvas }) => ({
      ...canvas,
      name: 'Projected source',
    }));
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: { requestSource, authorMaterial },
    });
    const host = createCanvasWebviewHost(runtime);

    const snapshot = await host.requestSource('image', 'reference', { x: 320, y: 180 });

    expect(requestSource).toHaveBeenCalledWith({
      identity: runtime.identity,
      sourceKind: 'image',
      sourceMode: 'reference',
    });
    expect(authorMaterial).toHaveBeenCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          kind: 'direct-reference',
          locator: { kind: 'workspace-file', path: 'media/cat.png' },
          position: { x: 320, y: 180 },
        }),
      }),
    );
    expect(snapshot.canvas.name).toBe('Projected source');

    const dragged = await host.projectContent(
      { kind: 'workspace-file', path: 'media/dog.png' },
      'image',
      { x: 40, y: 50 },
      'dog.png',
    );
    expect(authorMaterial).toHaveBeenLastCalledWith(
      expect.objectContaining({
        request: expect.objectContaining({
          kind: 'direct-reference',
          locator: { kind: 'workspace-file', path: 'media/dog.png' },
          mediaKind: 'image',
          title: 'dog.png',
          position: { x: 40, y: 50 },
        }),
      }),
    );
    expect(dragged.canvas.name).toBe('Projected source');
    expect(authorMaterial).toHaveBeenCalledTimes(2);
    host.dispose();
    runtime.dispose();
  });

  it('creates one canonical Generation Node without submitting a Job', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      rendererSessionId: 'endpoint-1',
    };
    const startNode = vi.fn(async () => {
      throw new Error('Creating a Generation Node must not submit a Job.');
    });
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: {
        generation: {
          startNode,
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
        },
      },
    });
    const host = createCanvasWebviewHost(runtime);

    const snapshot = await host.createGenerationNode('image', { x: 80, y: 120 });

    expect(startNode).not.toHaveBeenCalled();
    expect(snapshot.canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'generation',
        position: { x: 80, y: 120 },
        data: expect.objectContaining({
          recipe: expect.objectContaining({
            kind: 'image',
            prompt: '',
            aspectRatio: '1:1',
            width: 1024,
            height: 1024,
            count: 1,
            quality: 'standard',
          }),
          outputs: [],
        }),
      }),
    ]);
    host.dispose();
    runtime.dispose();
  });

  it('commits a queued deletion before creating a Generation Node', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      rendererSessionId: 'endpoint-1',
    };
    const deletedNode = {
      id: 'deleted-note',
      type: 'markdown' as const,
      position: { x: 20, y: 30 },
      size: { width: 240, height: 160 },
      zIndex: 0,
      data: { content: 'Delete me' },
    };
    const initialCanvas = {
      ...DEFAULT_CANVAS_DATA,
      nodes: [deletedNode],
    };
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas,
      effects: {
        generation: {
          startNode: async () => {
            throw new Error('Generation execution is not used by this test.');
          },
          resumeNode: async () => {
            throw new Error('Generation recovery is not used by this test.');
          },
          observeNode: async function* () {
            yield* [];
          },
          cancelNode: async () => {
            throw new Error('Generation cancellation is not used by this test.');
          },
        },
      },
    });
    const host = createCanvasWebviewHost(runtime);
    const messages: unknown[] = [];
    host.subscribe((message) => messages.push(message));

    host.postMessage({
      type: 'canvasStatus',
      data: {
        ...initialCanvas,
        nodes: [],
        connections: [],
        _selection: { nodeIds: [] },
      },
    });
    const snapshot = await host.createGenerationNode('image', { x: 320, y: 180 });

    expect(snapshot.canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'generation',
        position: { x: 320, y: 180 },
      }),
    ]);
    expect(snapshot.canvas.nodes).not.toContainEqual(
      expect.objectContaining({ id: deletedNode.id }),
    );
    expect((await runtime.getSnapshot()).canvas.nodes).toEqual(snapshot.canvas.nodes);
    expect(messages.filter(isCanvasUpdateMessage).at(-1)).toEqual({
      type: 'update',
      data: snapshot.canvas,
    });

    host.dispose();
    runtime.dispose();
  });

  it('keeps the command queue usable after one narrow operation fails locally', async () => {
    const runtime = new CanvasHostRuntimeSession({
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewInstanceId: 'view-instance-1',
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        rendererSessionId: 'endpoint-1',
      },
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: {},
    });
    const host = createCanvasWebviewHost(runtime);
    const messages: unknown[] = [];
    host.subscribe((message) => messages.push(message));

    await expect(host.createGenerationNode('image')).rejects.toThrow(
      'Canvas Host intent "create-generation-node" is unavailable.',
    );
    host.postMessage({
      type: 'canvasStatus',
      data: {
        ...DEFAULT_CANVAS_DATA,
        name: 'Edited after local failure',
        _selection: { nodeIds: [] },
      },
    });

    await vi.waitFor(async () => {
      expect((await runtime.getSnapshot()).canvas.name).toBe('Edited after local failure');
    });
    expect(messages).not.toContainEqual(expect.objectContaining({ type: 'canvas.loadFailed' }));

    host.dispose();
    runtime.dispose();
  });

  it('projects owner descriptors and dispatches the exact identity-bound material action', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      rendererSessionId: 'endpoint-1',
    };
    const node: MediaCanvasNode = {
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
    const runtime = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: { ...DEFAULT_CANVAS_DATA, nodes: [node] },
      effects: {
        resolveMaterialActions: vi.fn(async () => [descriptor]),
        executeMaterialAction,
      },
    });
    const host = createCanvasWebviewHost(runtime);
    const unsubscribe = host.subscribe(() => undefined);
    host.postMessage({ type: 'ready' });

    await vi.waitFor(() => {
      return expect(host.resolveMaterialActions([node.id])).resolves.toEqual([descriptor]);
    });
    const snapshot = await host.executeMaterialAction(descriptor.id, [node.id]);

    expect(snapshot.identity).toEqual(identity);
    expect(executeMaterialAction).toHaveBeenCalledWith(
      expect.objectContaining({
        identity,
        descriptor,
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
        targets: [
          {
            nodeId: node.id,
            mediaKind: 'image',
            origin: 'referenced',
            locator: { kind: 'workspace-file', path: 'media/cat.png' },
          },
        ],
      }),
    );
    unsubscribe();
    host.dispose();
    runtime.dispose();
  });

  it('waits for an in-flight presentation mutation before resolving material actions', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      rendererSessionId: 'endpoint-1',
    };
    const node: MediaCanvasNode = {
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
    const descriptor: CanvasMaterialActionDescriptor = {
      id: 'preview:open',
      ownerId: 'preview',
      label: 'Preview',
      mediaKinds: ['image'],
      origins: ['referenced', 'generated'],
      selection: { minimum: 1, maximum: 1 },
      effect: 'read',
    };
    const session = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: { ...DEFAULT_CANVAS_DATA, nodes: [node] },
      effects: {
        resolveMaterialActions: vi.fn(async () => [descriptor]),
      },
    });
    let releaseIntentResult = (): void => {};
    const intentResultGate = new Promise<void>((resolve) => {
      releaseIntentResult = resolve;
    });
    let intentApplied = false;
    const runtime: CanvasHostRuntime = {
      identity,
      getSnapshot: () => session.getSnapshot(),
      resolveMaterialActions: (request) => session.resolveMaterialActions(request),
      readTextFilePreview: (request) => session.readTextFilePreview(request),
      subscribe: () => () => {},
      async executeIntent(request) {
        const result = await session.executeIntent(request);
        intentApplied = true;
        await intentResultGate;
        return result;
      },
    };
    const host = createCanvasWebviewHost(runtime);
    const messages: unknown[] = [];
    host.subscribe((message) => messages.push(message));
    host.postMessage({ type: 'ready' });
    await vi.waitFor(() => {
      expect(messages).toContainEqual({
        type: 'update',
        data: { ...DEFAULT_CANVAS_DATA, nodes: [node] },
      });
    });

    await expect(host.resolveMaterialActions([node.id])).resolves.toEqual([descriptor]);
    host.postMessage({
      type: 'canvasStatus',
      data: {
        ...DEFAULT_CANVAS_DATA,
        nodes: [node],
        _selection: { nodeIds: [node.id] },
      },
    });
    await vi.waitFor(() => {
      expect(intentApplied).toBe(true);
    });

    const resolution = host.resolveMaterialActions([node.id]);
    releaseIntentResult();

    await expect(resolution).resolves.toEqual([descriptor]);
    host.dispose();
    session.dispose();
  });

  it('waits for a same-turn Canvas status enqueue before resolving material actions', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      rendererSessionId: 'endpoint-1',
    };
    const node: MediaCanvasNode = {
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
    const descriptor: CanvasMaterialActionDescriptor = {
      id: 'preview:open',
      ownerId: 'preview',
      label: 'Preview',
      mediaKinds: ['image'],
      origins: ['referenced', 'generated'],
      selection: { minimum: 1, maximum: 1 },
      effect: 'read',
    };
    const session = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: {
        resolveMaterialActions: vi.fn(async () => [descriptor]),
      },
    });
    const requestIds: string[] = [];
    const runtime: CanvasHostRuntime = {
      identity,
      getSnapshot: () => session.getSnapshot(),
      resolveMaterialActions(request) {
        requestIds.push(request.requestId);
        return session.resolveMaterialActions(request);
      },
      readTextFilePreview: (request) => session.readTextFilePreview(request),
      subscribe: (listener) => session.subscribe(listener),
      executeIntent: (request) => session.executeIntent(request),
    };
    const host = createCanvasWebviewHost(runtime);
    const messages: unknown[] = [];
    host.subscribe((message) => messages.push(message));
    host.postMessage({ type: 'ready' });
    await vi.waitFor(() => {
      expect(messages).toContainEqual({
        type: 'update',
        data: DEFAULT_CANVAS_DATA,
      });
    });

    const resolution = host.resolveMaterialActions([node.id]);
    host.postMessage({
      type: 'canvasStatus',
      data: {
        ...DEFAULT_CANVAS_DATA,
        nodes: [node],
        _selection: { nodeIds: [node.id] },
      },
    });

    await expect(resolution).resolves.toEqual([descriptor]);
    expect(requestIds).toEqual(['canvas-webview-material-actions:1']);
    host.dispose();
    session.dispose();
  });

  it.each(['delayed request', 'delayed response'] as const)(
    'keeps a content-unavailable node open when a concurrent move overlaps a %s',
    async (concurrencyResult) => {
      const identity = {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewInstanceId: 'view-instance-1',
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        rendererSessionId: 'endpoint-1',
      };
      const node: MediaCanvasNode = {
        id: 'media-image',
        type: 'media',
        position: { x: 20, y: 30 },
        size: { width: 320, height: 180 },
        zIndex: 1,
        data: {
          assetPath: 'media/cat.png',
          mediaType: 'image',
        },
      };
      const presentationSnapshots = createCanvasHostPresentationSnapshotStore();
      presentationSnapshots.write(identity, {
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        selectedNodeIds: [node.id],
      });
      const session = new CanvasHostRuntimeSession({
        identity,
        initialCanvas: { ...DEFAULT_CANVAS_DATA, nodes: [node] },
        presentationSnapshots,
        effects: {},
      });
      let releaseFirstResolution = (): void => {};
      const firstResolutionGate = new Promise<void>((resolve) => {
        releaseFirstResolution = resolve;
      });
      const requestIds: string[] = [];
      const runtime: CanvasHostRuntime = {
        identity,
        getSnapshot: () => session.getSnapshot(),
        async resolveMaterialActions(request) {
          requestIds.push(request.requestId);
          if (requestIds.length === 1 && concurrencyResult === 'delayed response') {
            const resolution = await session.resolveMaterialActions(request);
            await firstResolutionGate;
            return resolution;
          }
          if (requestIds.length === 1) await firstResolutionGate;
          return session.resolveMaterialActions(request);
        },
        readTextFilePreview: (request) => session.readTextFilePreview(request),
        subscribe: (listener) => session.subscribe(listener),
        executeIntent: (request) => session.executeIntent(request),
      };
      const host = createCanvasWebviewHost(runtime);
      const messages: unknown[] = [];
      host.subscribe((message) => messages.push(message));
      host.postMessage({ type: 'ready' });
      await vi.waitFor(() => {
        expect(messages).toContainEqual({
          type: 'update',
          data: { ...DEFAULT_CANVAS_DATA, nodes: [node] },
        });
      });

      const resolution = host.resolveMaterialActions([node.id]);
      await vi.waitFor(() => {
        expect(requestIds).toEqual(['canvas-webview-material-actions:1']);
      });
      host.postMessage({
        type: 'canvasStatus',
        data: {
          ...DEFAULT_CANVAS_DATA,
          nodes: [{ ...node, position: { x: 160, y: 90 } }],
          _selection: { nodeIds: [node.id] },
        },
      });
      await vi.waitFor(async () => {
        expect((await session.getSnapshot()).canvas.nodes[0]?.position).toEqual({ x: 160, y: 90 });
      });
      releaseFirstResolution();

      await expect(resolution).resolves.toEqual([]);
      expect(requestIds).toEqual(['canvas-webview-material-actions:1']);
      expect(messages).not.toContainEqual(
        expect.objectContaining({
          type: 'canvas.loadFailed',
        }),
      );
      host.dispose();
      session.dispose();
    },
  );

  it('does not let a delayed startup snapshot replace a newer session projection', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      rendererSessionId: 'endpoint-1',
    };
    const node: MediaCanvasNode = {
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
    const descriptor: CanvasMaterialActionDescriptor = {
      id: 'preview:open',
      ownerId: 'preview',
      label: 'Preview',
      mediaKinds: ['image'],
      origins: ['referenced', 'generated'],
      selection: { minimum: 1, maximum: 1 },
      effect: 'read',
    };
    const session = new CanvasHostRuntimeSession({
      identity,
      initialCanvas: { ...DEFAULT_CANVAS_DATA, nodes: [node] },
      effects: {
        resolveMaterialActions: vi.fn(async () => [descriptor]),
      },
    });
    let releaseStartupSnapshot = (): void => {};
    const startupSnapshotGate = new Promise<void>((resolve) => {
      releaseStartupSnapshot = resolve;
    });
    let snapshotRequestCount = 0;
    const runtime: CanvasHostRuntime = {
      identity,
      async getSnapshot() {
        snapshotRequestCount += 1;
        const current = await session.getSnapshot();
        if (snapshotRequestCount === 1) await startupSnapshotGate;
        return current;
      },
      resolveMaterialActions: (request) => session.resolveMaterialActions(request),
      readTextFilePreview: (request) => session.readTextFilePreview(request),
      subscribe: (listener) => session.subscribe(listener),
      executeIntent: (request) => session.executeIntent(request),
    };
    const host = createCanvasWebviewHost(runtime);
    const messages: unknown[] = [];
    host.subscribe((message) => messages.push(message));
    host.postMessage({ type: 'ready' });
    host.postMessage({
      type: 'canvasStatus',
      data: {
        ...DEFAULT_CANVAS_DATA,
        nodes: [node],
        _selection: { nodeIds: [node.id] },
      },
    });
    await vi.waitFor(async () => {
      expect((await session.getSnapshot()).presentation.selectedNodeIds).toEqual([node.id]);
    });

    releaseStartupSnapshot();

    await expect(host.resolveMaterialActions([node.id])).resolves.toEqual([descriptor]);
    expect(messages).not.toContainEqual(
      expect.objectContaining({
        type: 'canvas.loadFailed',
      }),
    );
    host.dispose();
    session.dispose();
  });

  it('projects the authoritative snapshot and commits Canvas status through the runtime', async () => {
    const saveDocument = vi.fn(async () => undefined);
    const runtime = new CanvasHostRuntimeSession({
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewInstanceId: 'view-instance-1',
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        rendererSessionId: 'endpoint-1',
      },
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: { saveDocument },
    });
    const host = createCanvasWebviewHost(runtime);
    const messages: unknown[] = [];
    host.subscribe((message) => messages.push(message));

    host.postMessage({ type: 'ready' });
    expect(() => host.postMessage({ type: 'webviewKeyboardFocus', focused: true })).not.toThrow();
    expect(() =>
      host.postMessage({ type: 'webviewKeyboardEditable', editable: false }),
    ).not.toThrow();
    expect(() => host.postMessage({ type: 'operationApplied', operation: {} })).not.toThrow();
    await vi.waitFor(() => {
      expect(messages).toContainEqual({
        type: 'update',
        data: DEFAULT_CANVAS_DATA,
      });
    });

    host.postMessage({
      type: 'canvasStatus',
      data: {
        ...DEFAULT_CANVAS_DATA,
        name: 'Edited Canvas',
        _selection: { nodeIds: [] },
      },
    });
    await vi.waitFor(async () => {
      expect((await runtime.getSnapshot()).canvas.name).toBe('Edited Canvas');
    });
    host.postMessage({
      type: 'canvasContentNodeDeltaApplied',
      removedNodeIds: ['removed-node-1'],
      restoredNodeIds: [],
    });
    host.postMessage({ type: 'requestSave' });
    await vi.waitFor(() => {
      expect(saveDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          canvas: expect.objectContaining({ name: 'Edited Canvas' }),
          identity: runtime.identity,
          removedNodeIds: ['removed-node-1'],
        }),
      );
    });

    expect(() => host.postMessage({ type: 'openDocument' })).toThrow(
      "does not implement message 'openDocument'",
    );
    host.dispose();
    runtime.dispose();
  });

  it('keeps viewport and selection in presentation state instead of document facts', async () => {
    const initialCanvas = {
      ...DEFAULT_CANVAS_DATA,
      viewport: { pan: { x: 3, y: 4 }, zoom: 0.8 },
    };
    const runtimeIdentity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      rendererSessionId: 'endpoint-1',
    };
    const presentationSnapshots = createCanvasHostPresentationSnapshotStore();
    presentationSnapshots.write(runtimeIdentity, {
      viewport: { pan: { x: 20, y: 30 }, zoom: 1.2 },
      selectedNodeIds: ['node-a'],
    });
    const runtime = new CanvasHostRuntimeSession({
      identity: runtimeIdentity,
      initialCanvas,
      presentationSnapshots,
      effects: {},
    });
    const host = createCanvasWebviewHost(runtime);
    const messages: unknown[] = [];
    host.subscribe((message) => messages.push(message));

    host.postMessage({ type: 'ready' });
    await vi.waitFor(() => {
      expect(messages).toContainEqual({
        type: 'canvas.hostPresentation',
        presentation: {
          viewport: { pan: { x: 20, y: 30 }, zoom: 1.2 },
          selectedNodeIds: ['node-a'],
        },
      });
    });
    expect(host.getState()).toEqual({
      canvasViewportSnapshots: {
        [runtime.identity.documentId]: {
          pan: { x: 20, y: 30 },
          zoom: 1.2,
        },
      },
    });

    host.postMessage({
      type: 'canvasStatus',
      data: {
        ...initialCanvas,
        viewport: { pan: { x: 50, y: 60 }, zoom: 1.5 },
        _selection: { nodeIds: ['node-b'] },
      },
    });
    await vi.waitFor(async () => {
      expect((await runtime.getSnapshot()).presentation).toEqual({
        viewport: { pan: { x: 50, y: 60 }, zoom: 1.5 },
        selectedNodeIds: ['node-b'],
      });
    });
    const snapshot = await runtime.getSnapshot();
    expect(snapshot.canvas.viewport).toEqual(initialCanvas.viewport);
    expect(snapshot.dirty).toBe(false);

    host.dispose();
    runtime.dispose();
  });

  it('does not replay locally originated stale selection projections into the source Root', async () => {
    const runtime = new CanvasHostRuntimeSession({
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewInstanceId: 'view-instance-1',
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        rendererSessionId: 'endpoint-1',
      },
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: {},
    });
    const host = createCanvasWebviewHost(runtime);
    const messages: unknown[] = [];
    host.subscribe((message) => messages.push(message));
    host.postMessage({ type: 'ready' });
    await vi.waitFor(() => {
      expect(messages.some((message) => isHostPresentationMessage(message))).toBe(true);
    });
    messages.length = 0;

    host.postMessage({
      type: 'canvasStatus',
      data: {
        ...DEFAULT_CANVAS_DATA,
        _selection: { nodeIds: ['node-a'] },
      },
    });
    host.postMessage({
      type: 'canvasStatus',
      data: {
        ...DEFAULT_CANVAS_DATA,
        _selection: { nodeIds: ['node-a', 'node-b'] },
      },
    });

    await vi.waitFor(async () => {
      expect((await runtime.getSnapshot()).presentation.selectedNodeIds).toEqual([
        'node-a',
        'node-b',
      ]);
    });
    expect(messages.filter(isHostPresentationMessage)).toEqual([]);

    const current = await runtime.getSnapshot();
    await runtime.executeIntent(
      createCanvasHostIntentRequest({
        requestId: 'external-request',
        commandId: 'external-agent-command',
        identity: runtime.identity,
        intent: {
          type: 'update-presentation',
          presentation: {
            ...current.presentation,
            selectedNodeIds: ['node-c'],
          },
        },
      }),
    );
    expect(messages.filter(isHostPresentationMessage)).toEqual([
      {
        type: 'canvas.hostPresentation',
        presentation: {
          ...current.presentation,
          selectedNodeIds: ['node-c'],
        },
      },
    ]);

    host.dispose();
    runtime.dispose();
  });

  it('does not replay unchanged presentation for an external document-only snapshot', async () => {
    const runtime = new CanvasHostRuntimeSession({
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewInstanceId: 'view-instance-1',
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        rendererSessionId: 'endpoint-1',
      },
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: {},
    });
    const host = createCanvasWebviewHost(runtime);
    const messages: unknown[] = [];
    host.subscribe((message) => messages.push(message));
    host.postMessage({ type: 'ready' });
    await vi.waitFor(() => {
      expect(messages.some((message) => isHostPresentationMessage(message))).toBe(true);
    });
    messages.length = 0;

    await runtime.executeIntent(
      createCanvasHostIntentRequest({
        requestId: 'external-document-request',
        commandId: 'external-document-command',
        identity: runtime.identity,
        intent: {
          type: 'replace-document',
          canvas: {
            ...DEFAULT_CANVAS_DATA,
            name: 'Terminal delivery',
          },
        },
      }),
    );

    await vi.waitFor(() => {
      expect(messages).toContainEqual({
        type: 'update',
        data: {
          ...DEFAULT_CANVAS_DATA,
          name: 'Terminal delivery',
        },
      });
    });
    expect(messages.filter(isHostPresentationMessage)).toEqual([]);

    host.dispose();
    runtime.dispose();
  });

  it('exposes delegate capabilities and forwards command-bearing Canvas actions only when supported', () => {
    const runtime = new CanvasHostRuntimeSession({
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewInstanceId: 'view-instance-1',
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        rendererSessionId: 'endpoint-1',
      },
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: {},
    });
    const postMessage = vi.fn();
    const host = createCanvasWebviewHost(runtime, {
      postMessage,
      getState: () => undefined,
      setState: () => undefined,
      supportsMessage: (messageType) =>
        messageType === 'canvasAction' || messageType.startsWith('preview:'),
    });

    expect(host.supportsMessage('canvasAction')).toBe(true);
    expect(host.supportsMessage('preview:resolveResource')).toBe(true);
    expect(host.supportsMessage('sendToAgent')).toBe(false);
    host.postMessage({ type: 'canvasAction', action: 'selectNode' });
    host.postMessage({ type: 'canvasAction', action: 'openExport' });
    host.postMessage({ type: 'preview:releaseResource', descriptorId: 'descriptor-video-1' });

    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenCalledWith({ type: 'canvasAction', action: 'openExport' });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'preview:releaseResource',
      descriptorId: 'descriptor-video-1',
    });
    expect(() => host.postMessage({ type: 'sendToAgent' })).toThrow(
      "does not implement message 'sendToAgent'",
    );
    host.dispose();
    runtime.dispose();
  });

  it('rejects unknown delegated messages even when a delegate claims generic support', () => {
    const runtime = new CanvasHostRuntimeSession({
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewInstanceId: 'view-instance-1',
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        rendererSessionId: 'endpoint-1',
      },
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: {},
    });
    const postMessage = vi.fn();
    const host = createCanvasWebviewHost(runtime, {
      postMessage,
      getState: () => undefined,
      setState: () => undefined,
      supportsMessage: () => true,
    });

    expect(() => host.postMessage({ type: 'unregistered:message' })).toThrow(
      "does not implement message 'unregistered:message'",
    );
    expect(postMessage).not.toHaveBeenCalled();
    host.dispose();
    runtime.dispose();
  });

  it('routes delegate state and responses only through this Canvas Host instance', async () => {
    const runtime = new CanvasHostRuntimeSession({
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewInstanceId: 'view-instance-1',
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        rendererSessionId: 'endpoint-1',
      },
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: {},
    });
    let delegateListener: ((message: unknown) => void) | undefined;
    const unsubscribeDelegate = vi.fn();
    const reportStateDiagnostic = vi.fn();
    let delegateState: unknown = {
      canvasViewportSnapshots: {
        'neko/boards/sibling.nkc': { pan: { x: 7, y: 8 }, zoom: 0.75 },
        malformed: { unsupportedField: true },
      },
    };
    const setState = vi.fn((nextState: unknown) => {
      delegateState = nextState;
    });
    const host = createCanvasWebviewHost(runtime, {
      postMessage: vi.fn(),
      getState: () => delegateState,
      setState,
      reportStateDiagnostic,
      subscribe(listener) {
        delegateListener = listener;
        return unsubscribeDelegate;
      },
    });
    const listener = vi.fn();
    host.subscribe(listener);
    host.postMessage({ type: 'ready' });

    await vi.waitFor(() => expect(setState).toHaveBeenCalled());
    expect(delegateState).toEqual({
      canvasViewportSnapshots: {
        'neko/boards/sibling.nkc': { pan: { x: 7, y: 8 }, zoom: 0.75 },
        malformed: { unsupportedField: true },
        'neko/boards/workspace.nkc': DEFAULT_CANVAS_DATA.viewport,
      },
    });

    delegateListener?.({
      type: 'preview:resourceResolved',
      requestId: 'preview-1',
      descriptor: {
        descriptorId: 'preview-descriptor-1',
        contentKind: 'image',
        resourceUrl: 'openneko://resource/preview-1',
        displayName: 'preview.png',
        mediaType: 'image/png',
      },
    });

    expect(listener).toHaveBeenCalledWith({
      type: 'preview:resourceResolved',
      requestId: 'preview-1',
      descriptor: {
        descriptorId: 'preview-descriptor-1',
        contentKind: 'image',
        resourceUrl: 'openneko://resource/preview-1',
        displayName: 'preview.png',
        mediaType: 'image/png',
      },
    });

    host.setState({ canvasViewportSnapshots: 'corrupt' });
    await vi.waitFor(() => expect(reportStateDiagnostic).toHaveBeenCalled());
    expect(reportStateDiagnostic).toHaveBeenCalledWith({
      code: 'invalid-viewport-map',
      message: 'Canvas viewport snapshot map must be an object.',
      documentId: 'neko/boards/workspace.nkc',
    });

    host.dispose();
    expect(unsubscribeDelegate).toHaveBeenCalledTimes(1);
    runtime.dispose();
  });
});

function isHostPresentationMessage(
  value: unknown,
): value is { readonly type: 'canvas.hostPresentation' } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'canvas.hostPresentation'
  );
}

function isCanvasUpdateMessage(
  value: unknown,
): value is { readonly type: 'update'; readonly data: unknown } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    value.type === 'update' &&
    'data' in value
  );
}
