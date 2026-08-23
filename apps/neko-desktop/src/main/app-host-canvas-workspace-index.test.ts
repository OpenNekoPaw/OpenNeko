import {
  RESOURCE_BROWSER_ROUTES,
  type ResourceBrowserIdentity,
  type ResourceBrowserProjection,
} from '@neko/assets-domain/resource-browser/contract';
import { describe, expect, it, vi } from 'vitest';
import { DesktopAppHost } from './app-host';
import type { DesktopSenderIdentity } from './window-registry';

const identity: ResourceBrowserIdentity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'resource-browser-1',
  viewInstanceId: 'resource-browser-instance-1',
  rendererSessionId: 'renderer-session-1',
};

const projection: ResourceBrowserProjection = {
  identity,
  source: 'files',
  query: '',
  items: [],
};

describe('Desktop AppHost Canvas workspace index publication', () => {
  it('publishes only after a successful Canvas document creation', async () => {
    const execute = vi.fn(async () => projection);
    const host = createHost(execute);
    const publish = vi.fn();

    await executeResourceBrowser(host, canvasCreateRequest(), publish);

    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith({ workspaceId: identity.workspaceId });

    await executeResourceBrowser(
      host,
      {
        ...canvasCreateRequest(),
        requestId: 'create-cut-1',
        documentKind: 'cut',
        entryName: 'story.otio',
      },
      publish,
    );
    await executeResourceBrowser(
      host,
      {
        requestId: 'create-file-1',
        identity,
        route: RESOURCE_BROWSER_ROUTES.createFile,
        entryName: 'notes.md',
      },
      publish,
    );

    expect(publish).toHaveBeenCalledOnce();
  });

  it('does not publish when Canvas creation fails', async () => {
    const host = createHost(vi.fn(async () => Promise.reject(new Error('create failed'))));
    const publish = vi.fn();

    await expect(executeResourceBrowser(host, canvasCreateRequest(), publish)).rejects.toThrow(
      'create failed',
    );
    expect(publish).not.toHaveBeenCalled();
  });
});

function createHost(
  execute: (windowId: string, request: unknown) => Promise<ResourceBrowserProjection>,
): object {
  return Object.assign(Object.create(DesktopAppHost.prototype), {
    disposed: false,
    windows: { resolveSender: () => ({ windowId: identity.windowId }) },
    resourceBrowser: { execute },
  });
}

function canvasCreateRequest() {
  return {
    requestId: 'create-canvas-1',
    identity,
    route: RESOURCE_BROWSER_ROUTES.createCreativeDocument,
    documentKind: 'canvas' as const,
    entryName: 'test.nkc',
  };
}

async function executeResourceBrowser(
  host: object,
  request: ReturnType<typeof canvasCreateRequest> | Record<string, unknown>,
  publish: (event: { readonly workspaceId: string }) => void,
): Promise<unknown> {
  const sender: DesktopSenderIdentity = {
    webContentsId: 7,
    frameUrl: 'openneko://desktop',
  };
  return Reflect.apply(DesktopAppHost.prototype.executeResourceBrowser, host, [
    sender,
    request,
    publish,
  ]);
}
