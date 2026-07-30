// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuAction } from '@neko/ui/primitives';
import { buildCanvasMenuItems, buildNodeMenuItems, ContextMenu } from './ContextMenu';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('Canvas ContextMenu builders', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.replaceChildren();
  });

  it('marks the shared positioned menu with the Canvas theme class', () => {
    act(() => {
      root.render(
        <ContextMenu
          x={12}
          y={24}
          items={[{ label: 'Reset view', onClick: vi.fn() }]}
          onClose={vi.fn()}
        />,
      );
    });

    expect(document.body.querySelector('.neko-menu')?.className).toBe(
      'neko-menu canvas-context-menu',
    );
  });

  it('exposes a node playback entry action before AI actions', () => {
    const onSetPlaybackEntry = vi.fn();
    const items = buildNodeMenuItems({
      canvasPosition: { x: 0, y: 0 },
      hasSelection: true,
      selectedCount: 1,
      contextNodeId: 'scene-1',
      onSetPlaybackEntry,
      onAddAction: vi.fn(),
      onDelete: vi.fn(),
      onSelectAll: vi.fn(),
      onFitContent: vi.fn(),
      onResetView: vi.fn(),
    });

    const playbackEntry = items.find(
      (item): item is MenuAction =>
        !('separator' in item) && item.label === 'Set as Playback Start',
    );

    expect(playbackEntry).toBeDefined();
    expect(playbackEntry?.disabled).toBe(false);

    playbackEntry?.onClick?.();

    expect(onSetPlaybackEntry).toHaveBeenCalledWith('scene-1');
  });

  it('projects the canonical add catalog without an empty Job action', () => {
    const onAddAction = vi.fn();
    const canvasPosition = { x: 18, y: 42 };
    const items = buildCanvasMenuItems({
      canvasPosition,
      hasSelection: false,
      selectedCount: 0,
      onAddAction,
      onDelete: vi.fn(),
      onSelectAll: vi.fn(),
      onFitContent: vi.fn(),
      onResetView: vi.fn(),
    });
    const groups = items.filter(
      (item): item is MenuAction => !('separator' in item) && item.submenu !== undefined,
    );

    expect(groups.map((group) => group.label)).toEqual(['Add Node']);
    const actions = groups.flatMap(
      (group) => group.submenu?.filter((item): item is MenuAction => !('separator' in item)) ?? [],
    );
    expect(actions.map((action) => action.label)).toEqual([
      'Text',
      'Table',
      'Image',
      'Video',
      'Audio',
      '3D Director',
    ]);

    const imageAction = actions.find((action) => action.label === 'Image');
    expect(imageAction?.submenu?.map((item) => ('separator' in item ? '' : item.label))).toEqual([
      'Create with AI',
      'Import file',
      'Reference project content',
    ]);
    const referenceAction = imageAction?.submenu?.find(
      (item): item is MenuAction =>
        !('separator' in item) && item.label === 'Reference project content',
    );
    referenceAction?.onClick?.();
    expect(onAddAction).toHaveBeenCalledWith('image', canvasPosition, 'reference');
  });
});
