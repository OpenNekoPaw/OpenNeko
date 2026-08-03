import { describe, expect, it } from 'vitest';
import {
  DESKTOP_SECONDARY_MAIN_GROUP_ID,
  DESKTOP_WORKBENCH_CONTRACT_VERSION,
  DesktopWorkbenchContractError,
  closeMainView,
  createDefaultDesktopWorkbenchLayout,
  migrateDesktopWorkbenchV2,
  openOrFocusMainView,
  parseDesktopWorkbenchLayout,
  reorderMainView,
  resizeMainSplit,
  setWorkbenchDisplayMode,
  showWorkbenchTimeline,
  splitMainView,
} from './desktop-workbench-contract';

describe('Desktop Workbench contract', () => {
  it('creates an orthogonal Chat-first default without Agent Main state', () => {
    expect(createDefaultDesktopWorkbenchLayout('window-1')).toEqual({
      schemaVersion: DESKTOP_WORKBENCH_CONTRACT_VERSION,
      windowId: 'window-1',
      revision: 0,
      primarySidebar: { visible: true, width: 240 },
      resourceDock: { presentation: 'hidden', width: 320 },
      display: { mode: 'chat-only', chatPosition: 'left', chatWidth: 360 },
      main: {
        views: [],
        groups: [{ groupId: 'main:primary', viewIds: [] }],
        activeGroupId: 'main:primary',
      },
      timeline: { presentation: 'hidden', height: 240 },
    });
  });

  it('opens, focuses and splits Main Views without changing Chat presentation', () => {
    const initial = {
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      display: { mode: 'chat-main' as const, chatPosition: 'right' as const, chatWidth: 388 },
    };
    const canvas = openOrFocusMainView(initial, viewRef('canvas-1', 'canvas'));
    const preview = openOrFocusMainView(canvas, viewRef('preview-1', 'preview'), {
      splitAxis: 'columns',
    });
    const focused = openOrFocusMainView(preview, viewRef('canvas-1', 'canvas'));

    expect(preview.display).toEqual(initial.display);
    expect(preview.main.groups).toEqual([
      {
        groupId: 'main:primary',
        viewIds: ['canvas-1'],
        activeViewId: 'canvas-1',
      },
      {
        groupId: DESKTOP_SECONDARY_MAIN_GROUP_ID,
        viewIds: ['preview-1'],
        activeViewId: 'preview-1',
      },
    ]);
    expect(preview.main.split).toEqual({ axis: 'columns', ratio: 0.5 });
    expect(focused.main.activeGroupId).toBe('main:primary');
    expect(focused.main.views).toHaveLength(2);
  });

  it('rejects Resource Browser as a v3 Main View', () => {
    const initial = createDefaultDesktopWorkbenchLayout('window-1');
    const resourceBrowser = legacyResourceViewRef('resources-1');

    expect(() => Reflect.apply(openOrFocusMainView, undefined, [initial, resourceBrowser])).toThrow(
      'Desktop Workbench Main View kind is invalid.',
    );
    expect(() =>
      parseDesktopWorkbenchLayout({
        ...initial,
        main: {
          ...initial.main,
          views: [resourceBrowser],
          groups: [
            {
              groupId: 'main:primary',
              viewIds: ['resources-1'],
              activeViewId: 'resources-1',
            },
          ],
        },
      }),
    ).toThrow('Desktop Workbench Main View kind is invalid.');
  });

  it('migrates v2 Resource Browser Main Views into the visible right Dock', () => {
    const canvas = viewRef('canvas-1', 'canvas');
    const resources = legacyResourceViewRef('resources-1');

    const migrated = migrateDesktopWorkbenchV2({
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      schemaVersion: 2,
      revision: 7,
      resourceDock: { presentation: 'hidden', position: 'left', width: 404 },
      main: {
        views: [canvas, resources],
        groups: [
          {
            groupId: 'main:primary',
            viewIds: ['canvas-1', 'resources-1'],
            activeViewId: 'resources-1',
          },
        ],
        activeGroupId: 'main:primary',
      },
    });

    expect(migrated).toMatchObject({
      schemaVersion: DESKTOP_WORKBENCH_CONTRACT_VERSION,
      revision: 7,
      resourceDock: { presentation: 'docked', width: 404 },
      main: {
        views: [canvas],
        groups: [
          {
            groupId: 'main:primary',
            viewIds: ['canvas-1'],
            activeViewId: 'canvas-1',
          },
        ],
        activeGroupId: 'main:primary',
      },
    });
    expect(migrated.resourceDock).not.toHaveProperty('position');
  });

  it('rejects duplicate membership, missing active Group and dangling Timeline owner', () => {
    const canvas = openOrFocusMainView(
      createDefaultDesktopWorkbenchLayout('window-1'),
      viewRef('canvas-1', 'canvas'),
    );
    expect(() =>
      parseDesktopWorkbenchLayout({
        ...canvas,
        main: {
          ...canvas.main,
          groups: [
            canvas.main.groups[0],
            {
              groupId: 'main:secondary',
              viewIds: ['canvas-1'],
              activeViewId: 'canvas-1',
            },
          ],
          split: { axis: 'rows', ratio: 0.5 },
        },
      }),
    ).toThrow('exactly one Group');
    expect(() =>
      parseDesktopWorkbenchLayout({
        ...canvas,
        main: { ...canvas.main, activeGroupId: 'missing' },
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DesktopWorkbenchContractError>>({
        code: 'desktop-workbench-stale-identity',
      }),
    );
    expect(() =>
      parseDesktopWorkbenchLayout({
        ...canvas,
        timeline: {
          presentation: 'docked',
          ownerViewId: 'canvas-1',
          height: 240,
        },
      }),
    ).toThrow('attached Cut View');
  });

  it('binds Timeline only to Cut and closes the owner visibly', () => {
    const canvas = openOrFocusMainView(
      createDefaultDesktopWorkbenchLayout('window-1'),
      viewRef('canvas-1', 'canvas'),
    );
    const cut = openOrFocusMainView(canvas, viewRef('cut-1', 'cut'));
    const withTimeline = showWorkbenchTimeline(cut, 'cut-1');
    const closed = closeMainView(withTimeline, 'cut-1');

    expect(withTimeline.timeline).toEqual({
      presentation: 'docked',
      ownerViewId: 'cut-1',
      height: 240,
    });
    expect(closed.timeline).toEqual({ presentation: 'hidden', height: 240 });
  });

  it('supports bounded split, reorder, resize and collapse operations', () => {
    const first = openOrFocusMainView(
      createDefaultDesktopWorkbenchLayout('window-1'),
      viewRef('canvas-1', 'canvas'),
    );
    const second = openOrFocusMainView(first, viewRef('preview-1', 'preview'));
    const reordered = reorderMainView(second, 'main:primary', 'canvas-1', 'preview-1');
    const split = splitMainView(reordered, 'preview-1', 'rows');
    const resized = resizeMainSplit(split, 0.6);
    const collapsed = closeMainView(resized, 'preview-1');

    expect(reordered.main.groups[0]?.viewIds).toEqual(['preview-1', 'canvas-1']);
    expect(split.main.split).toEqual({ axis: 'rows', ratio: 0.5 });
    expect(resized.main.split?.ratio).toBe(0.6);
    expect(collapsed.main.groups).toHaveLength(1);
    expect(collapsed.main.split).toBeUndefined();
  });

  it('keeps stable Group ordering when moving a secondary Tab back to primary', () => {
    const first = openOrFocusMainView(
      createDefaultDesktopWorkbenchLayout('window-1'),
      viewRef('canvas-1', 'canvas'),
    );
    const second = openOrFocusMainView(first, viewRef('preview-1', 'preview'), {
      splitAxis: 'columns',
    });
    const third = openOrFocusMainView(second, viewRef('preview-2', 'preview'));
    const moved = splitMainView(third, 'preview-2', 'rows');

    expect(moved.main.groups.map((group) => group.groupId)).toEqual([
      'main:primary',
      'main:secondary',
    ]);
    expect(moved.main.groups[0]?.activeViewId).toBe('preview-2');
    expect(moved.main.split?.axis).toBe('rows');
  });

  it('allows Chat + Main to expose an empty Main group but rejects Main only without a View', () => {
    const initial = createDefaultDesktopWorkbenchLayout('window-1');
    const emptyChatMain = setWorkbenchDisplayMode(initial, 'chat-main', 'right');
    expect(emptyChatMain.display).toEqual({
      mode: 'chat-main',
      chatPosition: 'right',
      chatWidth: 360,
    });
    expect(emptyChatMain.main).toEqual(initial.main);
    expect(() => setWorkbenchDisplayMode(initial, 'main-only')).toThrow(
      "display mode 'main-only' requires an attached Main View",
    );
    const withCanvas = openOrFocusMainView(initial, viewRef('canvas-1', 'canvas'));
    const changed = setWorkbenchDisplayMode(withCanvas, 'chat-main', 'right');
    expect(changed.main).toEqual(withCanvas.main);
    expect(changed.display).toEqual({
      mode: 'chat-main',
      chatPosition: 'right',
      chatWidth: 360,
    });
  });

  it('rejects unknown versions and does not retain unknown path fields', () => {
    expect(() =>
      parseDesktopWorkbenchLayout({
        ...createDefaultDesktopWorkbenchLayout('window-1'),
        schemaVersion: 1,
      }),
    ).toThrowError(
      expect.objectContaining<Partial<DesktopWorkbenchContractError>>({
        code: 'unsupported-desktop-workbench-version',
      }),
    );
    const projection = parseDesktopWorkbenchLayout({
      ...createDefaultDesktopWorkbenchLayout('window-1'),
      workspacePath: '/Users/private/project',
      display: {
        ...createDefaultDesktopWorkbenchLayout('window-1').display,
        conversation: { secret: 'renderer-owned-state' },
      },
    });
    expect(projection).not.toHaveProperty('workspacePath');
    expect(projection.display).not.toHaveProperty('conversation');
    expect(JSON.stringify(projection)).not.toContain('/Users/private');
  });
});

function viewRef(viewId: string, kind: 'canvas' | 'preview' | 'cut') {
  return {
    viewId,
    viewEpoch: 1,
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    kind,
    ownerId: `${kind}-owner-1`,
    displayLabel: `${viewId}.document`,
    documentId: `documents/${viewId}`,
    ...(kind === 'preview'
      ? {
          previewPresentation: 'pinned' as const,
          previewContentKind: 'model' as const,
        }
      : {}),
  } as const;
}

function legacyResourceViewRef(viewId: string) {
  return {
    viewId,
    viewEpoch: 1,
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    kind: 'resource-browser',
    ownerId: 'resource-browser-owner-1',
    displayLabel: `${viewId}.document`,
    documentId: `documents/${viewId}`,
  } as const;
}
