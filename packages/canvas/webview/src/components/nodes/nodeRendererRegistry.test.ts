import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CanvasNode } from '@neko/canvas-domain';
import { buildCanvasNode } from '../../utils/nodeFactory';
import { createCoreNodeRendererRegistry } from './coreNodeRenderers';
import { renderCanvasNode } from './nodeRendererRegistry';

describe('nodeRendererRegistry', () => {
  it('registers only the seven canonical renderers', () => {
    const renderers = createCoreNodeRendererRegistry();

    expect(Object.keys(renderers).sort()).toEqual(
      ['canvas-embed', 'file', 'generation', 'group', 'job', 'markdown', 'media'].sort(),
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

  it('renders media and File names through the external label above the card', () => {
    const renderers = createCoreNodeRendererRegistry();
    const video = {
      ...buildCanvasNode({
        type: 'media',
        position: { x: 40, y: 40 },
        data: {
          assetPath: 'media/Cut Basic Functional Fixture.mp4',
          contentLocator: {
            file: { authority: 'workspace', path: 'media/Cut Basic Functional Fixture.mp4' },
          },
          mediaType: 'video',
        },
        zIndex: 1,
      }),
      id: 'video-1',
    } as CanvasNode;
    const file = {
      ...buildCanvasNode({
        type: 'file',
        position: { x: 320, y: 40 },
        data: {
          path: 'Assets/epub/animation/Blame/volume-01.epub',
          title: 'ignored/path/title.epub',
          contentLocator: {
            file: {
              authority: 'workspace',
              path: 'neko/assets/Assets/epub/animation/Blame/volume-01.epub',
            },
          },
        },
        zIndex: 2,
      }),
      id: 'file-1',
    } as CanvasNode;

    const videoMarkup = renderNode(renderers, video);
    const fileMarkup = renderNode(renderers, file);

    expect(videoMarkup).toContain('data-canvas-node-label="true"');
    expect(videoMarkup).toContain('Cut Basic Functional Fixture.mp4');
    expect(videoMarkup.indexOf('data-canvas-node-label')).toBeLessThan(
      videoMarkup.indexOf('node-card'),
    );
    expect(fileMarkup).toContain('data-canvas-node-label="true"');
    expect(fileMarkup).toContain('volume-01.epub');
    expect(fileMarkup).not.toContain('title.epub');
    expect(fileMarkup.indexOf('data-canvas-node-label')).toBeLessThan(
      fileMarkup.indexOf('node-card'),
    );
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

  it('renders invalid Generation content as one unavailable node without invoking its renderer', () => {
    const node = {
      id: 'generation-invalid',
      type: 'generation',
      position: { x: 0, y: 0 },
      size: { width: 240, height: 140 },
      zIndex: 1,
      data: { recipe: { kind: 'image', prompt: '' }, outputs: [], phase: 'running' },
    } as never;
    const generationRenderer = () => {
      throw new Error('Invalid Generation content reached the Generation renderer.');
    };

    const markup = renderToStaticMarkup(
      renderCanvasNode(
        { generation: generationRenderer },
        {
          node,
          allNodes: [node],
          selectedNodeIds: [],
          viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
          isSelected: false,
          containerRef: { current: null },
        },
      ),
    );

    expect(markup).toContain('data-canvas-node-unavailable="generation-invalid"');
    expect(markup).toContain('UNAVAILABLE');
    expect(markup).toContain('canonical Recipe/run/output contract');
  });
});

function renderNode(
  renderers: ReturnType<typeof createCoreNodeRendererRegistry>,
  node: CanvasNode,
): string {
  return renderToStaticMarkup(
    renderCanvasNode(renderers, {
      node,
      allNodes: [node],
      selectedNodeIds: [],
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      isSelected: false,
      containerRef: { current: null },
    }),
  );
}
