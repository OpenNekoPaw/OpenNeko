import { describe, expect, it, vi } from 'vitest';

import { ContentImageDshHostAdapter } from './content-image-host-adapter';

const source = {
  file: { authority: 'workspace' as const, path: 'books/story.epub' },
  selector: { kind: 'entry' as const, path: 'OPS/page.png' },
};

describe('ContentImageDshHostAdapter', () => {
  it('loads an exact locator and returns a bounded canonical chunk', async () => {
    const bytes = pngBytes();
    const loadContentAsset = vi.fn(async () => ({
      status: 'ready' as const,
      diagnostics: [],
      bytes,
      mimeType: 'image/png',
      sizeBytes: bytes.byteLength,
    }));
    const adapter = new ContentImageDshHostAdapter({
      resolveDocumentContent: vi.fn(),
      loadContentAsset,
    });

    await expect(adapter.execute(request())).resolves.toMatchObject({
      outcome: 'success',
      result: {
        source,
        offset: 0,
        totalBytes: bytes.byteLength,
        mimeType: 'image/png',
        data: Buffer.from(bytes).toString('base64'),
      },
    });
    expect(loadContentAsset).toHaveBeenCalledWith(expect.objectContaining({ locator: source }));
  });

  it('fails only the current request for invalid sources and non-images', async () => {
    const adapter = new ContentImageDshHostAdapter({
      resolveDocumentContent: vi.fn(),
      loadContentAsset: vi.fn(async () => ({
        status: 'ready',
        diagnostics: [],
        bytes: new TextEncoder().encode('not an image'),
        sizeBytes: 12,
      })),
    });
    await expect(adapter.execute(request())).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'CONTENT_IMAGE_DSH_FORMAT_UNSUPPORTED' },
    });
    await expect(
      adapter.execute({ ...request(), input: { path: '/tmp/page.png', offset: 0 } }),
    ).resolves.toMatchObject({
      outcome: 'failure',
      diagnostic: { code: 'CONTENT_IMAGE_DSH_TOOL_INVALID_INPUT' },
    });
  });
});

function request() {
  return {
    sessionId: 'session-1',
    turn: 1,
    toolCallId: 'call-1',
    tool: 'openneko.read_image',
    operation: 'read-chunk',
    input: { source, offset: 0 },
  } as const;
}

function pngBytes(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  ]);
}
