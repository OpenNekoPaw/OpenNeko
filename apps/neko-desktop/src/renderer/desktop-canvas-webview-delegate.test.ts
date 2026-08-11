// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopCanvasWebviewDelegate } from './desktop-canvas-webview-delegate';

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'canvas:view-1',
  viewInstanceId: 'view-instance-1',
  documentId: 'boards/main.nkc',
  sessionId: 'canvas-session:canvas:view-1:view-instance-1',
  rendererSessionId: 'endpoint-1',
};

describe('Desktop Canvas Webview delegate', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves a package PreviewSurface request through the owner-bound Desktop bridge', async () => {
    const resolvePreviewVariant = vi.fn(async () => ({
      requestId: 'preview-1',
      url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/preview',
    }));
    vi.stubGlobal('openNekoDesktop', {
      canvas: { resolvePreviewVariant },
    });
    const delegate = createDesktopCanvasWebviewDelegate(identity);
    const message = vi.fn();
    delegate.subscribe(message);
    expect(delegate.supportsMessage('preview:resolveVariant')).toBe(true);
    expect(delegate.supportsMessage('sendToAgent')).toBe(false);

    delegate.postMessage({
      type: 'preview:resolveVariant',
      requestId: 'preview-1',
      sourceId: 'image-node-1',
      contentLocator: { kind: 'workspace-file', path: 'media/cat.png' },
      role: 'thumbnail',
      mediaType: 'image',
    });

    await vi.waitFor(() => expect(message).toHaveBeenCalled());
    expect(resolvePreviewVariant).toHaveBeenCalledWith({
      identity,
      requestId: 'preview-1',
      sourceId: 'image-node-1',
      locator: { kind: 'workspace-file', path: 'media/cat.png' },
      role: 'thumbnail',
      mediaType: 'image',
    });
    expect(message.mock.calls.at(-1)?.[0]).toEqual({
      type: 'preview:variantResolved',
      requestId: 'preview-1',
      url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/preview',
    });
  });

  it('routes the package-owned media preview protocol through the owner-bound Desktop bridge', async () => {
    const executeMediaRequest = vi.fn(async () => ({
      type: 'media:probeResult',
      nodeId: 'audio-1',
      mediaInfo: {
        duration: 12,
        width: 0,
        height: 0,
        fps: 0,
        codec: 'aac',
        format: 'aac',
        hasAudio: true,
      },
    }));
    vi.stubGlobal('openNekoDesktop', {
      canvas: {
        resolvePreviewVariant: vi.fn(),
        executeMediaRequest,
      },
    });
    const delegate = createDesktopCanvasWebviewDelegate(identity);
    const message = vi.fn();
    delegate.subscribe(message);

    expect(delegate.supportsMessage('media:probe')).toBe(true);
    expect(delegate.supportsMessage('media:play')).toBe(true);
    expect(delegate.supportsMessage('media:captureFrame')).toBe(true);
    expect(delegate.supportsMessage('media:stop')).toBe(true);

    delegate.postMessage({
      type: 'media:probe',
      nodeId: 'audio-1',
      contentLocator: { kind: 'workspace-file', path: 'media/test.aac' },
      mediaType: 'audio',
    });

    await vi.waitFor(() => expect(message).toHaveBeenCalled());
    expect(executeMediaRequest).toHaveBeenCalledWith({
      identity,
      type: 'media:probe',
      nodeId: 'audio-1',
      locator: { kind: 'workspace-file', path: 'media/test.aac' },
      mediaType: 'audio',
    });
    expect(message.mock.calls.at(-1)?.[0]).toMatchObject({
      type: 'media:probeResult',
      nodeId: 'audio-1',
      mediaInfo: { codec: 'aac', hasAudio: true },
    });
  });

  it('resolves and releases an embedded Preview descriptor through the exact Canvas owner', async () => {
    const descriptor = {
      descriptorId: 'canvas-embedded-session-1-output-1',
      sourceFingerprint: 'sha256-output-1',
      contentLocator: {
        kind: 'generated-output' as const,
        outputId: 'output-1',
        digest: 'sha256:output-1',
        path: 'neko/generated/output-1.png',
      },
      url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      contentKind: 'image' as const,
      mediaType: 'image/png',
      displayName: 'Output 1',
      byteLength: 42,
    };
    const resolveEmbeddedPreview = vi.fn(async (request) => ({
      requestId: request.requestId,
      descriptor,
    }));
    const releaseEmbeddedPreview = vi.fn(async () => undefined);
    vi.stubGlobal('openNekoDesktop', {
      canvas: { resolveEmbeddedPreview, releaseEmbeddedPreview },
    });
    const delegate = createDesktopCanvasWebviewDelegate(identity);
    const message = vi.fn();
    delegate.subscribe(message);

    delegate.postMessage({
      type: 'preview:resolveEmbedded',
      requestId: 'embedded-1',
      nodeId: 'generation-1',
      outputId: 'output-1',
      contentLocator: descriptor.contentLocator,
      contentKind: 'image',
      mediaType: 'image/png',
      displayName: 'Output 1',
    });

    await vi.waitFor(() => expect(message).toHaveBeenCalled());
    expect(resolveEmbeddedPreview).toHaveBeenCalledWith({
      identity,
      requestId: 'embedded-1',
      nodeId: 'generation-1',
      outputId: 'output-1',
      locator: descriptor.contentLocator,
      contentKind: 'image',
      mediaType: 'image/png',
      displayName: 'Output 1',
    });
    expect(message).toHaveBeenCalledWith({
      type: 'preview:embeddedResolved',
      requestId: 'embedded-1',
      descriptor,
    });

    delegate.postMessage({
      type: 'preview:releaseEmbedded',
      descriptorId: descriptor.descriptorId,
    });
    await vi.waitFor(() =>
      expect(releaseEmbeddedPreview).toHaveBeenCalledWith({
        identity,
        descriptorId: descriptor.descriptorId,
      }),
    );
  });

  it('rejects unsupported messages and path-only sources instead of inferring locators', () => {
    vi.stubGlobal('openNekoDesktop', {
      canvas: { resolvePreviewVariant: vi.fn() },
    });
    const delegate = createDesktopCanvasWebviewDelegate(identity);

    expect(() => delegate.postMessage({ type: 'desktop:unknown' })).toThrow('unsupported message');
    expect(() =>
      delegate.postMessage({
        type: 'media:probe',
        nodeId: 'video-1',
        assetPath: 'media/cat.mp4',
        mediaType: 'video',
      }),
    ).toThrow('media source is invalid');
    expect(() =>
      delegate.postMessage({
        type: 'preview:resolveVariant',
        requestId: 'preview-2',
        assetPath: 'media/cat.png',
        role: 'thumbnail',
      }),
    ).toThrow('preview message is invalid');
  });
});
