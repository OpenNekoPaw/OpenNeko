import { describe, expect, it } from 'vitest';
import type { DocumentSourceRef } from '../../../types';
import {
  createDocumentResourceRef,
  createDocumentResourceRefFromArchiveRef,
} from '../document-resource-ref';

describe('document resource refs', () => {
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

  it('uses source identity and entry path as the stable index across aliases', () => {
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
});
