import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CanvasNode } from '@neko/canvas-domain';
import { buildCanvasNode } from '../../utils/nodeFactory';
import { createCoreNodeRendererRegistry } from './coreNodeRenderers';
import { renderCanvasNode } from './nodeRendererRegistry';

describe('nodeRendererRegistry', () => {
  it('registers only the six canonical renderers', () => {
    const renderers = createCoreNodeRendererRegistry();

    expect(Object.keys(renderers).sort()).toEqual(
      ['canvas-embed', 'file', 'group', 'job', 'markdown', 'media'].sort(),
    );
  });

  it('renders canonical groups without subsystem activation', () => {
    const renderers = createCoreNodeRendererRegistry();
    const node = {
      ...buildCanvasNode({
        type: 'group',
        position: { x: 40, y: 40 },
        data: { label: 'Inbox', color: '#64748b' },
        zIndex: 1,
      }),
      id: 'workspace-inbox',
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      renderCanvasNode(renderers, {
        node,
        allNodes: [node],
        selectedNodeIds: [],
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
        isSelected: false,
        containerRef: { current: null },
      }),
    );

    expect(markup).toContain('data-spatial-group-frame="true"');
    expect(markup).not.toContain('UNSUPPORTED');
  });

  it('renders unknown loaded nodes as unsupported instead of falling back', () => {
    const markup = renderToStaticMarkup(
      renderCanvasNode(
        {},
        {
          node: {
            id: 'future-1',
            type: 'future-node',
            position: { x: 0, y: 0 },
            size: { width: 240, height: 140 },
            zIndex: 1,
            data: { preserved: true },
          } as never,
          allNodes: [],
          selectedNodeIds: [],
          viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
          isSelected: false,
          containerRef: { current: null },
        },
      ),
    );

    expect(markup).toContain('UNSUPPORTED');
    expect(markup).toContain('future-node');
  });
});
