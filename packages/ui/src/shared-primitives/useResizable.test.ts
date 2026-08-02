import { describe, expect, it } from 'vitest';
import {
  beginResizeSession,
  calculateEdgeSize,
  clampResizeSize,
  endResizeSession,
  getResizeCursor,
  getResizeOrientation,
  isActiveResizePointer,
  resolveResizeSize,
  type ResizeRect,
} from './useResizable';

const rect: ResizeRect = {
  left: 100,
  right: 900,
  top: 50,
  bottom: 450,
  width: 800,
  height: 400,
};

describe('resize sizing helpers', () => {
  it('clamps pixel sizes to min and max bounds', () => {
    expect(clampResizeSize(120, 200, 500)).toBe(200);
    expect(clampResizeSize(640, 200, 500)).toBe(500);
    expect(clampResizeSize(320, 200, 500)).toBe(320);
  });

  it('clamps ratio sizes to min and max bounds', () => {
    expect(clampResizeSize(0.1, 0.2, 0.8)).toBe(0.2);
    expect(clampResizeSize(0.9, 0.2, 0.8)).toBe(0.8);
    expect(clampResizeSize(0.5, 0.2, 0.8)).toBe(0.5);
  });

  it('calculates right-edge pixel size from the container right edge', () => {
    expect(calculateEdgeSize('right', 'pixel', { clientX: 620, clientY: 0 }, rect)).toBe(280);
  });

  it('calculates left-edge pixel size from the container left edge', () => {
    expect(calculateEdgeSize('left', 'pixel', { clientX: 380, clientY: 0 }, rect)).toBe(280);
  });

  it('calculates top-edge ratio size from the container top edge', () => {
    expect(calculateEdgeSize('top', 'ratio', { clientX: 0, clientY: 250 }, rect)).toBe(0.5);
  });

  it('calculates bottom-edge ratio size from the container bottom edge', () => {
    expect(calculateEdgeSize('bottom', 'ratio', { clientX: 0, clientY: 250 }, rect)).toBe(0.5);
  });

  it('uses custom calculateSize before clamping', () => {
    const size = resolveResizeSize(
      {
        edge: 'right',
        mode: 'pixel',
        minSize: 100,
        maxSize: 300,
        calculateSize: () => 500,
      },
      { clientX: 0, clientY: 0 },
      rect,
    );

    expect(size).toBe(300);
  });

  it('maps edges to separator orientation and cursor style', () => {
    expect(getResizeOrientation('left')).toBe('vertical');
    expect(getResizeOrientation('right')).toBe('vertical');
    expect(getResizeOrientation('top')).toBe('horizontal');
    expect(getResizeOrientation('bottom')).toBe('horizontal');
    expect(getResizeCursor('left')).toBe('ew-resize');
    expect(getResizeCursor('bottom')).toBe('ns-resize');
  });
});

describe('resize pointer session helpers', () => {
  it('tracks the active pointer and ignores stale pointer IDs', () => {
    const session = beginResizeSession(7);

    expect(session).toEqual({ activePointerId: 7, isResizing: true });
    expect(isActiveResizePointer(session, 7)).toBe(true);
    expect(isActiveResizePointer(session, 8)).toBe(false);
    expect(endResizeSession(session, 8)).toBe(session);
  });

  it('ends active resize interactions idempotently', () => {
    const active = beginResizeSession(7);
    const ended = endResizeSession(active, 7);
    const endedAgain = endResizeSession(ended, 7);

    expect(ended).toEqual({ activePointerId: null, isResizing: false });
    expect(endedAgain).toBe(ended);
  });
});
