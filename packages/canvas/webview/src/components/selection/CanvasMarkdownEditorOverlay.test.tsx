// @vitest-environment jsdom

import type { MarkdownCanvasNode } from '@neko/canvas-domain';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CanvasMarkdownEditorOverlay } from './CanvasMarkdownEditorOverlay';

vi.mock('@neko/markdown/rich-surface', async () => {
  const { useEffect: useMockEffect } = await import('react');
  return {
    MilkdownRichSurface: ({
      value,
      onChange,
      onActions,
      onStateChange,
    }: {
      readonly value: string;
      readonly onChange: (value: string) => void;
      readonly onActions?: (actions: { readonly focus: () => void }) => void;
      readonly onStateChange?: (state: 'ready') => void;
    }) => {
      useMockEffect(() => {
        onActions?.({ focus: () => undefined });
        onStateChange?.('ready');
      }, [onActions, onStateChange]);
      return (
        <button
          type="button"
          data-fake-rich-surface="true"
          onClick={() => onChange(`${value}\n\n更新内容`)}
        >
          {value}
        </button>
      );
    },
  };
});

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe('CanvasMarkdownEditorOverlay', () => {
  it('updates the exact node and closes only for the owned completion inputs', async () => {
    const node = markdownNode();
    const onUpdateData = vi.fn();
    const onClose = vi.fn();
    ({ root, container } = createTestRoot());

    await act(async () => {
      root?.render(
        <CanvasMarkdownEditorOverlay
          nodeId={node.id}
          node={node}
          onUpdateData={onUpdateData}
          onClose={onClose}
        />,
      );
    });
    await vi.waitFor(() =>
      expect(
        container
          ?.querySelector('[data-canvas-markdown-editor]')
          ?.getAttribute('data-editor-state'),
      ).toBe('ready'),
    );

    expect(container?.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');
    expect(
      container
        ?.querySelector('.canvas-markdown-editor-overlay__body')
        ?.getAttribute('data-canvas-wheel-owner'),
    ).toBe('content');

    await act(async () => {
      container?.querySelector<HTMLButtonElement>('[data-fake-rich-surface]')?.click();
    });
    expect(onUpdateData).toHaveBeenCalledWith(node.id, {
      ...node.data,
      content: `${node.data.content}\n\n更新内容`,
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      container
        ?.querySelector<HTMLButtonElement>('[data-canvas-markdown-editor-action="close"]')
        ?.click();
    });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('owns Escape and fails locally when the exact node disappears', async () => {
    const onClose = vi.fn();
    ({ root, container } = createTestRoot());
    await act(async () => {
      root?.render(
        <CanvasMarkdownEditorOverlay
          nodeId="missing-markdown"
          onUpdateData={vi.fn()}
          onClose={onClose}
        />,
      );
    });

    expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
      'no longer available',
    );
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    window.dispatchEvent(escape);
    expect(escape.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalledOnce();
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
      content: '# 第一章\n\n初始内容',
    },
  };
}

function createTestRoot(): { readonly root: Root; readonly container: HTMLDivElement } {
  const nextContainer = document.createElement('div');
  document.body.append(nextContainer);
  return { root: createRoot(nextContainer), container: nextContainer };
}
