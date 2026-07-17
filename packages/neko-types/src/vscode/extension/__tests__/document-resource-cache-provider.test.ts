import { describe, expect, it, vi } from 'vitest';
import { PathResolver } from '../../../path';
import type { DocumentSourceRef } from '../../../types';
import {
  createDocumentResourceRef,
  createDocumentResourceRefFromArchiveRef,
  DocumentResourceCacheProvider,
} from '../document-resource-cache-provider';

describe('DocumentResourceCacheProvider', () => {
  const source: DocumentSourceRef = {
    filePath: '${BOOKS}/comic.epub',
    format: 'epub',
    fileId: 'comic-v1',
    identity: { fileId: 'comic-v1', sizeBytes: 1024, mtimeMs: 42 },
  };

  it('creates stable resource refs from archive refs without embedding cache paths', () => {
    const ref = createDocumentResourceRefFromArchiveRef({
      kind: 'document-entry',
      source,
      entryPath: 'OPS/page-1.jpg',
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
      cachePath: '/tmp/page-1.jpg',
      versionPolicy: 'versioned-export',
    });

    expect(ref.provider).toBe('document-archive');
    expect(ref.scope).toBe('project');
    expect(ref.source.kind).toBe('document');
    expect(ref.source.document).toMatchObject({
      filePath: source.filePath,
      format: 'epub',
    });
    expect(ref.source).not.toHaveProperty('filePath');
    expect(ref.source).not.toHaveProperty('metadata');
    expect(ref.id).toBe(
      createDocumentResourceRefFromArchiveRef({
        kind: 'document-entry',
        source,
        entryPath: 'OPS/page-1.jpg',
        locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
        cachePath: '/tmp/other-run/page-1.jpg',
      }).id,
    );
    expect(ref.locator).toMatchObject({
      kind: 'document',
      entryPath: 'OPS/page-1.jpg',
    });
  });

  it('uses source identity and entry path as the stable cache index across aliases', () => {
    const chapterRef = createDocumentResourceRefFromArchiveRef({
      kind: 'document-entry',
      source: {
        ...source,
        uri: 'runtime://agent/open-1',
        token: 'session-token',
        rangeUrl: 'https://example.invalid/range',
      },
      entryPath: 'OPS/page-1.jpg',
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
      cachePath: '/tmp/run-a/page_1.jpg',
    });
    const pageRef = createDocumentResourceRefFromArchiveRef({
      kind: 'document-entry',
      source,
      entryPath: 'OPS/page-1.jpg',
      locator: { kind: 'page', pageNumber: 1, pageIndex: 0, entryName: 'OPS/page-1.jpg' },
      cachePath: '/tmp/run-b/moe-018893.jpg',
    });

    expect(chapterRef.id).toBe(pageRef.id);
    expect(chapterRef.locator).toMatchObject({
      kind: 'document',
      entryPath: 'OPS/page-1.jpg',
      locator: { kind: 'chapter' },
    });
    expect(pageRef.locator).toMatchObject({
      kind: 'document',
      entryPath: 'OPS/page-1.jpg',
      locator: { kind: 'page' },
    });
  });

  it('keeps locator-only pages distinct when no entry path is available', () => {
    const firstPageRef = createDocumentResourceRef({
      source: { ...source, format: 'pdf' },
      locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
    });
    const secondPageRef = createDocumentResourceRef({
      source: { ...source, format: 'pdf' },
      locator: { kind: 'page', pageNumber: 2, pageIndex: 1 },
    });

    expect(firstPageRef.id).not.toBe(secondPageRef.id);
    expect(firstPageRef.locator).toMatchObject({
      kind: 'document',
      locator: { kind: 'page', pageNumber: 1 },
    });
    expect(secondPageRef.locator).toMatchObject({
      kind: 'document',
      locator: { kind: 'page', pageNumber: 2 },
    });
  });

  it('does not materialize reader-returned scratch paths by default', async () => {
    const fsOps = createFsOps();
    const provider = new DocumentResourceCacheProvider({ fsOps });
    const ref = createDocumentResourceRef({
      source,
      entryPath: 'OPS/page-1.jpg',
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
    });

    const result = await provider.ensure({
      ref,
      variant: { role: 'document-entry', mimeType: 'image/jpeg' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result).toMatchObject({
      status: 'missing',
      error: 'Document image entry could not be materialized directly: OPS/page-1.jpg',
    });
    expect(fsOps.writeFile).not.toHaveBeenCalled();
  });

  it('materializes document entries directly from source without scratch paths', async () => {
    const fsOps = createFsOps();
    const entryReader = {
      readEntry: vi.fn(async () => new Uint8Array([1, 2, 3])),
    };
    const provider = new DocumentResourceCacheProvider({ entryReader, fsOps });
    const ref = createDocumentResourceRef({
      source,
      entryPath: 'OPS/page-1.jpg',
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
    });

    const result = await provider.ensure({
      ref,
      variant: { role: 'document-entry' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result).toMatchObject({
      status: 'ready',
      relativePath: expect.stringMatching(
        /^documents\/doc_.+\/5289df737df57326fcdd22597afb1fac\.jpg$/,
      ),
      mimeType: 'image/jpeg',
      sizeBytes: 456,
      rebuildable: true,
    });
    expect(entryReader.readEntry).toHaveBeenCalledWith(source, 'OPS/page-1.jpg');
    expect(fsOps.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('/workspace/.neko/.cache/resources/documents/'),
      new Uint8Array([1, 2, 3]),
    );
  });

  it('resolves path variables before reading document entries from portable refs', async () => {
    const fsOps = createFsOps();
    const entryReader = {
      readEntry: vi.fn(async () => new Uint8Array([1, 2, 3])),
    };
    const provider = new DocumentResourceCacheProvider({
      entryReader,
      fsOps,
      pathResolver: new PathResolver(new Map([['BOOKS', '/library/books']])),
      projectRoot: '/workspace/demo',
    });
    const ref = createDocumentResourceRef({
      source,
      entryPath: 'OPS/page-1.jpg',
    });

    const result = await provider.ensure({
      ref,
      variant: { role: 'document-entry' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result.status).toBe('ready');
    expect(ref.source.document).toMatchObject({
      filePath: '${BOOKS}/comic.epub',
    });
    expect(entryReader.readEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: '/library/books/comic.epub',
      }),
      'OPS/page-1.jpg',
    );
  });

  it('requires a direct entry reader for locator-only document resources', async () => {
    const fsOps = createFsOps();
    const provider = new DocumentResourceCacheProvider({ fsOps });
    const ref = createDocumentResourceRef({
      source,
      locator: { kind: 'chapter', chapterHref: 'OPS/page-1.xhtml', spineIndex: 0 },
    });

    const result = await provider.ensure({
      ref,
      variant: { role: 'document-entry' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(result).toMatchObject({
      status: 'missing',
      error: 'Document resource ref cannot be materialized without a direct entry.',
    });
    expect(fsOps.writeFile).not.toHaveBeenCalled();
  });

  it('stores entries from the same source document under one document cache directory', async () => {
    const fsOps = createFsOps();
    const entryReader = {
      readEntry: vi.fn(async () => new Uint8Array([1])),
    };
    const provider = new DocumentResourceCacheProvider({ entryReader, fsOps });
    const firstRef = createDocumentResourceRef({
      source,
      entryPath: 'OPS/images/page-1.jpg',
    });
    const secondRef = createDocumentResourceRef({
      source,
      entryPath: 'OPS/images/page-2.jpg',
    });

    const first = await provider.ensure({
      ref: firstRef,
      variant: { role: 'document-entry' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });
    const second = await provider.ensure({
      ref: secondRef,
      variant: { role: 'document-entry' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(first.status).toBe('ready');
    expect(second.status).toBe('ready');
    expect(first.relativePath).toMatch(
      /^documents\/doc_.+\/55a54008ad1ba589aa210d2629c1df41\.jpg$/,
    );
    expect(second.relativePath).toMatch(
      /^documents\/doc_.+\/55a54008ad1ba589aa210d2629c1df41\.jpg$/,
    );
    expect(first.relativePath?.split('/').slice(0, 2)).toEqual(
      second.relativePath?.split('/').slice(0, 2),
    );
    expect(firstRef.id).not.toBe(secondRef.id);
  });

  it('keeps the same document cache directory across path aliases with matching identity', async () => {
    const fsOps = createFsOps();
    const aliasSource: DocumentSourceRef = {
      filePath: '/library/books/comic.epub',
      format: 'epub',
      fileId: source.fileId,
      identity: source.identity,
    };
    const entryReader = {
      readEntry: vi.fn(async () => new Uint8Array([1])),
    };
    const provider = new DocumentResourceCacheProvider({ entryReader, fsOps });
    const variablePathRef = createDocumentResourceRef({
      source,
      entryPath: 'OPS/images/page-1.jpg',
    });
    const absolutePathRef = createDocumentResourceRef({
      source: aliasSource,
      entryPath: 'OPS/images/page-1.jpg',
    });

    const variablePathResult = await provider.ensure({
      ref: variablePathRef,
      variant: { role: 'document-entry' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });
    const absolutePathResult = await provider.ensure({
      ref: absolutePathRef,
      variant: { role: 'document-entry' },
      cacheRoot: '/workspace/.neko/.cache/resources',
    });

    expect(variablePathRef.id).toBe(absolutePathRef.id);
    expect(variablePathResult.status).toBe('ready');
    expect(absolutePathResult.status).toBe('ready');
    expect(variablePathResult.relativePath).toMatch(
      /^documents\/doc_.+\/55a54008ad1ba589aa210d2629c1df41\.jpg$/,
    );
    expect(variablePathResult.relativePath?.split('/').slice(0, 2)).toEqual(
      absolutePathResult.relativePath?.split('/').slice(0, 2),
    );
  });
});

function createFsOps() {
  return {
    writeFile: vi.fn(async () => undefined),
    mkdir: vi.fn(async () => undefined),
    stat: vi.fn(async () => ({ size: 456 })),
  };
}
