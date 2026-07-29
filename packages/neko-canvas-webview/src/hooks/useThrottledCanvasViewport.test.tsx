// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasViewport } from '@neko/shared';
import { useThrottledCanvasViewport } from './useThrottledCanvasViewport';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('useThrottledCanvasViewport', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('publishes viewport snapshots at a bounded interval while enabled', () => {
    const first = createViewport(0);
    const second = createViewport(20);
    const third = createViewport(40);

    act(() => {
      root.render(<ViewportHarness viewport={first} enabled intervalMs={80} />);
    });
    expect(host.textContent).toBe('0');

    act(() => {
      vi.setSystemTime(20);
      root.render(<ViewportHarness viewport={second} enabled intervalMs={80} />);
    });
    expect(host.textContent).toBe('0');

    act(() => {
      vi.setSystemTime(40);
      root.render(<ViewportHarness viewport={third} enabled intervalMs={80} />);
    });
    expect(host.textContent).toBe('0');

    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(host.textContent).toBe('40');
  });

  it('publishes immediately when throttling is disabled', () => {
    act(() => {
      root.render(<ViewportHarness viewport={createViewport(0)} enabled intervalMs={80} />);
    });
    act(() => {
      root.render(
        <ViewportHarness viewport={createViewport(60)} enabled={false} intervalMs={80} />,
      );
    });

    expect(host.textContent).toBe('60');
  });
});

function ViewportHarness({
  viewport,
  enabled,
  intervalMs,
}: {
  viewport: CanvasViewport;
  enabled: boolean;
  intervalMs: number;
}) {
  const snapshot = useThrottledCanvasViewport(viewport, { enabled, intervalMs });
  return <div>{snapshot.pan.x}</div>;
}

function createViewport(x: number): CanvasViewport {
  return { pan: { x, y: 0 }, zoom: 1 };
}
