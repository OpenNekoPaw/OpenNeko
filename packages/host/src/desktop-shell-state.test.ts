import { describe, expect, it } from 'vitest';
import {
  createEmptyDesktopShellState,
  DesktopShellStateError,
  parseDesktopShellStoredState,
  type DesktopShellStoredState,
} from './desktop-shell-state';
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

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.windows[0]?.workbench).toEqual(createDefaultDesktopWorkbenchLayout('window-1'));
    expect({ ...migrated, storageRevision: 1 }).toMatchObject({
      schemaVersion: 4,
      windows: [{ workbench: { schemaVersion: 3, display: { mode: 'chat-only' } } }],
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
      schemaVersion: 4,
      windows: [
        {
          workbench: {
            schemaVersion: 3,
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
      schemaVersion: 4,
      windows: [
        {
          workbench: {
            schemaVersion: 3,
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
      },
    ],
  };
}
