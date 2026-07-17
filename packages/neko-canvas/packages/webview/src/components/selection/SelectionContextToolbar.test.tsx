import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createResourceRef, type CanvasNode, type GroupCanvasNode } from '@neko/shared';
import { SelectionContextToolbar } from './SelectionContextToolbar';

describe('SelectionContextToolbar', () => {
  it('places foundational fullscreen in the overflow actions', () => {
    const node: CanvasNode = {
      id: 'media',
      type: 'media',
      position: { x: 100, y: 100 },
      size: { width: 280, height: 200 },
      zIndex: 1,
      data: {
        mediaType: 'image',
        resourceRef: createResourceRef({
          id: 'resource-image',
          scope: 'project',
          provider: 'workspace',
          kind: 'media',
          source: { kind: 'file', projectRelativePath: 'assets/image.png' },
          locator: { kind: 'file', path: 'assets/image.png' },
          fingerprint: { strategy: 'identity', value: 'image-v1' },
        }),
      },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      <SelectionContextToolbar
        nodes={[node]}
        selectedNodeIds={[node.id]}
        viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
        viewportSize={{ width: 800, height: 600 }}
      />,
    );

    expect(markup).toContain('data-selection-overflow="true"');
    expect(markup).toContain(
      'data-selection-overflow-actions="node:open-content-overlay delete-selection"',
    );
  });

  it('renders outside Canvas scaling with a clamped screen-space position', () => {
    const node: GroupCanvasNode = {
      id: 'note',
      type: 'group',
      position: { x: 900, y: -50 },
      size: { width: 120, height: 80 },
      zIndex: 1,
      container: { policy: 'group', childIds: ['child'] },
      data: { label: 'Note' },
    };
    const markup = renderToStaticMarkup(
      <SelectionContextToolbar
        nodes={[
          node,
          {
            id: 'child',
            type: 'annotation',
            parentId: node.id,
            position: { x: 920, y: 20 },
            size: { width: 80, height: 60 },
            zIndex: 2,
            data: { content: 'Child' },
          },
        ]}
        selectedNodeIds={[node.id]}
        viewport={{ pan: { x: 0, y: 0 }, zoom: 2 }}
        viewportSize={{ width: 800, height: 600 }}
      />,
    );

    expect(markup).toContain('data-selection-context-toolbar="true"');
    expect(markup).toContain('data-selection-count="1"');
    expect(markup).toContain('data-selection-action="container:arrange-stable"');
    expect(markup).toContain('data-selection-action="container:fit-to-content"');
    expect(markup).toContain('data-selection-action="container:collapse-group"');
    expect(markup).toContain('data-selection-overflow="true"');
    expect(markup).toContain('top:10px');
    expect(markup).toContain('Auto-arrange');
    expect(markup).toContain('Fit to content');
  });
});
