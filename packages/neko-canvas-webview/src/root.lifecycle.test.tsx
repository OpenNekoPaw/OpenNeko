// @vitest-environment jsdom

import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANVAS_HOST_RUNTIME_CONTRACT_VERSION, type CanvasHostRuntime } from '@neko-canvas/domain';

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
          host.postMessage({ type: 'canvasDataReady' });
        };
      }, [host]);
      return null;
    },
  };
});

import { CanvasWebviewRoot } from './root';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('CanvasWebviewRoot lifetime', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
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
        viewEpoch: 1,
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        endpointEpoch: 'endpoint-1',
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
          schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
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
        viewEpoch: 1,
        documentId: 'neko/boards/workspace.nkc',
        sessionId: 'session-1',
        endpointEpoch: 'endpoint-1',
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
          schemaVersion: CANVAS_HOST_RUNTIME_CONTRACT_VERSION,
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
});
