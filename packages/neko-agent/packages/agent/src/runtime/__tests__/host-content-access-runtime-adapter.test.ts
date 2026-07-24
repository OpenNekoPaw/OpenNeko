import { describe, expect, it, vi } from 'vitest';
import type { IDocumentAccessService } from '@neko/content/document';
import type { ContentRepresentationService } from '@neko/shared';
import { createHostAgentContentAccessRuntime } from '../capability/host-content-access-runtime-adapter';

describe('HostAgentContentAccessRuntime document representations', () => {
  it('projects computed document pages as representation locators without physical paths', async () => {
    const getRepresentation = vi.fn(
      async (request: Parameters<ContentRepresentationService['getRepresentation']>[0]) => ({
        status: 'ready' as const,
        locator: {
          kind: 'content-representation' as const,
          id: `page-${request.spec.kind === 'raster-page' ? request.spec.page : 0}`,
          representationKind: request.spec.kind,
          source: request.source,
          spec: request.spec,
          generatorId: 'document-raster',
          sourceFingerprint: 'source-v1',
          specFingerprint: 'spec-v1',
          revision: '1',
        },
        metadata: { mimeType: 'image/png', width: 640, height: 480, byteLength: 16 },
      }),
    );
    const runtime = createRuntime(createRepresentations(getRepresentation));

    const result = await runtime.resolveDocumentContent({
      source: { kind: 'file', path: 'docs/story.pdf' },
      includeImages: true,
      maxImages: 2,
    });

    expect(result).toMatchObject({
      status: 'ready',
      text: 'story',
      imageCount: 3,
      imagesTruncated: true,
      imageInfo: [
        {
          locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
          representationLocator: {
            kind: 'content-representation',
            representationKind: 'raster-page',
          },
        },
        {
          locator: { kind: 'page', pageNumber: 2, pageIndex: 1 },
          representationLocator: {
            kind: 'content-representation',
            representationKind: 'raster-page',
          },
        },
      ],
    });
    expect(getRepresentation).toHaveBeenCalledTimes(2);
    expect(getRepresentation).toHaveBeenNthCalledWith(1, {
      source: { kind: 'workspace-file', path: 'docs/story.pdf' },
      spec: { kind: 'raster-page', page: 1, format: 'png' },
    });
    expect(JSON.stringify(result)).not.toContain('/workspace/.neko');
    expect(JSON.stringify(result)).not.toContain('cacheRoot');
  });

  it('keeps readable document content ready when derived page generation fails', async () => {
    const runtime = createRuntime(
      createRepresentations(
        vi.fn(async () => ({
          status: 'unavailable' as const,
          diagnostic: {
            code: 'representation-failed' as const,
            severity: 'error' as const,
            message: 'Content representation generation failed.',
          },
        })),
      ),
    );

    const result = await runtime.resolveDocumentContent({
      source: { kind: 'file', path: 'docs/story.pdf' },
      includeImages: true,
      maxImages: 1,
    });

    expect(result).toMatchObject({
      status: 'ready',
      text: 'story',
      pageCount: 3,
      diagnostics: [
        {
          code: 'document-representation-unavailable',
          severity: 'warning',
          message: 'Document page representations are unavailable.',
        },
      ],
    });
    expect(result.imageInfo).toBeUndefined();
  });
});

function createRuntime(contentRepresentation: ContentRepresentationService) {
  const documentAccess = {
    supports: () => true,
    hasDRM: async () => false,
    readContent: async () => ({ text: 'story', pageCount: 3 }),
    getManifest: async () => {
      throw new Error('not used');
    },
    createBatchCursor: async () => {
      throw new Error('not used');
    },
    readRange: async () => {
      throw new Error('not used');
    },
    readNext: async () => {
      throw new Error('not used');
    },
  } satisfies IDocumentAccessService;
  return createHostAgentContentAccessRuntime({
    contentRead: {
      stat: async (locator) => ({
        status: 'ready',
        locator,
        byteLength: 5,
        fingerprint: { strategy: 'mtime-size', value: '1:5' },
      }),
      read: async () => {
        throw new Error('not used');
      },
    },
    documentAccess,
    resolveWorkspaceFileLocator: (filePath) => ({ kind: 'workspace-file', path: filePath }),
    contentRepresentation,
    resolveDocumentHostFilePath: () => '/workspace/docs/story.pdf',
  });
}

function createRepresentations(
  getRepresentation: ContentRepresentationService['getRepresentation'],
): ContentRepresentationService {
  return {
    getRepresentation,
    readRepresentation: async () => {
      throw new Error('not used');
    },
  };
}
