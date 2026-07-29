// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopCanvasWebviewDelegate } from './desktop-canvas-webview-delegate';

const identity = {
  projectId: 'project-1',
  workspaceId: 'workspace-1',
  windowId: 'window-1',
  viewId: 'canvas:view-1',
  viewEpoch: 1,
  documentId: 'boards/main.nkc',
  sessionId: 'canvas-session:canvas:view-1:1',
  endpointEpoch: 'endpoint-1',
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
      assetPath: 'media/cat.png',
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

  it('rejects unsupported messages and escaping paths instead of silently ignoring them', () => {
    vi.stubGlobal('openNekoDesktop', {
      canvas: { resolvePreviewVariant: vi.fn() },
    });
    const delegate = createDesktopCanvasWebviewDelegate(identity);

    expect(() => delegate.postMessage({ type: 'media:play' })).toThrow('unsupported message');
    expect(() =>
      delegate.postMessage({
        type: 'preview:resolveVariant',
        requestId: 'preview-2',
        assetPath: '../cat.png',
        role: 'thumbnail',
      }),
    ).toThrow('preview message is invalid');
  });
});
