import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko-canvas/domain';
import {
  applyCanvasAgentContent,
  createCanvasAgentActiveContext,
  createCanvasComposite,
  extractStructuredCanvasContent,
} from './canvasAgentOperations';

function ids(): () => string {
  let count = 0;
  return () => `generated-${++count}`;
}

function groupNode(): CanvasNode {
  return {
    id: 'group-1',
    type: 'group',
    position: { x: 100, y: 100 },
    size: { width: 400, height: 300 },
    zIndex: 1,
    container: {
      policy: 'group',
      childIds: [],
      layout: { mode: 'manual' },
      deleteBehavior: 'release-children',
    },
    data: { label: 'Draft' },
  };
}

describe('canvasAgentOperations canonical authoring', () => {
  it('inserts Agent text as Markdown inside a Group', () => {
    const result = applyCanvasAgentContent(
      { nodes: [groupNode()], connections: [], generateId: ids() },
      {
        kind: 'text',
        text: 'Beat note',
        format: 'markdown',
        target: {
          containerId: 'group-1',
          mode: 'create-child',
          insertionPoint: { x: 160, y: 220 },
        },
      },
    );

    const created = result.nodes.find((node) => node.id === 'generated-1');
    expect(created).toMatchObject({
      type: 'markdown',
      parentId: 'group-1',
      data: { content: 'Beat note' },
    });
    expect(result.nodes.find((node) => node.id === 'group-1')?.container?.childIds).toEqual([
      'generated-1',
    ]);
  });

  it('creates canonical Group composites atomically', () => {
    const result = createCanvasComposite(
      { nodes: [], connections: [], generateId: ids() },
      {
        containerType: 'group',
        children: [{ type: 'markdown', data: { content: '# Scene' } }],
      },
    );

    expect(result.nodes.map((node) => node.type)).toEqual(['group', 'markdown']);
    expect(result.nodes[0]?.container?.childIds).toEqual(['generated-2']);
    expect(result.nodes[1]?.parentId).toBe('generated-1');
  });

  it('extracts canonical content without runtime media paths', () => {
    const media: CanvasNode = {
      id: 'media-1',
      type: 'media',
      position: { x: 0, y: 0 },
      size: { width: 300, height: 220 },
      zIndex: 1,
      data: {
        assetPath: 'media/hero.png',
        runtimeAssetPath: 'blob:runtime-preview',
        mediaType: 'image',
      },
    };

    const result = extractStructuredCanvasContent([media], {
      nodeIds: ['media-1'],
      includeChildren: false,
      format: 'json',
    });

    expect(result.nodeIds).toEqual(['media-1']);
    expect(JSON.stringify(result)).not.toContain('blob:runtime-preview');
  });

  it('returns compact active context for canonical nodes', () => {
    const result = createCanvasAgentActiveContext({
      nodes: [groupNode()],
      selectedNodeIds: ['group-1'],
    });

    expect(result.selectedNodes[0]).toMatchObject({ id: 'group-1', type: 'group' });
  });
});
