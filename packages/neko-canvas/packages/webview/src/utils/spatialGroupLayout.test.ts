import { describe, expect, it } from 'vitest';
import type { AnnotationCanvasNode, CanvasNode, GroupCanvasNode } from '@neko/shared';
import {
  arrangeSpatialGroup,
  clampSpatialGroupResize,
  fitSpatialGroupToContent,
  setSpatialGroupCollapsed,
} from './spatialGroupLayout';

describe('spatialGroupLayout', () => {
  it('arranges unlocked children in stable rows without overlapping variable heights', () => {
    const nodes: CanvasNode[] = [
      group('group', ['a', 'b', 'c']),
      annotation('a', 'group', 300, 220, 80),
      annotation('b', 'group', 500, 220, 180),
      annotation('c', 'group', 300, 500, 60),
    ];

    const arranged = arrangeSpatialGroup(nodes, 'group', 'stable');
    const a = requireNode(arranged, 'a');
    const b = requireNode(arranged, 'b');
    const c = requireNode(arranged, 'c');

    expect(a.position).toEqual({ x: 24, y: 56 });
    expect(b.position).toEqual({ x: 356, y: 56 });
    expect(c.position.y).toBe(256);
  });

  it('translates a nested child subtree when its direct Group is arranged', () => {
    const nodes: CanvasNode[] = [
      group('outer', ['inner']),
      { ...group('inner', ['child'], 300, 240, 300, 240), parentId: 'outer' },
      annotation('child', 'inner', 340, 310, 100),
    ];

    const arranged = arrangeSpatialGroup(nodes, 'outer', 'stable');

    expect(requireNode(arranged, 'inner').position).toEqual({ x: 24, y: 56 });
    expect(requireNode(arranged, 'child').position).toEqual({ x: 64, y: 126 });
  });

  it('fits and clamps against every nested descendant while preserving child geometry', () => {
    const nodes: CanvasNode[] = [
      group('outer', ['inner'], 0, 0, 900, 700),
      { ...group('inner', ['child'], 100, 100, 300, 240), parentId: 'outer' },
      annotation('child', 'inner', 360, 280, 100),
    ];
    const childBefore = requireNode(nodes, 'child').position;

    const fitted = fitSpatialGroupToContent(nodes, 'outer');
    expect(requireNode(fitted, 'outer')).toMatchObject({
      position: { x: 76, y: 44 },
      size: { width: 508, height: 360 },
    });
    expect(requireNode(fitted, 'child').position).toEqual(childBefore);

    const clamped = clampSpatialGroupResize(
      fitted,
      'outer',
      { width: 100, height: 100 },
      {
        x: 200,
        y: 200,
      },
    );
    expect(clamped).toEqual({
      position: { x: 76, y: 44 },
      size: { width: 508, height: 360 },
    });
  });

  it('stores collapse on the canonical container capability and treats repeats as no-ops', () => {
    const nodes: CanvasNode[] = [group('group', [])];
    const collapsed = setSpatialGroupCollapsed(nodes, 'group', true);

    expect(requireNode(collapsed, 'group').container?.collapsed).toBe(true);
    expect(setSpatialGroupCollapsed(collapsed, 'group', true)).toBe(collapsed);
    expect(requireNode(setSpatialGroupCollapsed(collapsed, 'group', false), 'group').data).toEqual({
      label: 'group',
    });
  });
});

function group(
  id: string,
  childIds: string[],
  x = 0,
  y = 0,
  width = 800,
  height = 600,
): GroupCanvasNode {
  return {
    id,
    type: 'group',
    position: { x, y },
    size: { width, height },
    zIndex: 1,
    container: { policy: 'group', childIds, deleteBehavior: 'release-children' },
    data: { label: id },
  };
}

function annotation(
  id: string,
  parentId: string,
  x: number,
  y: number,
  height: number,
): AnnotationCanvasNode {
  return {
    id,
    type: 'annotation',
    parentId,
    position: { x, y },
    size: { width: 200, height },
    zIndex: 2,
    data: { content: id },
  };
}

function requireNode(nodes: readonly CanvasNode[], id: string): CanvasNode {
  const node = nodes.find((candidate) => candidate.id === id);
  if (!node) throw new Error(`Missing test node: ${id}`);
  return node;
}
