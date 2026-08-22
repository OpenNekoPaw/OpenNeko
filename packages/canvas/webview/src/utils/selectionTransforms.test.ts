import { describe, expect, it } from 'vitest';
import type { CanvasNode, GroupCanvasNode, MarkdownCanvasNode } from '@neko/canvas-domain';
import { resolveCanvasSelectionMoveRoots, translateCanvasSelection } from './selectionTransforms';

function markdown(
  id: string,
  x: number,
  y: number,
  options: { readonly parentId?: string; readonly locked?: boolean } = {},
): MarkdownCanvasNode {
  return {
    id,
    type: 'markdown',
    ...(options.parentId ? { parentId: options.parentId } : {}),
    position: { x, y },
    size: { width: 200, height: 120 },
    zIndex: 1,
    locked: options.locked,
    data: { content: id },
  };
}

function group(id: string, childIds: string[], x: number, y: number): GroupCanvasNode {
  return {
    id,
    type: 'group',
    position: { x, y },
    size: { width: 480, height: 320 },
    zIndex: 0,
    container: { policy: 'group', childIds },
    data: { label: id },
  };
}

describe('Canvas selection transforms', () => {
  it('translates independent selected nodes by one stable delta', () => {
    const nodes: CanvasNode[] = [markdown('a', 10, 20), markdown('b', 80, 120)];

    const result = translateCanvasSelection(nodes, ['a', 'b'], { x: 30, y: -10 });

    expect(result.rootIds).toEqual(['a', 'b']);
    expect(result.nodes.map((node) => node.position)).toEqual([
      { x: 40, y: 10 },
      { x: 110, y: 110 },
    ]);
  });

  it('moves a selected container subtree once when its child is also selected', () => {
    const nodes: CanvasNode[] = [
      group('group', ['child'], 0, 0),
      markdown('child', 40, 60, { parentId: 'group' }),
    ];

    const result = translateCanvasSelection(nodes, ['group', 'child'], { x: 25, y: 35 });

    expect(result.rootIds).toEqual(['group']);
    expect(result.nodes.find((node) => node.id === 'group')?.position).toEqual({ x: 25, y: 35 });
    expect(result.nodes.find((node) => node.id === 'child')?.position).toEqual({ x: 65, y: 95 });
  });

  it('keeps locked selections fixed without suppressing unlocked roots', () => {
    const nodes: CanvasNode[] = [
      markdown('movable', 10, 20),
      markdown('locked', 80, 120, { locked: true }),
    ];

    expect(resolveCanvasSelectionMoveRoots(nodes, ['movable', 'locked'])).toEqual(['movable']);
    expect(
      translateCanvasSelection(nodes, ['movable', 'locked'], { x: 30, y: 40 }).nodes.map(
        (node) => node.position,
      ),
    ).toEqual([
      { x: 40, y: 60 },
      { x: 80, y: 120 },
    ]);
  });
});
