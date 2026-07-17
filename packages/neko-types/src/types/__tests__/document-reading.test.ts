import { describe, expect, it } from 'vitest';
import type {
  DocumentArchiveResourceRef,
  DocumentBatchCursor,
  DocumentContextData,
  DocumentImageInfo,
  DocumentLocator,
  DocumentManifest,
  DocumentReadResult,
  DocumentSourceRef,
} from '../document-reading';
import {
  createDocumentEntryResourceRef,
  isDocumentArchiveResourceRef,
  isDocumentArchiveResourceVersionPolicy,
  isDocumentFormat,
  parseDocumentArchiveResourceRef,
} from '../document-reading';

describe('document reading contracts', () => {
  it('represents stable page, chapter, text, and region locators', () => {
    const locators: DocumentLocator[] = [
      { kind: 'page', pageNumber: 3, pageIndex: 2 },
      { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0, title: 'Chapter 1' },
      { kind: 'text-range', startLine: 10, endLine: 20 },
      {
        kind: 'region',
        pageNumber: 4,
        pageIndex: 3,
        region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      },
    ];

    expect(locators.map((locator) => locator.kind)).toEqual([
      'page',
      'chapter',
      'text-range',
      'region',
    ]);
  });

  it('keeps manifest structure separate from read results and cursors', () => {
    const source: DocumentSourceRef = {
      filePath: '/books/demo.epub',
      format: 'epub',
      fileId: 'demo-123',
    };
    const manifest: DocumentManifest = {
      source,
      format: 'epub',
      fileId: 'demo-123',
      chapterCount: 1,
      units: [
        {
          kind: 'chapter',
          locator: { kind: 'chapter', chapterHref: 'chapter-1.xhtml', spineIndex: 0 },
          title: 'Chapter 1',
        },
      ],
      capabilities: {
        supportsManifest: true,
        supportsRangeRead: true,
        supportsCursorRead: true,
        supportsChapterRange: true,
      },
    };
    const imageInfo: DocumentImageInfo = {
      path: '/tmp/page-1.jpg',
      width: 1494,
      height: 2133,
      mimeType: 'image/jpeg',
      byteSize: 2048,
      locator: manifest.units[0]?.locator,
    };
    const cursor: DocumentBatchCursor = {
      source,
      strategy: 'manifest-order',
      next: manifest.units[0]?.locator,
      batchIndex: 0,
      done: false,
      fileId: 'demo-123',
    };
    const result: DocumentReadResult = {
      source,
      manifest,
      cursor,
      text: 'Chapter text',
      imagePaths: [imageInfo.path],
      imageInfo: [imageInfo],
      excerpt: {
        contentKind: 'mixed',
        text: 'Chapter text',
        imagePaths: [imageInfo.path],
        imageInfo: [imageInfo],
      },
      returnedTextChars: 'Chapter text'.length,
      truncated: false,
    };

    expect(result.manifest?.units[0]?.kind).toBe('chapter');
    expect(result.cursor?.next?.kind).toBe('chapter');
    expect(result.imageInfo?.[0]?.width).toBe(1494);
    expect(result.excerpt?.imageInfo?.[0]?.mimeType).toBe('image/jpeg');
    expect(result.returnedTextChars).toBe(12);
  });

  it('keeps archive entry references separate from cache paths', () => {
    const source: DocumentSourceRef = {
      filePath: '${BOOKS}/comic.epub',
      format: 'epub',
      fileId: 'comic-v1',
    };
    const resourceRef: DocumentArchiveResourceRef = {
      kind: 'document-entry',
      source,
      entryPath: 'image/page-1.jpg',
      locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
      versionPolicy: 'versioned-export',
    };
    const imageInfo: DocumentImageInfo = {
      mimeType: 'image/jpeg',
      resourceRef,
    };

    expect(imageInfo.path).toBeUndefined();
    expect(imageInfo.resourceRef?.source.filePath).toBe('${BOOKS}/comic.epub');
    expect(imageInfo.resourceRef?.entryPath).toBe('image/page-1.jpg');
    expect(imageInfo.resourceRef?.versionPolicy).toBe('versioned-export');
    expect(JSON.stringify(imageInfo.resourceRef)).not.toContain('cachePath');
  });

  it('parses and validates archive entry references at shared boundaries without leaking cache paths', () => {
    const parsed = parseDocumentArchiveResourceRef({
      kind: 'document-entry',
      source: {
        filePath: '${BOOKS}/comic.epub',
        format: 'epub',
        identity: { fileId: 'comic-v1', sizeBytes: 1024, mtimeMs: 1000 },
      },
      entryPath: 'image/page-1.jpg',
      cachePath: '/tmp/page-1.jpg',
      locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
      versionPolicy: 'versioned-export',
    });

    expect(parsed?.source.identity?.fileId).toBe('comic-v1');
    expect(parsed?.locator?.kind).toBe('chapter');
    expect(JSON.stringify(parsed)).not.toContain('cachePath');
    expect(isDocumentArchiveResourceRef(parsed)).toBe(true);
    expect(
      parseDocumentArchiveResourceRef({
        kind: 'document-entry',
        source: { filePath: '${BOOKS}/comic.epub', format: 'epub' },
        entryPath: 12,
      }),
    ).toBeUndefined();
    expect(
      parseDocumentArchiveResourceRef({
        kind: 'document-entry',
        source: { filePath: '${BOOKS}/comic.epub', format: 'bad-format' },
      }),
    ).toBeUndefined();
  });

  it('builds archive entry references with a default version policy', () => {
    const ref = createDocumentEntryResourceRef({
      source: {
        filePath: '${BOOKS}/comic.cbz',
        format: 'cbz',
      },
      entryPath: 'page-1.png',
      locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
    });

    expect(ref?.kind).toBe('document-entry');
    expect(ref?.versionPolicy).toBe('versioned-export');
    expect(ref?.locator?.kind).toBe('page');
    expect(JSON.stringify(ref)).not.toContain('cachePath');
    expect(
      createDocumentEntryResourceRef({
        source: {
          filePath: '${BOOKS}/comic.cbz',
          format: 'cbz',
        },
      }),
    ).toBeUndefined();
    expect(isDocumentFormat('xlsx')).toBe(true);
    expect(isDocumentFormat('zip')).toBe(false);
    expect(isDocumentArchiveResourceVersionPolicy('replace-reference')).toBe(true);
  });

  it('allows preview context to carry source locator and legacy excerpt data together', () => {
    const context: DocumentContextData = {
      filePath: '/docs/demo.pdf',
      text: 'Selected text',
      contentKind: 'text',
      source: { filePath: '/docs/demo.pdf', format: 'pdf', fileId: 'pdf-1' },
      locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
      excerpt: { contentKind: 'text', text: 'Selected text', truncated: false },
    };

    expect(context.source?.format).toBe('pdf');
    expect(context.locator?.kind).toBe('page');
    expect(context.text).toBe(context.excerpt?.text);
  });
});
