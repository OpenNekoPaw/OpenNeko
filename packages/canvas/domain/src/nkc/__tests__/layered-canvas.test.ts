import { describe, expect, it } from 'vitest';
import { validateNkcLayered } from '../index';
import { getContainerChildIds, getNodeParentId } from '../../utils/canvasLayered';
import type { CanvasData, CanvasNode } from '../../types/canvas';

function createLayeredCanvas(): CanvasData {
  return {
    name: 'Layered Canvas',
    viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
    nodes: [
      {
        id: 'group-1',
        type: 'group',
        position: { x: 0, y: 0 },
        size: { width: 640, height: 360 },
        zIndex: 1,
        container: { policy: 'group', childIds: ['note-1', 'note-2'] },
        data: { label: 'Opening' },
      },
      createNote('note-1', 'group-1', 40),
      createNote('note-2', 'group-1', 320),
    ],
    connections: [
      {
        id: 'conn-1',
        sourceId: 'note-1',
        targetId: 'note-2',
        sourceEndpoint: { nodeId: 'note-1', scope: 'node' },
        targetEndpoint: { nodeId: 'note-2', scope: 'node' },
        type: 'reference',
      },
    ],
  };
}

function createNote(id: string, parentId: string, x: number): CanvasNode {
  return {
    id,
    type: 'markdown',
    position: { x, y: 80 },
    size: { width: 240, height: 160 },
    zIndex: 2,
    parentId,
    data: { content: id },
  };
}

describe('version-free NKC layered validator', () => {
  it('accepts canonical group containment', () => {
    const canvas = createLayeredCanvas();
    const group = canvas.nodes[0]!;
    const child = canvas.nodes[1]!;

    expect(getContainerChildIds(group)).toEqual(['note-1', 'note-2']);
    expect(getNodeParentId(child)).toBe('group-1');
    expect(validateNkcLayered(canvas)).toMatchObject({ valid: true, errors: [] });
  });

  it('reports dangling container child IDs', () => {
    const canvas = createLayeredCanvas();
    const group = canvas.nodes[0];
    if (group?.container) group.container.childIds = [...group.container.childIds, 'missing-note'];

    expect(validateNkcLayered(canvas).errors).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('missing child "missing-note"') }),
    );
  });

  it('reports inconsistent bidirectional membership', () => {
    const canvas = createLayeredCanvas();
    canvas.nodes[1]!.parentId = 'missing-group';

    const result = validateNkcLayered(canvas);
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('references missing parent "missing-group"'),
      }),
    );
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('child "note-1" does not reference this parent'),
      }),
    );
  });

  it('reports container cycles', () => {
    const groupA: CanvasNode = {
      id: 'group-a',
      type: 'group',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      zIndex: 1,
      parentId: 'group-b',
      container: { policy: 'group', childIds: ['group-b'] },
      data: { label: 'Group A' },
    };
    const groupB: CanvasNode = {
      ...groupA,
      id: 'group-b',
      parentId: 'group-a',
      container: { policy: 'group', childIds: ['group-a'] },
      data: { label: 'Group B' },
    };

    const result = validateNkcLayered({
      name: 'Cyclic groups',
      nodes: [groupA, groupB],
      connections: [],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('container cycle detected') }),
    );
  });

  it('reports required field bindings that cannot resolve into node data', () => {
    const canvas = createLayeredCanvas();
    canvas.nodes[1]!.content = {
      id: 'root',
      blocks: [
        {
          id: 'missing-field',
          kind: 'text',
          binding: { path: '/missingField', required: true },
        },
      ],
    };

    expect(validateNkcLayered(canvas).errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('required binding path "/missingField"'),
      }),
    );
  });

  it('reports dangling connection endpoints', () => {
    const canvas = createLayeredCanvas();
    canvas.connections.push({
      id: 'conn-missing',
      sourceId: 'note-1',
      targetId: 'missing-node',
      sourceEndpoint: { nodeId: 'note-1', scope: 'node' },
      targetEndpoint: { nodeId: 'missing-node', scope: 'node' },
      type: 'reference',
    });

    expect(validateNkcLayered(canvas).errors).toContainEqual(
      expect.objectContaining({
        field: 'connections[1].targetId',
        message: expect.stringContaining('missing node "missing-node"'),
      }),
    );
  });
});
