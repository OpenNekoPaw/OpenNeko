import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_WORKSPACE_GRANT_CHANNEL } from '@neko/host/desktop-workspace-grant-contract';
import { createDefaultDesktopWorkbenchLayout } from '@neko/host/desktop-workbench-contract';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
} from '@neko/host/desktop-scene-contract';
import { createDesktopWindowComposition } from '@neko/host/desktop-window-composition-contract';

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

  it('sends only renderer-session-bound choose data and decodes an opaque grant', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: Record<string, unknown>) => {
        expect(channel).toBe(DESKTOP_WORKSPACE_GRANT_CHANNEL);
        expect(request).toMatchObject({
          operation: 'choose-directory',
          windowId: 'window-1',
          rendererSessionId: 'application-1:window-1:1',
        });
        expect(request).not.toHaveProperty('path');
        expect(request).not.toHaveProperty('hostResource');
        return {
          requestId: request['requestId'],
          status: 'authorized',
          workspaceId: 'workspace-1',
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
    await expect(bridge.workspaceGrants.chooseDirectory('window-1')).resolves.toMatchObject({
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
    await expect(bridge.workspaceGrants.chooseDirectory('window-1')).resolves.toMatchObject({
      status: 'cancelled',
    });
    electron.invoke.mockImplementationOnce(
      async (_channel: string, request: { readonly requestId: string }) => ({
        requestId: request.requestId,
        status: 'authorized',
        workspaceId: 'workspace-1',
        grant: {
          workspaceGrantId: 'workspace-grant:1',
          windowId: 'window-1',
          label: 'demo',
          path: '/Users/fixture/demo',
        },
      }),
    );
    await expect(bridge.workspaceGrants.chooseDirectory('window-1')).rejects.toThrow(
      /unknown field 'path'/,
    );
  });

  it('selects an existing Project without exposing a host path', async () => {
    electron.invoke.mockImplementation(
      async (_channel: string, request: Record<string, unknown>) => ({
        requestId: request['requestId'],
        status: 'authorized',
        workspaceId: 'workspace-1',
        grant: {
          workspaceGrantId: 'workspace-grant:project-1',
          windowId: 'window-1',
          label: 'OpenNeko',
        },
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await expect(
      bridge.workspaceGrants.selectProject('window-1', 'project-1'),
    ).resolves.toMatchObject({
      status: 'authorized',
      workspaceId: 'workspace-1',
    });
    expect(electron.invoke.mock.calls[0]?.[1]).toMatchObject({
      operation: 'select-project',
      projectId: 'project-1',
    });
  });
});

function shellProjection() {
  const scene = createDefaultDesktopAgentScene('window-1', 'assistant-space:default');
  const workbench = createDesktopWindowComposition({
    workbenchInstanceId: 'workbench:window-1:entry',
    layout: createDefaultDesktopWorkbenchLayout('window-1'),
    scene,
  });
  return {
    applicationInstanceId: 'application-1',
    rendererSessionId: 'application-1:window-1:1',
    catalog: { projects: [] },
    window: {
      windowId: 'window-1',
      activeTarget: { kind: 'home' as const },
      tabs: [],
      workbench,
      applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
    },
    agentHome: {
      conversations: [],
      attention: { needsInput: 0, needsReview: 0, running: 0 },
    },
    conversationNavigation: {
      recentProjectIds: [],
      groups: [],
    },
    domains: [],
  };
}
