import type {
  ResourceBrowserHostRuntime,
  ResourceBrowserProjection,
  ResourceBrowserProjectionEvent,
} from '@neko/assets-domain/resource-browser/contract';
import { describe, expect, it, vi } from 'vitest';
import { createResourceBrowserRuntimeBootstrap } from './runtime-bootstrap';

describe('createResourceBrowserRuntimeBootstrap', () => {
  it('loads one snapshot before UI subscription and replays it as the first local event', async () => {
    let releaseSnapshot = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    const projection = fixtureProjection();
    const getSnapshot = vi.fn(async () => {
      await gate;
      return projection;
    });
    const unsubscribe = vi.fn();
    const runtime = {
      identity: projection.identity,
      getSnapshot,
      subscribe: vi.fn(() => unsubscribe),
    } as unknown as ResourceBrowserHostRuntime;
    const bootstrap = createResourceBrowserRuntimeBootstrap(runtime);

    bootstrap.prepare();
    bootstrap.prepare();
    expect(getSnapshot).toHaveBeenCalledOnce();
    releaseSnapshot();
    await expect(bootstrap.getSnapshot()).resolves.toBe(projection);

    const observed: ResourceBrowserProjectionEvent[] = [];
    bootstrap.subscribe((event) => observed.push(event));
    expect(observed).toEqual([{ sequence: 1, projection }]);
    expect(getSnapshot).toHaveBeenCalledOnce();
    bootstrap.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps a newer event authoritative and restarts sequence for a late UI consumer', async () => {
    let releaseSnapshot = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseSnapshot = resolve;
    });
    let runtimeListener: ((event: ResourceBrowserProjectionEvent) => void) | undefined;
    const initial = fixtureProjection();
    const newer = { ...initial, query: 'cat' };
    const runtime = {
      identity: initial.identity,
      getSnapshot: vi.fn(async () => {
        await gate;
        return initial;
      }),
      subscribe: vi.fn((listener) => {
        runtimeListener = listener;
        return () => undefined;
      }),
    } as unknown as ResourceBrowserHostRuntime;
    const bootstrap = createResourceBrowserRuntimeBootstrap(runtime);

    bootstrap.prepare();
    runtimeListener?.({ sequence: 27, projection: newer });
    releaseSnapshot();
    await expect(bootstrap.getSnapshot()).resolves.toBe(newer);

    const observed: ResourceBrowserProjectionEvent[] = [];
    bootstrap.subscribe((event) => observed.push(event));
    expect(observed).toEqual([{ sequence: 1, projection: newer }]);
    bootstrap.dispose();
  });
});

function fixtureProjection(): ResourceBrowserProjection {
  return {
    identity: {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'resource-view-1',
      viewInstanceId: 'view-instance-1',
      rendererSessionId: 'endpoint-1',
    },
    source: 'files',
    query: '',
    items: [],
  };
}
