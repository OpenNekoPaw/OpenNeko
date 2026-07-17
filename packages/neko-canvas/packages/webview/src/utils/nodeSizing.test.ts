import { describe, expect, it } from 'vitest';
import {
  clampNodeRenderSize,
  clampNodeSize,
  clampNodeStoredSize,
  clampNodeStoredSizes,
  resolveNodeMinSize,
} from './nodeSizing';

describe('nodeSizing', () => {
  it('resolves minimum sizes for known container and leaf nodes', () => {
    expect(resolveNodeMinSize({ type: 'scene' })).toEqual({ width: 320, height: 220 });
    expect(resolveNodeMinSize({ type: 'gallery' })).toEqual({ width: 280, height: 240 });
    expect(resolveNodeMinSize({ type: 'shot' })).toEqual({ width: 220, height: 160 });
  });

  it('uses conservative fallback minimums for unknown nodes', () => {
    expect(resolveNodeMinSize({ type: 'custom-node' })).toEqual({ width: 180, height: 120 });
    expect(resolveNodeMinSize({ type: 'custom-container', container: {} })).toEqual({
      width: 260,
      height: 180,
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
      clampNodeRenderSize({ type: 'scene', size: { width: 90, height: 60 } }, { renderHeight: 42 }),
    ).toEqual({ width: 320, height: 42 });
  });

  it('normalizes stored node sizes without changing already valid nodes', () => {
    const validNode = { id: 'shot-valid', type: 'shot', size: { width: 240, height: 180 } };
    const tinyNode = { id: 'scene-tiny', type: 'scene', size: { width: 90, height: 60 } };

    expect(clampNodeStoredSize(validNode)).toBe(validNode);
    expect(clampNodeStoredSize(tinyNode)).toEqual({
      id: 'scene-tiny',
      type: 'scene',
      size: { width: 320, height: 220 },
    });
    expect(clampNodeStoredSizes([validNode, tinyNode])).toEqual([
      validNode,
      { id: 'scene-tiny', type: 'scene', size: { width: 320, height: 220 } },
    ]);
  });
});
