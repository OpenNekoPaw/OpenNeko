import { describe, expect, it } from 'vitest';
import type { ViewportFrameMeta, ViewportOverlayDescriptor } from '@neko/shared';
import {
  collectOverlayDiagnostics,
  createOverlayAlignmentSamples,
  projectOverlayPointForFrame,
} from './overlay-diagnostics';

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

describe('overlay diagnostics and alignment', () => {
  it('reports stale viewport, scene, revision, and applied sequence metadata', () => {
    const diagnostics = collectOverlayDiagnostics(
      [
        overlay('viewport', { viewportId: 'side' }),
        overlay('scene', { sceneId: 'scene-b' }),
        overlay('revision', { revision: 4 }),
        overlay('seq', { appliedSeq: 11 }),
      ],
      frameMeta,
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'viewport-mismatch',
      'scene-mismatch',
      'revision-mismatch',
      'applied-seq-ahead',
    ]);
  });

  it('projects 2D scene-space overlay points through frame transform metadata', () => {
    expect(projectOverlayPointForFrame(overlay('line'), [4, 8], frameMeta)).toEqual([18, 36]);
    expect(
      createOverlayAlignmentSamples(overlay('line'), frameMeta).map((item) => item.screen),
    ).toEqual([
      [10, 20],
      [12, 22],
    ]);
  });

  it('keeps 3D projected screen-space descriptors in screen coordinates', () => {
    const projected = overlay('anchor', {
      kind: 'points',
      coordinateSpace: 'screen',
      payload: { points: [[128, 64]] },
    });

    expect(createOverlayAlignmentSamples(projected, frameMeta)[0]?.screen).toEqual([128, 64]);
  });
});

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
    appliedSeq: 10,
    payload: {
      points: [
        [0, 0],
        [1, 1],
      ],
    },
    ...patch,
  };
}
