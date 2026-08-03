import { describe, expect, it } from 'vitest';
import {
  createEmptyDesktopShellState,
  DESKTOP_DEFAULT_ASSISTANT_SPACE_ID,
  DESKTOP_SHELL_STATE_VERSION,
  DesktopShellStateError,
  parseDesktopShellStoredState,
  type DesktopShellStoredState,
} from './desktop-shell-state';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
} from './desktop-scene-contract';
import { createDefaultDesktopWorkbenchLayout } from './desktop-workbench-contract';
import { createInMemoryDesktopShellStateRepository } from './testing/in-memory-desktop-shell-state-repository';

describe('Desktop Shell state codec', () => {
  it('validates state commits and rejects stale revisions through the repository contract', async () => {
    const first = createInMemoryDesktopShellStateRepository();
    const initial = await first.read();
    const committed = await first.commit(0, withPrimaryWindow(initial, 'window-1'));

    await expect(first.commit(0, withPrimaryWindow(initial, 'window-2'))).rejects.toMatchObject({
      code: 'desktop-shell-stale-storage-revision',
    });
    expect((await first.read()).primaryWindowId).toBe('window-1');
    expect(committed.storageRevision).toBe(1);
  });

  it('fails visibly for a Project Tab whose Project is absent', () => {
    const initial = createEmptyDesktopShellState();
    const invalid: DesktopShellStoredState = {
      ...initial,
      storageRevision: 1,
      primaryWindowId: 'window-1',
      windows: [
        {
          windowId: 'window-1',
          revision: 1,
          activeTarget: { kind: 'project', tabId: 'tab-1' },
          tabs: [
            {
              tabId: 'tab-1',
              projectId: 'missing-project',
              viewId: 'view-1',
              viewEpoch: 1,
            },
          ],
          workbench: createDefaultDesktopWorkbenchLayout('window-1'),
          scene: createDefaultDesktopAgentScene('window-1', DESKTOP_DEFAULT_ASSISTANT_SPACE_ID),
          applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
        },
      ],
    };

    expect(() => parseDesktopShellStoredState(invalid)).toThrow(DesktopShellStateError);
  });

  it('migrates the version 1 Window state by adding a default Workbench layout', async () => {
    const content = JSON.stringify({
      schemaVersion: 1,
      storageRevision: 0,
      catalogRevision: 0,
      primaryWindowId: 'window-1',
      projects: [],
      windows: [
        {
          windowId: 'window-1',
          revision: 0,
          activeTarget: { kind: 'home' },
          tabs: [],
        },
      ],
    });
    const migrated = parseDesktopShellStoredState(JSON.parse(content));

    expect(migrated.schemaVersion).toBe(DESKTOP_SHELL_STATE_VERSION);
    expect(migrated.windows[0]?.workbench).toEqual(createDefaultDesktopWorkbenchLayout('window-1'));
    expect({ ...migrated, storageRevision: 1 }).toMatchObject({
      schemaVersion: DESKTOP_SHELL_STATE_VERSION,
      windows: [
        {
          scene: { context: { kind: 'agent', scope: { kind: 'assistant' } } },
          applicationSidebar: { visible: true, width: 240 },
          workbench: { schemaVersion: 4, display: { mode: 'chat-only' } },
        },
      ],
    });
  });

  it('migrates the version 2 single-Main Workbench into explicit View Groups', async () => {
    const content = JSON.stringify({
      schemaVersion: 2,
      storageRevision: 0,
      catalogRevision: 0,
      primaryWindowId: 'window-1',
      projects: [],
      windows: [
        {
          windowId: 'window-1',
          revision: 0,
          activeTarget: { kind: 'home' },
          tabs: [],
          workbench: {
            schemaVersion: 1,
            windowId: 'window-1',
            revision: 4,
            preset: 'canvas-cut',
            primarySidebar: { visible: true, width: 240 },
            resourceDock: { presentation: 'hidden', position: 'right', width: 320 },
            agent: {
              presentation: 'dock',
              dockPresentation: 'docked',
              dockPosition: 'left',
              width: 360,
            },
            main: {
              views: [
                {
                  viewId: 'canvas-1',
                  viewEpoch: 1,
                  projectId: 'project-1',
                  workspaceId: 'workspace-1',
                  kind: 'canvas',
                  ownerId: 'canvas-1',
                  documentId: 'boards/main.nkc',
                },
                {
                  viewId: 'cut-1',
                  viewEpoch: 1,
                  projectId: 'project-1',
                  workspaceId: 'workspace-1',
                  kind: 'cut',
                  ownerId: 'cut-1',
                  documentId: 'cuts/main.otio',
                },
              ],
              activeViewId: 'canvas-1',
              sideViewId: 'cut-1',
              split: 'vertical',
            },
            timeline: { visible: true, height: 240 },
          },
        },
      ],
    });
    const migrated = parseDesktopShellStoredState(JSON.parse(content));

    expect(migrated).toMatchObject({
      schemaVersion: DESKTOP_SHELL_STATE_VERSION,
      windows: [
        {
          workbench: {
            schemaVersion: 4,
            display: { mode: 'chat-main', chatPosition: 'left' },
            main: {
              groups: [
                { viewIds: ['canvas-1'], activeViewId: 'canvas-1' },
                { viewIds: ['cut-1'], activeViewId: 'cut-1' },
              ],
              split: { axis: 'rows', ratio: 0.5 },
            },
            timeline: { presentation: 'docked', ownerViewId: 'cut-1' },
          },
        },
      ],
    });
  });

  it('migrates version 3 Resource Browser Main Views into the right Dock', async () => {
    const content = JSON.stringify({
      schemaVersion: 3,
      storageRevision: 0,
      catalogRevision: 0,
      primaryWindowId: 'window-1',
      projects: [],
      windows: [
        {
          windowId: 'window-1',
          revision: 0,
          activeTarget: { kind: 'home' },
          tabs: [],
          workbench: {
            schemaVersion: 2,
            windowId: 'window-1',
            revision: 9,
            primarySidebar: { visible: true, width: 240 },
            resourceDock: { presentation: 'hidden', position: 'left', width: 416 },
            display: { mode: 'main-only', chatPosition: 'right', chatWidth: 360 },
            main: {
              views: [
                {
                  viewId: 'resources-1',
                  viewEpoch: 1,
                  projectId: 'project-1',
                  workspaceId: 'workspace-1',
                  kind: 'resource-browser',
                  ownerId: 'assets:project-1',
                  displayLabel: 'Resources',
                },
              ],
              groups: [
                {
                  groupId: 'main:primary',
                  viewIds: ['resources-1'],
                  activeViewId: 'resources-1',
                },
              ],
              activeGroupId: 'main:primary',
            },
            timeline: { presentation: 'hidden', height: 240 },
          },
        },
      ],
    });
    const migrated = parseDesktopShellStoredState(JSON.parse(content));

    expect(migrated).toMatchObject({
      schemaVersion: DESKTOP_SHELL_STATE_VERSION,
      windows: [
        {
          workbench: {
            schemaVersion: 4,
            revision: 9,
            resourceDock: { presentation: 'docked', width: 416 },
            display: { mode: 'chat-only', chatPosition: 'right' },
            main: {
              views: [],
              groups: [{ groupId: 'main:primary', viewIds: [] }],
              activeGroupId: 'main:primary',
            },
          },
        },
      ],
    });
    expect(migrated.windows[0]?.workbench.resourceDock).not.toHaveProperty('position');
  });

  it('migrates the version 4 Workbench sidebar exactly once into the Window aggregate', () => {
    const legacyWorkbench = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      schemaVersion: 3,
      primarySidebar: { visible: false, width: 312 },
    };
    const migrated = parseDesktopShellStoredState({
      schemaVersion: 4,
      storageRevision: 7,
      catalogRevision: 0,
      primaryWindowId: 'window-1',
      projects: [],
      windows: [
        {
          windowId: 'window-1',
          revision: 3,
          activeTarget: { kind: 'home' },
          tabs: [],
          workbench: legacyWorkbench,
        },
      ],
    });

    expect(migrated).toMatchObject({
      schemaVersion: DESKTOP_SHELL_STATE_VERSION,
      storageRevision: 7,
      windows: [
        {
          scene: {
            windowId: 'window-1',
            context: { kind: 'agent', scope: { kind: 'assistant' } },
          },
          applicationSidebar: {
            windowId: 'window-1',
            revision: 0,
            visible: false,
            width: 312,
          },
        },
      ],
    });
  });

  it('migrates version 5 management catalogs and Assistant resources into canonical Scene slots', () => {
    const migrated = parseDesktopShellStoredState(createVersion5RetiredSceneState());

    expect(migrated).toMatchObject({
      schemaVersion: DESKTOP_SHELL_STATE_VERSION,
      storageRevision: 894,
      windows: [
        {
          scene: {
            context: {
              kind: 'project-management',
              projectManagementSessionId: 'project-management:1',
            },
            slots: {
              main: {
                kind: 'project-management',
                projectManagementSessionId: 'project-management:1',
              },
              status: { kind: 'scene-status', sceneId: 'scene:window-1:project-management' },
            },
          },
        },
        {
          scene: {
            context: { kind: 'agent', scope: { kind: 'assistant' } },
            slots: {
              interaction: { kind: 'agent', phase: 'draft' },
              status: { kind: 'scene-status', sceneId: 'scene:window-2:agent' },
            },
          },
        },
      ],
    });
    expect(migrated.windows[0]?.scene.slots).not.toHaveProperty('leftManager');
    expect(migrated.windows[1]?.scene.slots).not.toHaveProperty('leftManager');
  });

  it('keeps retired Manager Surface kinds invalid in the current stored-state version', () => {
    expect(() =>
      parseDesktopShellStoredState({
        ...createVersion5RetiredSceneState(),
        schemaVersion: DESKTOP_SHELL_STATE_VERSION,
      }),
    ).toThrow("Unknown Manager Surface kind 'project-catalog'");
  });

  it('keeps unknown Manager Surface kinds fail-visible while migrating version 5', () => {
    expect(() =>
      parseDesktopShellStoredState(
        createVersion5RetiredManagementState({
          context: {
            kind: 'project-management',
            projectManagementSessionId: 'project-management:1',
          },
          catalog: {
            kind: 'future-catalog',
            projectManagementSessionId: 'project-management:1',
          },
          detail: {
            kind: 'project-detail',
            projectManagementSessionId: 'project-management:1',
          },
        }),
      ),
    ).toThrow("Unknown Manager Surface kind 'future-catalog'");
  });

  it.each([
    {
      label: 'Asset',
      context: { kind: 'asset-center', assetCenterSessionId: 'asset-center:1' },
      catalog: { kind: 'asset-catalog', assetCenterSessionId: 'asset-center:1' },
      management: { kind: 'asset-management', assetCenterSessionId: 'asset-center:1' },
      detail: {
        kind: 'asset-preview',
        assetCenterSessionId: 'asset-center:1',
        previewSessionId: 'preview:1',
      },
    },
    {
      label: 'Extension',
      context: {
        kind: 'extensions',
        extensionManagementSessionId: 'extension-management:1',
      },
      catalog: {
        kind: 'extension-catalog',
        extensionManagementSessionId: 'extension-management:1',
      },
      management: {
        kind: 'extension-management',
        extensionManagementSessionId: 'extension-management:1',
      },
      detail: {
        kind: 'extension-detail',
        extensionManagementSessionId: 'extension-management:1',
      },
    },
  ])(
    'migrates version 5 $label management and detail placement',
    ({ context, catalog, management, detail }) => {
      const migrated = parseDesktopShellStoredState(
        createVersion5RetiredManagementState({ context, catalog, detail }),
      );

      expect(migrated.windows[0]?.scene.slots).toMatchObject({
        main: management,
        secondaryMain: detail,
      });
      expect(migrated.windows[0]?.scene.slots).not.toHaveProperty('leftManager');
    },
  );

  it('rejects stored Scene and Sidebar projections owned by another Window', () => {
    const state = withPrimaryWindow(createEmptyDesktopShellState(), 'window-1');
    const window = state.windows[0];
    if (!window) throw new Error('Expected the primary Window fixture.');

    expect(() =>
      parseDesktopShellStoredState({
        ...state,
        windows: [
          {
            ...window,
            scene: { ...window.scene, windowId: 'window-2' },
          },
        ],
      }),
    ).toThrow('Desktop stored Scene belongs to another Window');
    expect(() =>
      parseDesktopShellStoredState({
        ...state,
        windows: [
          {
            ...window,
            applicationSidebar: { ...window.applicationSidebar, windowId: 'window-2' },
          },
        ],
      }),
    ).toThrow('Desktop stored Application Sidebar belongs to another Window');
  });
});

function withPrimaryWindow(
  state: DesktopShellStoredState,
  windowId: string,
): DesktopShellStoredState {
  return {
    ...state,
    storageRevision: state.storageRevision + 1,
    primaryWindowId: windowId,
    windows: [
      {
        windowId,
        revision: 0,
        activeTarget: { kind: 'home' },
        tabs: [],
        workbench: createDefaultDesktopWorkbenchLayout(windowId),
        scene: createDefaultDesktopAgentScene(windowId, DESKTOP_DEFAULT_ASSISTANT_SPACE_ID),
        applicationSidebar: createDefaultDesktopApplicationSidebar(windowId),
      },
    ],
  };
}

function createVersion5RetiredSceneState(): unknown {
  const projectSceneId = 'scene:window-1:project-management';
  const assistantScene = createDefaultDesktopAgentScene(
    'window-2',
    DESKTOP_DEFAULT_ASSISTANT_SPACE_ID,
  );
  return {
    schemaVersion: 5,
    storageRevision: 894,
    catalogRevision: 0,
    primaryWindowId: 'window-1',
    projects: [],
    windows: [
      {
        windowId: 'window-1',
        revision: 28,
        activeTarget: { kind: 'home' },
        tabs: [],
        workbench: createDefaultDesktopWorkbenchLayout('window-1'),
        scene: {
          schemaVersion: 1,
          sceneId: projectSceneId,
          windowId: 'window-1',
          revision: 28,
          context: {
            kind: 'project-management',
            projectManagementSessionId: 'project-management:1',
          },
          slots: {
            leftManager: {
              kind: 'project-catalog',
              projectManagementSessionId: 'project-management:1',
            },
            status: { kind: 'scene-status', sceneId: projectSceneId },
          },
        },
        applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
      },
      {
        windowId: 'window-2',
        revision: 0,
        activeTarget: { kind: 'home' },
        tabs: [],
        workbench: createDefaultDesktopWorkbenchLayout('window-2'),
        scene: {
          ...assistantScene,
          slots: {
            ...assistantScene.slots,
            leftManager: {
              kind: 'assistant-resources',
              assistantSpaceId: DESKTOP_DEFAULT_ASSISTANT_SPACE_ID,
            },
          },
        },
        applicationSidebar: createDefaultDesktopApplicationSidebar('window-2'),
      },
    ],
  };
}

function createVersion5RetiredManagementState(input: {
  readonly context: Readonly<Record<string, unknown>>;
  readonly catalog: Readonly<Record<string, unknown>>;
  readonly detail: Readonly<Record<string, unknown>>;
}): unknown {
  const sceneId = 'scene:window-1:management';
  return {
    schemaVersion: 5,
    storageRevision: 12,
    catalogRevision: 0,
    primaryWindowId: 'window-1',
    projects: [],
    windows: [
      {
        windowId: 'window-1',
        revision: 3,
        activeTarget: { kind: 'home' },
        tabs: [],
        workbench: createDefaultDesktopWorkbenchLayout('window-1'),
        scene: {
          schemaVersion: 1,
          sceneId,
          windowId: 'window-1',
          revision: 3,
          context: input.context,
          slots: {
            leftManager: input.catalog,
            main: input.detail,
            status: { kind: 'scene-status', sceneId },
          },
        },
        applicationSidebar: createDefaultDesktopApplicationSidebar('window-1'),
      },
    ],
  };
}
