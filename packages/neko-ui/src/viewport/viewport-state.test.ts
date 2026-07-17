import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEWPORT_LOCAL_STATE,
  applyViewportTransform,
  createViewportPointerInput,
  createViewportWheelInput,
  reduceViewportLocalState,
} from './viewport-state';

describe('viewport local state helpers', () => {
  it('keeps shell-local pan, zoom, resize, and quality state local', () => {
    const panned = reduceViewportLocalState(DEFAULT_VIEWPORT_LOCAL_STATE, {
      type: 'panBy',
      delta: [8, -4],
    });
    expect(panned.pan).toEqual([8, -4]);

    const zoomed = reduceViewportLocalState(panned, {
      type: 'zoomBy',
      origin: [100, 50],
      delta: -120,
    });
    expect(zoomed.zoom).toBeGreaterThan(1);

    const resized = reduceViewportLocalState(zoomed, {
      type: 'resize',
      size: { width: 1920.2, height: 1080.4, pixelRatio: 1.5 },
    });
    expect(resized.size).toEqual({ width: 1920, height: 1080, pixelRatio: 1.5 });

    const quality = reduceViewportLocalState(resized, { type: 'quality', quality: 'high' });
    expect(quality.quality).toBe('high');
  });

  it('maps frame transform matrices to overlay coordinates', () => {
    expect(applyViewportTransform([2, 0, 0, 2, 10, -5], [3, 4])).toEqual([16, 3]);
  });

  it('normalizes pointer and wheel inputs from DOM events', () => {
    const rect = { left: 10, top: 20 };
    const pointer = createViewportPointerInput(
      'scene-a',
      'main',
      'down',
      {
        pointerId: 7,
        pointerType: 'mouse',
        clientX: 110,
        clientY: 70,
        buttons: 1,
        button: 0,
        pressure: 0.5,
        altKey: false,
        ctrlKey: true,
        metaKey: false,
        shiftKey: true,
      },
      rect,
      123,
    );
    expect(pointer.position).toEqual([100, 50]);
    expect(pointer.modifiers).toEqual({ alt: false, ctrl: true, meta: false, shift: true });

    const wheel = createViewportWheelInput(
      'scene-a',
      'main',
      {
        clientX: 20,
        clientY: 30,
        deltaX: 0,
        deltaY: -120,
        deltaMode: 0,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
      },
      rect,
      124,
    );
    expect(wheel.position).toEqual([10, 10]);
    expect(wheel.deltaMode).toBe('pixel');
  });
});
