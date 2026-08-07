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
      url: 'data:image/png;base64,Y2F0',
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
      contentLocator: { kind: 'workspace-file', path: 'media/cat.png' },
      role: 'thumbnail',
      mediaType: 'image',
    });

    await vi.waitFor(() => expect(message).toHaveBeenCalled());
    expect(resolvePreviewVariant).toHaveBeenCalledWith({
      identity,
      requestId: 'preview-1',
      locator: { kind: 'workspace-file', path: 'media/cat.png' },
      role: 'thumbnail',
      mediaType: 'image',
    });
    expect(message.mock.calls.at(-1)?.[0]).toEqual({
      type: 'preview:variantResolved',
      requestId: 'preview-1',
      url: 'data:image/png;base64,Y2F0',
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
