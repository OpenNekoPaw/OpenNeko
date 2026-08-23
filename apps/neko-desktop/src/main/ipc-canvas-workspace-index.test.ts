import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RESOURCE_BROWSER_ROUTES,
  type ResourceBrowserIntentRequest,
} from '@neko/assets-domain/resource-browser/contract';
import { DESKTOP_CANVAS_CHANNELS } from '../shared/canvas-bridge-contract';
import { DESKTOP_RESOURCE_BROWSER_CHANNELS } from '../shared/resource-browser-bridge-contract';

const electron = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload: unknown) => unknown>(),
  removeHandler: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (event: unknown, payload: unknown) => unknown) => {
      electron.handlers.set(channel, handler);
    },
    removeHandler: electron.removeHandler,
  },
}));

import { registerDesktopIpc } from './ipc';

describe('Desktop Canvas workspace index IPC publication', () => {
  beforeEach(() => {
    electron.handlers.clear();
    electron.removeHandler.mockReset();
  });

  it('projects the AppHost invalidation only to the exact live sender', async () => {
    const request = canvasCreateRequest();
    const executeResourceBrowser = vi.fn(
      async (
        _sender: unknown,
        _payload: unknown,
        publish: (event: { readonly workspaceId: string }) => void,
      ) => {
        publish({ workspaceId: request.identity.workspaceId });
        return { requestId: request.requestId, identity: request.identity, status: 'completed' };
      },
    );
    registerDesktopIpc({ executeResourceBrowser } as never, requiredOptions());
    const handler = electron.handlers.get(DESKTOP_RESOURCE_BROWSER_CHANNELS.execute);
    if (!handler) throw new Error('Resource Browser execute handler was not registered.');
    const send = vi.fn();
    const event = {
      sender: { id: 42, isDestroyed: () => false, send },
      senderFrame: { url: 'file:///desktop/index.html' },
    };

    await handler(event, request);

    expect(send).toHaveBeenCalledWith(DESKTOP_CANVAS_CHANNELS.workspaceIndexChangedEvent, {
      workspaceId: request.identity.workspaceId,
    });
  });
});

function requiredOptions() {
  return {
    selectContentWorkspace: vi.fn(),
    selectWorkspaceGrant: vi.fn(),
    saveCharacterPackage: vi.fn(),
    readCharacterPackage: vi.fn(),
    saveWorldPackage: vi.fn(),
    readWorldPackage: vi.fn(),
  };
}

function canvasCreateRequest(): ResourceBrowserIntentRequest {
  return {
    requestId: 'create-canvas-1',
    identity: {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'resource-browser-1',
      viewInstanceId: 'resource-browser-instance-1',
      rendererSessionId: 'renderer-session-1',
    },
    route: RESOURCE_BROWSER_ROUTES.createCreativeDocument,
    documentKind: 'canvas',
    entryName: 'test.nkc',
  };
}
