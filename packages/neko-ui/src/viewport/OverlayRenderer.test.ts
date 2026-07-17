import { describe, expect, it, vi } from 'vitest';
import type { ViewportFrameMeta, ViewportOverlayDescriptor } from '@neko/shared';
import {
  drawOverlayDescriptors,
  isOverlayDescriptorFresh,
  sortOverlayDescriptors,
} from './OverlayRenderer';

const frameMeta: ViewportFrameMeta = {
  protocolVersion: 1,
  streamId: 'stream-main',
  sceneId: 'scene-a',
  viewportId: 'main',
  frameId: 1,
  ptsUs: 0,
  durationUs: 16666,
  frameTimestamp: 100,
  revision: 5,
  appliedSeq: 10,
  viewTransform: [2, 0, 0, 2, 10, 20],
};

function overlay(
  id: string,
  patch: Partial<ViewportOverlayDescriptor> = {},
): ViewportOverlayDescriptor {
  return {
    id,
    kind: 'polyline',
    sceneId: 'scene-a',
    viewportId: 'main',
    coordinateSpace: 'scene',
    revision: 5,
    zIndex: 0,
    payload: {
      points: [
        [0, 0],
        [1, 1],
      ],
    },
    ...patch,
  };
}

describe('OverlayRenderer helpers', () => {
  it('sorts overlay descriptors by z-index', () => {
    expect(
      sortOverlayDescriptors([overlay('b', { zIndex: 20 }), overlay('a', { zIndex: 1 })]).map(
        (item) => item.id,
      ),
    ).toEqual(['a', 'b']);
  });

  it('rejects stale viewport, scene, and revision metadata', () => {
    expect(isOverlayDescriptorFresh(overlay('ok'), frameMeta)).toBe(true);
    expect(isOverlayDescriptorFresh(overlay('viewport', { viewportId: 'side' }), frameMeta)).toBe(
      false,
    );
    expect(isOverlayDescriptorFresh(overlay('scene', { sceneId: 'scene-b' }), frameMeta)).toBe(
      false,
    );
    expect(isOverlayDescriptorFresh(overlay('revision', { revision: 4 }), frameMeta)).toBe(false);
    expect(isOverlayDescriptorFresh(overlay('seq', { appliedSeq: 11 }), frameMeta)).toBe(false);
  });

  it('draws scene-space polylines through frame transform metadata', () => {
    const context = fakeContext();
    drawOverlayDescriptors(context, [overlay('line')], frameMeta);

    expect(context.moveTo).toHaveBeenCalledWith(10, 20);
    expect(context.lineTo).toHaveBeenCalledWith(12, 22);
    expect(context.stroke).toHaveBeenCalled();
  });
});

function fakeContext() {
  return {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  };
}
