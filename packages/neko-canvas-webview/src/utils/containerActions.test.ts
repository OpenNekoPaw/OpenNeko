import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import {
  addContainerChild,
  createContainerComposite,
  releaseContainerChildren,
} from './containerActions';
import { autoArrangeContainer, findFreePosition } from './containerLayout';

function createNode(id: string, type: CanvasNode['type'] = 'markdown', x = 0, y = 0): CanvasNode {
  return {
    id,
    type,
    position: { x, y },
    size: { width: 100, height: 80 },
    zIndex: 1,
    data: type === 'group' ? { childIds: [], label: id } : { content: id },
    ...(type === 'group' ? { container: { policy: 'group', childIds: [] } } : {}),
  } as CanvasNode;
}

describe('containerActions', () => {
  it('adds heterogeneous and nested children through generic membership', () => {
    const group = createNode('group-1', 'group');
    const childGroup = createNode('group-2', 'group', 200, 0);
    const note = createNode('note-1', 'markdown', 400, 0);

    let result = addContainerChild([group, childGroup, note], 'group-1', 'group-2');
    result = addContainerChild(result.nodes, 'group-1', 'note-1');

    const nextGroup = result.nodes.find((node) => node.id === 'group-1');
    const nextChildGroup = result.nodes.find((node) => node.id === 'group-2');
    const nextNote = result.nodes.find((node) => node.id === 'note-1');

    expect(nextGroup?.container?.childIds).toEqual(['group-2', 'note-1']);
    expect(nextChildGroup?.parentId).toBe('group-1');
    expect(nextNote?.parentId).toBe('group-1');
  });

  it('rejects container cycles', () => {
    const group = createNode('group-1', 'group');
    const childGroup = createNode('group-2', 'group');
    const linked = addContainerChild([group, childGroup], 'group-1', 'group-2');

    const result = addContainerChild(linked.nodes, 'group-2', 'group-1');

    expect(result.changed).toBe(false);
    expect(result.error).toContain('cycle');
  });

  it('releases children without deleting them', () => {
    const group = createNode('group-1', 'group');
    const note = createNode('note-1', 'markdown');
    const linked = addContainerChild([group, note], 'group-1', 'note-1');

    const result = releaseContainerChildren(linked.nodes, 'group-1');
    const nextGroup = result.nodes.find((node) => node.id === 'group-1');
    const nextNote = result.nodes.find((node) => node.id === 'note-1');

    expect(nextGroup?.container?.childIds).toEqual([]);
    expect(nextNote?.parentId).toBeUndefined();
  });

  it('creates composites atomically', () => {
    const container = createNode('group-1', 'group');
    const note = createNode('note-1', 'markdown');

    const result = createContainerComposite([], { container, children: [note] });

    expect(result.changed).toBe(true);
    expect(result.nodes.find((node) => node.id === 'group-1')?.container?.childIds).toEqual([
      'note-1',
    ]);
    expect(result.nodes.find((node) => node.id === 'note-1')?.parentId).toBe('group-1');
  });

  it('rejects duplicate IDs within composite input', () => {
    const container = createNode('group-1', 'group');
    const note = createNode('group-1', 'markdown');

    const result = createContainerComposite([], { container, children: [note] });

    expect(result.changed).toBe(false);
    expect(result.error).toContain('duplicate node id');
    expect(result.nodes).toEqual([]);
  });
});

describe('containerLayout', () => {
  it('finds a free position when the preferred slot overlaps', () => {
    const occupied = createNode('occupied', 'markdown', 0, 0);

    const position = findFreePosition({
      preferred: { x: 0, y: 0 },
      size: { width: 100, height: 80 },
      nodes: [occupied],
      gap: 10,
    });

    expect(position).not.toEqual({ x: 0, y: 0 });
  });

  it('auto-arranges children with absolute positions', () => {
    const group: CanvasNode = {
      ...createNode('group-1', 'group', 100, 100),
      size: { width: 400, height: 320 },
      container: { policy: 'group', childIds: ['a', 'b'] },
      data: { label: 'Group' },
    } as CanvasNode;
    const a = createNode('a', 'markdown', 0, 0);
    const b = createNode('b', 'markdown', 0, 0);

    const arranged = autoArrangeContainer([group, a, b], {
      containerId: 'group-1',
      mode: 'grid',
      paddingX: 20,
      paddingTop: 40,
    });

    expect(arranged.find((node) => node.id === 'a')?.position).toEqual({ x: 120, y: 140 });
    expect(arranged.find((node) => node.id === 'b')?.position.x).toBeGreaterThan(120);
  });
});
