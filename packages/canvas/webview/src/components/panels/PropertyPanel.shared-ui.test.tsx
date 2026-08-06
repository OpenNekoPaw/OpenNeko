// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasNode } from '@neko/canvas-domain';
import { PropertyPanel } from './PropertyPanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(globalThis as { React?: typeof React }).React = React;

describe('Canvas PropertyPanel shared UI migration', () => {
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
    host.remove();
  });

  it('delegates transform, lock, and delete actions through shared controls', () => {
    const onDeleteNode = vi.fn();
    const onToggleLock = vi.fn();
    const onUpdateNode = vi.fn();

    act(() => {
      root.render(
        <PropertyPanel
          selectedNodes={[createNode()]}
          onDeleteNode={onDeleteNode}
          onToggleLock={onToggleLock}
          onUpdateNode={onUpdateNode}
          onUpdateNodeData={vi.fn()}
        />,
      );
    });

    const xInput = host.querySelector<HTMLInputElement>(
      '[data-property-id="position.x"] input[type="number"]',
    );
    expect(xInput).not.toBeNull();

    act(() => {
      if (!xInput) return;
      setInputValue(xInput, '24');
      xInput.dispatchEvent(new Event('input', { bubbles: true }));
      xInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
    });
    expect(onUpdateNode).toHaveBeenCalledWith('node-1', { position: { x: 24, y: 20 } });

    act(() => {
      host.querySelector<HTMLButtonElement>('button .codicon-lock')?.closest('button')?.click();
    });
    expect(onToggleLock).toHaveBeenCalledWith('node-1');

    act(() => {
      host.querySelector<HTMLButtonElement>('button .codicon-trash')?.closest('button')?.click();
    });
    expect(onDeleteNode).toHaveBeenCalledWith('node-1');
  });

  it('renders canonical Markdown content', () => {
    act(() => {
      root.render(
        <PropertyPanel
          selectedNodes={[
            createNode({
              id: 'markdown-1',
              type: 'markdown',
              data: {
                title: 'Opening',
                content: '# Opening',
              },
            }),
          ]}
          onDeleteNode={vi.fn()}
          onToggleLock={vi.fn()}
          onUpdateNode={vi.fn()}
          onUpdateNodeData={vi.fn()}
        />,
      );
    });

    expect(
      host.querySelector<HTMLTextAreaElement>('textarea[aria-label="Markdown content"]')?.value,
    ).toBe('# Opening');
    expect(host.textContent).not.toContain('References');
    expect(host.textContent).not.toContain('runtime projection');
  });
});

function createNode(overrides: Partial<CanvasNode> = {}): CanvasNode {
  return {
    id: 'node-1',
    type: 'markdown',
    position: { x: 10, y: 20 },
    size: { width: 120, height: 80 },
    zIndex: 4,
    rotation: 15,
    locked: true,
    data: { title: 'Note', content: 'Note' },
    ...overrides,
  } as CanvasNode;
}

function setInputValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(
    input,
    value,
  );
}
