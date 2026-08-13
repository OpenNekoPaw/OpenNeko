// @vitest-environment jsdom

import type { CanvasNode } from '@neko/canvas-domain';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  CanvasFullscreenPreviewOverlay,
  resolveCanvasFullscreenPreviewRequest,
  type CanvasFullscreenPreviewRequest,
} from './CanvasImagePreviewOverlay';
import { CanvasHostProvider, type CanvasWebviewHostPort } from '../../host-runtime';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('CanvasFullscreenPreviewOverlay', () => {
  it('resolves the selected generated Image and its exact Job siblings as one gallery', () => {
    const node: CanvasNode = {
      id: 'generation-image',
      type: 'generation',
      position: { x: 0, y: 0 },
      size: { width: 240, height: 180 },
      zIndex: 1,
      data: {
        recipe: { kind: 'image', prompt: 'Character sheet', count: 2 },
        outputs: [
          output('historical-output', 'sha256:historical', 'job-old'),
          output('output-1', 'sha256:first'),
          output('output-2', 'sha256:selected'),
        ],
        selectedOutputId: 'output-2',
      },
    };

    expect(resolveCanvasFullscreenPreviewRequest(node)).toEqual({
      nodeId: 'generation-image',
      initialIndex: 1,
      items: [
        expect.objectContaining({
          id: 'canvas-fullscreen:generation:generation-image:output-1',
          role: 'image',
          previewKind: 'image',
          contentLocator: expect.objectContaining({ outputId: 'output-1' }),
        }),
        expect.objectContaining({
          id: 'canvas-fullscreen:generation:generation-image:output-2',
          role: 'image',
          previewKind: 'image',
          contentLocator: expect.objectContaining({
            outputId: 'output-2',
            digest: 'sha256:selected',
          }),
        }),
      ],
    });
  });

  it('resolves authorized Video and Audio nodes through the same embedded preview contract', () => {
    const video = mediaNode('video-node', 'video', 'media/clip.mp4');
    const audio = mediaNode('audio-node', 'audio', 'media/voice.mp3');

    expect(resolveCanvasFullscreenPreviewRequest(video)).toEqual(
      expect.objectContaining({
        nodeId: 'video-node',
        items: [
          expect.objectContaining({
            previewKind: 'video',
            role: 'video-proxy',
            contentLocator: { kind: 'workspace-file', path: 'media/clip.mp4' },
          }),
        ],
      }),
    );
    expect(resolveCanvasFullscreenPreviewRequest(audio)).toEqual(
      expect.objectContaining({
        nodeId: 'audio-node',
        items: [
          expect.objectContaining({
            previewKind: 'audio',
            role: 'audio-waveform',
            contentLocator: { kind: 'workspace-file', path: 'media/voice.mp3' },
          }),
        ],
      }),
    );
  });

  it('does not open an invalid material locator through the Canvas preview path', () => {
    const node = {
      ...mediaNode('invalid-node', 'video', 'Books/story.epub/video/preview.mp4'),
      data: {
        ...mediaNode('invalid-node', 'video', 'Books/story.epub/video/preview.mp4').data,
        contentLocator: {
          kind: 'document-entry',
          source: { kind: 'workspace-file', path: 'neko/assets/Books/story.epub' },
          entryPath: 'video/preview.mp4',
        },
      },
    } as unknown as CanvasNode;

    expect(resolveCanvasFullscreenPreviewRequest(node)).toBeUndefined();
  });

  it('maps a generated Prompt output to the shared text preview renderer', () => {
    const node: CanvasNode = {
      id: 'generation-prompt',
      type: 'generation',
      position: { x: 0, y: 0 },
      size: { width: 240, height: 180 },
      zIndex: 1,
      data: {
        recipe: { kind: 'prompt', prompt: 'Scene outline' },
        outputs: [
          {
            outputId: 'prompt-output',
            jobRef: { kind: 'generation', jobId: 'prompt-job' },
            locator: {
              kind: 'generated-output',
              outputId: 'prompt-output',
              digest: 'sha256:prompt-output',
              path: 'neko/generated/prompt-output.txt',
            },
            kind: 'prompt',
            recipeInputFingerprint: 'sha256:prompt-recipe',
          },
        ],
        selectedOutputId: 'prompt-output',
      },
    };

    expect(resolveCanvasFullscreenPreviewRequest(node)).toEqual(
      expect.objectContaining({
        nodeId: 'generation-prompt',
        items: [expect.objectContaining({ previewKind: 'text', role: 'text' })],
      }),
    );
  });

  it('resolves bounded text files but rejects document containers from embedded preview', () => {
    const markdown = fileNode('notes', 'notes/scene.md', 'text/markdown');
    const epub = fileNode('book', 'books/story.epub', 'application/epub+zip');

    expect(resolveCanvasFullscreenPreviewRequest(markdown)).toEqual(
      expect.objectContaining({
        nodeId: 'notes',
        items: [
          expect.objectContaining({
            previewKind: 'text',
            role: 'text',
            asset: { kind: 'asset-identity', mediaType: 'text' },
          }),
        ],
      }),
    );
    expect(resolveCanvasFullscreenPreviewRequest(epub)).toBeUndefined();
  });

  it('switches between Job siblings in the shared embedded Viewer and releases each lease', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onClose = vi.fn();
    const host = createPreviewHost();

    await act(async () => {
      root.render(
        <CanvasHostProvider host={host.port}>
          <CanvasFullscreenPreviewOverlay request={galleryRequest()} onClose={onClose} />
        </CanvasHostProvider>,
      );
    });

    const dialog = container.querySelector<HTMLElement>('[data-canvas-image-preview="true"]');
    expect(dialog?.dataset.imagePreviewActiveIndex).toBe('0');
    expect(dialog?.dataset.imagePreviewCount).toBe('2');
    expect(dialog?.textContent).toContain('1 / 2');
    expect(container.querySelector('[data-preview-ui="lightweight"]')).not.toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/output-1');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(dialog?.dataset.imagePreviewActiveIndex).toBe('1');
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toContain('2');
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/output-2');
    expect(host.postMessage).toHaveBeenCalledWith({
      type: 'preview:releaseResource',
      descriptorId: 'descriptor-output-1',
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    expect(host.postMessage).toHaveBeenCalledWith({
      type: 'preview:releaseResource',
      descriptorId: 'descriptor-output-2',
    });
    container.remove();
  });

  it('contains wheel input so zooming the preview cannot change the Canvas viewport', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const host = createPreviewHost();
    const leakedWheel = vi.fn();
    window.addEventListener('wheel', leakedWheel);

    await act(async () => {
      root.render(
        <CanvasHostProvider host={host.port}>
          <CanvasFullscreenPreviewOverlay request={galleryRequest()} onClose={() => undefined} />
        </CanvasHostProvider>,
      );
    });

    const stage = container.querySelector<HTMLElement>('.neko-preview-viewer--image');
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 });
    await act(async () => stage?.dispatchEvent(wheel));

    expect(leakedWheel).not.toHaveBeenCalled();
    expect(container.querySelector('output')?.textContent).toBe('110%');

    window.removeEventListener('wheel', leakedWheel);
    await act(async () => root.unmount());
    container.remove();
  });

  it('releases an embedded preview lease that resolves after the overlay is disposed', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const host = createDeferredPreviewHost();

    await act(async () => {
      root.render(
        <CanvasHostProvider host={host.port}>
          <CanvasFullscreenPreviewOverlay request={galleryRequest()} onClose={() => undefined} />
        </CanvasHostProvider>,
      );
    });
    await act(async () => root.unmount());
    await act(async () => host.resolve());

    expect(host.postMessage).toHaveBeenCalledWith({
      type: 'preview:releaseResource',
      descriptorId: 'descriptor-output-1',
    });
    container.remove();
  });

  it('does not reserve an empty gallery footer for a single embedded text document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('# Readable document', { status: 200 })),
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const host = createTextPreviewHost();
    const request = resolveCanvasFullscreenPreviewRequest(
      fileNode('notes', 'notes/scene.md', 'text/markdown'),
    );
    if (!request) throw new Error('Expected an embedded text preview request.');

    await act(async () => {
      root.render(
        <CanvasHostProvider host={host.port}>
          <CanvasFullscreenPreviewOverlay request={request} onClose={() => undefined} />
        </CanvasHostProvider>,
      );
    });
    await act(async () => Promise.resolve());

    expect(container.querySelector('[data-preview-kind="text"]')).toBeTruthy();
    expect(container.querySelector('[data-preview-text-reader="full"]')).toBeTruthy();
    expect(container.querySelector('.canvas-image-preview-overlay__footer')).toBeNull();

    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });
});

function galleryRequest(): CanvasFullscreenPreviewRequest {
  return {
    nodeId: 'generation-image',
    initialIndex: 0,
    items: [previewItem('output-1', 'First image'), previewItem('output-2', 'Second image')],
  };
}

function previewItem(outputId: string, title: string) {
  return {
    id: `canvas-fullscreen:generation:generation-image:${outputId}`,
    role: 'image' as const,
    previewKind: 'image' as const,
    title,
    asset: { kind: 'asset-identity' as const, mediaType: 'image' as const },
    contentLocator: {
      kind: 'generated-output' as const,
      outputId,
      digest: `sha256:${outputId}`,
      path: `neko/generated/${outputId}.png`,
    },
    metadata: {},
  };
}

function output(outputId: string, digest: string, jobId = 'job-1') {
  return {
    outputId,
    jobRef: { kind: 'generation', jobId } as const,
    locator: {
      kind: 'generated-output' as const,
      outputId,
      digest,
      path: `neko/generated/${outputId}.png`,
    },
    kind: 'image' as const,
    recipeInputFingerprint: 'recipe-fingerprint-1',
  };
}

function mediaNode(id: string, mediaType: 'video' | 'audio', path: string): CanvasNode {
  return {
    id,
    type: 'media',
    position: { x: 0, y: 0 },
    size: { width: 240, height: 180 },
    zIndex: 1,
    data: {
      mediaType,
      assetPath: path,
      contentLocator: { kind: 'workspace-file', path },
    },
  };
}

function fileNode(nodeId: string, path: string, mediaType: string): CanvasNode {
  return {
    id: nodeId,
    type: 'file',
    position: { x: 0, y: 0 },
    size: { width: 240, height: 180 },
    zIndex: 1,
    data: {
      title: path,
      path,
      mediaKind: 'document',
      mediaType,
      contentLocator: { kind: 'workspace-file', path },
    },
  };
}

function createPreviewHost(): {
  readonly port: CanvasWebviewHostPort;
  readonly postMessage: ReturnType<typeof vi.fn>;
} {
  const listeners = new Set<(message: unknown) => void>();
  const postMessage = vi.fn((message: unknown) => {
    if (!isRecord(message) || message['type'] !== 'preview:resolveResource') return;
    const outputId = String(message['outputId']);
    const descriptor = {
      descriptorId: `descriptor-${outputId}`,
      sourceFingerprint: `sha256-${outputId}`,
      contentLocator: message['contentLocator'],
      url: `openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${outputId}`,
      contentKind: 'image',
      mediaType: 'image/png',
      displayName: String(message['displayName']),
      byteLength: 42,
    };
    for (const listener of listeners) {
      listener({
        type: 'preview:resourceResolved',
        requestId: message['requestId'],
        descriptor,
      });
    }
  });
  const port = {
    documentId: 'neko/boards/workspace.nkc',
    postMessage,
    supportsMessage: () => true,
    subscribe(listener: (message: unknown) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as CanvasWebviewHostPort;
  return { port, postMessage };
}

function createDeferredPreviewHost(): {
  readonly port: CanvasWebviewHostPort;
  readonly postMessage: ReturnType<typeof vi.fn>;
  readonly resolve: () => void;
} {
  const listeners = new Set<(message: unknown) => void>();
  let pendingRequest: Record<string, unknown> | undefined;
  const postMessage = vi.fn((message: unknown) => {
    if (!isRecord(message) || message['type'] !== 'preview:resolveResource') return;
    pendingRequest = message;
  });
  const port = {
    documentId: 'neko/boards/workspace.nkc',
    postMessage,
    supportsMessage: () => true,
    subscribe(listener: (message: unknown) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as CanvasWebviewHostPort;
  return {
    port,
    postMessage,
    resolve() {
      if (!pendingRequest) throw new Error('Expected an embedded preview request.');
      const outputId = String(pendingRequest['outputId']);
      for (const listener of listeners) {
        listener({
          type: 'preview:resourceResolved',
          requestId: pendingRequest['requestId'],
          descriptor: {
            descriptorId: `descriptor-${outputId}`,
            sourceFingerprint: `sha256-${outputId}`,
            contentLocator: pendingRequest['contentLocator'],
            url: `openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/${outputId}`,
            contentKind: 'image',
            mediaType: 'image/png',
            displayName: String(pendingRequest['displayName']),
            byteLength: 42,
          },
        });
      }
    },
  };
}

function createTextPreviewHost(): {
  readonly port: CanvasWebviewHostPort;
  readonly postMessage: ReturnType<typeof vi.fn>;
} {
  const listeners = new Set<(message: unknown) => void>();
  const postMessage = vi.fn((message: unknown) => {
    if (!isRecord(message) || message['type'] !== 'preview:resolveResource') return;
    for (const listener of listeners) {
      listener({
        type: 'preview:resourceResolved',
        requestId: message['requestId'],
        descriptor: {
          descriptorId: 'descriptor-notes',
          sourceFingerprint: 'sha256-notes',
          contentLocator: message['contentLocator'],
          url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/preview',
          contentKind: 'text',
          mediaType: 'text/markdown',
          displayName: String(message['displayName']),
          byteLength: 19,
        },
      });
    }
  });
  const port = {
    documentId: 'neko/boards/workspace.nkc',
    postMessage,
    supportsMessage: () => true,
    subscribe(listener: (message: unknown) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as CanvasWebviewHostPort;
  return { port, postMessage };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
