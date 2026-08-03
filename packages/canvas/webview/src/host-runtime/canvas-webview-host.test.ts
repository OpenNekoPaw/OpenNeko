import {
  CanvasHostRuntimeSession,
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
  it('routes the Add menu source picker through the injected runtime', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewEpoch: 1,
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      endpointEpoch: 'endpoint-1',
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
    expect(dragged.revision).toBe(snapshot.revision + 1);
    host.dispose();
    runtime.dispose();
  });

  it('routes create mode to a Generation draft and projects only the authoritative Job', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewEpoch: 1,
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      endpointEpoch: 'endpoint-1',
    };
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
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: { requestGenerationDraft },
    });
    const host = createCanvasWebviewHost(runtime);

    const snapshot = await host.requestGenerationDraft('image', { x: 80, y: 120 });

    expect(requestGenerationDraft).toHaveBeenCalledWith({
      identity,
      mediaKind: 'image',
      position: { x: 80, y: 120 },
      inputNodeIds: [],
    });
    expect(snapshot.canvas.nodes).toEqual([
      expect.objectContaining({
        type: 'job',
        position: { x: 80, y: 120 },
        data: expect.objectContaining({
          jobRef: { kind: 'generation', jobId: 'generation-1' },
        }),
      }),
    ]);
    host.dispose();
    runtime.dispose();
  });

  it('projects owner descriptors and dispatches the exact revisioned material action', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewEpoch: 1,
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      endpointEpoch: 'endpoint-1',
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

    expect(snapshot).toMatchObject({ revision: 0 });
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
          expectedCanvasRevision: 0,
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
      viewEpoch: 1,
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      endpointEpoch: 'endpoint-1',
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
      viewEpoch: 1,
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      endpointEpoch: 'endpoint-1',
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
    const requestedRevisions: number[] = [];
    const runtime: CanvasHostRuntime = {
      identity,
      getSnapshot: () => session.getSnapshot(),
      resolveMaterialActions(request) {
        requestedRevisions.push(request.expectedRevision);
        return session.resolveMaterialActions(request);
      },
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
    host.postMessage({
      type: 'canvasStatus',
      data: {
        ...DEFAULT_CANVAS_DATA,
        nodes: [node],
        _selection: { nodeIds: [node.id] },
      },
    });

    await expect(resolution).resolves.toEqual([descriptor]);
    expect(requestedRevisions).toEqual([1]);
    host.dispose();
    session.dispose();
  });

  it.each(['stale rejection', 'stale response'] as const)(
    'keeps a content-unavailable node open after a concurrent move returns a %s',
    async (concurrencyResult) => {
      const identity = {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewEpoch: 1,
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        endpointEpoch: 'endpoint-1',
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
      const session = new CanvasHostRuntimeSession({
        identity,
        initialCanvas: { ...DEFAULT_CANVAS_DATA, nodes: [node] },
        initialPresentation: {
          viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
          selectedNodeIds: [node.id],
        },
        effects: {},
      });
      let releaseFirstResolution = (): void => {};
      const firstResolutionGate = new Promise<void>((resolve) => {
        releaseFirstResolution = resolve;
      });
      const requestedRevisions: number[] = [];
      const runtime: CanvasHostRuntime = {
        identity,
        getSnapshot: () => session.getSnapshot(),
        async resolveMaterialActions(request) {
          requestedRevisions.push(request.expectedRevision);
          if (requestedRevisions.length === 1 && concurrencyResult === 'stale response') {
            const resolution = await session.resolveMaterialActions(request);
            await firstResolutionGate;
            return resolution;
          }
          if (requestedRevisions.length === 1) await firstResolutionGate;
          return session.resolveMaterialActions(request);
        },
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
        expect(requestedRevisions).toEqual([0]);
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
        expect((await session.getSnapshot()).revision).toBe(1);
      });
      releaseFirstResolution();

      await expect(resolution).resolves.toEqual([]);
      expect(requestedRevisions).toEqual([0, 1]);
      expect(messages).not.toContainEqual(
        expect.objectContaining({
          type: 'canvas.loadFailed',
        }),
      );
      host.dispose();
      session.dispose();
    },
  );

  it('does not let a delayed startup snapshot regress the material action revision', async () => {
    const identity = {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'view-1',
      viewEpoch: 1,
      documentId: 'neko/boards/workspace.nkc',
      sessionId: 'session-1',
      endpointEpoch: 'endpoint-1',
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
      expect((await session.getSnapshot()).revision).toBe(1);
    });

    releaseStartupSnapshot();

    await expect(host.resolveMaterialActions([node.id])).resolves.toEqual([descriptor]);
    expect(messages).not.toContainEqual(
      expect.objectContaining({
        type: 'canvas.loadFailed',
        diagnostic: expect.objectContaining({
          message: expect.stringContaining('revision is stale'),
        }),
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
        viewEpoch: 1,
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        endpointEpoch: 'endpoint-1',
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
    host.postMessage({ type: 'requestSave' });
    await vi.waitFor(() => {
      expect(saveDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          canvas: expect.objectContaining({ name: 'Edited Canvas' }),
          identity: runtime.identity,
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
    const runtime = new CanvasHostRuntimeSession({
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewEpoch: 1,
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        endpointEpoch: 'endpoint-1',
      },
      initialCanvas,
      initialPresentation: {
        viewport: { pan: { x: 20, y: 30 }, zoom: 1.2 },
        selectedNodeIds: ['node-a'],
      },
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
        [`${initialCanvas.name}:${initialCanvas.version}`]: {
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
        viewEpoch: 1,
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        endpointEpoch: 'endpoint-1',
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
        expectedRevision: current.revision,
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

  it('exposes delegate capabilities and forwards command-bearing Canvas actions only when supported', () => {
    const runtime = new CanvasHostRuntimeSession({
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewEpoch: 1,
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        endpointEpoch: 'endpoint-1',
      },
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: {},
    });
    const postMessage = vi.fn();
    const host = createCanvasWebviewHost(runtime, {
      postMessage,
      getState: () => undefined,
      setState: () => undefined,
      supportsMessage: (messageType) => messageType === 'canvasAction',
    });

    expect(host.supportsMessage('canvasAction')).toBe(true);
    expect(host.supportsMessage('sendToAgent')).toBe(false);
    host.postMessage({ type: 'canvasAction', action: 'selectNode' });
    host.postMessage({ type: 'canvasAction', action: 'openExport' });

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith({ type: 'canvasAction', action: 'openExport' });
    expect(() => host.postMessage({ type: 'sendToAgent' })).toThrow(
      "does not implement message 'sendToAgent'",
    );
    host.dispose();
    runtime.dispose();
  });

  it('routes delegate responses only through this Canvas Host instance', () => {
    const runtime = new CanvasHostRuntimeSession({
      identity: {
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        windowId: 'window-1',
        viewId: 'view-1',
        viewEpoch: 1,
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        endpointEpoch: 'endpoint-1',
      },
      initialCanvas: DEFAULT_CANVAS_DATA,
      effects: {},
    });
    let delegateListener: ((message: unknown) => void) | undefined;
    const unsubscribeDelegate = vi.fn();
    const host = createCanvasWebviewHost(runtime, {
      postMessage: vi.fn(),
      getState: () => undefined,
      setState: () => undefined,
      subscribe(listener) {
        delegateListener = listener;
        return unsubscribeDelegate;
      },
    });
    const listener = vi.fn();
    host.subscribe(listener);

    delegateListener?.({
      type: 'preview:variantResolved',
      requestId: 'preview-1',
      url: 'data:image/png;base64,Y2F0',
    });

    expect(listener).toHaveBeenCalledWith({
      type: 'preview:variantResolved',
      requestId: 'preview-1',
      url: 'data:image/png;base64,Y2F0',
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
