// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasHostRuntime } from '@neko/canvas-domain';

const canvasAppDisposed = vi.hoisted(() => vi.fn());

vi.mock('./CanvasApp', async () => {
  const ReactRuntime = await import('react');
  return {
    CanvasApp: ({
      host,
    }: {
      readonly host: {
        postMessage(message: unknown): void;
        subscribe(listener: (message: unknown) => void): () => void;
      };
    }) => {
      ReactRuntime.useEffect(() => {
        const unsubscribe = host.subscribe(() => undefined);
        return () => {
          unsubscribe();
          canvasAppDisposed();
          host.postMessage({ type: 'canvasDataReady' });
        };
      }, [host]);
      return <div data-canvas-app="mounted" />;
    },
  };
});

import { CanvasWebviewRoot } from './root';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('CanvasWebviewRoot lifetime', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    canvasAppDisposed.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('lets child effects unsubscribe before disposing the instance Host', async () => {
    const dispose = vi.fn();
    const runtime: CanvasHostRuntime = {
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
      async getSnapshot() {
        throw new Error('Snapshot is not used by the lifetime fixture.');
      },
      async resolveMaterialActions() {
        throw new Error('Material actions are not used by the lifetime fixture.');
      },
      subscribe() {
        return () => {};
      },
      async executeIntent(request) {
        return {
          requestId: request.requestId,
          commandId: request.commandId,
          status: 'rejected',
          diagnostic: {
            code: 'canvas-runtime-unsupported-intent',
            message: 'Intent is not used by the lifetime fixture.',
          },
        };
      },
      dispose,
    };

    act(() => {
      root.render(<CanvasWebviewRoot runtime={runtime} />);
    });
    expect(() => {
      act(() => root.unmount());
    }).not.toThrow();
    expect(dispose).not.toHaveBeenCalled();

    await Promise.resolve();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('keeps the instance Host alive across React StrictMode effect replay', async () => {
    const dispose = vi.fn();
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const runtime: CanvasHostRuntime = {
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
      async getSnapshot() {
        throw new Error('Snapshot is not used by the lifetime fixture.');
      },
      async resolveMaterialActions() {
        throw new Error('Material actions are not used by the lifetime fixture.');
      },
      subscribe,
      async executeIntent(request) {
        return {
          requestId: request.requestId,
          commandId: request.commandId,
          status: 'rejected',
          diagnostic: {
            code: 'canvas-runtime-unsupported-intent',
            message: 'Intent is not used by the lifetime fixture.',
          },
        };
      },
      dispose,
    };

    act(() => {
      root.render(
        <StrictMode>
          <CanvasWebviewRoot runtime={runtime} />
        </StrictMode>,
      );
    });
    await Promise.resolve();

    expect(dispose).not.toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
    await Promise.resolve();

    expect(dispose).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('suspends the high-memory Canvas child while retaining its owner Host', async () => {
    const dispose = vi.fn();
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const runtime = createRuntime({ dispose, subscribe });

    act(() => {
      root.render(<CanvasWebviewRoot lifecyclePresentation="active" runtime={runtime} />);
    });
    expect(container.querySelector('[data-canvas-app="mounted"]')).not.toBeNull();

    act(() => {
      root.render(<CanvasWebviewRoot lifecyclePresentation="suspended" runtime={runtime} />);
    });
    expect(container.querySelector('[data-canvas-app="mounted"]')).toBeNull();
    expect(container.querySelector('[data-canvas-suspended="true"]')).not.toBeNull();
    expect(canvasAppDisposed).toHaveBeenCalledOnce();
    expect(dispose).not.toHaveBeenCalled();

    act(() => {
      root.render(<CanvasWebviewRoot lifecyclePresentation="active" runtime={runtime} />);
    });
    expect(container.querySelector('[data-canvas-app="mounted"]')).not.toBeNull();
    expect(subscribe).toHaveBeenCalledOnce();

    act(() => root.unmount());
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
  });
});

function createRuntime(input: {
  readonly dispose: () => void;
  readonly subscribe: () => () => void;
}): CanvasHostRuntime {
  return {
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
    async getSnapshot() {
      throw new Error('Snapshot is not used by the lifetime fixture.');
    },
    async resolveMaterialActions() {
      throw new Error('Material actions are not used by the lifetime fixture.');
    },
    subscribe: input.subscribe,
    async executeIntent(request) {
      return {
        requestId: request.requestId,
        commandId: request.commandId,
        status: 'rejected',
        diagnostic: {
          code: 'canvas-runtime-unsupported-intent',
          message: 'Intent is not used by the lifetime fixture.',
        },
      };
    },
    dispose: input.dispose,
  };
}
