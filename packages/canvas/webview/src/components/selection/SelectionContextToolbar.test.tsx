// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type {
  CanvasMaterialActionDescriptor,
  CanvasHostSnapshot,
  CanvasNode,
  GroupCanvasNode,
} from '@neko/canvas-domain';
import { createEmptyCanvasData } from '@neko/canvas-domain';
import { CanvasHostProvider, type CanvasWebviewHostPort } from '../../host-runtime';
import { enableDefaultCanvasTestStoreScope } from '../../stores/canvasStoreScope';
import { SelectionContextToolbar } from './SelectionContextToolbar';

Object.assign(globalThis, {
  IS_REACT_ACT_ENVIRONMENT: true,
  ResizeObserver: class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  },
});
enableDefaultCanvasTestStoreScope();

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
    expect(markup).not.toContain('data-selection-action="node:copy-to-media-library"');
    expect(markup).not.toContain('data-selection-action="node:open-content-overlay"');
    expect(markup).toContain('data-selection-overflow-actions="node:duplicate delete-selection"');
    await act(async () => root.unmount());
  });

  it('keeps Add to Cut and Preview visible while grouping video management actions in More', async () => {
    const node: CanvasNode = {
      id: 'video',
      type: 'media',
      position: { x: 100, y: 100 },
      size: { width: 320, height: 180 },
      zIndex: 1,
      data: {
        mediaType: 'video',
        assetPath: 'media/clip.mp4',
        contentLocator: { kind: 'workspace-file', path: 'media/clip.mp4' },
      },
    };
    const descriptors: readonly CanvasMaterialActionDescriptor[] = [
      descriptor('preview:open', 'Preview', 'read'),
      descriptor('desktop:reveal', 'Reveal in Finder', 'handoff'),
      descriptor('media-library:copy-to-project', 'Copy to project Media Library', 'copy'),
      descriptor('media-library:copy-to-global', 'Copy to global Media Library', 'copy'),
      {
        ...descriptor('cut:add-resource', 'Add to Cut', 'handoff'),
        executionPayload: {
          target: { kind: 'existing-cut', viewId: 'cut-view-1' },
        },
      },
    ];
    const executeMaterialAction = vi.fn(async () => materialActionSnapshot());
    const host = createMaterialHost(descriptors, executeMaterialAction);
    const container = document.createElement('div');
    document.body.append(container);
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

    expect(
      container
        .querySelector('[data-selection-action="cut:add-resource"]')
        ?.getAttribute('data-selection-action-location'),
    ).toBe('primary');
    expect(
      container
        .querySelector('[data-selection-action="preview:open"]')
        ?.getAttribute('data-selection-action-location'),
    ).toBe('primary');
    expect(
      container
        .querySelector('[data-selection-overflow]')
        ?.getAttribute('data-selection-overflow-actions'),
    ).toBe(
      'desktop:reveal media-library:copy-to-project media-library:copy-to-global node:duplicate delete-selection',
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-selection-overflow]')?.click();
    });
    const mediaLibraryGroup = document.body.querySelector(
      '[data-selection-overflow-group="media-library"]',
    );
    expect(mediaLibraryGroup?.textContent).toContain('Media Library');
    expect(mediaLibraryGroup?.textContent).toContain('Copy to project Media Library');
    expect(mediaLibraryGroup?.textContent).toContain('Copy to global Media Library');
    const nodeGroup = document.body.querySelector('[data-selection-overflow-group="node"]');
    expect(nodeGroup?.textContent).toContain('Duplicate node');
    expect(nodeGroup?.textContent).toContain('Delete');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-selection-action="cut:add-resource"]')
        ?.click();
    });
    expect(executeMaterialAction).toHaveBeenCalledWith(
      'cut:add-resource',
      [node.id],
      descriptors[4]?.executionPayload,
    );
    await act(async () => root.unmount());
    container.remove();
  });

  it('keeps Open Cut and Generation actions visible by canonical identity', async () => {
    const otioNode = fileNode('otio', 'cuts/story.otio');
    const generatedNode: CanvasNode = {
      id: 'generated',
      type: 'media',
      position: { x: 400, y: 100 },
      size: { width: 280, height: 180 },
      zIndex: 2,
      data: {
        mediaType: 'image',
        assetPath: 'neko/generated/result.png',
        contentLocator: {
          kind: 'generated-output',
          outputId: 'output-1',
          digest: 'sha256:output-1',
          path: 'neko/generated/result.png',
        },
      },
    };
    const otio = await renderToolbar(
      [otioNode],
      [otioNode.id],
      [descriptor('cut:open', 'Open Cut', 'handoff')],
    );
    expect(
      otio.container
        .querySelector('[data-selection-action="cut:open"]')
        ?.getAttribute('data-selection-action-location'),
    ).toBe('primary');
    expect(otio.container.innerHTML).not.toContain('cut:add-resource');
    await otio.dispose();

    const generated = await renderToolbar(
      [generatedNode],
      [generatedNode.id],
      [
        descriptor('desktop:reveal', 'Reveal', 'handoff'),
        descriptor('generation:regenerate', 'Regenerate', 'generate'),
        descriptor('preview:open', 'Preview', 'read'),
      ],
    );
    expect(
      generated.container.querySelector('[data-selection-action="generation:regenerate"]'),
    ).not.toBeNull();
    expect(
      generated.container
        .querySelector('[data-selection-overflow]')
        ?.getAttribute('data-selection-overflow-actions'),
    ).toContain('desktop:reveal');
    await generated.dispose();
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

  it('keeps Group visible and destructive deletion in More for multi-selection', () => {
    const nodes: readonly CanvasNode[] = [
      {
        id: 'note-1',
        type: 'markdown',
        position: { x: 20, y: 20 },
        size: { width: 160, height: 100 },
        zIndex: 1,
        data: { content: 'One' },
      },
      {
        id: 'note-2',
        type: 'markdown',
        position: { x: 220, y: 20 },
        size: { width: 160, height: 100 },
        zIndex: 2,
        data: { content: 'Two' },
      },
    ];
    const markup = renderToStaticMarkup(
      <SelectionContextToolbar
        nodes={nodes}
        selectedNodeIds={nodes.map((node) => node.id)}
        viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
        viewportSize={{ width: 800, height: 600 }}
      />,
    );

    expect(markup).toContain('data-selection-action="group-selection"');
    expect(markup).toContain('data-selection-action-location="primary"');
    expect(markup).toContain('data-selection-overflow-actions="delete-selection"');
    expect(markup).not.toContain('node:duplicate');
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
  executeMaterialAction: CanvasWebviewHostPort['executeMaterialAction'] = async () => {
    throw new Error('Not used by this static component test.');
  },
): CanvasWebviewHostPort {
  return {
    documentId: 'canvas-document-1',
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
    executeMaterialAction,
    dispose: () => undefined,
  };
}

function descriptor(
  id: string,
  label: string,
  effect: CanvasMaterialActionDescriptor['effect'],
): CanvasMaterialActionDescriptor {
  return {
    id,
    ownerId: id.split(':')[0] ?? 'fixture',
    label,
    mediaKinds: ['image', 'video', 'audio', 'document'],
    origins: ['referenced', 'generated'],
    selection: { minimum: 1, maximum: 1 },
    effect,
  };
}

function fileNode(id: string, path: string): CanvasNode {
  return {
    id,
    type: 'file',
    position: { x: 100, y: 100 },
    size: { width: 240, height: 180 },
    zIndex: 1,
    data: {
      title: path,
      path,
      mediaKind: 'document',
      contentLocator: { kind: 'workspace-file', path },
    },
  } as CanvasNode;
}

async function renderToolbar(
  nodes: readonly CanvasNode[],
  selectedNodeIds: readonly string[],
  descriptors: readonly CanvasMaterialActionDescriptor[],
): Promise<{ readonly container: HTMLDivElement; readonly dispose: () => Promise<void> }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <CanvasHostProvider host={createMaterialHost(descriptors)}>
        <SelectionContextToolbar
          nodes={nodes}
          selectedNodeIds={selectedNodeIds}
          viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
          viewportSize={{ width: 800, height: 600 }}
        />
      </CanvasHostProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return {
    container,
    dispose: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function materialActionSnapshot(): CanvasHostSnapshot {
  return {
    identity: {
      projectId: 'project-1',
      workspaceId: 'workspace-1',
      windowId: 'window-1',
      viewId: 'canvas-view-1',
      viewInstanceId: 'view-instance-1',
      documentId: 'canvas-document-1',
      sessionId: 'canvas-session-1',
      rendererSessionId: 'renderer-session-1',
    },
    dirty: false,
    canvas: createEmptyCanvasData('Fixture'),
    presentation: {
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      selectedNodeIds: [],
    },
    authoringCapabilities: { sourceModes: [], generationMediaKinds: [] },
  };
}
