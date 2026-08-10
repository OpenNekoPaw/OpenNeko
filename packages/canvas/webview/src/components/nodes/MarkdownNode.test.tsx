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
  it('keeps selection read-only and enters Rich editing only after explicit activation', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
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
        />,
      );
    });

    expect(container.querySelector('[data-markdown-document="ready"]')?.textContent).toContain(
      '这是画布分析。',
    );
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('.ProseMirror')).toBeNull();

    await act(async () => {
      container
        .querySelector('[data-node-id="markdown-1"]')
        ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await vi.waitFor(() => expect(container.querySelector('.ProseMirror')).not.toBeNull());

    expect(container.querySelector('.ProseMirror')?.textContent).toContain('这是画布分析。');
    expect(container.querySelector('textarea')).toBeNull();

    await act(async () => {
      container
        .querySelector('.ProseMirror')
        ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('.ProseMirror')).toBeNull();
    expect(container.querySelector('[data-markdown-document="ready"]')).not.toBeNull();

    await act(async () => root.unmount());
  });
});
