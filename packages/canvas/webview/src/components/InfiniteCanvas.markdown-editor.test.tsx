// @vitest-environment jsdom

import type { MarkdownCanvasNode } from '@neko/canvas-domain';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { enableDefaultCanvasTestStoreScope } from '../stores/canvasStoreScope';
import { InfiniteCanvas } from './InfiniteCanvas';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  enableDefaultCanvasTestStoreScope();
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  });
});

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  container?.remove();
  container = undefined;
  document.body.replaceChildren();
});

describe('InfiniteCanvas Markdown editor', () => {
  it('uses one fullscreen Surface and restores Canvas interaction after close', async () => {
    const node = markdownNode();
    const onModalOpenChange = vi.fn();
    ({ root, container } = createTestRoot());

    await act(async () => {
      root?.render(
        <InfiniteCanvas
          nodes={[node]}
          connections={[]}
          viewport={{ pan: { x: 20, y: 30 }, zoom: 1 }}
          selectedNodeIds={[node.id]}
          onViewportChange={vi.fn()}
          onNodeUpdateData={vi.fn()}
          onFullscreenPreviewOpenChange={onModalOpenChange}
          enableCulling={false}
          isGridVisible={false}
        />,
      );
    });

    expect(container?.querySelector('[data-selection-context-toolbar]')).not.toBeNull();
    expect(container?.querySelector('[data-node-id="markdown-1"] .ProseMirror')).toBeNull();

    await act(async () => {
      container
        ?.querySelector('[data-node-id="markdown-1"]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    });
    await vi.waitFor(() =>
      expect(
        container?.querySelector('[data-canvas-markdown-editor="true"] .ProseMirror'),
      ).not.toBeNull(),
    );

    expect(
      container
        ?.querySelector('[data-canvas-viewport-root="true"]')
        ?.getAttribute('data-canvas-interaction-suspended'),
    ).toBe('true');
    expect(container?.querySelector('[data-selection-context-toolbar]')).toBeNull();
    expect(container?.querySelector('[data-node-id="markdown-1"] .ProseMirror')).toBeNull();
    expect(
      container?.querySelectorAll('[data-canvas-markdown-editor="true"] .ProseMirror'),
    ).toHaveLength(1);
    expect(onModalOpenChange).toHaveBeenLastCalledWith(true);

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-canvas-markdown-editor-action="close"]')
        ?.click();
    });

    expect(container?.querySelector('[data-canvas-markdown-editor="true"]')).toBeNull();
    expect(
      container
        ?.querySelector('[data-canvas-viewport-root="true"]')
        ?.hasAttribute('data-canvas-interaction-suspended'),
    ).toBe(false);
    expect(container?.querySelector('[data-selection-context-toolbar]')).not.toBeNull();
    expect(onModalOpenChange).toHaveBeenLastCalledWith(false);
  });
});

function markdownNode(): MarkdownCanvasNode {
  return {
    id: 'markdown-1',
    type: 'markdown',
    position: { x: 10, y: 20 },
    size: { width: 320, height: 220 },
    zIndex: 1,
    data: {
      title: '卷一分析',
      content: '# 第一章\n\n这是长文编辑内容。',
    },
  };
}

function createTestRoot(): { readonly root: Root; readonly container: HTMLDivElement } {
  const nextContainer = document.createElement('div');
  nextContainer.style.width = '800px';
  nextContainer.style.height = '600px';
  document.body.append(nextContainer);
  return { root: createRoot(nextContainer), container: nextContainer };
}
