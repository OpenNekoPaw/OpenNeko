import { describe, expect, it } from 'vitest';

import {
  CONTENT_IMAGE_DSH_CHUNK_BYTES,
  CONTENT_IMAGE_DSH_DETAILS,
  CONTENT_IMAGE_DSH_TOOL_NAME,
  CONTENT_IMAGE_DSH_TOOL_PARAMETERS,
  CONTENT_IMAGES_DSH_MAX_SOURCES,
  CONTENT_IMAGES_DSH_TOOL_NAME,
  CONTENT_IMAGES_DSH_TOOL_PARAMETERS,
  decodeContentImageDshChunk,
  decodeContentImageDshChunkRequest,
  decodeContentImageDshToolInput,
  decodeContentImagesDshToolInput,
} from './image-dsh-tool';

const source = {
  file: { authority: 'workspace' as const, path: 'books/story.epub' },
  selector: { kind: 'entry' as const, path: 'OPS/images/page-1.png' },
};

describe('Content image DSH contract', () => {
  it('accepts an exact document-entry locator and bounded offset', () => {
    expect(CONTENT_IMAGE_DSH_TOOL_NAME).toBe('openneko_read_image');
    expect(CONTENT_IMAGE_DSH_CHUNK_BYTES).toBeLessThan(192 * 1024);
    expect(CONTENT_IMAGE_DSH_DETAILS).toEqual(['overview', 'original']);
    expect(CONTENT_IMAGE_DSH_TOOL_PARAMETERS.source.properties).toHaveProperty('selector');
    expect(CONTENT_IMAGE_DSH_TOOL_PARAMETERS.detail.enum).toEqual(['overview', 'original']);
    expect(decodeContentImageDshToolInput({ source, detail: 'overview' })).toEqual({
      source,
      detail: 'overview',
    });
    expect(decodeContentImageDshToolInput({ source })).toEqual({ source, detail: 'original' });
    expect(decodeContentImageDshChunkRequest('read-chunk', { source, offset: 0 })).toEqual({
      source,
      offset: 0,
    });
  });

  it('accepts one to four distinct overview sources and rejects unbounded shapes', () => {
    const second = {
      ...source,
      selector: { kind: 'entry' as const, path: 'OPS/images/page-2.png' },
    };
    expect(CONTENT_IMAGES_DSH_TOOL_NAME).toBe('openneko_read_images');
    expect(CONTENT_IMAGES_DSH_MAX_SOURCES).toBe(4);
    expect(CONTENT_IMAGES_DSH_TOOL_PARAMETERS.sources).toMatchObject({
      type: 'array',
      required: true,
    });
    expect(decodeContentImagesDshToolInput({ sources: [source, second] })).toEqual({
      sources: [source, second],
    });
    expect(() => decodeContentImagesDshToolInput({ sources: [] })).toThrow(/between 1 and 4/u);
    expect(() => decodeContentImagesDshToolInput({ sources: [source, second, source] })).toThrow(
      /duplicate ContentLocator at index 2/u,
    );
    expect(() =>
      decodeContentImagesDshToolInput({
        sources: [
          source,
          second,
          { ...source, file: { ...source.file, path: 'other.epub' } },
          second,
        ],
        detail: 'original',
      }),
    ).toThrow(/must contain exactly sources/u);
    expect(() =>
      decodeContentImagesDshToolInput({
        sources: [source, second, source, second, source],
      }),
    ).toThrow(/between 1 and 4/u);
  });

  it('rejects raw paths, extra fields, and invalid offsets', () => {
    expect(() => decodeContentImageDshToolInput({ source, detail: 'thumbnail' })).toThrow(
      /overview, original/u,
    );
    expect(() => decodeContentImageDshToolInput({ source, extra: true })).toThrow(
      /only source and detail/u,
    );
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
