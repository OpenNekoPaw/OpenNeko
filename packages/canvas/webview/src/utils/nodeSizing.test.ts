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
    expect(resolveNodeMinSize({ type: 'group' })).toEqual({ width: 260, height: 180 });
    expect(resolveNodeMinSize({ type: 'media' })).toEqual({ width: 200, height: 120 });
    expect(resolveNodeMinSize({ type: 'job' })).toEqual({ width: 240, height: 150 });
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
      clampNodeRenderSize({ type: 'group', size: { width: 90, height: 60 } }, { renderHeight: 42 }),
    ).toEqual({ width: 260, height: 42 });
  });

  it('normalizes stored node sizes without changing already valid nodes', () => {
    const validNode = { id: 'media-valid', type: 'media', size: { width: 240, height: 180 } };
    const tinyNode = { id: 'group-tiny', type: 'group', size: { width: 90, height: 60 } };

    expect(clampNodeStoredSize(validNode)).toBe(validNode);
    expect(clampNodeStoredSize(tinyNode)).toEqual({
      id: 'group-tiny',
      type: 'group',
      size: { width: 260, height: 180 },
    });
    expect(clampNodeStoredSizes([validNode, tinyNode])).toEqual([
      validNode,
      { id: 'group-tiny', type: 'group', size: { width: 260, height: 180 } },
    ]);
  });
});
