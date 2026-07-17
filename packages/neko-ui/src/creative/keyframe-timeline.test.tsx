// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyframeTimeline } from './index';
import type { KeyframeTimelineTrack } from './index';

const tracks: KeyframeTimelineTrack[] = [
  {
    id: 'node.x',
    label: 'Position X',
    defaultValue: 0.5,
    keyframes: [{ id: 'kf-1', timeMs: 1000, value: 0.25, easing: 'linear' }],
  },
];

describe('@neko/ui KeyframeTimeline', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    host.style.width = '500px';
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
    document.querySelectorAll('.neko-menu').forEach((node) => node.remove());
    host.remove();
  });

  it('renders track labels and selected keyframes', () => {
    act(() => {
      root.render(
        <KeyframeTimeline
          currentTimeMs={500}
          durationMs={2000}
          selectedKeyframeIds={new Set(['kf-1'])}
          tracks={tracks}
          onKeyframeAdd={vi.fn()}
          onKeyframeRemove={vi.fn()}
          onSeek={vi.fn()}
        />,
      );
    });

    expect(host.textContent).toContain('Position X');
    expect(host.querySelector('.neko-keyframe-timeline')).not.toBeNull();
    expect(
      host.querySelector('.neko-keyframe-timeline')?.getAttribute('data-neko-keyboard-scope'),
    ).toBe('timeline');
    expect(host.querySelector('.neko-keyframe-diamond')?.getAttribute('title')).toContain(
      'Position X',
    );
  });

  it('delegates add, select, drag, and menu actions', () => {
    const onKeyframeAdd = vi.fn();
    const onKeyframeDrag = vi.fn();
    const onKeyframeRemove = vi.fn();
    const onKeyframeSelect = vi.fn();

    act(() => {
      root.render(
        <KeyframeTimeline
          currentTimeMs={500}
          durationMs={4000}
          pixelsPerSecond={100}
          tracks={tracks}
          onKeyframeAdd={onKeyframeAdd}
          onKeyframeDrag={onKeyframeDrag}
          onKeyframeRemove={onKeyframeRemove}
          onKeyframeSelect={onKeyframeSelect}
          onSeek={vi.fn()}
        />,
      );
    });

    const lane = host.querySelectorAll<HTMLDivElement>('[style*="position: relative"]')[1];
    expect(lane).not.toBeUndefined();

    if (!lane) throw new Error('KeyframeTimeline lane was not rendered');
    lane.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 400,
      }) as DOMRect;

    act(() => {
      lane.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: 200 }));
    });
    expect(onKeyframeAdd).toHaveBeenCalledWith('node.x', 2000, 0.5);

    const diamond = host.querySelector<HTMLElement>('.neko-keyframe-diamond');
    act(() => {
      diamond?.click();
    });
    expect(onKeyframeSelect).toHaveBeenCalledWith('kf-1', false);

    act(() => {
      diamond?.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 0 }),
      );
    });
    act(() => {
      document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 50 }));
    });
    act(() => {
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    expect(onKeyframeDrag).toHaveBeenCalledWith('node.x', 'kf-1', 1500);

    act(() => {
      diamond?.parentElement?.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, clientX: 10, clientY: 20 }),
      );
    });
    expect(document.querySelector('.neko-menu')?.textContent).toContain('Delete Keyframe');
    expect(document.querySelector('.neko-menu')?.getAttribute('data-neko-keyboard-scope')).toBe(
      'menu',
    );

    act(() => {
      document.querySelector<HTMLButtonElement>('.neko-menu-item')?.click();
    });
    expect(onKeyframeRemove).toHaveBeenCalledWith('node.x', 'kf-1');
  });
});
