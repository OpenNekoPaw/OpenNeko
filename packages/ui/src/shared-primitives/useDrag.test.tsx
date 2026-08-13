// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDrag } from './useDrag';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useDrag', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('finishes a drag when mouseup follows mousedown in the same task', () => {
    const onEnd = vi.fn();
    act(() => root.render(<DragHarness onEnd={onEnd} />));

    act(() => {
      const target = container.querySelector<HTMLButtonElement>('button');
      target?.dispatchEvent(mouseEvent('mousedown', 10, 20, 0));
      window.dispatchEvent(mouseEvent('mouseup', 10, 20, 0));
    });

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button')?.dataset.dragging).toBe('false');
  });

  it('finishes the current drag when the window loses focus', () => {
    const onEnd = vi.fn();
    act(() => root.render(<DragHarness onEnd={onEnd} />));

    act(() => {
      container
        .querySelector<HTMLButtonElement>('button')
        ?.dispatchEvent(mouseEvent('mousedown', 30, 40, 0));
    });
    act(() => window.dispatchEvent(new Event('blur')));

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button')?.dataset.dragging).toBe('false');
  });

  it('finishes a drag when the pointer returns without a pressed button', () => {
    const onEnd = vi.fn();
    act(() => root.render(<DragHarness onEnd={onEnd} />));

    act(() => {
      container
        .querySelector<HTMLButtonElement>('button')
        ?.dispatchEvent(mouseEvent('mousedown', 30, 40, 1));
    });
    act(() => window.dispatchEvent(mouseEvent('mousemove', 90, 110, 0)));

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(container.querySelector('button')?.dataset.dragging).toBe('false');
  });
});

function DragHarness({ onEnd }: { readonly onEnd: () => void }) {
  const drag = useDrag({
    onStart: (event) => ({ clientX: event.clientX, clientY: event.clientY }),
    onMove: () => undefined,
    onEnd,
  });
  return (
    <button type="button" data-dragging={String(drag.isDragging)} {...drag.bindDrag}>
      drag
    </button>
  );
}

function mouseEvent(type: string, clientX: number, clientY: number, buttons: number): MouseEvent {
  return new MouseEvent(type, { bubbles: true, button: 0, buttons, clientX, clientY });
}
