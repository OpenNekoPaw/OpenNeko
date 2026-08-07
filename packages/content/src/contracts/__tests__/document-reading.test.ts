import { describe, expect, it } from 'vitest';
import type {
  DocumentBatchCursor,
  DocumentContextData,
  DocumentImageInfo,
  DocumentLocator,
  DocumentManifest,
  DocumentReadResult,
  DocumentSourceRef,
} from '../document-reading';
import { createDocumentEntryContentLocator, isDocumentFormat } from '../document-reading';
import { isContentLocator } from '../content-locator';

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

  it('keeps archive entry content identity separate from semantic location and cache paths', () => {
    const source: DocumentSourceRef = {
      filePath: '${BOOKS}/comic.epub',
      format: 'epub',
      fileId: 'comic-edition',
      contentLocator: { kind: 'workspace-file', path: 'books/comic.epub' },
    };
    const contentLocator = createDocumentEntryContentLocator({
      source,
      entryPath: 'image/page-1.jpg',
    });
    const imageInfo: DocumentImageInfo = {
      mimeType: 'image/jpeg',
      contentLocator,
      locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
    };

    expect(imageInfo.path).toBeUndefined();
    expect(imageInfo.contentLocator?.source.path).toBe('books/comic.epub');
    expect(imageInfo.contentLocator?.entryPath).toBe('image/page-1.jpg');
    expect(imageInfo.locator?.kind).toBe('chapter');
    expect(JSON.stringify(imageInfo)).not.toMatch(/cachePath|resourceRef/u);
  });

  it('builds only validated document-entry locators from workspace-owned sources', () => {
    const locator = createDocumentEntryContentLocator({
      source: {
        filePath: '${BOOKS}/comic.cbz',
        format: 'cbz',
        contentLocator: { kind: 'workspace-file', path: 'books/comic.cbz' },
      },
      entryPath: 'page-1.png',
    });

    expect(locator).toEqual({
      kind: 'document-entry',
      source: { kind: 'workspace-file', path: 'books/comic.cbz' },
      entryPath: 'page-1.png',
    });
    expect(isContentLocator(locator)).toBe(true);
    expect(
      createDocumentEntryContentLocator({
        source: {
          filePath: '${BOOKS}/comic.cbz',
          format: 'cbz',
        },
      }),
    ).toBeUndefined();
    expect(isDocumentFormat('xlsx')).toBe(true);
    expect(isDocumentFormat('zip')).toBe(false);
  });

  it('carries document selection context through source, locator, and excerpt', () => {
    const context: DocumentContextData = {
      source: { filePath: '/docs/demo.pdf', format: 'pdf', fileId: 'pdf-1' },
      locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
      excerpt: { contentKind: 'text', text: 'Selected text', truncated: false },
    };

    expect(context.source?.format).toBe('pdf');
    expect(context.locator?.kind).toBe('page');
    expect(context.excerpt?.text).toBe('Selected text');
  });
});
