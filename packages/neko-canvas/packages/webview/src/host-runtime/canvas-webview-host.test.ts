import { CanvasHostRuntimeSession } from '@neko-canvas/domain';
import { DEFAULT_CANVAS_DATA } from '@neko/shared';
import { describe, expect, it, vi } from 'vitest';
import { createCanvasWebviewHost } from './canvas-webview-host';

describe('createCanvasWebviewHost', () => {
  it('routes the Add menu source picker through the injected runtime', async () => {
    const requestSource = vi.fn(async () => ({
      kind: 'workspace-file' as const,
      path: 'media/cat.png',
    }));
    const projectContent = vi.fn(async ({ canvas }) => ({
      ...canvas,
      name: 'Projected source',
    }));
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
      effects: { requestSource, projectContent },
    });
    const host = createCanvasWebviewHost(runtime);

    const snapshot = await host.requestSource('image', { x: 320, y: 180 });

    expect(requestSource).toHaveBeenCalledWith({
      identity: runtime.identity,
      sourceKind: 'image',
    });
    expect(projectContent).toHaveBeenCalledWith(
      expect.objectContaining({
        locator: { kind: 'workspace-file', path: 'media/cat.png' },
        position: { x: 320, y: 180 },
      }),
    );
    expect(snapshot.canvas.name).toBe('Projected source');

    const dragged = await host.projectContent(
      { kind: 'workspace-file', path: 'media/dog.png' },
      { x: 40, y: 50 },
    );
    expect(projectContent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        locator: { kind: 'workspace-file', path: 'media/dog.png' },
        position: { x: 40, y: 50 },
      }),
    );
    expect(dragged.revision).toBe(snapshot.revision + 1);
    host.dispose();
    runtime.dispose();
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
