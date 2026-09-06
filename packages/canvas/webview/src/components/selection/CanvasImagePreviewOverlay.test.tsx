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
          nodeId: 'generation-image',
          outputId: 'output-1',
          role: 'image',
          previewKind: 'image',
          contentLocator: {
            file: { authority: 'workspace', path: 'neko/generated/output-1.png' },
          },
        }),
        expect.objectContaining({
          id: 'canvas-fullscreen:generation:generation-image:output-2',
          nodeId: 'generation-image',
          outputId: 'output-2',
          role: 'image',
          previewKind: 'image',
          contentLocator: {
            file: { authority: 'workspace', path: 'neko/generated/output-2.png' },
          },
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
            contentLocator: { file: { authority: 'workspace', path: 'media/clip.mp4' } },
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
            contentLocator: { file: { authority: 'workspace', path: 'media/voice.mp3' } },
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
          file: { authority: 'workspace', path: '/Users/example/private.epub' },
          selector: { kind: 'entry', path: 'video/preview.mp4' },
        },
      },
    } as unknown as CanvasNode;

    expect(resolveCanvasFullscreenPreviewRequest(node)).toBeUndefined();
  });

  it('does not expose generated Prompt output through the preview path', () => {
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
            locator: { file: { authority: 'workspace', path: 'neko/generated/prompt-output.txt' } },
            kind: 'prompt',
            recipeInputFingerprint: 'sha256:prompt-recipe',
          },
        ],
        selectedOutputId: 'prompt-output',
      },
    };

    expect(resolveCanvasFullscreenPreviewRequest(node)).toBeUndefined();
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
    const thumbnails = container.querySelectorAll<HTMLButtonElement>(
      '.canvas-image-preview-overlay__thumbnail',
    );
    expect(thumbnails).toHaveLength(2);
    expect(thumbnails[0]?.querySelector('img')?.getAttribute('src')).toContain('/output-1');
    expect(thumbnails[1]?.querySelector('img')?.getAttribute('src')).toContain('/output-2');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    const initialRequests = previewRequests(host.postMessage);
    expect(initialRequests).toHaveLength(3);
    expect(initialRequests.map((request) => request['nodeId'])).toEqual([
      'generation-image',
      'generation-image',
      'generation-image',
    ]);
    expect(initialRequests.map((request) => request['outputId']).sort()).toEqual([
      'output-1',
      'output-1',
      'output-2',
    ]);
    for (const request of initialRequests) {
      expect(request['contentLocator']).toEqual({
        file: { authority: 'workspace', path: `neko/generated/${String(request['outputId'])}.png` },
      });
    }
    const initialBody = initialRequests.find((request) =>
      String(request['requestId']).startsWith('canvas-preview-resource-'),
    );
    expect(initialBody).toBeDefined();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(dialog?.dataset.imagePreviewActiveIndex).toBe('1');
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toContain('2');
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/output-2');
    expect(host.postMessage).toHaveBeenCalledWith({
      type: 'preview:releaseResource',
      descriptorId: `descriptor-${String(initialBody?.['requestId'])}`,
    });
    expect(previewRequests(host.postMessage)).toHaveLength(4);
    await act(async () => thumbnails[0]?.click());
    expect(dialog?.dataset.imagePreviewActiveIndex).toBe('0');
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/output-1');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    expectReleasedPreviewRequests(host.postMessage);
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

    expect(previewRequests(host.postMessage)).toHaveLength(3);
    expectReleasedPreviewRequests(host.postMessage);
    container.remove();
  });

  it('keeps a real thumbnail failure compact while another output remains previewable', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const host = createPreviewHost('output-1');
    try {
      await act(async () => {
        root.render(
          <CanvasHostProvider host={host.port}>
            <CanvasFullscreenPreviewOverlay request={galleryRequest()} onClose={() => undefined} />
          </CanvasHostProvider>,
        );
      });
      const alert = container.querySelector(
        '.canvas-image-preview-overlay__thumbnail [role="alert"]',
      );
      expect(alert?.getAttribute('title')).toBe('Output file is unavailable.');
      expect(alert?.getAttribute('aria-label')).toBe('Output file is unavailable.');
      expect(alert?.textContent).toBe('');
      expect(alert?.querySelector('svg')).not.toBeNull();
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
      const body = container.querySelector('.canvas-image-preview-overlay__content');
      expect(body?.querySelector('img')?.getAttribute('src')).toContain('/output-2');
      expect(body?.querySelector('[role="alert"]')).toBeNull();
      expect(
        container.querySelectorAll('.canvas-image-preview-overlay__thumbnail img'),
      ).toHaveLength(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
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
  const request = resolveCanvasFullscreenPreviewRequest({
    id: 'generation-image',
    type: 'generation',
    position: { x: 0, y: 0 },
    size: { width: 240, height: 180 },
    zIndex: 1,
    data: {
      recipe: { kind: 'image', prompt: 'Character sheet', count: 2 },
      outputs: [output('output-1', 'sha256:first'), output('output-2', 'sha256:second')],
      selectedOutputId: 'output-1',
    },
  });
  if (!request) throw new Error('Expected a generated Image gallery.');
  return request;
}

function output(outputId: string, _digest: string, jobId = 'job-1') {
  return {
    outputId,
    jobRef: { kind: 'generation', jobId } as const,
    locator: {
      file: {
        authority: 'workspace' as const,
        path: `neko/generated/${outputId}.png`,
      },
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
      contentLocator: { file: { authority: 'workspace', path } },
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
      contentLocator: { file: { authority: 'workspace', path } },
    },
  };
}

function createPreviewHost(unavailableOutputId?: string): {
  readonly port: CanvasWebviewHostPort;
  readonly postMessage: ReturnType<typeof vi.fn>;
} {
  const listeners = new Set<(message: unknown) => void>();
  const postMessage = vi.fn((message: unknown) => {
    if (!isRecord(message) || message['type'] !== 'preview:resolveResource') return;
    const outputId = String(message['outputId']);
    if (outputId === unavailableOutputId) {
      for (const listener of listeners) {
        listener({
          type: 'preview:resourceResolved',
          requestId: message['requestId'],
          error: 'Output file is unavailable.',
        });
      }
      return;
    }
    const descriptor = {
      descriptorId: `descriptor-${String(message['requestId'])}`,
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
  const pendingRequests: Record<string, unknown>[] = [];
  const postMessage = vi.fn((message: unknown) => {
    if (!isRecord(message) || message['type'] !== 'preview:resolveResource') return;
    pendingRequests.push(message);
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
      if (pendingRequests.length === 0) throw new Error('Expected an embedded preview request.');
      for (const pendingRequest of pendingRequests) {
        const outputId = String(pendingRequest['outputId']);
        for (const listener of listeners) {
          listener({
            type: 'preview:resourceResolved',
            requestId: pendingRequest['requestId'],
            descriptor: {
              descriptorId: `descriptor-${String(pendingRequest['requestId'])}`,
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

function previewRequests(postMessage: ReturnType<typeof vi.fn>): Record<string, unknown>[] {
  return postMessage.mock.calls.flatMap(([message]) =>
    isRecord(message) && message['type'] === 'preview:resolveResource' ? [message] : [],
  );
}

function expectReleasedPreviewRequests(postMessage: ReturnType<typeof vi.fn>): void {
  const released = postMessage.mock.calls.flatMap(([message]) =>
    isRecord(message) && message['type'] === 'preview:releaseResource'
      ? [message['descriptorId']]
      : [],
  );
  expect(released.sort()).toEqual(
    previewRequests(postMessage)
      .map((request) => `descriptor-${String(request['requestId'])}`)
      .sort(),
  );
}
