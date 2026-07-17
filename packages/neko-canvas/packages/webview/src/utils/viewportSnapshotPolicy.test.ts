import { describe, expect, it, vi } from 'vitest';
import type { CanvasViewport } from '@neko/shared';
import { createViewportSnapshotPolicy } from './viewportSnapshotPolicy';

const VIEWPORT_A: CanvasViewport = {
  pan: { x: 10, y: 20 },
  zoom: 1.25,
};

const VIEWPORT_B: CanvasViewport = {
  pan: { x: 30, y: 40 },
  zoom: 1.5,
};

describe('viewport snapshot policy', () => {
  it('writes one latest snapshot after idle debounce', () => {
    vi.useFakeTimers();
    const writeSnapshot = vi.fn();
    const policy = createViewportSnapshotPolicy({
      writer: { writeSnapshot },
      idleDelayMs: 100,
    });

    policy.schedule(VIEWPORT_A);
    policy.schedule(VIEWPORT_B);
    vi.advanceTimersByTime(100);

    expect(writeSnapshot).toHaveBeenCalledTimes(1);
    expect(writeSnapshot).toHaveBeenCalledWith(VIEWPORT_B, 'idle');
    vi.useRealTimers();
  });

  it('flushes pending snapshot once and deduplicates repeated flushes', () => {
    vi.useFakeTimers();
    const writeSnapshot = vi.fn();
    const policy = createViewportSnapshotPolicy({
      writer: { writeSnapshot },
      idleDelayMs: 100,
    });

    policy.schedule(VIEWPORT_A);
    policy.flush('blur');
    policy.schedule(VIEWPORT_A);
    policy.flush('close');
    vi.advanceTimersByTime(100);

    expect(writeSnapshot).toHaveBeenCalledTimes(1);
    expect(writeSnapshot).toHaveBeenCalledWith(VIEWPORT_A, 'blur');
    vi.useRealTimers();
  });

  it('flushes a later distinct snapshot', () => {
    vi.useFakeTimers();
    const writeSnapshot = vi.fn();
    const policy = createViewportSnapshotPolicy({
      writer: { writeSnapshot },
      idleDelayMs: 100,
    });

    policy.schedule(VIEWPORT_A);
    policy.flush('save');
    policy.schedule(VIEWPORT_B);
    policy.flush('close');

    expect(writeSnapshot).toHaveBeenCalledTimes(2);
    expect(writeSnapshot).toHaveBeenLastCalledWith(VIEWPORT_B, 'close');
    vi.useRealTimers();
  });
});
