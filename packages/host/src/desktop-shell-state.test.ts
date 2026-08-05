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
  createDesktopWorkbenchInstanceFromScene,
  parseDesktopWindowWorkbenchCatalog,
} from './desktop-workbench-instance-contract';
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

  it('restores multiple valid Workbench siblings from the one canonical shape', () => {
    const initial = createEmptyDesktopShellState();
    const first = draftWorkbench('window:1', 'workbench:draft:1', 'draft:1');
    const second = draftWorkbench('window:1', 'workbench:draft:2', 'draft:2');
    const state = withCatalog(initial, {
      windowId: 'window:1',
      activeWorkbenchInstanceId: second.workbenchInstanceId,
      instances: [first, second],
    });

    const parsed = parseDesktopShellStoredState(state);

    expect(parsed.windows[0]?.workbenches).toEqual({
      windowId: 'window:1',
      activeWorkbenchInstanceId: second.workbenchInstanceId,
      instances: [first, second],
      diagnostics: [],
    });
  });

  it('isolates one invalid Workbench child and retains valid siblings unchanged', () => {
    const initial = createEmptyDesktopShellState();
    const valid = draftWorkbench('window:1', 'workbench:valid', 'draft:valid');
    const invalid = {
      ...draftWorkbench('window:1', 'workbench:invalid', 'draft:invalid'),
      scene: {
        ...createDefaultDesktopAgentScene('window:1', 'draft:invalid'),
        context: { kind: 'unknown-scene' },
      },
    };
    const state = withCatalog(initial, {
      windowId: 'window:1',
      activeWorkbenchInstanceId: valid.workbenchInstanceId,
      instances: [valid, invalid],
    });
    const before = JSON.stringify(state);

    const parsed = parseDesktopShellStoredState(state);

    expect(JSON.stringify(state)).toBe(before);
    expect(parsed.windows[0]?.workbenches.instances).toEqual([valid]);
    expect(parsed.windows[0]?.workbenches.diagnostics).toEqual([
      expect.objectContaining({
        code: 'desktop-workbench-instance-invalid',
        workbenchInstanceId: 'workbench:invalid',
      }),
    ]);
    expect(serializeDesktopShellStoredState(parsed)).toMatchObject({
      windows: [
        expect.objectContaining({
          workbenches: expect.objectContaining({ instances: [valid, invalid] }),
        }),
      ],
    });
  });

  it('isolates a Window whose active Workbench identity names an invalid child', () => {
    const initial = withPrimaryWindow(createEmptyDesktopShellState(), 'window:1');
    const valid = draftWorkbench('window:1', 'workbench:valid', 'draft:valid');
    const state = {
      ...initial,
      windows: initial.windows.map((window) => ({
        ...window,
        workbenches: {
          windowId: 'window:1',
          activeWorkbenchInstanceId: 'workbench:missing',
          instances: [valid],
        },
      })),
    };

    const parsed = parseDesktopShellStoredState(state);

    expect(parsed.windows).toEqual([]);
    expect(readDesktopShellStateDiagnostics(parsed)).toEqual([
      expect.objectContaining({
        code: 'desktop-stored-window-invalid',
        windowId: 'window:1',
        message: expect.stringContaining(
          "Desktop Window active Workbench instance 'workbench:missing' is unavailable.",
        ),
      }),
    ]);
    expect(serializeDesktopShellStoredState(parsed)).toMatchObject({ windows: state.windows });
  });

  it('rejects a non-canonical root record without conversion or input mutation', () => {
    const invalidState = {
      primaryWindowId: null,
      projects: [],
      windows: [],
      removedTechnicalField: true,
    };
    const before = JSON.stringify(invalidState);

    expect(() => parseDesktopShellStoredState(invalidState)).toThrow(DesktopShellStateError);
    expect(JSON.stringify(invalidState)).toBe(before);
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
    expect(serializeDesktopShellStoredState(parsed)).toMatchObject({ windows: invalid.windows });
  });

  it('keeps a superseded Window record unchanged while allowing a new canonical Window', async () => {
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
    expect(readDesktopShellStateDiagnostics(committed)).toEqual([
      expect.objectContaining({ windowId: 'window:old' }),
    ]);
    expect(serializeDesktopShellStoredState(committed)).toMatchObject({
      primaryWindowId: 'window:new',
      windows: [expect.objectContaining({ windowId: 'window:new' }), oldWindow],
    });
  });
});

function withPrimaryWindow(
  state: DesktopShellStoredState,
  windowId: string,
): DesktopShellStoredState {
  const workbench = draftWorkbench(windowId, `workbench:${windowId}`, `draft:${windowId}`);
  return withCatalog(state, {
    windowId,
    activeWorkbenchInstanceId: workbench.workbenchInstanceId,
    instances: [workbench],
  });
}

function withCatalog(
  state: DesktopShellStoredState,
  workbenches: Parameters<typeof parseDesktopWindowWorkbenchCatalog>[0],
): DesktopShellStoredState {
  const catalog = parseDesktopWindowWorkbenchCatalog(workbenches);
  return {
    ...state,
    primaryWindowId: catalog.windowId,
    windows: [
      {
        windowId: catalog.windowId,
        activeTarget: { kind: 'home' },
        tabs: [],
        workbenches: catalog,
        applicationSidebar: createDefaultDesktopApplicationSidebar(catalog.windowId),
      },
    ],
  };
}

function draftWorkbench(windowId: string, workbenchInstanceId: string, draftId: string) {
  const scene = createDefaultDesktopAgentScene(windowId, draftId);
  return createDesktopWorkbenchInstanceFromScene({
    workbenchInstanceId,
    agentSurfaceId: `agent-surface:${draftId}`,
    layout: createDefaultDesktopWorkbenchLayout(windowId),
    scene,
  });
}
