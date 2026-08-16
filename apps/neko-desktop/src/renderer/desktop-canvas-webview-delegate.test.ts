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

  it('does not expose the retired Canvas media preparation protocol', () => {
    vi.stubGlobal('openNekoDesktop', { canvas: {} });
    const delegate = createDesktopCanvasWebviewDelegate(identity);

    expect(delegate.supportsMessage('media:probe')).toBe(false);
    expect(delegate.supportsMessage('media:play')).toBe(false);
    expect(delegate.supportsMessage('media:captureFrame')).toBe(false);
    expect(delegate.supportsMessage('media:stop')).toBe(false);
    expect(() => delegate.postMessage({ type: 'media:probe' })).toThrow('unsupported message');
  });

  it('resolves and releases an embedded Preview descriptor through the exact Canvas owner', async () => {
    const descriptor = {
      descriptorId: 'canvas-preview-session-1-output-1',
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
    const resolvePreviewResource = vi.fn(async (request) => ({
      requestId: request.requestId,
      descriptor,
    }));
    const releasePreviewResource = vi.fn(async () => undefined);
    vi.stubGlobal('openNekoDesktop', {
      canvas: { resolvePreviewResource, releasePreviewResource },
    });
    const delegate = createDesktopCanvasWebviewDelegate(identity);
    const message = vi.fn();
    delegate.subscribe(message);

    delegate.postMessage({
      type: 'preview:resolveResource',
      requestId: 'embedded-1',
      nodeId: 'generation-1',
      outputId: 'output-1',
      contentLocator: descriptor.contentLocator,
      contentKind: 'image',
      mediaType: 'image/png',
      displayName: 'Output 1',
    });

    await vi.waitFor(() => expect(message).toHaveBeenCalled());
    expect(resolvePreviewResource).toHaveBeenCalledWith({
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
      type: 'preview:resourceResolved',
      requestId: 'embedded-1',
      descriptor,
    });

    delegate.postMessage({
      type: 'preview:releaseResource',
      descriptorId: descriptor.descriptorId,
    });
    await vi.waitFor(() =>
      expect(releasePreviewResource).toHaveBeenCalledWith({
        identity,
        descriptorId: descriptor.descriptorId,
      }),
    );
  });

  it('forwards an embedded text Preview request without reclassifying it as a document', async () => {
    const locator = { kind: 'workspace-file' as const, path: 'notes/scene.md' };
    const descriptor = {
      descriptorId: 'canvas-text-preview-notes',
      sourceFingerprint: 'sha256-notes',
      contentLocator: locator,
      url: 'openneko://resource/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/preview',
      contentKind: 'text' as const,
      mediaType: 'text/markdown',
      displayName: 'scene.md',
      byteLength: 42,
    };
    const resolvePreviewResource = vi.fn(async (request) => ({
      requestId: request.requestId,
      descriptor,
    }));
    vi.stubGlobal('openNekoDesktop', {
      canvas: { resolvePreviewResource, releasePreviewResource: vi.fn() },
    });
    const delegate = createDesktopCanvasWebviewDelegate(identity);

    delegate.postMessage({
      type: 'preview:resolveResource',
      requestId: 'embedded-text-1',
      nodeId: 'notes',
      outputId: 'notes',
      contentLocator: locator,
      contentKind: 'text',
      mediaType: 'text/markdown',
      displayName: 'scene.md',
    });

    await vi.waitFor(() => expect(resolvePreviewResource).toHaveBeenCalled());
    expect(resolvePreviewResource).toHaveBeenCalledWith({
      identity,
      requestId: 'embedded-text-1',
      nodeId: 'notes',
      outputId: 'notes',
      locator,
      contentKind: 'text',
      mediaType: 'text/markdown',
      displayName: 'scene.md',
    });
  });

  it('rejects unsupported messages including the retired variant protocol', () => {
    vi.stubGlobal('openNekoDesktop', {
      canvas: { resolvePreviewResource: vi.fn() },
    });
    const delegate = createDesktopCanvasWebviewDelegate(identity);

    expect(delegate.supportsMessage('preview:resolveVariant')).toBe(false);
    expect(() => delegate.postMessage({ type: 'desktop:unknown' })).toThrow('unsupported message');
    expect(() => delegate.postMessage({ type: 'media:probe' })).toThrow('unsupported message');
    expect(() =>
      delegate.postMessage({
        type: 'preview:resolveVariant',
        requestId: 'preview-2',
        assetPath: 'media/cat.png',
        role: 'thumbnail',
      }),
    ).toThrow('unsupported message');
  });
});
