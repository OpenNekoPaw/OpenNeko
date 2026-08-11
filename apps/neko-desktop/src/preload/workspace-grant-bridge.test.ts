import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_WORKSPACE_GRANT_CHANNEL } from '@neko/host/desktop-workspace-grant-contract';
import { PROJECT_AUTHORING_HOST_CHANNEL } from '@neko/project/contracts';
import {
  CHARACTER_AUTHORING_HOST_CHANNEL,
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import { WORLD_AUTHORING_HOST_CHANNEL } from '@neko/world/contracts';
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

  it('creates Content targets and selects configured authoring libraries through closed operations', async () => {
    electron.invoke.mockImplementation(
      async (_channel: string, request: Record<string, unknown>) =>
        request['operation'] === 'create-content-project'
          ? {
              requestId: request['requestId'],
              status: 'authorized-project',
              workspaceId: 'workspace-1',
              projectId: 'content:workspace-1',
              grant: {
                workspaceGrantId: 'grant-content',
                windowId: 'window-1',
                label: 'Novel',
              },
            }
          : {
              requestId: request['requestId'],
              status: 'authorized',
              workspaceId: 'library-worlds',
              grant: {
                workspaceGrantId: 'grant-worlds',
                windowId: 'window-1',
                label: 'Worlds',
              },
            },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await expect(bridge.workspaceGrants.createContentProject('window-1')).resolves.toMatchObject({
      status: 'authorized-project',
      projectId: 'content:workspace-1',
    });
    await expect(
      bridge.workspaceGrants.selectAuthoringLibrary('window-1', 'world'),
    ).resolves.toMatchObject({ status: 'authorized', workspaceId: 'library-worlds' });
    expect(electron.invoke.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ operation: 'create-content-project' }),
      expect.objectContaining({ operation: 'select-authoring-library', library: 'world' }),
    ]);
  });

  it('requests Project authoring navigation with exact opaque authority only', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: Record<string, unknown>) => {
        expect(channel).toBe(PROJECT_AUTHORING_HOST_CHANNEL);
        expect(request).toMatchObject({
          operation: 'navigation-get',
          rendererSessionId: 'application-1:window-1:1',
          windowId: 'window-1',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'workspace-grant:1',
          contentProjectId: 'project-1',
        });
        expect(request).not.toHaveProperty('path');
        return {
          requestId: request['requestId'],
          workspaceId: 'workspace-1',
          contentProjectId: 'project-1',
          navigation: [
            {
              kind: 'authoring-target',
              target: { kind: 'content-project', contentProjectId: 'project-1' },
              identity: 'content-project:project-1',
              label: 'Demo',
            },
          ],
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await expect(
      bridge.projectAuthoring.getNavigation('window-1', {
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant:1',
        contentProjectId: 'project-1',
      }),
    ).resolves.toMatchObject({ navigation: [{ identity: 'content-project:project-1' }] });
  });

  it('binds Character Studio reads and commands to the exact project-local target', async () => {
    const binding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant:1',
      contentProjectId: 'project-1',
      characterProjectId: 'character-1',
    };
    electron.invoke.mockImplementation(
      async (channel: string, request: Record<string, unknown>) => {
        expect(channel).toBe(CHARACTER_AUTHORING_HOST_CHANNEL);
        expect(request).toMatchObject({
          rendererSessionId: 'application-1:window-1:1',
          windowId: 'window-1',
          ...binding,
        });
        expect(request).not.toHaveProperty('path');
        return {
          requestId: request['requestId'],
          ...binding,
          snapshot: { project: characterProject(), versions: [], diagnostics: [] },
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await expect(bridge.characterAuthoring.getSnapshot('window-1', binding)).resolves.toMatchObject(
      {
        project: { characterProjectId: 'character-1' },
      },
    );
    await expect(
      bridge.characterAuthoring.execute('window-1', binding, {
        operation: 'character-project-set-review',
        input: { characterProjectId: 'character-1', reviewStatus: 'ready' },
      }),
    ).resolves.toMatchObject({ project: { characterProjectId: 'character-1' } });
    expect(electron.invoke.mock.calls[1]?.[1]).toMatchObject({
      operation: 'character-project-set-review',
    });
  });

  it('binds World Studio reads and commands to the exact project-local target', async () => {
    const binding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant:1',
      contentProjectId: 'project-1',
      worldProjectId: 'world-1',
    };
    electron.invoke.mockImplementation(
      async (channel: string, request: Record<string, unknown>) => {
        expect(channel).toBe(WORLD_AUTHORING_HOST_CHANNEL);
        expect(request).toMatchObject({
          rendererSessionId: 'application-1:window-1:1',
          windowId: 'window-1',
          ...binding,
        });
        expect(request).not.toHaveProperty('path');
        return {
          requestId: request['requestId'],
          ...binding,
          snapshot: { project: worldProject(), versions: [], diagnostics: [] },
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await expect(bridge.worldAuthoring.getSnapshot('window-1', binding)).resolves.toMatchObject({
      project: { worldProjectId: 'world-1' },
    });
    await expect(
      bridge.worldAuthoring.execute('window-1', binding, {
        operation: 'world-project-set-review',
        input: { worldProjectId: 'world-1', reviewStatus: 'ready' },
      }),
    ).resolves.toMatchObject({ project: { worldProjectId: 'world-1' } });
    expect(electron.invoke.mock.calls[1]?.[1]).toMatchObject({
      operation: 'world-project-set-review',
    });
  });
});

function characterProject() {
  return {
    characterProjectId: 'character-1',
    displayName: 'Character',
    draft: {
      summary: 'Summary',
      backgroundStory: createEmptyCharacterBackgroundStory(),
      originSetting: createEmptyCharacterOriginSetting(),
      canon: [],
      knowledgeBoundary: [],
      behaviorPolicy: [],
      expressionPolicy: [],
      representationRefs: [],
    },
    evidence: [],
    candidates: [],
    reviewStatus: 'ready',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  };
}

function worldProject() {
  return {
    worldProjectId: 'world-1',
    title: 'World',
    draft: {
      background: 'Background',
      worldBook: [],
      locations: [],
      organizations: [],
      rules: [],
      initialFacts: [],
    },
    sourceRefs: [],
    reviewStatus: 'ready',
    createdAt: '2026-08-11T00:00:00.000Z',
    updatedAt: '2026-08-11T00:00:00.000Z',
  };
}

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
