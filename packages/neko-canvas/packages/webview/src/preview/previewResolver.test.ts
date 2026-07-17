import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMockVSCodeApi,
  installMockWebviewWindow,
  type MockWebviewWindow,
} from '@neko/shared/vscode/test-utils';
import { WebviewPreviewResolver } from './previewResolver';

let mockWindow: MockWebviewWindow | undefined;

afterEach(() => {
  mockWindow?.dispose();
  mockWindow = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WebviewPreviewResolver', () => {
  it('uses stable preview descriptors without persisting runtime URLs', async () => {
    const resolver = new WebviewPreviewResolver();
    const source = {
      id: 'node:block',
      role: 'image' as const,
      asset: { kind: 'asset-identity' as const, path: 'asset.png' },
      variants: [{ id: 'thumb', role: 'image' as const, sourcePath: 'thumb.png' }],
    };

    const variant = await resolver.resolve({ source });

    expect(variant.runtimeUrl).toBe('thumb.png');
    expect(source.variants[0]).not.toHaveProperty('runtimeUrl');
  });

  it('returns unavailable preview when no source exists', async () => {
    const resolver = new WebviewPreviewResolver();

    const variant = await resolver.resolve({
      source: { id: 'empty', role: 'image', title: 'Missing' },
    });

    expect(variant.role).toBe('unavailable');
    expect(variant.metadata?.label).toBe('No preview source');
  });

  it('does not treat video source URLs as stable poster images', async () => {
    const resolver = new WebviewPreviewResolver();
    const source = {
      id: 'node:video',
      role: 'video-poster' as const,
      asset: { kind: 'asset-identity' as const, path: 'clip.mp4', mediaType: 'video' },
      variants: [
        {
          id: 'source-video',
          role: 'video-poster' as const,
          sourcePath: 'https://file+.vscode-resource.vscode-cdn.net/workspace/clip.mp4',
        },
      ],
    };

    const variant = await resolver.resolve({ source });

    expect(variant.runtimeUrl).toBeUndefined();
    expect(variant.sourcePath).toBe('clip.mp4');
  });

  it('resolves relative image poster paths for video posters instead of the video source', async () => {
    vi.useFakeTimers();
    const { postMessage } = installPreviewMock();
    const resolver = new WebviewPreviewResolver();

    const promise = resolver.resolve({
      source: {
        id: 'node:video',
        role: 'video-poster',
        asset: { kind: 'asset-identity', path: 'clip.mp4', mediaType: 'video' },
        variants: [{ id: 'thumb', role: 'video-poster', sourcePath: 'thumbs/clip.png' }],
      },
    });
    const request = postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
    resolver.dispose();

    expect(request).toMatchObject({
      type: 'preview:resolveVariant',
      assetPath: 'thumbs/clip.png',
      role: 'thumbnail',
      mediaType: 'image',
    });
    await expect(promise).resolves.toMatchObject({
      sourcePath: 'thumbs/clip.png',
      runtimeUrl: undefined,
      mimeType: 'image',
    });
  });

  it('cleans up pending runtime variant requests on dispose', async () => {
    vi.useFakeTimers();
    const { postMessage } = installPreviewMock();
    const resolver = new WebviewPreviewResolver();

    const promise = resolver.resolve({
      source: {
        id: 'node:video',
        role: 'video-poster',
        asset: { kind: 'asset-identity', path: 'clip.mp4', mediaType: 'video' },
      },
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'preview:resolveVariant' }),
    );

    resolver.dispose();

    await expect(promise).resolves.toMatchObject({
      id: 'node:video:runtime',
      runtimeUrl: undefined,
    });
    expect(mockWindow?.listeners).toHaveLength(0);
  });

  it('requests panoramic FOV variants without persisting returned runtime URLs', async () => {
    vi.useFakeTimers();
    const { postMessage } = installPreviewMock();
    let messageHandler: ((event: MessageEvent) => void) | undefined;
    const addEventListener = window.addEventListener.bind(window);
    window.addEventListener = vi.fn(
      (_type: string, listener: EventListenerOrEventListenerObject) => {
        messageHandler =
          typeof listener === 'function'
            ? (listener as (event: MessageEvent) => void)
            : (event: MessageEvent) => listener.handleEvent(event);
        addEventListener(_type, listener);
      },
    );
    const resolver = new WebviewPreviewResolver();
    const source = {
      id: 'node:pano',
      role: 'panorama-fov-crop' as const,
      asset: { kind: 'asset-identity' as const, path: 'skybox_360.jpg', mediaType: 'image' },
    };

    const promise = resolver.resolve({ source });
    const request = postMessage.mock.calls[0]?.[0] as { requestId: string };
    messageHandler?.({
      data: {
        type: 'preview:variantResolved',
        requestId: request.requestId,
        url: 'http://127.0.0.1:3456/v1/preview/file/token',
      },
    } as MessageEvent);

    await expect(promise).resolves.toMatchObject({
      role: 'panorama-fov-crop',
      sourcePath: 'skybox_360.jpg',
      runtimeUrl: 'http://127.0.0.1:3456/v1/preview/file/token',
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:resolveVariant',
        role: 'fov-crop',
        mediaType: 'image',
      }),
    );
    expect(JSON.stringify(source)).not.toContain('127.0.0.1');
    expect(JSON.stringify(source)).not.toContain('token');
  });

  it('passes document resource refs to runtime preview resolution without storing them on asset identity', async () => {
    vi.useFakeTimers();
    const { postMessage } = installPreviewMock();
    const resolver = new WebviewPreviewResolver();
    const documentResourceRef = {
      kind: 'document-entry',
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
      entryPath: 'image/page-1.jpg',
      versionPolicy: 'versioned-export',
    };

    const promise = resolver.resolve({
      source: {
        id: 'node:document-image',
        role: 'image',
        asset: { kind: 'asset-identity', uri: 'image/page-1.jpg', mediaType: 'image' },
        metadata: { documentResourceRef },
      },
    });
    const request = postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
    resolver.dispose();

    expect(request).toMatchObject({
      type: 'preview:resolveVariant',
      documentResourceRef,
    });
    expect(request).not.toHaveProperty('assetPath');
    await expect(promise).resolves.toMatchObject({ sourcePath: 'image/page-1.jpg' });
  });

  it('requests runtime previews from document resource refs without an asset path', async () => {
    vi.useFakeTimers();
    const { postMessage } = installPreviewMock();
    const resolver = new WebviewPreviewResolver();
    const documentResourceRef = {
      kind: 'document-entry',
      source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
      entryPath: 'image/page-1.jpg',
      versionPolicy: 'versioned-export',
    };

    const promise = resolver.resolve({
      source: {
        id: 'node:shot-reference',
        role: 'image',
        metadata: { documentResourceRef },
      },
    });
    const request = postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
    resolver.dispose();

    expect(request).toMatchObject({
      type: 'preview:resolveVariant',
      documentResourceRef,
    });
    expect(request).not.toHaveProperty('assetPath');
    await expect(promise).resolves.toMatchObject({
      sourcePath: undefined,
      runtimeUrl: undefined,
    });
  });

  it('requests source variants for source-image review previews', async () => {
    vi.useFakeTimers();
    const { postMessage } = installPreviewMock();
    const resolver = new WebviewPreviewResolver();

    const promise = resolver.resolve({
      source: {
        id: 'node:shot-review',
        role: 'source-image',
        asset: { kind: 'asset-identity', path: 'panel.jpg', mediaType: 'image' },
      },
    });
    const request = postMessage.mock.calls[0]?.[0] as Record<string, unknown>;
    resolver.dispose();

    expect(request).toMatchObject({
      type: 'preview:resolveVariant',
      assetPath: 'panel.jpg',
      role: 'source',
      mediaType: 'image',
    });
    await expect(promise).resolves.toMatchObject({ sourcePath: 'panel.jpg' });
  });
});

function installPreviewMock(): { postMessage: ReturnType<typeof vi.fn> } {
  const api = createMockVSCodeApi();
  const postMessage = vi.fn(api.postMessage);
  api.postMessage = postMessage;
  mockWindow = installMockWebviewWindow(api);
  return { postMessage };
}
