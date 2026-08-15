import { describe, expect, it } from 'vitest';
import {
  DESKTOP_SECONDARY_MAIN_GROUP_ID,
  DesktopWorkbenchContractError,
  closeCutView,
  closeMainView,
  createDefaultDesktopWorkbenchLayout,
  getActiveCutView,
  openOrFocusCutView,
  openOrFocusMainView,
  parseDesktopWorkbenchLayout,
  reorderCutView,
  reorderMainView,
  resizeCutPanel,
  resizeMainSplit,
  setCutPanelPresentation,
  setWorkbenchDisplayMode,
  splitMainView,
} from './desktop-workbench-contract';

describe('Desktop Workbench contract', () => {
  it('creates a Chat + fresh Main default without fabricating a Main View', () => {
    expect(createDefaultDesktopWorkbenchLayout('window-1')).toEqual({
      windowId: 'window-1',
      resourceDock: { presentation: 'docked', width: 320 },
      display: { mode: 'chat-main', chatPosition: 'left', chatWidth: 360 },
      main: {
        views: [],
        groups: [{ groupId: 'main:primary', viewIds: [] }],
        activeGroupId: 'main:primary',
      },
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

  it('side-opens from an empty primary Main and relocates an existing primary target', () => {
    const standalone = openOrFocusMainView(
      createDefaultDesktopWorkbenchLayout('window-1'),
      {
        viewId: 'character-view-1',
        viewInstanceId: 'character-view-instance-1',
        workspaceId: 'character-library',
        kind: 'character-authoring',
        ownerId: 'character-project-1',
        displayLabel: 'Lead',
        characterProjectId: 'character-project-1',
      },
      { groupId: 'main:primary', splitAxis: 'columns' },
    );
    expect(standalone.main.groups).toEqual([
      { groupId: 'main:primary', viewIds: [] },
      {
        groupId: 'main:secondary',
        viewIds: ['character-view-1'],
        activeViewId: 'character-view-1',
      },
    ]);

    const primaryCharacter = openOrFocusMainView(createDefaultDesktopWorkbenchLayout('window-2'), {
      viewId: 'character-view-2',
      viewInstanceId: 'character-view-instance-2',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      kind: 'character-authoring',
      ownerId: 'character-project-2',
      displayLabel: 'Rival',
      characterProjectId: 'character-project-2',
    });
    const relocated = openOrFocusMainView(primaryCharacter, primaryCharacter.main.views[0]!, {
      groupId: 'main:primary',
      splitAxis: 'columns',
    });
    expect(relocated.main.groups).toEqual([
      { groupId: 'main:primary', viewIds: [] },
      {
        groupId: 'main:secondary',
        viewIds: ['character-view-2'],
        activeViewId: 'character-view-2',
      },
    ]);
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
    const { editorSessionId: _editorSessionId, ...missingEditorSession } = textEditorViewRef(
      'editor-1',
      'session-1',
    );
    expect(() =>
      openOrFocusMainView(createDefaultDesktopWorkbenchLayout('window-1'), missingEditorSession),
    ).toThrow('requires exact document and editor session identities');
  });

  it('accepts only exact owner-qualified Character and World authoring Views', () => {
    const initial = createDefaultDesktopWorkbenchLayout('window-1');
    const character = openOrFocusMainView(initial, {
      viewId: 'character-view-1',
      viewInstanceId: 'character-view-instance-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      kind: 'character-authoring',
      ownerId: 'character',
      displayLabel: 'Lead',
      characterProjectId: 'character-project-1',
    });
    const world = openOrFocusMainView(character, {
      viewId: 'world-view-1',
      viewInstanceId: 'world-view-instance-1',
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      kind: 'world-authoring',
      ownerId: 'world',
      displayLabel: 'Setting',
      worldProjectId: 'world-project-1',
    });
    expect(world.main.views.map((view) => view.kind)).toEqual([
      'character-authoring',
      'world-authoring',
    ]);
    expect(() =>
      openOrFocusMainView(initial, {
        viewId: 'character-view-2',
        viewInstanceId: 'character-view-instance-2',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        kind: 'character-authoring',
        ownerId: 'character',
        displayLabel: 'Missing',
      }),
    ).toThrow('requires an exact CharacterProject');
    expect(() =>
      openOrFocusMainView(initial, {
        viewId: 'world-view-2',
        viewInstanceId: 'world-view-instance-2',
        projectId: 'project-1',
        workspaceId: 'workspace-1',
        kind: 'world-authoring',
        ownerId: 'world',
        displayLabel: 'Setting',
        worldProjectId: 'world-project-1',
        characterProjectId: 'character-project-1',
      }),
    ).toThrow('belongs only to Character authoring Views');
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
  });

  it('keeps Cut tabs in the Main-below panel without replacing Main', () => {
    const canvas = openOrFocusMainView(
      createDefaultDesktopWorkbenchLayout('window-1'),
      viewRef('canvas-1', 'canvas'),
    );
    const firstCut = openOrFocusCutView(canvas, viewRef('cut-1', 'cut'));
    const cuts = openOrFocusCutView(firstCut, viewRef('cut-2', 'cut'));
    const reordered = reorderCutView(cuts, 'cut-1', 'cut-2');
    const hidden = setCutPanelPresentation(reordered, 'hidden');
    const resized = resizeCutPanel(hidden, 500);

    expect(resized.main).toEqual(canvas.main);
    expect(resized.cutPanel).toMatchObject({
      presentation: 'hidden',
      height: 500,
      activeViewId: 'cut-2',
    });
    expect(resized.cutPanel?.views.map((view) => view.viewId)).toEqual(['cut-2', 'cut-1']);
    expect(getActiveCutView(resized)?.viewId).toBe('cut-2');
    expect(closeCutView(resized, 'cut-2').cutPanel?.activeViewId).toBe('cut-1');
    expect(closeCutView(closeCutView(resized, 'cut-2'), 'cut-1').cutPanel).toBeUndefined();
    expect(() => openOrFocusMainView(canvas, viewRef('cut-1', 'cut'))).toThrow(
      'belong to the Cut Panel',
    );
    expect(() => openOrFocusCutView(canvas, viewRef('canvas-2', 'canvas'))).toThrow(
      'accepts only Cut Views',
    );
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

  it('rejects only the ninth Main View and allows the same View after an explicit close', () => {
    let workbench = createDefaultDesktopWorkbenchLayout('window-1');
    for (let index = 1; index <= 8; index += 1) {
      workbench = openOrFocusMainView(workbench, viewRef(`canvas-${String(index)}`, 'canvas'));
    }
    const beforeRejectedOpen = workbench;

    expect(() => openOrFocusMainView(workbench, viewRef('canvas-9', 'canvas'))).toThrow(
      expect.objectContaining<Partial<DesktopWorkbenchContractError>>({
        code: 'desktop-workbench-main-view-capacity-reached',
      }),
    );
    expect(workbench).toBe(beforeRejectedOpen);
    expect(workbench.main.views.map((view) => view.viewId)).toEqual([
      'canvas-1',
      'canvas-2',
      'canvas-3',
      'canvas-4',
      'canvas-5',
      'canvas-6',
      'canvas-7',
      'canvas-8',
    ]);

    const closed = closeMainView(workbench, 'canvas-3');
    const retried = openOrFocusMainView(closed, viewRef('canvas-9', 'canvas'));
    expect(retried.main.views.map((view) => view.viewId)).toEqual([
      'canvas-1',
      'canvas-2',
      'canvas-4',
      'canvas-5',
      'canvas-6',
      'canvas-7',
      'canvas-8',
      'canvas-9',
    ]);
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

  it('keeps an empty Main group visible without requiring a fabricated View', () => {
    const initial = createDefaultDesktopWorkbenchLayout('window-1');
    const emptyChatMain = setWorkbenchDisplayMode(initial, 'chat-main', 'right');
    expect(emptyChatMain.display).toEqual({
      mode: 'chat-main',
      chatPosition: 'right',
      chatWidth: 360,
    });
    expect(emptyChatMain.main).toEqual(initial.main);
    const emptyMainOnly = setWorkbenchDisplayMode(initial, 'main-only');
    expect(emptyMainOnly.display.mode).toBe('main-only');
    expect(emptyMainOnly.main).toEqual(initial.main);
    const withCanvas = openOrFocusMainView(initial, viewRef('canvas-1', 'canvas'));
    const changed = setWorkbenchDisplayMode(withCanvas, 'chat-main', 'right');
    expect(changed.main).toEqual(withCanvas.main);
    expect(changed.display).toEqual({
      mode: 'chat-main',
      chatPosition: 'right',
      chatWidth: 360,
    });
  });

  it('accepts empty Main only while an exact Cut Panel is docked', () => {
    const initial = createDefaultDesktopWorkbenchLayout('window-1');
    expect(() => setWorkbenchDisplayMode(initial, 'empty-main')).toThrow(
      "display mode 'empty-main' requires a docked Cut Panel",
    );

    const withCut = openOrFocusCutView(initial, viewRef('cut-1', 'cut'));
    const cutOnly = setWorkbenchDisplayMode(withCut, 'empty-main');
    expect(cutOnly.display.mode).toBe('empty-main');
    expect(cutOnly.cutPanel?.presentation).toBe('docked');
    const withoutFinalCut = closeCutView(cutOnly, 'cut-1');
    expect(withoutFinalCut.display.mode).toBe('chat-only');
    expect(withoutFinalCut.cutPanel).toBeUndefined();

    const hiddenCut = setCutPanelPresentation(withCut, 'hidden');
    expect(() => setWorkbenchDisplayMode(hiddenCut, 'empty-main')).toThrow(
      "display mode 'empty-main' requires a docked Cut Panel",
    );
    expect(() =>
      parseDesktopWorkbenchLayout({
        ...hiddenCut,
        display: { ...hiddenCut.display, mode: 'empty-main' },
      }),
    ).toThrow("display mode 'empty-main' requires a docked Cut Panel");
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

function viewRef(
  viewId: string,
  kind: 'canvas' | 'preview' | 'cut' | 'character-authoring' | 'world-authoring',
) {
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
