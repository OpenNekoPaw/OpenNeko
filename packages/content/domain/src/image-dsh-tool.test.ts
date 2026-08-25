import { describe, expect, it } from 'vitest';

import {
  CONTENT_IMAGE_DSH_CHUNK_BYTES,
  CONTENT_IMAGE_DSH_TOOL_NAME,
  CONTENT_IMAGE_DSH_TOOL_PARAMETERS,
  decodeContentImageDshChunk,
  decodeContentImageDshChunkRequest,
} from './image-dsh-tool';

const source = {
  file: { authority: 'workspace' as const, path: 'books/story.epub' },
  selector: { kind: 'entry' as const, path: 'OPS/images/page-1.png' },
};

describe('Content image DSH contract', () => {
  it('accepts an exact document-entry locator and bounded offset', () => {
    expect(CONTENT_IMAGE_DSH_TOOL_NAME).toBe('openneko.read_image');
    expect(CONTENT_IMAGE_DSH_CHUNK_BYTES).toBeLessThan(192 * 1024);
    expect(CONTENT_IMAGE_DSH_TOOL_PARAMETERS.source.properties).toHaveProperty('selector');
    expect(decodeContentImageDshChunkRequest('read-chunk', { source, offset: 0 })).toEqual({
      source,
      offset: 0,
    });
  });

  it('rejects raw paths, extra fields, and invalid offsets', () => {
    expect(() =>
      decodeContentImageDshChunkRequest('read-chunk', {
        source: { path: '/tmp/page.png' },
        offset: 0,
      }),
    ).toThrow(/canonical Workspace ContentLocator/u);
    expect(() => decodeContentImageDshChunkRequest('read-chunk', { source, offset: -1 })).toThrow(
      /non-negative integer/u,
    );
    expect(() =>
      decodeContentImageDshChunkRequest('read-chunk', { source, offset: 0, path: 'page.png' }),
    ).toThrow(/exactly/u);
  });

  it('strictly decodes an image chunk', () => {
    expect(
      decodeContentImageDshChunk({
        source,
        offset: 0,
        totalBytes: 3,
        mimeType: 'image/png',
        data: 'AQID',
      }),
    ).toEqual({ source, offset: 0, totalBytes: 3, mimeType: 'image/png', data: 'AQID' });
    expect(() =>
      decodeContentImageDshChunk({
        source,
        offset: 0,
        totalBytes: 3,
        mimeType: 'image/svg+xml',
        data: 'AQID',
      }),
    ).toThrow(/unsupported/u);
  });
});
