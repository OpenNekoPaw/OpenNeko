import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineRuler } from './index';

describe('@neko/ui TimelineRuler', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '400px';
    document.body.appendChild(host);
    root = createRoot(host);
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      value: () => ({
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        fillText: vi.fn(),
        setTransform: vi.fn(),
        set fillStyle(_value: string) {},
        set font(_value: string) {},
        set globalAlpha(_value: number) {},
        set textBaseline(_value: string) {},
      }),
    });
    class TestResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
    }
    Object.defineProperty(window, 'ResizeObserver', {
      configurable: true,
      value: TestResizeObserver,
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders the shared ruler shell and seeks by pointer position', () => {
    const onSeek = vi.fn();

    act(() => {
      root.render(
        <TimelineRuler
          className="custom-ruler"
          duration={10}
          height={28}
          pixelsPerSecond={20}
          onSeek={onSeek}
        />,
      );
    });

    const shell = host.querySelector<HTMLDivElement>('.neko-ruler');
    const canvas = host.querySelector<HTMLCanvasElement>('canvas');
    expect(shell?.className).toContain('custom-ruler');
    expect(shell?.style.height).toBe('28px');
    expect(canvas).not.toBeNull();

    if (!canvas) throw new Error('TimelineRuler canvas was not rendered');
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 400,
      }) as DOMRect;

    act(() => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 40 }));
    });

    expect(onSeek).toHaveBeenCalledWith(2);
  });
});
