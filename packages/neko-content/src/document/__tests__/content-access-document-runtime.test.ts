import { describe, expect, it, vi } from 'vitest';
import type {
  ContentReadService,
  DocumentSourceRef,
  WorkspaceFileContentLocator,
} from '@neko/shared';
import { DocumentContentAccessRuntime } from '../content-access-document-runtime';

describe('DocumentContentAccessRuntime', () => {
  it('authorizes the source and archive entry through ContentReadService', async () => {
    const source: WorkspaceFileContentLocator = {
      kind: 'workspace-file',
      path: 'neko/assets/Library/book.epub',
    };
    const hostPath = '/external/library/book.epub';
    const contentRead = createContentRead();
    const documentAccess = createDocumentAccess({
      text: 'EPUB image document with 1 image pages',
      imageInfo: [{ entryPath: 'OEBPS/images/page.png' }],
    });
    const runtime = new DocumentContentAccessRuntime({
      contentRead,
      documentAccess,
      resolveHostFilePath: vi.fn(() => hostPath),
    });

    const result = await runtime.resolveDocumentContent({
      source,
      mode: 'content',
      includeImages: true,
      maxImages: 1,
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(documentAccess.readContent).toHaveBeenCalledWith(hostPath);
    expect(contentRead.stat).toHaveBeenNthCalledWith(1, source, {});
    expect(contentRead.stat).toHaveBeenNthCalledWith(
      2,
      {
        kind: 'document-entry',
        source,
        entryPath: 'OEBPS/images/page.png',
      },
      {},
    );
    expect(result.imageInfo?.[0]).toMatchObject({
      entryPath: 'OEBPS/images/page.png',
      contentLocator: {
        kind: 'document-entry',
        source,
        entryPath: 'OEBPS/images/page.png',
      },
    });
    expect(JSON.stringify(result)).not.toContain(hostPath);
  });

  it('preserves manifest, range, cursor and stable source semantics without path leakage', async () => {
    const source: WorkspaceFileContentLocator = {
      kind: 'workspace-file',
      path: 'books/Blame/book.epub',
    };
    const hostPath = '/Users/feng/Assets/epub/animation/Blame/book.epub';
    const runtimeSource: DocumentSourceRef = { filePath: hostPath, format: 'epub' };
    const documentAccess = createDocumentAccess();
    documentAccess.readRange = vi.fn(async () => ({
      source: runtimeSource,
      range: { locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 } },
      text: 'chapter',
      imageInfo: [
        {
          entryPath: 'image/moe-010564.jpg',
          locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
          width: 1365,
          height: 1920,
          mimeType: 'image/jpeg',
        },
      ],
      cursor: {
        source: runtimeSource,
        strategy: 'manifest-order',
        batchIndex: 1,
        done: true,
      },
      pageCount: 402,
    }));
    const runtime = new DocumentContentAccessRuntime({
      contentRead: createContentRead(),
      documentAccess,
      resolveHostFilePath: () => hostPath,
    });

    const result = await runtime.resolveDocumentContent({
      source,
      mode: 'range',
      range: { locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 } },
      includeImages: true,
      maxImages: 1,
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.documentSource.filePath).toBe(source.path);
    expect(result.cursor?.source.filePath).toBe(source.path);
    expect(result.range?.locator).toEqual({
      kind: 'chapter',
      chapterHref: 'Page_1',
      spineIndex: 0,
    });
    expect(result.imageInfo?.[0]?.contentLocator).toEqual({
      kind: 'document-entry',
      source,
      entryPath: 'image/moe-010564.jpg',
    });
    expect(JSON.stringify(result)).not.toContain(hostPath);
  });

  it('returns safe diagnostics and never invokes the Host resolver after read denial', async () => {
    const source: WorkspaceFileContentLocator = {
      kind: 'workspace-file',
      path: 'private/book.pdf',
    };
    const resolveHostFilePath = vi.fn(() => '/private/user/book.pdf');
    const runtime = new DocumentContentAccessRuntime({
      contentRead: {
        stat: vi.fn(async (locator) => ({
          status: 'unavailable' as const,
          locator,
          diagnostic: { code: 'content-unauthorized' as const },
        })),
        read: vi.fn(),
      },
      documentAccess: createDocumentAccess(),
      resolveHostFilePath,
    });

    await expect(runtime.resolveDocumentContent({ source })).resolves.toEqual({
      status: 'unavailable',
      source,
      diagnostic: { code: 'content-unauthorized' },
    });
    expect(resolveHostFilePath).not.toHaveBeenCalled();
  });
});

function createContentRead(): ContentReadService {
  return {
    stat: vi.fn(async (locator) => ({
      status: 'ready' as const,
      locator,
      byteLength: 128,
      fingerprint: { strategy: 'mtime-size' as const, value: '1:128' },
    })),
    read: vi.fn(),
  };
}

function createDocumentAccess(
  content: { text: string; imageInfo?: readonly object[] } = { text: '' },
) {
  return {
    supports: vi.fn(() => true),
    hasDRM: vi.fn(async () => false),
    readContent: vi.fn(async () => content),
    getManifest: vi.fn(),
    createBatchCursor: vi.fn(),
    readNext: vi.fn(),
    readRange: vi.fn(),
  };
}
