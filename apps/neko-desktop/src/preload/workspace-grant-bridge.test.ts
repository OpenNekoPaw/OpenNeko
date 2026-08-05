import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_WORKSPACE_GRANT_CHANNEL } from '@neko/host/desktop-workspace-grant-contract';
import { createDefaultDesktopWorkbenchLayout } from '@neko/host/desktop-workbench-contract';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
} from '@neko/host/desktop-scene-contract';
import {
  createDesktopWorkbenchInstanceFromScene,
  parseDesktopWindowWorkbenchCatalog,
} from '@neko/host/desktop-workbench-instance-contract';

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
        requestId: request.requestId,
        application: {
          applicationId: 'neko-desktop',
          instanceId: 'application-1',
        },
        window: { windowId: 'window-1', rendererSessionId: 'renderer-session-1' },
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
          windowId: 'window-1',
          expectedWindowRevision: 0,
          rendererSessionId: 'application-1:window-1:1',
        });
        expect(request).not.toHaveProperty('path');
        expect(request).not.toHaveProperty('hostResource');
        return {
          requestId: request['requestId'],
          status: 'authorized',
          grant: {
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
        requestId: request.requestId,
        status: 'cancelled',
      }),
    );
    await expect(bridge.workspaceGrants.choose('window-1', 0)).resolves.toMatchObject({
      status: 'cancelled',
    });
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        requestId: request.requestId,
        status: 'authorized',
        grant: {
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
  const scene = createDefaultDesktopAgentScene('window-1', 'assistant-space:default');
  const workbench = createDesktopWorkbenchInstanceFromScene({
    workbenchInstanceId: 'workbench:window-1:entry',
    agentSurfaceId: 'agent-surface:window-1:entry',
    layout: createDefaultDesktopWorkbenchLayout('window-1'),
    scene,
  });
  return {
    applicationInstanceId: 'application-1',
    rendererSessionId: 'application-1:window-1:1',
    catalog: { revision: 0, projects: [] },
    window: {
      windowId: 'window-1',
      revision: 0,
      activeTarget: { kind: 'home' as const },
      tabs: [],
      workbenches: parseDesktopWindowWorkbenchCatalog({
        windowId: 'window-1',
        activeWorkbenchInstanceId: workbench.workbenchInstanceId,
        instances: [workbench],
      }),
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome: {
      revision: 0,
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    },
    conversationNavigation: {
      projectCatalogRevision: 0,
      agentHomeRevision: 0,
      groups: [],
    },
    domains: [],
  };
}
