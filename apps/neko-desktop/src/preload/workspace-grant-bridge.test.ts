import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_WORKSPACE_GRANT_CHANNEL } from '@neko/host/desktop-workspace-grant-contract';
import { DESKTOP_SHELL_CONTRACT_VERSION } from '@neko/host/desktop-shell-contract';
import { createDefaultDesktopWorkbenchLayout } from '@neko/host/desktop-workbench-contract';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
} from '@neko/host/desktop-scene-contract';

const electron = vi.hoisted(() => ({
  bridge: undefined as typeof window.openNekoDesktop | undefined,
  invoke: vi.fn(),
  on: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, bridge: typeof window.openNekoDesktop) => {
      electron.bridge = bridge;
    },
  },
  ipcRenderer: {
    invoke: electron.invoke,
    on: electron.on,
    removeListener: vi.fn(),
  },
}));

await import('./index');

describe('Desktop Workspace grant preload bridge', () => {
  beforeEach(async () => {
    electron.invoke.mockReset();
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        schemaVersion: 1,
        requestId: request.requestId,
        application: {
          schemaVersion: 1,
          applicationId: 'neko-desktop',
          instanceId: 'application-1',
          version: '0.0.1',
        },
        window: { windowId: 'window-1', rendererEpoch: 1 },
        host: { id: 'electron', kind: 'electron', ui: 'graphical' },
        runtime: { platform: 'darwin' },
        status: 'foundation-ready',
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await bridge.bootstrap.get();
    electron.invoke.mockReset();
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
        requestId: request.requestId,
        projection: shellProjection(),
      }),
    );
    await bridge.shell.getSnapshot();
    electron.invoke.mockReset();
  });

  it('sends only revision-fenced choose data and decodes an opaque grant', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: Record<string, unknown>) => {
        expect(channel).toBe(DESKTOP_WORKSPACE_GRANT_CHANNEL);
        expect(request).toMatchObject({
          schemaVersion: 1,
          windowId: 'window-1',
          expectedWindowRevision: 0,
          expectedEndpointEpoch: 'application-1:window-1:1',
        });
        expect(request).not.toHaveProperty('path');
        expect(request).not.toHaveProperty('hostResource');
        return {
          schemaVersion: 1,
          requestId: request['requestId'],
          status: 'authorized',
          grant: {
            schemaVersion: 1,
            workspaceGrantId: 'workspace-grant:1',
            windowId: 'window-1',
            label: 'demo',
          },
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await expect(bridge.workspaceGrants.choose('window-1', 0)).resolves.toMatchObject({
      status: 'authorized',
      grant: { workspaceGrantId: 'workspace-grant:1', label: 'demo' },
    });
  });

  it('preserves cancellation and rejects a raw path injected by Main', async () => {
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        schemaVersion: 1,
        requestId: request.requestId,
        status: 'cancelled',
      }),
    );
    await expect(bridge.workspaceGrants.choose('window-1', 0)).resolves.toMatchObject({
      status: 'cancelled',
    });
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        schemaVersion: 1,
        requestId: request.requestId,
        status: 'authorized',
        grant: {
          schemaVersion: 1,
          workspaceGrantId: 'workspace-grant:1',
          windowId: 'window-1',
          label: 'demo',
          path: '/Users/fixture/demo',
        },
      }),
    );
    await expect(bridge.workspaceGrants.choose('window-1', 0)).rejects.toThrow(
      /unknown field 'path'/,
    );
  });
});

function shellProjection() {
  return {
    schemaVersion: DESKTOP_SHELL_CONTRACT_VERSION,
    applicationInstanceId: 'application-1',
    endpointEpoch: 'application-1:window-1:1',
    projectionRevision: 0,
    catalog: { revision: 0, projects: [] },
    window: {
      windowId: 'window-1',
      revision: 0,
      activeTarget: { kind: 'home' as const },
      tabs: [],
      workbench: createDefaultDesktopWorkbenchLayout('window-1'),
      scene: createDefaultDesktopAgentScene('window-1', 'assistant-space:default'),
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome: {
      revision: 0,
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    },
    domains: [],
  };
}
