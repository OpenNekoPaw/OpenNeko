// @vitest-environment jsdom

import type { CanvasNode } from '@neko/canvas-domain';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import {
  CanvasEmbeddedPreviewOverlay,
  resolveCanvasEmbeddedPreviewRequest,
  type CanvasEmbeddedPreviewRequest,
} from './CanvasImagePreviewOverlay';
import { CanvasHostProvider, type CanvasWebviewHostPort } from '../../host-runtime';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('CanvasEmbeddedPreviewOverlay', () => {
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

    expect(resolveCanvasEmbeddedPreviewRequest(node)).toEqual({
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

    expect(resolveCanvasEmbeddedPreviewRequest(video)).toEqual(
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
    expect(resolveCanvasEmbeddedPreviewRequest(audio)).toEqual(
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

  it('switches between Job siblings in the shared embedded Viewer and releases each lease', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onClose = vi.fn();
    const host = createPreviewHost();

    await act(async () => {
      root.render(
        <CanvasHostProvider host={host.port}>
          <CanvasEmbeddedPreviewOverlay request={galleryRequest()} onClose={onClose} />
        </CanvasHostProvider>,
      );
    });

    const dialog = container.querySelector<HTMLElement>('[data-canvas-image-preview="true"]');
    expect(dialog?.dataset.imagePreviewActiveIndex).toBe('0');
    expect(dialog?.dataset.imagePreviewCount).toBe('2');
    expect(dialog?.textContent).toContain('1 / 2');
    expect(container.querySelector('[data-preview-presentation="embedded"]')).not.toBeNull();
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/output-1');

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(dialog?.dataset.imagePreviewActiveIndex).toBe('1');
    expect(container.querySelector('[aria-pressed="true"]')?.textContent).toContain('2');
    expect(container.querySelector('img')?.getAttribute('src')).toContain('/output-2');
    expect(host.postMessage).toHaveBeenCalledWith({
      type: 'preview:releaseEmbedded',
      descriptorId: 'descriptor-output-1',
    });

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    expect(host.postMessage).toHaveBeenCalledWith({
      type: 'preview:releaseEmbedded',
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
          <CanvasEmbeddedPreviewOverlay request={galleryRequest()} onClose={() => undefined} />
        </CanvasHostProvider>,
      );
    });

    const stage = container.querySelector<HTMLElement>('.neko-preview-viewer--embedded-image');
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
          <CanvasEmbeddedPreviewOverlay request={galleryRequest()} onClose={() => undefined} />
        </CanvasHostProvider>,
      );
    });
    await act(async () => root.unmount());
    await act(async () => host.resolve());

    expect(host.postMessage).toHaveBeenCalledWith({
      type: 'preview:releaseEmbedded',
      descriptorId: 'descriptor-output-1',
    });
    container.remove();
  });
});

function galleryRequest(): CanvasEmbeddedPreviewRequest {
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

function createPreviewHost(): {
  readonly port: CanvasWebviewHostPort;
  readonly postMessage: ReturnType<typeof vi.fn>;
} {
  const listeners = new Set<(message: unknown) => void>();
  const postMessage = vi.fn((message: unknown) => {
    if (!isRecord(message) || message['type'] !== 'preview:resolveEmbedded') return;
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
        type: 'preview:embeddedResolved',
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
    if (!isRecord(message) || message['type'] !== 'preview:resolveEmbedded') return;
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
          type: 'preview:embeddedResolved',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
