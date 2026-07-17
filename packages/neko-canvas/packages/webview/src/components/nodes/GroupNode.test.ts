import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { AnnotationCanvasNode, GroupCanvasNode } from '@neko/shared';
import { GroupNode } from './GroupNode';

describe('GroupNode', () => {
  it('renders a semi-transparent spatial frame with a floating name and no child summaries', () => {
    const group: GroupCanvasNode = {
      id: 'group',
      type: 'group',
      position: { x: 0, y: 0 },
      size: { width: 500, height: 400 },
      zIndex: 10,
      container: { policy: 'group', childIds: ['child'] },
      data: { label: 'References' },
    };
    const child: AnnotationCanvasNode = {
      id: 'child',
      type: 'annotation',
      parentId: 'group',
      position: { x: 40, y: 100 },
      size: { width: 120, height: 80 },
      zIndex: 11,
      data: { content: 'Child content must render as its own Canvas node.' },
    };

    const markup = renderToStaticMarkup(
      React.createElement(GroupNode, {
        node: group,
        allNodes: [group, child],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: true,
      }),
    );

    expect(markup).toContain('data-node-presentation="spatial-container"');
    expect(markup).toContain('data-spatial-group-frame="true"');
    expect(markup).toContain('data-spatial-group-label="group"');
    expect(markup).toContain('data-spatial-group-collapse-toggle="group"');
    expect(markup).toContain('data-node-drag-allow="true"');
    expect(markup).toContain('References');
    expect(markup).not.toContain('Child content must render as its own Canvas node.');
    expect(markup).not.toContain('data-group-review-surface');
  });
});
