import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import { resolveCanvasDropContainer } from './containerMembership';

describe('resolveCanvasDropContainer', () => {
  it('chooses the deepest eligible Group and preserves absolute coordinates', () => {
    const node = media('media', 180, 180);
    const nodes = [
      group('outer', 0, 0, 600, 500, 1),
      { ...group('inner', 100, 100, 350, 300, 2), parentId: 'outer' },
      node,
    ];

    expect(resolveCanvasDropContainer(nodes, node.id)).toEqual({
      targetContainerId: 'inner',
    });
    expect(node.position).toEqual({ x: 180, y: 180 });
  });

  it('uses visible stacking then stable identity for overlapping Groups', () => {
    const node = media('media', 100, 100);
    expect(
      resolveCanvasDropContainer(
        [group('a', 0, 0, 400, 300, 2), group('b', 0, 0, 400, 300, 3), node],
        node.id,
      ),
    ).toEqual({ targetContainerId: 'b' });
    expect(
      resolveCanvasDropContainer(
        [group('b', 0, 0, 400, 300, 2), group('a', 0, 0, 400, 300, 2), node],
        node.id,
      ),
    ).toEqual({ targetContainerId: 'a' });
  });

  it('releases a child outside all containers and rejects descendant cycles', () => {
    const outside = { ...media('media', 800, 800), parentId: 'group' };
    expect(
      resolveCanvasDropContainer([group('group', 0, 0, 400, 300, 1), outside], outside.id),
    ).toEqual({});

    const parent = { ...group('parent', 100, 100, 600, 500, 2), parentId: 'root' };
    const root = {
      ...group('root', 100, 100, 500, 400, 1),
      container: {
        policy: 'group' as const,
        childIds: ['parent'],
      },
    };
    expect(resolveCanvasDropContainer([root, parent], root.id).diagnostic).toMatch(
      /cycle rejected/,
    );
    expect(resolveCanvasDropContainer([root, parent], root.id, { movingSubtree: true })).toEqual(
      {},
    );
  });
});

function group(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
): CanvasNode {
  return {
    id,
    type: 'group',
    position: { x, y },
    size: { width, height },
    zIndex,
    container: { policy: 'group', childIds: [] },
    data: { label: id },
  };
}

function media(id: string, x: number, y: number): CanvasNode {
  return {
    id,
    type: 'media',
    position: { x, y },
    size: { width: 100, height: 80 },
    zIndex: 10,
    data: { assetPath: 'neko/assets/files/image/test.png', mediaType: 'image' },
  };
}
