// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasHostProvider, type CanvasWebviewHostPort } from '../host-runtime';
import { PreviewSurface } from './PreviewRendererRegistry';
import type { PreviewSourceDescriptor } from './types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('PreviewSurface canonical descriptor lifecycle', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('resolves one descriptor, renders the shared Viewer, and releases the exact lease', async () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const messages: unknown[] = [];
    const listeners = new Set<(message: unknown) => void>();
    const host = {
      documentId: 'boards/video.nkc',
      postMessage(message: unknown) {
        messages.push(message);
        if (!isRecord(message) || message['type'] !== 'preview:resolveResource') return;
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener({
              type: 'preview:resourceResolved',
              requestId: message['requestId'],
              descriptor: {
                descriptorId: 'canvas-descriptor-video-1',
                sourceFingerprint: 'video-fingerprint',
                contentLocator: message['contentLocator'],
                url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
                contentKind: 'video',
                mediaType: 'video/webm',
                displayName: 'video.webm',
                byteLength: 42,
              },
            });
          }
        });
      },
      supportsMessage: () => true,
      getState: () => undefined,
      setState: () => undefined,
      subscribe(listener: (message: unknown) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as CanvasWebviewHostPort;
    const source: PreviewSourceDescriptor = {
      id: 'canvas-node:video-1',
      nodeId: 'video-1',
      outputId: 'video-1',
      role: 'video-proxy',
      asset: { kind: 'asset-identity', mediaType: 'video' },
      contentLocator: { file: { authority: 'workspace', path: 'media/video.webm' } },
      metadata: {},
    };

    await act(async () => {
      root.render(
        <CanvasHostProvider host={host}>
          <PreviewSurface source={source} mediaPlayback="inline" />
        </CanvasHostProvider>,
      );
      await import('@neko/preview-webview/root');
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(
      messages.filter((message) => messageType(message) === 'preview:resolveResource'),
    ).toHaveLength(1);
    expect(
      messages.filter((message) => String(messageType(message)).startsWith('media:')),
    ).toHaveLength(0);
    expect(container.querySelector('[data-preview-ui="lightweight"]')).toBeTruthy();
    await vi.waitFor(() => expect(container.querySelector('video')).toBeTruthy());
    expect(container.querySelector('video')?.getAttribute('src')).toBe(
      'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );
    expect(container.querySelector('video')?.controls).toBe(false);
    expect(container.querySelector('[data-testid="preview-video-toggle-playback"]')).toBeTruthy();

    await act(async () => root.unmount());
    expect(
      messages.filter((message) => messageType(message) === 'preview:releaseResource'),
    ).toHaveLength(1);
  });

  it('resolves a fresh descriptor when the same locator fingerprint changes', async () => {
    const messages: unknown[] = [];
    const listeners = new Set<(message: unknown) => void>();
    let descriptorSequence = 0;
    const host = {
      documentId: 'boards/image.nkc',
      postMessage(message: unknown) {
        messages.push(message);
        if (!isRecord(message) || message['type'] !== 'preview:resolveResource') return;
        descriptorSequence += 1;
        const descriptorId = `canvas-descriptor-image-${descriptorSequence}`;
        queueMicrotask(() => {
          for (const listener of listeners) {
            listener({
              type: 'preview:resourceResolved',
              requestId: message['requestId'],
              descriptor: {
                descriptorId,
                sourceFingerprint: `resolved-${descriptorSequence}`,
                contentLocator: message['contentLocator'],
                url: `openneko://resource/${descriptorSequence.toString().padStart(32, 'a')}`,
                contentKind: 'image',
                mediaType: 'image/png',
                displayName: 'image.png',
                byteLength: 42,
              },
            });
          }
        });
      },
      supportsMessage: () => true,
      getState: () => undefined,
      setState: () => undefined,
      subscribe(listener: (message: unknown) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as unknown as CanvasWebviewHostPort;
    const source: PreviewSourceDescriptor = {
      id: 'canvas-node:image-1',
      nodeId: 'image-1',
      outputId: 'image-1',
      role: 'image',
      contentLocator: { file: { authority: 'workspace', path: 'media/image.png' } },
      sourceFingerprint: 'content:sha256:first',
    };

    await act(async () => {
      root.render(
        <CanvasHostProvider host={host}>
          <PreviewSurface source={source} />
        </CanvasHostProvider>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      root.render(
        <CanvasHostProvider host={host}>
          <PreviewSurface source={{ ...source, sourceFingerprint: 'content:sha256:second' }} />
        </CanvasHostProvider>,
      );
      await Promise.resolve();
    });

    expect(
      messages.filter((message) => messageType(message) === 'preview:resolveResource'),
    ).toHaveLength(2);
    expect(
      messages.filter((message) => messageType(message) === 'preview:releaseResource'),
    ).toHaveLength(1);
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageType(value: unknown): unknown {
  return isRecord(value) ? value['type'] : undefined;
}
