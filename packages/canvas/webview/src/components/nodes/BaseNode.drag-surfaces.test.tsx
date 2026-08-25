// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseNode } from './BaseNode';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('BaseNode drag surfaces', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it.each([
    ['external label', '[data-canvas-node-label]'],
    ['top edge', '[data-node-drag-rail="top"]'],
    ['bottom edge', '[data-node-drag-rail="bottom"]'],
  ])('starts the canonical drag path from the %s', (_name, selector) => {
    const onSelect = vi.fn();
    const onTransformStart = vi.fn();
    act(() => {
      root.render(
        <BaseNode
          node={{
            id: 'node-1',
            type: 'file',
            position: { x: 20, y: 30 },
            size: { width: 240, height: 160 },
            zIndex: 1,
          }}
          viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
          isSelected={false}
          autoSizeContent={false}
          nodeLabel={{ icon: null, text: 'notes.md' }}
          onSelect={onSelect}
          onTransformStart={onTransformStart}
        >
          <div>Preview</div>
        </BaseNode>,
      );
    });

    const surface = container.querySelector<HTMLElement>(selector);
    expect(surface?.dataset.nodeDragAllow).toBe('true');
    act(() => {
      surface?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });

    expect(onSelect).toHaveBeenCalledWith('node-1', false);
    expect(onTransformStart).toHaveBeenCalledWith('node-1');
    act(() => window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })));
  });
});
