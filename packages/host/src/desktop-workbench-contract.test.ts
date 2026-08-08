import { describe, expect, it } from 'vitest';
import {
  DESKTOP_SECONDARY_MAIN_GROUP_ID,
  DesktopWorkbenchContractError,
  closeMainView,
  createDefaultDesktopWorkbenchLayout,
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
      windowId: 'window-1',
      resourceDock: { presentation: 'docked', width: 320 },
      display: { mode: 'chat-only', chatPosition: 'left', chatWidth: 360 },
      main: {
        views: [],
        groups: [{ groupId: 'main:primary', viewIds: [] }],
        activeGroupId: 'main:primary',
      },
      timeline: { presentation: 'hidden', height: 240 },
    });
  });

  it('rejects an unknown field without affecting canonical layouts', () => {
    const current = createDefaultDesktopWorkbenchLayout('window-1');

    expect(() => parseDesktopWorkbenchLayout({ ...current, unexpectedField: 0 })).toThrow(
      'Desktop Workbench layout has unexpected fields',
    );
    expect(parseDesktopWorkbenchLayout(current)).toEqual(current);
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

  it('focuses one exact Text Editor View per Workspace document', () => {
    const initial = createDefaultDesktopWorkbenchLayout('window-1');
    const first = openOrFocusMainView(initial, textEditorViewRef('editor-1', 'session-1'));
    const focused = openOrFocusMainView(first, textEditorViewRef('editor-2', 'session-2'));

    expect(focused.main.views).toEqual(first.main.views);
    expect(focused.main.groups[0]?.activeViewId).toBe('editor-1');
  });

  it('requires Text Editor session identity only on exact Text Editor Views', () => {
    expect(() =>
      openOrFocusMainView(createDefaultDesktopWorkbenchLayout('window-1'), {
        ...viewRef('preview-1', 'preview'),
        editorSessionId: 'session-1',
      }),
    ).toThrow('belongs only to Text Editor Views');
    expect(() =>
      openOrFocusMainView(createDefaultDesktopWorkbenchLayout('window-1'), {
        ...textEditorViewRef('editor-1', 'session-1'),
        editorSessionId: undefined,
      }),
    ).toThrow('requires exact document and editor session identities');
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

  it('rejects unknown renderer/path fields', () => {
    expect(() =>
      parseDesktopWorkbenchLayout({
        ...createDefaultDesktopWorkbenchLayout('window-1'),
        workspacePath: '/Users/private/project',
      }),
    ).toThrow('Desktop Workbench layout has unexpected fields');
    expect(() =>
      parseDesktopWorkbenchLayout({
        ...createDefaultDesktopWorkbenchLayout('window-1'),
        display: {
          ...createDefaultDesktopWorkbenchLayout('window-1').display,
          conversation: { secret: 'renderer-owned-state' },
        },
      }),
    ).toThrow('Desktop Workbench display projection has unexpected fields');
  });
});

function viewRef(viewId: string, kind: 'canvas' | 'preview' | 'cut') {
  return {
    viewId,
    viewInstanceId: 'view-instance-1',
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

function textEditorViewRef(viewId: string, editorSessionId: string) {
  return {
    viewId,
    viewInstanceId: `${viewId}:instance`,
    projectId: 'project-1',
    workspaceId: 'workspace-1',
    kind: 'text-editor' as const,
    ownerId: 'text-editor-owner-1',
    displayLabel: 'main.fountain',
    documentId: 'scripts/main.fountain',
    editorSessionId,
  };
}
