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
import { useCanvasStore } from '../../stores/canvasStore';
import { enableDefaultCanvasTestStoreScope } from '../../stores/canvasStoreScope';
import { useHistoryStore } from '../../stores/historyStore';
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
  it('routes inline Markdown editing to the Canvas fullscreen Surface', async () => {
    const node: CanvasNode = {
      id: 'markdown',
      type: 'markdown',
      position: { x: 100, y: 100 },
      size: { width: 320, height: 220 },
      zIndex: 1,
      data: { title: 'Analysis', content: '# Analysis' },
    };
    const onMarkdownEdit = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CanvasHostProvider
          host={createMaterialHost([
            descriptor('text:edit', 'Edit text', 'handoff'),
            descriptor('preview:open', 'Main Preview', 'read'),
          ])}
        >
          <SelectionContextToolbar
            nodes={[node]}
            selectedNodeIds={[node.id]}
            viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
            viewportSize={{ width: 800, height: 600 }}
            onMarkdownEdit={onMarkdownEdit}
          />
        </CanvasHostProvider>,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(container.querySelector('[data-selection-action="text:edit"]')).toBeNull();
    expect(container.querySelector('[data-selection-action="preview:open"]')).not.toBeNull();
    expect(
      container.querySelector('[data-selection-action="canvas:edit-markdown"]')?.textContent,
    ).toContain('Edit full screen');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-selection-action="canvas:edit-markdown"]')
        ?.click();
    });
    expect(onMarkdownEdit).toHaveBeenCalledWith(node.id);

    await act(async () => root.unmount());
    container.remove();
  });

  it('projects owner-contributed media preview without synthesizing unavailable or delete actions', async () => {
    const node: CanvasNode = {
      id: 'media',
      type: 'media',
      position: { x: 100, y: 100 },
      size: { width: 280, height: 200 },
      zIndex: 1,
      data: {
        mediaType: 'image',
        assetPath: 'assets/image.png',
        contentLocator: { file: { authority: 'workspace', path: 'assets/image.png' } },
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
    document.body.appendChild(container);
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

    expect(markup).not.toContain('data-selection-overflow="true"');
    expect(markup).not.toContain('data-selection-action="node:edit-media"');
    expect(markup).not.toContain('data-selection-action="selection:quick-generate"');
    expect(markup).toContain('data-selection-action="preview:open"');
    expect(markup).not.toContain('data-selection-action="node:copy-to-media-library"');
    expect(markup).not.toContain('data-selection-action="node:open-content-overlay"');
    expect(markup).toContain('data-selection-action="node:duplicate"');
    expect(markup).toContain('data-selection-action-location="primary"');
    expect(markup).not.toContain('delete-selection');
    expect(container.querySelector('[data-selection-kind-label]')?.textContent).toBe('Image');
    expect(
      container.querySelector<HTMLElement>('[data-selection-context-toolbar]')?.style.top,
    ).toBe('32px');
    await act(async () => root.unmount());
    container.remove();
  });

  it('does not project material actions for a Generation node without a selected output', () => {
    const node: CanvasNode = {
      id: 'generation-video-failed',
      type: 'generation',
      position: { x: 100, y: 100 },
      size: { width: 320, height: 180 },
      zIndex: 1,
      data: {
        recipe: { kind: 'video', prompt: 'Generate a clip' },
        outputs: [],
      },
    };

    const markup = renderToStaticMarkup(
      <SelectionContextToolbar
        nodes={[node]}
        selectedNodeIds={[node.id]}
        viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
        viewportSize={{ width: 800, height: 600 }}
      />,
    );

    expect(markup).toContain('data-selection-action="node:duplicate"');
    expect(markup).not.toContain('data-selection-action="cut:add-resource"');
    expect(markup).not.toContain('data-selection-action="video:separate-audio"');
    expect(markup).not.toContain('data-selection-action="preview:open"');
    expect(markup).not.toContain('data-material-actions-status="error"');
  });

  it('keeps the toolbar preview owned by Main Preview without duplicating Canvas fullscreen', async () => {
    const node = mediaNode('image-preview', 'image', 'assets/image.png');
    const executeMaterialAction = vi.fn(async () => materialActionSnapshot());
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CanvasHostProvider
          host={createMaterialHost(
            [descriptor('preview:open', 'Full-screen preview', 'read')],
            executeMaterialAction,
          )}
        >
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

    expect(container.querySelector('[data-selection-action="canvas:preview"]')).toBeNull();
    expect(
      container.querySelector('[data-selection-action="preview:open"]')?.getAttribute('aria-label'),
    ).toBe('Full-screen preview');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-selection-action="preview:open"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(executeMaterialAction).toHaveBeenCalledWith('preview:open', [node.id], {});
    await act(async () => root.unmount());
    container.remove();
  });

  it('keeps file toolbar preview Main Preview-only', async () => {
    const textNode = fileNode('notes', 'notes/scene.md');
    const epubNode = fileNode('book', 'books/story.epub');
    const host = createMaterialHost([descriptor('preview:open', 'Main Preview', 'read')]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (node: CanvasNode): void =>
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

    await act(async () => {
      render(textNode);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[data-selection-action="canvas:preview"]')).toBeNull();
    expect(container.querySelector('[data-selection-action="preview:open"]')).not.toBeNull();

    await act(async () => {
      render(epubNode);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[data-selection-action="canvas:preview"]')).toBeNull();
    expect(container.querySelector('[data-selection-action="preview:open"]')).not.toBeNull();

    await act(async () => root.unmount());
    container.remove();
  });

  it('omits resource-library actions while keeping Video operations in one flat More list', async () => {
    const node: CanvasNode = {
      id: 'video',
      type: 'media',
      position: { x: 100, y: 100 },
      size: { width: 320, height: 180 },
      zIndex: 1,
      data: {
        mediaType: 'video',
        assetPath: 'media/clip.mp4',
        contentLocator: { file: { authority: 'workspace', path: 'media/clip.mp4' } },
      },
    };
    const descriptors: readonly CanvasMaterialActionDescriptor[] = [
      descriptor('preview:open', 'Preview', 'read'),
      descriptor('desktop:reveal', 'Reveal in Finder', 'handoff'),
      descriptor('media-library:copy-to-project', 'Copy to project Media Library', 'copy'),
      descriptor('media-library:copy-to-global', 'Copy to global Media Library', 'copy'),
      descriptor('video:separate-audio', 'Separate audio', 'derive'),
      descriptor('video:enhance', 'Enhance & interpolate', 'derive'),
      descriptor('video:extract-frame', 'Extract frame', 'derive'),
      descriptor('video:remove-subtitles', 'Remove subtitles', 'derive'),
      descriptor('video:generate-subtitles', 'Generate subtitles', 'generate'),
      descriptor('video:color-grade', 'Color grade', 'derive'),
      descriptor('video:open-editor-tools', 'Editor tools', 'handoff'),
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
      Array.from(container.querySelectorAll('[data-selection-action-location="primary"]')).map(
        (element) => element.getAttribute('data-selection-action'),
      ),
    ).toEqual(['cut:add-resource', 'video:separate-audio', 'node:duplicate', 'preview:open']);
    expect(
      container
        .querySelector('[data-selection-overflow]')
        ?.getAttribute('data-selection-overflow-actions'),
    ).toBe(
      'video:enhance video:extract-frame video:remove-subtitles video:generate-subtitles video:color-grade video:open-editor-tools',
    );

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-selection-overflow]')?.click();
    });
    expect(document.body.querySelector('[data-selection-overflow-group]')).toBeNull();
    expect(document.body.querySelector('.selection-action-overflow__label')).toBeNull();
    expect(document.body.textContent).toContain('Enhance & interpolate');
    expect(document.body.textContent).not.toContain('Reveal in Finder');
    expect(document.body.textContent).not.toContain('Copy to project Media Library');
    expect(document.body.textContent).not.toContain('Copy to global Media Library');
    expect(document.body.textContent).not.toContain('Delete');

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-selection-action="cut:add-resource"]')
        ?.click();
    });
    expect(executeMaterialAction).toHaveBeenCalledWith(
      'cut:add-resource',
      [node.id],
      descriptors[11]?.executionPayload,
    );
    await act(async () => root.unmount());
    container.remove();
  });

  it('orders Audio edit, denoise and preview while omitting resource-library actions', async () => {
    const node = mediaNode('audio', 'audio', 'media/voice.wav');
    const toolbar = await renderToolbar(
      [node],
      [node.id],
      [
        descriptor('preview:open', 'Full-screen preview', 'read'),
        descriptor('media-library:copy-to-project', 'Save material', 'copy'),
        descriptor('audio:voice-denoise', 'Voice denoise', 'derive'),
        descriptor('cut:add-resource', 'Edit', 'handoff'),
      ],
    );

    expect(
      Array.from(
        toolbar.container.querySelectorAll('[data-selection-action-location="primary"]'),
      ).map((element) => element.getAttribute('data-selection-action')),
    ).toEqual(['cut:add-resource', 'audio:voice-denoise', 'node:duplicate', 'preview:open']);
    expect(toolbar.container.textContent).toContain('Voice denoise');
    expect(toolbar.container.innerHTML).not.toContain('video:separate-audio');
    expect(toolbar.container.innerHTML).not.toContain('delete-selection');
    await toolbar.dispose();
  });

  it('orders Image crop, upscale and redraw before a capability-owned advanced edit menu', async () => {
    const node = mediaNode('image', 'image', 'media/still.png');
    const toolbar = await renderToolbar(
      [node],
      [node.id],
      [
        descriptor('preview:open', 'Full-screen preview', 'read'),
        descriptor('media-library:copy-to-project', 'Save material', 'copy'),
        descriptor('image:crop', 'Crop', 'derive'),
        descriptor('image:upscale', 'Upscale', 'derive'),
        descriptor('image:redraw', 'Redraw', 'generate'),
        descriptor('image:erase', 'Erase', 'derive'),
        descriptor('image:outpaint', 'Outpaint', 'generate'),
        descriptor('image:remove-background', 'Remove background', 'derive'),
        descriptor('image:color-grade', 'Color grade', 'derive'),
        descriptor('image:rotate', 'Rotate', 'derive'),
        descriptor('image:grid-split', 'Grid split', 'derive'),
        descriptor('image:open-editor-tools', 'Editor tools', 'handoff'),
      ],
    );

    expect(
      Array.from(
        toolbar.container.querySelectorAll('[data-selection-action-location="primary"]'),
      ).map((element) => element.getAttribute('data-selection-action')),
    ).toEqual(['image:crop', 'image:upscale', 'image:redraw', 'node:duplicate', 'preview:open']);
    expect(
      toolbar.container
        .querySelector('[data-selection-overflow]')
        ?.getAttribute('data-selection-overflow-actions'),
    ).toBe(
      'image:erase image:outpaint image:remove-background image:color-grade image:rotate image:grid-split image:open-editor-tools',
    );
    expect(toolbar.container.innerHTML).not.toContain('delete-selection');
    await toolbar.dispose();
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
        contentLocator: { file: { authority: 'workspace', path: 'neko/generated/result.png' } },
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
    expect(generated.container.innerHTML).not.toContain('desktop:reveal');
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

  it('keeps referenced text editing and preview visible while omitting Finder operations', async () => {
    const node = fileNode('notes', 'notes/scene.md');
    const toolbar = await renderToolbar(
      [node],
      [node.id],
      [
        descriptor('text:edit', 'Edit text', 'handoff'),
        descriptor('preview:open', 'Full-screen preview', 'read'),
        descriptor('desktop:reveal', 'Reveal in Finder', 'handoff'),
      ],
    );

    expect(
      Array.from(
        toolbar.container.querySelectorAll('[data-selection-action-location="primary"]'),
      ).map((element) => element.getAttribute('data-selection-action')),
    ).toEqual(['text:edit', 'node:duplicate', 'preview:open']);
    expect(toolbar.container.innerHTML).not.toContain('desktop:reveal');
    expect(toolbar.container.querySelector('[data-selection-kind-label]')?.textContent).toBe(
      'File',
    );
    await toolbar.dispose();
  });

  it.each([
    ['image', 'Image', 'image:crop'] as const,
    ['audio', 'Audio', 'audio:voice-denoise'] as const,
    ['video', 'Video', 'video:separate-audio'] as const,
  ])(
    'labels an explicit %s File by its material kind and renders its owner action',
    async (mediaKind, expectedLabel, actionId) => {
      const node = fileNode(`${mediaKind}-file`, `opaque/${mediaKind}.source`, mediaKind);
      const toolbar = await renderToolbar(
        [node],
        [node.id],
        [descriptor(actionId, 'Edit material', 'derive')],
      );

      expect(toolbar.container.querySelector('[data-selection-kind-label]')?.textContent).toBe(
        expectedLabel,
      );
      expect(
        toolbar.container.querySelector(`[data-selection-action="${actionId}"]`),
      ).not.toBeNull();
      await toolbar.dispose();
    },
  );

  it('labels a Generation Node as its base content kind', () => {
    const node: CanvasNode = {
      id: 'generation-image',
      type: 'generation',
      position: { x: 0, y: 0 },
      size: { width: 320, height: 240 },
      zIndex: 1,
      data: { recipe: { kind: 'image', prompt: '' }, outputs: [] },
    };
    const markup = renderToStaticMarkup(
      <SelectionContextToolbar
        nodes={[node]}
        selectedNodeIds={[node.id]}
        viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
        viewportSize={{ width: 800, height: 600 }}
      />,
    );

    expect(markup).toContain('data-selection-kind-label="true"');
    expect(markup).toContain('>Image</span>');
    expect(markup).toContain('data-selection-action="node:duplicate"');
    expect(markup).not.toContain('data-selection-action="preview:open"');
    expect(markup).not.toContain('data-disabled-reason');
    expect(markup).not.toContain('text:edit');
    expect(markup).not.toContain('cut:add-resource');
  });

  it('renders immutable Prompt output actions without inventing Text Editor ownership', async () => {
    const node: CanvasNode = {
      id: 'generation-prompt',
      type: 'generation',
      position: { x: 0, y: 0 },
      size: { width: 320, height: 240 },
      zIndex: 1,
      data: {
        recipe: { kind: 'prompt', prompt: 'Write a scene outline' },
        outputs: [
          {
            outputId: 'prompt-output-1',
            jobRef: { kind: 'generation', jobId: 'generation-job-1' },
            locator: {
              file: { authority: 'workspace', path: 'neko/generated/prompt-output-1.txt' },
            },
            kind: 'prompt',
            recipeInputFingerprint: 'recipe-fingerprint-1',
          },
        ],
        selectedOutputId: 'prompt-output-1',
      },
    };
    const toolbar = await renderToolbar(
      [node],
      [node.id],
      [
        descriptor('preview:open', 'Full-screen preview', 'read'),
        descriptor('desktop:reveal', 'Reveal in Finder', 'handoff'),
        descriptor('media-library:copy-to-project', 'Save material', 'copy'),
      ],
    );

    expect(
      Array.from(
        toolbar.container.querySelectorAll('[data-selection-action-location="primary"]'),
      ).map((element) => element.getAttribute('data-selection-action')),
    ).toEqual(['text:edit', 'node:duplicate', 'preview:open']);
    expect(
      toolbar.container.querySelector<HTMLButtonElement>('[data-selection-action="text:edit"]')
        ?.disabled,
    ).toBe(true);
    expect(toolbar.container.innerHTML).not.toContain('desktop:reveal');
    await toolbar.dispose();
  });

  it('projects Video material actions only while a selected output exists', async () => {
    const emptyNode: CanvasNode = {
      id: 'generation-video',
      type: 'generation',
      position: { x: 0, y: 0 },
      size: { width: 320, height: 180 },
      zIndex: 1,
      data: { recipe: { kind: 'video', prompt: '' }, outputs: [] },
    };
    const completedNode: CanvasNode = {
      ...emptyNode,
      data: {
        ...emptyNode.data,
        outputs: [
          {
            outputId: 'video-output-1',
            jobRef: { kind: 'generation', jobId: 'generation-job-1' },
            locator: {
              file: { authority: 'workspace', path: 'neko/generated/video-output-1.mp4' },
            },
            kind: 'video',
            recipeInputFingerprint: 'recipe-fingerprint-1',
          },
        ],
        selectedOutputId: 'video-output-1',
      },
    };
    const resolveMaterialActions = vi
      .fn<CanvasWebviewHostPort['resolveMaterialActions']>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        descriptor('cut:add-resource', 'Edit', 'handoff'),
        descriptor('video:separate-audio', 'Separate audio', 'derive'),
      ])
      .mockResolvedValueOnce([]);
    const host = { ...createMaterialHost([]), resolveMaterialActions };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (node: CanvasNode): void =>
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

    await act(async () => {
      render(emptyNode);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[data-selection-action="cut:add-resource"]')).toBeNull();
    expect(container.querySelector('[data-selection-action="video:separate-audio"]')).toBeNull();

    await act(async () => {
      render(completedNode);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(resolveMaterialActions).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-selection-action="cut:add-resource"]')).not.toBeNull();
    expect(
      container.querySelector<HTMLButtonElement>('[data-selection-action="cut:add-resource"]')
        ?.disabled,
    ).toBe(false);
    expect(
      Array.from(container.querySelectorAll('[data-selection-action-location="primary"]')).map(
        (element) => element.getAttribute('data-selection-action'),
      ),
    ).toEqual(['cut:add-resource', 'video:separate-audio', 'node:duplicate', 'preview:open']);

    await act(async () => {
      render(emptyNode);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(container.querySelector('[data-selection-action="cut:add-resource"]')).toBeNull();
    expect(container.querySelector('[data-selection-action="video:separate-audio"]')).toBeNull();
    expect(resolveMaterialActions).toHaveBeenCalledTimes(3);
    expect(
      Array.from(container.querySelectorAll('[data-selection-action-location="primary"]')).map(
        (element) => element.getAttribute('data-selection-action'),
      ),
    ).toEqual(['node:duplicate']);
    await act(async () => root.unmount());
    container.remove();
  });

  it('keeps material action resolution failures visible on the selected node toolbar', async () => {
    const node = mediaNode('image-error', 'image', 'media/still.png');
    const host = {
      ...createMaterialHost([]),
      resolveMaterialActions: vi.fn(async () => {
        throw new Error('Image action owner is unavailable.');
      }),
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
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

    const diagnostic = container.querySelector('[data-material-actions-status="error"]');
    expect(diagnostic?.getAttribute('role')).toBe('alert');
    expect(diagnostic?.getAttribute('title')).toBe('Image action owner is unavailable.');
    expect(diagnostic?.textContent).toContain('Actions unavailable');
    expect(container.querySelector('[data-selection-action="node:duplicate"]')).not.toBeNull();
    await act(async () => root.unmount());
    container.remove();
  });

  it('does not restart material action resolution for an equivalent selection projection', async () => {
    const node = mediaNode('video-stable-selection', 'video', 'media/clip.mp4');
    const resolveMaterialActions = vi
      .fn<CanvasWebviewHostPort['resolveMaterialActions']>()
      .mockResolvedValue([descriptor('preview:open', 'Preview', 'read')]);
    const host = { ...createMaterialHost([]), resolveMaterialActions };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const render = (): void =>
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

    await act(async () => {
      render();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      render();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(resolveMaterialActions).toHaveBeenCalledTimes(1);
    expect(resolveMaterialActions).toHaveBeenCalledWith([node.id]);
    await act(async () => root.unmount());
    container.remove();
  });

  it('reports exact material action execution failures instead of dropping the toolbar', async () => {
    const node = mediaNode('video-error', 'video', 'media/clip.mp4');
    const executeMaterialAction = vi.fn(async () => {
      throw new Error('Cut target changed before execution.');
    });
    const toolbar = await renderToolbar(
      [node],
      [node.id],
      [descriptor('cut:add-resource', 'Edit', 'handoff')],
      executeMaterialAction,
    );

    await act(async () => {
      toolbar.container
        .querySelector<HTMLButtonElement>('[data-selection-action="cut:add-resource"]')
        ?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const diagnostic = toolbar.container.querySelector('[data-material-actions-status="error"]');
    expect(diagnostic?.getAttribute('title')).toBe('Cut target changed before execution.');
    expect(
      toolbar.container.querySelector('[data-selection-action="cut:add-resource"]'),
    ).not.toBeNull();
    await toolbar.dispose();
  });

  it('keeps Group visible and exposes batch Duplicate and Delete for multi-selection', () => {
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
    expect(markup).toContain('delete-selection');
    expect(markup).toContain('data-selection-overflow="true"');
    expect(markup).toContain('node:duplicate');
  });

  it('duplicates the complete multi-selection through the toolbar action', async () => {
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
    useCanvasStore.getState().setCanvasData({
      name: 'Toolbar batch duplicate',
      viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      nodes: [...nodes],
      connections: [],
    });
    useCanvasStore.getState().selectNodes(nodes.map((node) => node.id));
    useHistoryStore.setState({ undoStack: [], redoStack: [], maxHistory: 50 });
    const toolbar = await renderToolbar(
      nodes,
      nodes.map((node) => node.id),
      [],
    );

    await act(async () => {
      toolbar.container
        .querySelector<HTMLButtonElement>('[data-selection-action="node:duplicate"]')
        ?.click();
    });

    const canvasData = useCanvasStore.getState().canvasData;
    expect(canvasData?.nodes).toHaveLength(4);
    expect(useCanvasStore.getState().selection.nodeIds).toHaveLength(2);
    expect(useCanvasStore.getState().selection.nodeIds).not.toEqual(nodes.map((node) => node.id));
    expect(useHistoryStore.getState().undoStack).toHaveLength(1);

    await toolbar.dispose();
    useCanvasStore.setState({ canvasData: null, selection: { nodeIds: [], connectionIds: [] } });
    useHistoryStore.setState({ undoStack: [], redoStack: [], maxHistory: 50 });
  });

  it('renders outside Canvas scaling while remaining fixed to the selected node', () => {
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
    expect(markup).not.toContain('data-selection-overflow="true"');
    expect(markup).toContain('left:1920px');
    expect(markup).toContain('top:-142px');
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
    createGenerationNode: async () => {
      throw new Error('Not used by this static component test.');
    },
    attachGenerationReference: async () => {
      throw new Error('Not used by this static component test.');
    },
    attachGenerationReferenceMaterial: async () => {
      throw new Error('Not used by this static component test.');
    },
    updateGenerationRecipe: async () => {
      throw new Error('Not used by this static component test.');
    },
    runGenerationNode: async () => {
      throw new Error('Not used by this static component test.');
    },
    cancelGenerationNode: async () => {
      throw new Error('Not used by this static component test.');
    },
    selectGenerationOutput: async () => {
      throw new Error('Not used by this static component test.');
    },
    authorGenerationText: async () => {
      throw new Error('Not used by this static component test.');
    },
    getGenerationProjection: () => undefined,
    projectContent: async () => {
      throw new Error('Not used by this static component test.');
    },
    previewResource: async () => undefined,
    revealResource: async () => undefined,
    readTextFilePreview: async (nodeId) => ({
      requestId: 'fixture-text-preview',
      nodeId,
      status: 'unsupported',
    }),
    getAuthoringCapabilities: () => ({
      sourceModes: [],
      generationKinds: [],
      generationModels: [],
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

function fileNode(
  id: string,
  path: string,
  mediaKind: 'image' | 'audio' | 'video' | 'document' = 'document',
): CanvasNode {
  return {
    id,
    type: 'file',
    position: { x: 100, y: 100 },
    size: { width: 240, height: 180 },
    zIndex: 1,
    data: {
      title: path,
      path,
      mediaKind,
      contentLocator: { file: { authority: 'workspace', path } },
    },
  } as CanvasNode;
}

function mediaNode(id: string, mediaType: 'image' | 'audio' | 'video', path: string): CanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 100, y: 100 },
    size: { width: 280, height: 180 },
    zIndex: 1,
    data: {
      mediaType,
      assetPath: path,
      contentLocator: { file: { authority: 'workspace', path } },
    },
  };
}

async function renderToolbar(
  nodes: readonly CanvasNode[],
  selectedNodeIds: readonly string[],
  descriptors: readonly CanvasMaterialActionDescriptor[],
  executeMaterialAction?: CanvasWebviewHostPort['executeMaterialAction'],
): Promise<{ readonly container: HTMLDivElement; readonly dispose: () => Promise<void> }> {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <CanvasHostProvider host={createMaterialHost(descriptors, executeMaterialAction)}>
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
    authoringCapabilities: { sourceModes: [], generationKinds: [], generationModels: [] },
    generationNodes: [],
  };
}
