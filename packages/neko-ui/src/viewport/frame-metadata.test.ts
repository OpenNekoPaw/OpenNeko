import { describe, expect, it } from 'vitest';
import type { RenderFrameMeta } from '@neko/shared';
import { bridgeRenderFrameMetaToViewportFrameMeta } from './frame-metadata';

describe('frame metadata bridge', () => {
  it('bridges existing RenderFrameMeta into ViewportFrameMeta', () => {
    const frame: RenderFrameMeta = {
      streamId: 'stream-main',
      sceneId: 'scene-a',
      viewportId: 'main',
      frameId: 12,
      ptsUs: 16666,
      durationUs: 16666,
      isKeyframe: true,
      sceneRevision: 7,
      appliedSeq: 5,
      frameTimestamp: 1770000000000,
      viewTransform: [2, 0, 0, 2, 10, 20],
      projectionJson: '{"kind":"orthographic"}',
    };

    expect(bridgeRenderFrameMetaToViewportFrameMeta(frame, 'fallback')).toEqual({
      protocolVersion: 1,
      streamId: 'stream-main',
      sceneId: 'scene-a',
      viewportId: 'main',
      frameId: 12,
      ptsUs: 16666,
      durationUs: 16666,
      frameTimestamp: 1770000000000,
      revision: 7,
      sceneRevision: 7,
      appliedSeq: 5,
      viewTransform: [2, 0, 0, 2, 10, 20],
      projection: { kind: 'orthographic' },
      diagnostics: undefined,
    });
  });

  it('uses fallback scene id and identity transform for legacy metadata', () => {
    const frame = {
      streamId: 'stream-main',
      viewportId: 'main',
      frameId: 12,
      ptsUs: 16666,
      durationUs: 16666,
      isKeyframe: true,
      sceneRevision: 7,
      appliedSeq: 5,
      frameTimestamp: 0,
      viewTransform: [],
    } satisfies RenderFrameMeta;

    const bridged = bridgeRenderFrameMetaToViewportFrameMeta(frame, 'scene-fallback');
    expect(bridged.sceneId).toBe('scene-fallback');
    expect(bridged.frameTimestamp).toBeCloseTo(16.666);
    expect(bridged.viewTransform).toEqual([1, 0, 0, 1, 0, 0]);
  });
});
