import { describe, expect, it, vi } from 'vitest';
import {
  RESOURCE_BROWSER_CONTRACT_VERSION,
  type ResourceBrowserIdentity,
  type ResourceBrowserProjection,
} from 'neko-assets/resource-browser/contract';
import type { OpenNekoDesktopResourceBrowserBridge } from '../shared/resource-browser-bridge-contract';
import { createElectronResourceBrowserHostRuntime } from './desktop-resource-browser-host-runtime';

const identity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser:view-1',
  viewEpoch: 1,
  endpointEpoch: 'endpoint-1',
};
const projection: ResourceBrowserProjection = {
  schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
  identity,
  revision: 0,
  facet: 'media',
  query: '',
  items: [],
};

describe('Electron Resource Browser Host runtime', () => {
  it('builds snapshot requests and filters foreign events', async () => {
    let publish:
      | Parameters<OpenNekoDesktopResourceBrowserBridge['resources']['subscribe']>[0]
      | undefined;
    const bridge: OpenNekoDesktopResourceBrowserBridge = {
      resources: {
        getSnapshot: vi.fn(async () => projection),
        children: vi.fn(async () => projection),
        resolveThumbnail: vi.fn(async (request) => ({
          schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
          requestId: request.requestId,
          identity: request.identity,
          resourceId: request.resourceId,
          descriptorId: request.descriptorId,
          revision: request.revision,
          dataUrl: 'data:image/png;base64,aW1hZ2U=',
        })),
        search: vi.fn(async () => projection),
        execute: vi.fn(async () => projection),
        subscribe: vi.fn((listener) => {
          publish = listener;
          return () => undefined;
        }),
      },
    };
    const runtime = createElectronResourceBrowserHostRuntime({ bridge, identity });
    const listener = vi.fn();
    runtime.subscribe(listener);

    await runtime.getSnapshot();
    await runtime.children({
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      requestId: 'children-1',
      identity,
      route: 'children',
      facet: 'media',
      parentResourceId: 'content:library',
      limit: 100,
    });
    publish?.({
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      sequence: 1,
      projection: { ...projection, identity: { ...identity, viewEpoch: 2 } },
    });
    publish?.({
      schemaVersion: RESOURCE_BROWSER_CONTRACT_VERSION,
      sequence: 1,
      projection,
    });

    expect(bridge.resources.getSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'snapshot.get',
        identity,
      }),
    );
    expect(bridge.resources.children).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'children',
        parentResourceId: 'content:library',
      }),
    );
    expect(listener).toHaveBeenCalledOnce();
  });
});
