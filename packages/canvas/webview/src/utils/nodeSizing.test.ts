import { describe, expect, it } from 'vitest';
import {
  centerNodeAt,
  clampNodeRenderSize,
  clampNodeSize,
  clampNodeStoredSize,
  clampNodeStoredSizes,
  resolveNodeMinSize,
} from './nodeSizing';

describe('nodeSizing', () => {
  it('converts a viewport target into a centered node position', () => {
    expect(centerNodeAt({ x: 400, y: 300 }, { width: 320, height: 240 })).toEqual({
      x: 240,
      y: 180,
    });
  });

  it('resolves minimum sizes for known container and leaf nodes', () => {
    expect(resolveNodeMinSize({ type: 'group' })).toEqual({ width: 110, height: 75 });
    expect(resolveNodeMinSize({ type: 'media' })).toEqual({ width: 80, height: 50 });
    expect(resolveNodeMinSize({ type: 'job' })).toEqual({ width: 100, height: 60 });
    expect(resolveNodeMinSize({ type: 'media', data: { mediaType: 'audio' } })).toEqual({
      width: 180,
      height: 90,
    });
    expect(resolveNodeMinSize({ type: 'generation', data: { recipe: { kind: 'audio' } } })).toEqual(
      { width: 180, height: 90 },
    );
  });

  it('preserves an image node ratio when deriving its resize minimum', () => {
    expect(
      resolveNodeMinSize({
        type: 'media',
        size: { width: 40, height: 120 },
        data: { mediaType: 'image' },
      }),
    ).toEqual({ width: 50 / 3, height: 50 });
    expect(
      resolveNodeMinSize({
        type: 'media',
        size: { width: 120, height: 40 },
        data: { mediaType: 'video' },
      }),
    ).toEqual({ width: 80, height: 50 });
  });

  it('uses conservative fallback minimums for unknown nodes', () => {
    expect(resolveNodeMinSize({ type: 'custom-node' })).toEqual({ width: 80, height: 50 });
    expect(resolveNodeMinSize({ type: 'custom-container', container: {} })).toEqual({
      width: 110,
      height: 75,
    });
  });

  it('clamps invalid and undersized node dimensions', () => {
    expect(clampNodeSize({ width: 12, height: Number.NaN }, { width: 180, height: 120 })).toEqual({
      width: 180,
      height: 120,
    });
  });

  it('keeps collapsed render height visual-only while clamping width', () => {
    expect(
      clampNodeRenderSize({ type: 'group', size: { width: 90, height: 60 } }, { renderHeight: 42 }),
    ).toEqual({ width: 110, height: 42 });
  });

  it('normalizes stored node sizes without changing already valid nodes', () => {
    const validNode = { id: 'media-valid', type: 'media', size: { width: 240, height: 180 } };
    const tinyNode = { id: 'group-tiny', type: 'group', size: { width: 90, height: 60 } };
    const undersizedAudioNode = {
      id: 'audio-undersized',
      type: 'media',
      size: { width: 120, height: 60 },
      data: { mediaType: 'audio' },
    };

    expect(clampNodeStoredSize(validNode)).toBe(validNode);
    expect(clampNodeStoredSize(tinyNode)).toEqual({
      id: 'group-tiny',
      type: 'group',
      size: { width: 110, height: 75 },
    });
    expect(clampNodeStoredSizes([validNode, tinyNode, undersizedAudioNode])).toEqual([
      validNode,
      { id: 'group-tiny', type: 'group', size: { width: 110, height: 75 } },
      {
        id: 'audio-undersized',
        type: 'media',
        size: { width: 180, height: 90 },
        data: { mediaType: 'audio' },
      },
    ]);
  });
});
