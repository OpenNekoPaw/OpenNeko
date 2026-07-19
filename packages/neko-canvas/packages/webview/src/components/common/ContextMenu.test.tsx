// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MenuAction } from '@neko/ui/primitives';
import { buildNodeMenuItems, ContextMenu } from './ContextMenu';

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
      onAddText: vi.fn(),
      onAddScene: vi.fn(),
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
});
