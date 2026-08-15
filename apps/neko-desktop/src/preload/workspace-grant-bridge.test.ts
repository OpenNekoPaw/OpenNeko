import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_WORKSPACE_GRANT_CHANNEL } from '@neko/host/desktop-workspace-grant-contract';
import { PROJECT_AUTHORING_HOST_CHANNEL } from '@neko/project/contracts';
import {
  CHARACTER_AUTHORING_HOST_CHANNEL,
  createEmptyCharacterBackgroundStory,
  createEmptyCharacterOriginSetting,
} from '@neko/chara/contracts';
import {
  WORLD_AUTHORING_HOST_CHANNEL,
  WORLD_PORTABLE_HOST_CHANNELS,
  WORLD_RUNTIME_HOST_CHANNEL,
  type WorldPortableHostBinding,
  type WorldRuntimeBinding,
} from '@neko/world/contracts';
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

  it('creates Content targets through one closed Host operation', async () => {
    electron.invoke.mockImplementation(
      async (_channel: string, request: Record<string, unknown>) => ({
        requestId: request['requestId'],
        status: 'authorized-project',
        workspaceId: 'workspace-1',
        projectId: 'content:workspace-1',
        grant: {
          workspaceGrantId: 'grant-content',
          windowId: 'window-1',
          label: 'Novel',
        },
      }),
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await expect(bridge.workspaceGrants.createContentProject('window-1')).resolves.toMatchObject({
      status: 'authorized-project',
      projectId: 'content:workspace-1',
    });
    expect(electron.invoke.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({ operation: 'create-content-project' }),
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
          projectId: 'project-1',
        });
        expect(request).not.toHaveProperty('path');
        return {
          requestId: request['requestId'],
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          navigation: [
            {
              kind: 'authoring-target',
              target: { kind: 'content-document', documentId: 'document-1' },
              identity: 'content-document:document-1',
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
        projectId: 'project-1',
      }),
    ).resolves.toMatchObject({ navigation: [{ identity: 'content-document:document-1' }] });
  });

  it('requests the aggregate Project authoring catalog without minting Renderer grants', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: Record<string, unknown>) => {
        expect(channel).toBe(PROJECT_AUTHORING_HOST_CHANNEL);
        expect(request).toEqual(
          expect.objectContaining({
            operation: 'catalog-get',
            rendererSessionId: 'application-1:window-1:1',
            windowId: 'window-1',
          }),
        );
        expect(request).not.toHaveProperty('workspaceGrantId');
        expect(request).not.toHaveProperty('path');
        return { requestId: request['requestId'], projects: [], diagnostics: [] };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await expect(bridge.projectAuthoring.getCatalog('window-1')).resolves.toEqual(
      expect.objectContaining({ projects: [], diagnostics: [] }),
    );
  });

  it('requests Project Content through the same exact Project authority', async () => {
    electron.invoke.mockImplementation(
      async (channel: string, request: Record<string, unknown>) => {
        expect(channel).toBe(PROJECT_AUTHORING_HOST_CHANNEL);
        expect(request).toMatchObject({
          operation: 'content-get',
          rendererSessionId: 'application-1:window-1:1',
          windowId: 'window-1',
          workspaceId: 'workspace-1',
          workspaceGrantId: 'workspace-grant:1',
          projectId: 'project-1',
        });
        expect(request).not.toHaveProperty('path');
        return {
          requestId: request['requestId'],
          workspaceId: 'workspace-1',
          projectId: 'project-1',
          projection: {
            projectId: 'project-1',
            characters: [],
            worlds: [],
            elements: [],
            candidates: [],
            diagnostics: [],
          },
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await expect(
      bridge.projectAuthoring.getContent('window-1', {
        workspaceId: 'workspace-1',
        workspaceGrantId: 'workspace-grant:1',
        projectId: 'project-1',
      }),
    ).resolves.toMatchObject({ projection: { projectId: 'project-1' } });
  });

  it('round-trips the Creative Workspace projection without publication planning', async () => {
    const binding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant:1',
      projectId: 'project-1',
    };
    electron.invoke.mockImplementation(
      async (channel: string, request: Record<string, unknown>) => {
        expect(channel).toBe(PROJECT_AUTHORING_HOST_CHANNEL);
        expect(request).not.toHaveProperty('path');
        expect(['creative-workspace-get', 'creative-workspace-reference-mutate']).toContain(
          request['operation'],
        );
        return {
          requestId: request['requestId'],
          ...binding,
          projection: {
            composition: {
              projectId: binding.projectId,
              content: [],
              characters: [],
              worlds: [],
              globalCharacters: [],
              globalWorlds: [],
              availableGlobalCharacters: [],
              availableGlobalWorlds: [],
              diagnostics: [],
            },
          },
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');
    await expect(
      bridge.projectAuthoring.getCreativeWorkspace('window-1', binding),
    ).resolves.toMatchObject({ projection: { composition: { projectId: binding.projectId } } });
    await expect(
      bridge.projectAuthoring.mutateCreativeWorkspaceReference('window-1', binding, {
        kind: 'remove',
        reference: {
          kind: 'world-version',
          globalWorldId: 'global-world-1',
          worldVersionId: 'world-version-1',
        },
      }),
    ).resolves.toMatchObject({ projection: { composition: { projectId: binding.projectId } } });
    expect(electron.invoke).toHaveBeenLastCalledWith(
      PROJECT_AUTHORING_HOST_CHANNEL,
      expect.objectContaining({
        operation: 'creative-workspace-reference-mutate',
        mutation: expect.objectContaining({ kind: 'remove' }),
      }),
    );
  });

  it('binds Character Studio reads and commands to the exact project-local target', async () => {
    const binding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant:1',
      authority: { kind: 'project' as const, projectId: 'project-1' },
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
          snapshot: {
            project: characterProject(),
            versions: [],
            authoringTestSnapshots: [],
            storylines: [],
            storylineDrafts: [],
            storylineVersions: [],
            lineage: null,
            referenceInventories: [],
            diagnostics: [],
          },
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
      authority: { kind: 'project' as const, projectId: 'project-1' },
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

  it('binds World portable operations without exposing paths or archive bytes', async () => {
    const binding: WorldPortableHostBinding = {
      workspaceId: 'workspace-1',
      workspaceGrantId: 'workspace-grant:1',
      authority: { kind: 'project', projectId: 'project-1' },
    };
    electron.invoke.mockImplementation(
      async (channel: string, request: Record<string, unknown>) => {
        expect(Object.values(WORLD_PORTABLE_HOST_CHANNELS)).toContain(channel);
        expect(request).toMatchObject({
          rendererSessionId: 'application-1:window-1:1',
          windowId: 'window-1',
        });
        if (request['operation'] === 'export') expect(request).toMatchObject({ binding });
        expect(request).not.toHaveProperty('path');
        expect(request).not.toHaveProperty('archiveBytes');
        return {
          requestId: request['requestId'],
          status: 'completed',
          result:
            request['operation'] === 'export'
              ? {
                  kind: 'export-completed',
                  worldProjectId: 'world-1',
                  worldVersionId: 'version-1',
                  archiveByteLength: 3,
                }
              : {
                  kind: 'import-completed',
                  worldProjectId: 'world-1',
                  worldVersionId: 'version-1',
                },
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await bridge.worldPortable.exportPackage('window-1', binding, {
      worldProjectId: 'world-1',
      worldVersionId: 'version-1',
      embeddedResourceIds: [],
    });
    await bridge.worldPortable.importPackage('window-1', {
      kind: 'new',
      globalWorldId: 'global-world-1',
    });
  });

  it('binds World Runtime launch, reattach and action to one sender-scoped authority', async () => {
    const binding: WorldRuntimeBinding = {
      worldProjectId: 'world-1',
      worldVersionId: 'world-version-1',
      worldRunId: 'world-run-1',
      worldSaveId: 'world-save-1',
      branchId: 'branch-main',
      participantId: 'participant-1',
      actorId: 'actor-1',
    };
    electron.invoke.mockImplementation(
      async (channel: string, request: Record<string, unknown>) => {
        expect(channel).toBe(WORLD_RUNTIME_HOST_CHANNEL);
        expect(request).toMatchObject({
          rendererSessionId: 'application-1:window-1:1',
          windowId: 'window-1',
        });
        expect(request).not.toHaveProperty('path');
        return {
          requestId: request['requestId'],
          projection: runtimeProjection(binding),
        };
      },
    );
    const bridge = electron.bridge;
    if (!bridge) throw new Error('Desktop preload bridge was not exposed.');

    await bridge.worldRuntime.launch('window-1', { ...binding, saveLabel: 'First run' });
    await bridge.worldRuntime.getSnapshot('window-1', binding);
    await bridge.worldRuntime.submitAction('window-1', binding, {
      worldActionIntentId: 'intent-1',
      worldRunId: binding.worldRunId,
      worldSaveId: binding.worldSaveId,
      branchId: binding.branchId,
      actorId: 'actor-1',
      action: 'world.foundation.fact.set',
      parameters: {},
      observedTimepoint: 0,
      expectedWorldStateRevision: 0,
      createdAt: '2026-08-14T00:00:00.000Z',
    });
    expect(electron.invoke.mock.calls.map((call) => call[1])).toEqual([
      expect.objectContaining({
        operation: 'runtime-launch',
        launch: { ...binding, saveLabel: 'First run' },
      }),
      expect.objectContaining({ operation: 'runtime-snapshot-get', binding }),
      expect.objectContaining({ operation: 'runtime-action-submit', binding }),
    ]);
  });
});

function runtimeProjection(binding: WorldRuntimeBinding) {
  return {
    binding,
    status: 'ready' as const,
    background: 'Archive City',
    locations: [],
    facts: [],
    availableActions: ['world.foundation.fact.set'],
    participants: [{ participantId: binding.participantId, actorId: 'actor-1' }],
    worldStateRevision: 0,
    timepoint: 0,
    branches: [{ branchId: binding.branchId, active: true, eventCount: 0 }],
    timeline: [],
    diagnostics: [],
  };
}

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
