// @vitest-environment jsdom

import type { MarkdownCanvasNode } from '@neko/canvas-domain';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { MarkdownNode } from './CanonicalContentNodes';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  });
});

afterEach(() => document.body.replaceChildren());

describe('MarkdownNode', () => {
  it('keeps the compact node read-only and delegates explicit activation to Canvas', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const onMarkdownEdit = vi.fn();
    const node: MarkdownCanvasNode = {
      id: 'markdown-1',
      type: 'markdown',
      position: { x: 10, y: 20 },
      size: { width: 260, height: 180 },
      zIndex: 1,
      data: {
        title: '分析结果',
        content: '# 第一章\n\n这是画布分析。',
      },
    };

    await act(async () => {
      root.render(
        <MarkdownNode
          node={node}
          viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
          isSelected
          containerRef={{ current: container }}
          onUpdateData={vi.fn()}
          onMarkdownEdit={onMarkdownEdit}
        />,
      );
    });

    expect(container.querySelector('[data-markdown-document="ready"]')?.textContent).toContain(
      '这是画布分析。',
    );
    expect(
      container
        .querySelector('.canvas-markdown-node__preview')
        ?.getAttribute('data-canvas-wheel-owner'),
    ).toBe('content');
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('.ProseMirror')).toBeNull();

    await act(async () => {
      container
        .querySelector('[data-node-id="markdown-1"]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(onMarkdownEdit).toHaveBeenCalledOnce();
    expect(onMarkdownEdit).toHaveBeenCalledWith(node.id);
    expect(container.querySelector('.ProseMirror')).toBeNull();
    expect(container.querySelector('[data-markdown-document="ready"]')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
