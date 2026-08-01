import { describe, expect, it, vi } from 'vitest';
import { WebviewPreviewResolver } from './previewResolver';

describe('WebviewPreviewResolver content identity', () => {
  it('requests a runtime variant with ContentLocator and no path identity', async () => {
    let listener: ((message: unknown) => void) | undefined;
    const host = {
      postMessage: vi.fn((message: unknown) => {
        const request = message as { requestId?: string };
        queueMicrotask(() => {
          listener?.({
            type: 'preview:variantResolved',
            requestId: request.requestId,
            url: 'data:image/png;base64,Y2F0',
          });
        });
      }),
      subscribe: vi.fn((nextListener: (message: unknown) => void) => {
        listener = nextListener;
        return () => {
          listener = undefined;
        };
      }),
    };
    const resolver = new WebviewPreviewResolver(host);

    await expect(
      resolver.resolve({
        source: {
          id: 'image-1',
          role: 'image',
          contentLocator: { kind: 'workspace-file', path: 'media/cat.png' },
          asset: {
            kind: 'asset-identity',
            path: 'media/cat.png',
            mediaType: 'image',
          },
        },
      }),
    ).resolves.toMatchObject({
      id: 'image-1:runtime',
      runtimeUrl: 'data:image/png;base64,Y2F0',
    });

    expect(host.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'preview:resolveVariant',
        contentLocator: { kind: 'workspace-file', path: 'media/cat.png' },
      }),
    );
    expect(host.postMessage.mock.calls[0]?.[0]).not.toHaveProperty('assetPath');
  });

  it('does not ask the Host to resolve a path-only source', async () => {
    const host = {
      postMessage: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const resolver = new WebviewPreviewResolver(host);

    await expect(
      resolver.resolve({
        source: {
          id: 'path-only',
          role: 'image',
          asset: {
            kind: 'asset-identity',
            path: 'media/path-only.png',
            mediaType: 'image',
          },
        },
      }),
    ).resolves.toMatchObject({
      id: 'path-only:unavailable',
      role: 'unavailable',
      metadata: { label: 'Preview source has no canonical ContentLocator' },
    });
    expect(host.postMessage).not.toHaveBeenCalled();
  });

  it('does not render a local path from a persisted preview variant', async () => {
    const host = {
      postMessage: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const resolver = new WebviewPreviewResolver(host);

    const result = await resolver.resolve({
      source: {
        id: 'local-variant',
        role: 'image',
        variants: [
          {
            id: 'local-variant:thumbnail',
            role: 'image',
            sourcePath: '/Users/example/private.png',
          },
        ],
      },
    });

    expect(result.role).toBe('unavailable');
    expect(host.postMessage).not.toHaveBeenCalled();
  });

  it('does not reuse a persisted loopback variant and resolves the locator through Host', async () => {
    let listener: ((message: unknown) => void) | undefined;
    const host = {
      postMessage: vi.fn((message: unknown) => {
        const request = message as { requestId?: string };
        queueMicrotask(() => {
          listener?.({
            type: 'preview:variantResolved',
            requestId: request.requestId,
            url: 'data:image/png;base64,bmV3',
          });
        });
      }),
      subscribe: vi.fn((nextListener: (message: unknown) => void) => {
        listener = nextListener;
        return () => {
          listener = undefined;
        };
      }),
    };
    const resolver = new WebviewPreviewResolver(host);

    const result = await resolver.resolve({
      source: {
        id: 'persisted-loopback',
        role: 'image',
        contentLocator: { kind: 'workspace-file', path: 'media/current.png' },
        variants: [
          {
            id: 'stale-runtime',
            role: 'image',
            sourcePath: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          },
        ],
      },
    });

    expect(result.runtimeUrl).toBe('data:image/png;base64,bmV3');
    expect(host.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        contentLocator: { kind: 'workspace-file', path: 'media/current.png' },
      }),
    );
  });

  it('ignores late responses from a disposed quick-preview request', async () => {
    let listener: ((message: unknown) => void) | undefined;
    const host = {
      postMessage: vi.fn(),
      subscribe: vi.fn((nextListener: (message: unknown) => void) => {
        listener = nextListener;
        return () => {
          listener = undefined;
        };
      }),
    };
    const resolver = new WebviewPreviewResolver(host);
    const pending = resolver.resolve({
      source: {
        id: 'hover-preview',
        role: 'video-proxy',
        contentLocator: { kind: 'workspace-file', path: 'media/hover.mp4' },
      },
    });
    const request = host.postMessage.mock.calls[0]?.[0] as { requestId?: string };

    resolver.dispose();
    listener?.({
      type: 'preview:variantResolved',
      requestId: request.requestId,
      url: 'openneko://resource/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });

    await expect(pending).resolves.toMatchObject({
      id: 'hover-preview:runtime',
      runtimeUrl: undefined,
    });
  });
});
