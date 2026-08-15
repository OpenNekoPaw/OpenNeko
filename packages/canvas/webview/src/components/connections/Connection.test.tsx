// @vitest-environment jsdom

import type { CanvasConnection, MarkdownCanvasNode } from '@neko/canvas-domain';
import { createNodeConnectionEndpoint } from '@neko/canvas-domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Connection } from './Connection';

describe('Connection', () => {
  it('uses one neutral relation line without type color, labels or motion', () => {
    const ordinary = renderToStaticMarkup(
      <Connection connection={connection} sourceNode={sourceNode} targetNode={targetNode} />,
    );
    const selected = renderToStaticMarkup(
      <Connection
        connection={connection}
        sourceNode={sourceNode}
        targetNode={targetNode}
        isSelected
      />,
    );

    expect(ordinary).toContain('data-selected="false"');
    expect(ordinary).toContain('class="connection-line"');
    expect(ordinary).toContain('stroke-width="1.25"');
    expect(ordinary).toContain('stroke-opacity="0.38"');
    expect(ordinary).not.toContain('connection-flow-dot');
    expect(ordinary).not.toContain('connection-arrow');
    expect(ordinary).not.toContain('reference-edge</text>');

    expect(selected).toContain('data-selected="true"');
    expect(selected).toContain('stroke-width="2"');
    expect(selected).toContain('stroke-opacity="0.88"');
    expect(selected).not.toContain('connection-flow-dot');
  });

  it('adds a direction marker only for sequence order', () => {
    const sequence = renderToStaticMarkup(
      <Connection
        connection={{ ...connection, id: 'sequence-edge', type: 'sequence' }}
        sourceNode={sourceNode}
        targetNode={targetNode}
      />,
    );
    expect(sequence).toContain('class="connection-arrow"');
    expect(sequence).toContain('marker-end="url(#arrow-sequence-edge)"');
  });
});

const sourceNode: MarkdownCanvasNode = {
  id: 'source',
  type: 'markdown',
  position: { x: 0, y: 0 },
  size: { width: 240, height: 160 },
  zIndex: 1,
  data: { content: 'source' },
};

const targetNode: MarkdownCanvasNode = {
  ...sourceNode,
  id: 'target',
  position: { x: 420, y: 120 },
  data: { content: 'target' },
};

const connection: CanvasConnection = {
  id: 'reference-edge',
  sourceId: sourceNode.id,
  targetId: targetNode.id,
  sourceEndpoint: createNodeConnectionEndpoint(sourceNode.id),
  targetEndpoint: createNodeConnectionEndpoint(targetNode.id),
  type: 'derived-from',
};
