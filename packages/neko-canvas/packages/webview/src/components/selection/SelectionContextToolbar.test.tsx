// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CanvasMaterialActionDescriptor, CanvasNode, GroupCanvasNode } from '@neko/shared';
import { CanvasHostProvider, type CanvasWebviewHostPort } from '../../host-runtime';
import { SelectionContextToolbar } from './SelectionContextToolbar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('SelectionContextToolbar', () => {
  it('projects owner-contributed media preview and keeps dangerous deletion in overflow', async () => {
    const node: CanvasNode = {
      id: 'media',
      type: 'media',
      position: { x: 100, y: 100 },
      size: { width: 280, height: 200 },
      zIndex: 1,
      data: {
        mediaType: 'image',
        assetPath: 'assets/image.png',
        contentLocator: { kind: 'workspace-file', path: 'assets/image.png' },
      },
    };
    const host = createMaterialHost([
      {
        id: 'preview:open',
        ownerId: 'preview',
        label: 'Preview',
        mediaKinds: ['image'],
        origins: ['referenced', 'generated'],
        selection: { minimum: 1, maximum: 1 },
        effect: 'read',
      },
    ]);

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <CanvasHostProvider host={host}>
          <SelectionContextToolbar
            nodes={[node]}
            selectedNodeIds={[node.id]}
            viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
            viewportSize={{ width: 800, height: 600 }}
          />
        </CanvasHostProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const markup = container.innerHTML;

    expect(markup).toContain('data-selection-overflow="true"');
    expect(markup).not.toContain('data-selection-action="node:edit-media"');
    expect(markup).not.toContain('data-selection-action="selection:quick-generate"');
    expect(markup).toContain('data-selection-action="preview:open"');
    expect(markup).toContain('data-selection-action="node:duplicate"');
    expect(markup).not.toContain('data-selection-action="node:copy-to-media-library"');
    expect(markup).not.toContain('data-selection-action="node:open-content-overlay"');
    expect(markup).toContain('data-selection-overflow-actions="delete-selection"');
    await act(async () => root.unmount());
  });

  it('does not expose a content overlay for canonical file nodes', () => {
    const node = {
      id: 'file',
      type: 'file',
      position: { x: 0, y: 0 },
      size: { width: 220, height: 280 },
      zIndex: 1,
      data: { title: 'External document', path: 'notes.md' },
    } as CanvasNode;

    const markup = renderToStaticMarkup(
      <SelectionContextToolbar
        nodes={[node]}
        selectedNodeIds={[node.id]}
        viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
        viewportSize={{ width: 800, height: 600 }}
      />,
    );

    expect(markup).not.toContain('node:open-content-overlay');
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
            type: 'markdown',
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
    expect(markup).toContain('data-selection-action="group:fit"');
    expect(markup).toContain('data-selection-action="group:toggle"');
    expect(markup).toContain('data-selection-overflow="true"');
    expect(markup).toContain('top:10px');
  });
});

function createMaterialHost(
  descriptors: readonly CanvasMaterialActionDescriptor[],
): CanvasWebviewHostPort {
  return {
    postMessage: () => undefined,
    getState: () => undefined,
    setState: () => undefined,
    supportsMessage: () => false,
    subscribe: () => () => undefined,
    requestSource: async () => {
      throw new Error('Not used by this static component test.');
    },
    requestGenerationDraft: async () => {
      throw new Error('Not used by this static component test.');
    },
    projectContent: async () => {
      throw new Error('Not used by this static component test.');
    },
    previewResource: async () => undefined,
    revealResource: async () => undefined,
    getAuthoringCapabilities: () => ({
      sourceModes: [],
      generationMediaKinds: [],
    }),
    resolveMaterialActions: async () => descriptors,
    executeMaterialAction: async () => {
      throw new Error('Not used by this static component test.');
    },
    dispose: () => undefined,
  };
}
