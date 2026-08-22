import { describe, expect, it } from 'vitest';

import {
  createEmptyDesktopShellState,
  DesktopShellStateError,
  parseDesktopShellStoredState,
  readDesktopShellStateDiagnostics,
  serializeDesktopShellStoredState,
  type DesktopShellStoredState,
} from './desktop-shell-state';
import {
  createDefaultDesktopAgentScene,
  createDefaultDesktopApplicationSidebar,
} from './desktop-scene-contract';
import { createDefaultDesktopWorkbenchLayout } from './desktop-workbench-contract';
import {
  createDesktopWindowComposition,
  parseDesktopWindowComposition,
} from './desktop-window-composition-contract';
import { createInMemoryDesktopShellStateRepository } from './testing/in-memory-desktop-shell-state-repository';

describe('Desktop Shell state codec', () => {
  it('serializes state commits through the owning repository', async () => {
    const repository = createInMemoryDesktopShellStateRepository();
    const initial = await repository.read();
    await repository.commit(withPrimaryWindow(initial, 'window:1'));

    const committed = await repository.commit(withPrimaryWindow(initial, 'window:2'));

    expect((await repository.read()).primaryWindowId).toBe('window:2');
    expect(committed.primaryWindowId).toBe('window:2');
  });

  it('isolates a Window whose current composition violates the canonical contract', () => {
    const initial = withPrimaryWindow(createEmptyDesktopShellState(), 'window:1');
    const state = {
      ...initial,
      windows: initial.windows.map((window) => ({
        ...window,
        workbench: { ...window.workbench, scene: { invalid: true } },
      })),
    };

    const parsed = parseDesktopShellStoredState(state);

    expect(parsed.windows).toEqual([]);
    expect(readDesktopShellStateDiagnostics(parsed)).toEqual([
      expect.objectContaining({
        code: 'desktop-stored-window-invalid',
        windowId: 'window:1',
        message: expect.stringContaining('Desktop stored Window composition is invalid'),
      }),
    ]);
    expect(serializeDesktopShellStoredState(parsed)).toEqual({
      primaryWindowId: null,
      projects: [],
      windows: [],
    });
  });

  it('restores a persisted Skill/MCP Extensions scene', () => {
    const initial = withPrimaryWindow(createEmptyDesktopShellState(), 'window:extensions');
    const state = {
      ...initial,
      windows: initial.windows.map((window) => ({
        ...window,
        workbench: {
          ...window.workbench,
          scene: {
            sceneId: 'scene:window:extensions',
            windowId: window.windowId,
            context: { kind: 'extensions' },
            slots: {
              main: { kind: 'extension-management' },
              status: { kind: 'scene-status', sceneId: 'scene:window:extensions' },
            },
          },
        },
      })),
    };

    const parsed = parseDesktopShellStoredState(state);

    expect(parsed.windows).toEqual(state.windows);
    expect(readDesktopShellStateDiagnostics(parsed)).toEqual([]);
    expect(serializeDesktopShellStoredState(parsed)).toEqual(state);
  });

  it('restores valid root collections while retaining unknown metadata unchanged', () => {
    const state = {
      primaryWindowId: null,
      projects: [],
      windows: [],
      opaqueSourceMarker: {
        source: 'desktop-shell-fixture',
        values: [1, null, false],
      },
    };
    const before = JSON.stringify(state);

    const parsed = parseDesktopShellStoredState(state);

    expect(parsed).toMatchObject({ primaryWindowId: null, projects: [], windows: [] });
    expect(readDesktopShellStateDiagnostics(parsed)).toEqual([
      {
        code: 'desktop-stored-state-metadata-retained',
        severity: 'warning',
        authorityKey: 'desktop.shell',
        fieldNames: ['opaqueSourceMarker'],
        message: expect.stringContaining('opaqueSourceMarker'),
      },
    ]);
    expect(serializeDesktopShellStoredState(parsed)).toEqual(state);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('rejects a root whose required collections cannot identify smaller owners', () => {
    expect(() => parseDesktopShellStoredState(null)).toThrow(DesktopShellStateError);
    expect(() => parseDesktopShellStoredState({ primaryWindowId: null, windows: [] })).toThrow(
      DesktopShellStateError,
    );
    expect(() =>
      parseDesktopShellStoredState({ primaryWindowId: null, projects: {}, windows: [] }),
    ).toThrow(DesktopShellStateError);
  });

  it('isolates a Window whose Project Tab references an absent Project', () => {
    const initial = withPrimaryWindow(createEmptyDesktopShellState(), 'window:1');
    const invalid: DesktopShellStoredState = {
      ...initial,
      windows: initial.windows.map((window) => ({
        ...window,
        activeTarget: { kind: 'project', tabId: 'tab:missing' },
        tabs: [
          {
            tabId: 'tab:missing',
            projectId: 'project:missing',
            viewId: 'view:missing',
            viewInstanceId: 'view-instance-1',
          },
        ],
      })),
    };

    const parsed = parseDesktopShellStoredState(invalid);

    expect(parsed.windows).toEqual([]);
    expect(readDesktopShellStateDiagnostics(parsed)[0]).toMatchObject({
      code: 'desktop-stored-window-invalid',
      windowId: 'window:1',
    });
    expect(serializeDesktopShellStoredState(parsed)).toEqual({
      primaryWindowId: null,
      projects: [],
      windows: [],
    });
  });

  it('keeps a valid primary Window while dropping an invalid sibling payload', () => {
    const validState = withPrimaryWindow(createEmptyDesktopShellState(), 'window:valid');
    const invalidWindow = {
      windowId: 'window:invalid',
      activeTarget: { kind: 'home' },
      tabs: [],
      workbench: { invalid: true },
      applicationSidebar: createDefaultDesktopApplicationSidebar('window:invalid'),
    };

    const parsed = parseDesktopShellStoredState({
      ...validState,
      windows: [...validState.windows, invalidWindow],
    });

    expect(parsed.windows.map((window) => window.windowId)).toEqual(['window:valid']);
    expect(readDesktopShellStateDiagnostics(parsed)).toEqual([
      expect.objectContaining({
        code: 'desktop-stored-window-invalid',
        windowId: 'window:invalid',
      }),
    ]);
    expect(serializeDesktopShellStoredState(parsed)).toEqual({
      primaryWindowId: 'window:valid',
      projects: [],
      windows: [expect.objectContaining({ windowId: 'window:valid' })],
    });
  });

  it('round-trips the current optional Project presentation snapshot', () => {
    const windowId = 'window:1';
    const initial = withPrimaryWindow(createEmptyDesktopShellState(), windowId);
    const project = storedProject('project:1', 'workspace:1');
    const presentation = projectPresentation(windowId, project.projectId, project.workspaceId);
    const state: DesktopShellStoredState = {
      ...initial,
      projects: [project],
      windows: initial.windows.map((window) => ({
        ...window,
        tabs: [
          {
            tabId: 'tab:1',
            projectId: project.projectId,
            viewId: 'view:1',
            viewInstanceId: 'view-instance:1',
            presentation,
          },
        ],
      })),
    };

    const parsed = parseDesktopShellStoredState(serializeDesktopShellStoredState(state));

    expect(parsed.windows[0]?.tabs[0]?.presentation).toEqual(presentation);
  });

  it.each([
    {
      label: 'another Window',
      presentation: projectPresentation('window:other', 'project:1', 'workspace:1'),
    },
    {
      label: 'another Project',
      presentation: projectPresentation('window:1', 'project:other', 'workspace:1'),
    },
    {
      label: 'another Workspace',
      presentation: projectPresentation('window:1', 'project:1', 'workspace:other'),
    },
  ])(
    'isolates a Window whose Project presentation contains $label identity',
    ({ presentation }) => {
      const initial = withPrimaryWindow(createEmptyDesktopShellState(), 'window:1');
      const project = storedProject('project:1', 'workspace:1');
      const state: DesktopShellStoredState = {
        ...initial,
        projects: [project],
        windows: initial.windows.map((window) => ({
          ...window,
          tabs: [
            {
              tabId: 'tab:1',
              projectId: project.projectId,
              viewId: 'view:1',
              viewInstanceId: 'view-instance:1',
              presentation,
            },
          ],
        })),
      };

      const parsed = parseDesktopShellStoredState(state);

      expect(parsed.windows).toEqual([]);
      expect(readDesktopShellStateDiagnostics(parsed)[0]).toMatchObject({
        code: 'desktop-stored-window-invalid',
        windowId: 'window:1',
      });
    },
  );

  it('commits a canonical Window without the isolated invalid payload', async () => {
    const oldWindow = {
      windowId: 'window:old',
      activeTarget: { kind: 'home' },
      tabs: [],
      workbench: createDefaultDesktopWorkbenchLayout('window:old'),
      scene: createDefaultDesktopAgentScene('window:old', 'draft:old'),
      applicationSidebar: createDefaultDesktopApplicationSidebar('window:old'),
    };
    const parsed = parseDesktopShellStoredState({
      ...createEmptyDesktopShellState(),
      primaryWindowId: oldWindow.windowId,
      windows: [oldWindow],
    });
    const repository = createInMemoryDesktopShellStateRepository(parsed);
    const committed = await repository.commit({
      ...parsed,
      primaryWindowId: 'window:new',
      windows: [withPrimaryWindow(createEmptyDesktopShellState(), 'window:new').windows[0]!],
    });

    expect(committed.windows.map((window) => window.windowId)).toEqual(['window:new']);
    expect(readDesktopShellStateDiagnostics(committed)).toEqual([]);
    expect(serializeDesktopShellStoredState(committed)).toEqual({
      primaryWindowId: 'window:new',
      projects: [],
      windows: [expect.objectContaining({ windowId: 'window:new' })],
    });
  });
});

function withPrimaryWindow(
  state: DesktopShellStoredState,
  windowId: string,
): DesktopShellStoredState {
  const workbench = draftWorkbench(windowId, `workbench:${windowId}`, `draft:${windowId}`);
  return withComposition(state, workbench);
}

function withComposition(
  state: DesktopShellStoredState,
  value: Parameters<typeof parseDesktopWindowComposition>[0],
): DesktopShellStoredState {
  const workbench = parseDesktopWindowComposition(value);
  return {
    ...state,
    primaryWindowId: workbench.windowId,
    windows: [
      {
        windowId: workbench.windowId,
        activeTarget: { kind: 'home' },
        tabs: [],
        workbench,
        applicationSidebar: createDefaultDesktopApplicationSidebar(workbench.windowId),
      },
    ],
  };
}

function draftWorkbench(windowId: string, workbenchInstanceId: string, draftId: string) {
  const scene = createDefaultDesktopAgentScene(windowId, draftId);
  return createDesktopWindowComposition({
    workbenchInstanceId,
    layout: createDefaultDesktopWorkbenchLayout(windowId),
    scene,
  });
}

function storedProject(projectId: string, workspaceId: string) {
  return {
    projectId,
    workspaceId,
    profile: 'content' as const,
    displayName: projectId,
    workspacePath: `/workspace/${workspaceId}`,
    workspaceLocator: { kind: 'variable' as const, value: `\${HOME}/workspace/${workspaceId}` },
    createdAt: '2026-08-07T00:00:00.000Z',
    updatedAt: '2026-08-07T00:00:00.000Z',
  };
}

function projectPresentation(windowId: string, projectId: string, workspaceId: string) {
  const layout = createDefaultDesktopWorkbenchLayout(windowId);
  return {
    ...layout,
    display: { ...layout.display, mode: 'chat-main' as const },
    main: {
      views: [
        {
          viewId: `canvas:${projectId}`,
          viewInstanceId: `view-instance:${projectId}`,
          projectId,
          workspaceId,
          kind: 'canvas' as const,
          ownerId: `canvas:${projectId}`,
          displayLabel: 'workspace.nkc',
          documentId: 'neko/boards/workspace.nkc',
        },
      ],
      groups: [
        {
          groupId: 'main:primary',
          viewIds: [`canvas:${projectId}`],
          activeViewId: `canvas:${projectId}`,
        },
      ],
      activeGroupId: 'main:primary',
    },
  };
}
