// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceRef, type CanvasNode } from '@neko/shared';
import { resetVSCodeApi } from '@neko/shared/vscode';
import { setLocale } from '../../i18n';
import { SelectionMaterialGenerationBar } from './SelectionMaterialGenerationBar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../../host-runtime', () => ({
  useOptionalCanvasHost: () =>
    (window as unknown as { vscodeApi?: { postMessage(message: unknown): void } }).vscodeApi,
}));

const resourceRef = createResourceRef({
  id: 'generated-image-1',
  scope: 'project',
  provider: 'generated-output',
  kind: 'generated',
  source: { kind: 'generated-asset', generatedAssetId: 'generated-image-1' },
  locator: { kind: 'generated-asset', assetId: 'generated-image-1' },
  fingerprint: { strategy: 'hash', value: 'sha256:generated-image-1' },
});

describe('SelectionMaterialGenerationBar', () => {
  beforeEach(() => {
    setLocale('en');
    (window as unknown as { vscodeApi?: unknown }).vscodeApi = {
      postMessage: vi.fn(),
      supportsMessage: (messageType: string) => messageType === 'sendToAgent',
    };
  });

  it('shows prompt metadata and quick generation for generated canonical media', () => {
    const node = mediaNode('generated-media', {
      assetPath: '',
      mediaType: 'image',
      resourceRef,
      generationContext: {
        prompt: 'Cold industrial corridor',
        model: 'image-model-v2',
        aspectRatio: '16:9',
      },
    });

    const markup = render(node, [node]);

    expect(markup).toContain('data-material-generation-context="true"');
    expect(markup).toContain('data-material-generation-target="generated-media"');
    expect(markup).toContain('Cold industrial corridor');
    expect(markup).toContain('image-model-v2 · 16:9');
    expect(markup).toContain('data-material-generation-action="generate-again"');
  });

  it('shows missing prompt provenance while retaining the Agent Job quick action', () => {
    const node = mediaNode('legacy-generated', {
      assetPath: '',
      mediaType: 'image',
      resourceRef,
    });

    const markup = render(node, [node]);

    expect(markup).toContain('data-material-generation-context="true"');
    expect(markup).toContain('No generation prompt was recorded');
    expect(markup).toContain('data-material-generation-action');
  });

  it('routes generate again through the Agent with explicit provenance', () => {
    const postMessage = vi.fn();
    (window as unknown as { vscodeApi?: unknown }).vscodeApi = {
      postMessage,
      supportsMessage: (messageType: string) => messageType === 'sendToAgent',
    };
    resetVSCodeApi();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    const node = mediaNode('generated-media', {
      assetPath: '',
      mediaType: 'image',
      resourceRef,
      generationContext: {
        prompt: 'Cold industrial corridor',
        model: 'image-model-v2',
      },
    });

    try {
      act(() => {
        root.render(
          <SelectionMaterialGenerationBar
            nodes={[node]}
            selectedNodeIds={[node.id]}
            viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
            viewportSize={{ width: 800, height: 600 }}
          />,
        );
      });
      act(() => {
        host
          .querySelector<HTMLButtonElement>('[data-material-generation-action="generate-again"]')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(postMessage).toHaveBeenCalledWith({
        type: 'sendToAgent',
        nodeIds: ['generated-media'],
        action: 'generate',
        prompt: 'Cold industrial corridor',
        mediaType: 'image',
      });
    } finally {
      act(() => root.unmount());
      host.remove();
      delete (window as unknown as { vscodeApi?: unknown }).vscodeApi;
      resetVSCodeApi();
    }
  });
});

function render(node: CanvasNode, nodes: readonly CanvasNode[]): string {
  return renderToStaticMarkup(
    <SelectionMaterialGenerationBar
      nodes={nodes}
      selectedNodeIds={[node.id]}
      viewport={{ pan: { x: 0, y: 0 }, zoom: 1 }}
      viewportSize={{ width: 800, height: 600 }}
    />,
  );
}

function mediaNode(id: string, data: Record<string, unknown>): CanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 100, y: 100 },
    size: { width: 280, height: 200 },
    zIndex: 1,
    data,
  } as CanvasNode;
}
