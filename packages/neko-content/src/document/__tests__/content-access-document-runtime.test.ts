import { describe, expect, it, vi } from 'vitest';
import type { ContentAccessResult, DocumentSourceRef } from '@neko/shared';
import { DocumentContentAccessRuntime } from '../content-access-document-runtime';

describe('DocumentContentAccessRuntime', () => {
  it('adds stable resource refs to range imageInfo before returning to ReadDocument', async () => {
    const source: DocumentSourceRef = {
      filePath: '${A}/epub/animation/Blame/book.epub',
      format: 'epub',
      fileId: 'book-file-id',
    };
    const resolvedSource: DocumentSourceRef = {
      ...source,
      filePath: '/Users/feng/Assets/epub/animation/Blame/book.epub',
    };
    const contentAccess = {
      resolve: vi.fn(async () => readyAccessResult(resolvedSource.filePath)),
    };
    const documentAccess = {
      supports: vi.fn(() => true),
      hasDRM: vi.fn(async () => false),
      readContent: vi.fn(),
      getManifest: vi.fn(),
      createBatchCursor: vi.fn(),
      readNext: vi.fn(),
      readRange: vi.fn(async () => ({
        source: resolvedSource,
        range: {
          locator: { kind: 'chapter' as const, chapterHref: 'Page_1', spineIndex: 0 },
        },
        text: 'EPUB chapter range with 1 image pages',
        imageInfo: [
          {
            entryPath: 'image/moe-010564.jpg',
            locator: { kind: 'chapter' as const, chapterHref: 'Page_1', spineIndex: 0 },
            width: 1365,
            height: 1920,
            mimeType: 'image/jpeg',
          },
        ],
        pageCount: 402,
      })),
    };
    const loadProviderAsset = vi.fn(async () => ({
      status: 'ready' as ContentAccessResult['status'],
      diagnostics: [],
    }));
    const runtime = new DocumentContentAccessRuntime({
      contentAccess,
      documentAccess,
      resolveDocumentResourceScope: () => 'project',
      loadProviderAsset,
    });

    const result = await runtime.resolveDocumentContent({
      caller: 'read-document',
      source: { kind: 'file', path: source.filePath },
      mode: 'range',
      range: {
        locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
      },
      includeImages: true,
      maxImages: 1,
    });

    expect(result.imageInfo?.[0]).toMatchObject({
      entryPath: 'image/moe-010564.jpg',
      resourceRef: {
        kind: 'document-entry',
        source: {
          filePath: source.filePath,
          format: source.format,
        },
        entryPath: 'image/moe-010564.jpg',
        locator: { kind: 'chapter', chapterHref: 'Page_1', spineIndex: 0 },
        versionPolicy: 'versioned-export',
      },
    });
    expect(result.resourceRef).toMatchObject({
      scope: 'project',
      provider: 'source-file-content-access',
      kind: 'document',
      source: { kind: 'file', projectRelativePath: source.filePath },
      locator: { kind: 'file', path: source.filePath },
      fingerprint: { strategy: 'hash', value: expect.any(String) },
    });
    expect(loadProviderAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        caller: 'read-document',
        preferredTarget: 'bytes',
        variant: { role: 'document-entry' },
        source: expect.objectContaining({
          provider: 'document-archive',
          source: {
            kind: 'document',
            document: {
              filePath: resolvedSource.filePath,
              format: source.format,
            },
          },
          locator: expect.objectContaining({
            kind: 'document',
            entryPath: 'image/moe-010564.jpg',
          }),
        }),
      }),
    );
  });
});

function readyAccessResult(localPath: string): ContentAccessResult {
  return {
    status: 'ready',
    request: {
      ref: { kind: 'file', path: localPath },
      intent: 'agent-context',
      target: 'local-path',
      caller: 'read-document',
    },
    source: { kind: 'file', path: localPath },
    diagnostics: [],
    localPath,
  };
}
