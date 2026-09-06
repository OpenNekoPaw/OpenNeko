import { describe, expect, it, vi } from 'vitest';
import {
  createResourceBrowserSearchRequest,
  type ResourceBrowserIdentity,
  type ResourceBrowserRequest,
} from '@neko/assets-domain/resource-browser/contract';
import { createDefaultDesktopWorkbenchLayout } from '@neko/host/desktop-workbench-contract';
import type { DesktopShellProjection } from '@neko/host/desktop-shell-contract';
import { executeDesktopWorkspaceQuickCreation } from '../renderer/desktop-workspace-quick-creation';
import { DESKTOP_RESOURCE_BROWSER_CHANNELS } from '../shared/resource-browser-bridge-contract';

const electron = vi.hoisted(() => ({
  bridge: undefined as typeof window.openNekoDesktop | undefined,
  invoke: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, bridge: typeof window.openNekoDesktop) => {
      electron.bridge = bridge;
    },
  },
  ipcRenderer: { invoke: electron.invoke, on: vi.fn(), removeListener: vi.fn() },
}));

await import('./index');

function workspaceIdentity(id: string): ResourceBrowserIdentity {
  return {
    projectId: `project-${id}`,
    workspaceId: `workspace-${id}`,
    windowId: 'window-1',
    viewId: `resource-browser:project-view-${id}`,
    viewInstanceId: `view-instance-${id}`,
    rendererSessionId: 'renderer-1',
  };
}

function quickCreation(identity: ResourceBrowserIdentity) {
  const bridge = electron.bridge;
  if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
  const shell = {} as DesktopShellProjection;
  return executeDesktopWorkspaceQuickCreation(
    {
      requestId: `create:${identity.workspaceId}`,
      identity,
      workbenchInstanceId: 'workbench-1',
      workbench: createDefaultDesktopWorkbenchLayout('window-1'),
      mainGroupId: 'main:primary',
      kind: 'canvas',
      name: 'Board',
    },
    {
      getResourceSnapshot: bridge.resources.getSnapshot,
      search: bridge.resources.search,
      execute: bridge.resources.execute,
      updateWorkbench: async () => {
        throw new Error('Unexpected Workbench update.');
      },
      getShellSnapshot: async () => shell,
    },
  );
}

describe('Workspace quick creation through the owner-bound preload bridge', () => {
  it('initializes a fresh binding and rebinds the exact next Workspace without a Resources UI', async () => {
    electron.invoke.mockReset();
    electron.invoke.mockImplementation(async (channel: string, request: ResourceBrowserRequest) => {
      const projection = { identity: request.identity, source: 'files', query: '', items: [] };
      if (
        channel === DESKTOP_RESOURCE_BROWSER_CHANNELS.snapshotGet ||
        channel === DESKTOP_RESOURCE_BROWSER_CHANNELS.search
      )
        return projection;
      if (channel === DESKTOP_RESOURCE_BROWSER_CHANNELS.execute)
        return {
          requestId: request.requestId,
          identity: request.identity,
          status: 'completed',
          projection,
        };
      throw new Error(`Unexpected IPC channel '${channel}'.`);
    });
    for (const id of ['first', 'second', 'first']) {
      const identity = workspaceIdentity(id);
      electron.invoke.mockClear();
      await expect(quickCreation(identity)).resolves.toMatchObject({
        createdDocumentId: 'Board.nkc',
      });
      expect(electron.invoke.mock.calls.map(([channel]) => channel)).toEqual([
        DESKTOP_RESOURCE_BROWSER_CHANNELS.snapshotGet,
        DESKTOP_RESOURCE_BROWSER_CHANNELS.search,
        DESKTOP_RESOURCE_BROWSER_CHANNELS.execute,
      ]);
      for (const [, request] of electron.invoke.mock.calls)
        expect(request.identity).toEqual(identity);
    }
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    electron.invoke.mockClear();
    await expect(
      bridge.resources.search(
        createResourceBrowserSearchRequest({
          requestId: 'stale',
          identity: workspaceIdentity('second'),
          source: 'files',
          query: '',
        }),
      ),
    ).rejects.toThrow('current owner-bound snapshot');
    expect(electron.invoke).not.toHaveBeenCalled();
  });

  it.each(['denied', 'wrong-owner'])(
    'does not search or write after a %s snapshot',
    async (failure) => {
      electron.invoke.mockReset();
      electron.invoke.mockImplementation(async () => {
        if (failure === 'denied') throw new Error('Workspace access denied.');
        return { identity: workspaceIdentity('other'), source: 'files', query: '', items: [] };
      });
      await expect(quickCreation(workspaceIdentity('target'))).rejects.toThrow(
        failure === 'denied' ? 'Workspace access denied' : 'snapshot owner identity does not match',
      );
      expect(electron.invoke.mock.calls.map(([channel]) => channel)).toEqual([
        DESKTOP_RESOURCE_BROWSER_CHANNELS.snapshotGet,
      ]);
    },
  );
});
