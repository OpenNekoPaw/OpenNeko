// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import { useCanvasStore } from '../../stores/canvasStore';
import { NodeContentDispatcher } from './NodeContentDispatcher';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('composable node content drag ownership', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useCanvasStore.setState({ activePlayingNodeId: null });
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('starts the node gesture from material content and rejects native asset dragging', () => {
    const onTransformStart = vi.fn();
    const node = {
      id: 'document-drag',
      type: 'document',
      position: { x: 0, y: 0 },
      size: { width: 280, height: 180 },
      zIndex: 1,
      data: { title: 'Drag preview' },
      content: {
        id: 'drag-content-root',
        blocks: [
          {
            id: 'drag-material-preview',
            kind: 'text',
            binding: { path: '/title' },
          },
        ],
      },
    } as unknown as CanvasNode;

    act(() => {
      root.render(
        <NodeContentDispatcher
          context={{
            node,
            allNodes: [node],
            selectedNodeIds: [],
            viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
            isSelected: false,
            containerRef: { current: null },
            onTransformStart,
          }}
        />,
      );
    });

    const preview = host.querySelector('[data-content-block-id="drag-material-preview"]');
    expect(preview).not.toBeNull();

    act(() => {
      preview?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });
    expect(onTransformStart).toHaveBeenCalledWith(node.id);

    const nativeDrag = new Event('dragstart', { bubbles: true, cancelable: true });
    act(() => {
      preview?.dispatchEvent(nativeDrag);
    });
    expect(nativeDrag.defaultPrevented).toBe(true);
  });
});
