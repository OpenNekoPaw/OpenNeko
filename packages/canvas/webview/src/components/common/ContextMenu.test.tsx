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

  it('keeps the node menu limited to functional graph layout actions', () => {
    const onBringToFront = vi.fn();
    const onSendToBack = vi.fn();
    const onToggleLock = vi.fn();
    const items = buildNodeMenuItems({
      canvasPosition: { x: 0, y: 0 },
      hasSelection: true,
      selectedCount: 1,
      contextNodeId: 'scene-1',
      onBringToFront,
      onSendToBack,
      onToggleLock,
      onAddAction: vi.fn(),
      onSelectAll: vi.fn(),
      onFitContent: vi.fn(),
      onResetView: vi.fn(),
    });

    const actions = items.filter((item): item is MenuAction => !('separator' in item));
    expect(actions.map((item) => item.label)).toEqual(['Bring to Front', 'Send to Back', 'Lock']);
    actions.forEach((action) => action.onClick?.());
    expect(onBringToFront).toHaveBeenCalledOnce();
    expect(onSendToBack).toHaveBeenCalledOnce();
    expect(onToggleLock).toHaveBeenCalledOnce();
  });

  it('keeps node deletion out of the context menu so keyboard ownership stays canonical', () => {
    const items = buildNodeMenuItems({
      canvasPosition: { x: 0, y: 0 },
      hasSelection: true,
      selectedCount: 1,
      contextNodeId: 'scene-1',
      onAddAction: vi.fn(),
      onSelectAll: vi.fn(),
      onFitContent: vi.fn(),
      onResetView: vi.fn(),
    });

    expect(items.some((item) => !('separator' in item) && item.label === 'Delete')).toBe(false);
  });

  it('keeps copy, cut, duplicate and media editing out of the node context menu', () => {
    const items = buildNodeMenuItems({
      canvasPosition: { x: 0, y: 0 },
      hasSelection: true,
      selectedCount: 1,
      contextNodeId: 'image-1',
      onAddAction: vi.fn(),
      onSelectAll: vi.fn(),
      onFitContent: vi.fn(),
      onResetView: vi.fn(),
    });
    const labels = items.flatMap((item) => ('separator' in item ? [] : [item.label]));

    expect(labels).not.toContain('Copy');
    expect(labels).not.toContain('Cut');
    expect(labels).not.toContain('Duplicate');
    expect(labels).not.toContain('Crop');
    expect(labels).not.toContain('Set as Playback Start');
    expect(labels).not.toContain('Send to Agent');
    expect(labels).toEqual(['Bring to Front', 'Send to Back', 'Lock']);
  });

  it('projects the canonical add catalog without an empty Job action', () => {
    const onAddAction = vi.fn();
    const canvasPosition = { x: 18, y: 42 };
    const items = buildCanvasMenuItems({
      canvasPosition,
      hasSelection: false,
      selectedCount: 0,
      onAddAction,
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
    expect(actions.map((action) => action.label)).toEqual(['Text', 'Image', 'Video', 'Audio']);

    const imageAction = actions.find((action) => action.label === 'Image');
    expect(imageAction?.submenu).toBeUndefined();
    imageAction?.onClick?.();
    expect(onAddAction).toHaveBeenCalledWith('image', canvasPosition);
  });
});
