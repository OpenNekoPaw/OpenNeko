import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IDocumentAccessService } from '@neko/content-domain/document';
import { createNodeDocumentAccessService } from '@neko/content-domain/document/node';
import type { ContentRepresentationService } from '@neko/content-domain';
import { createNodeHostContentReadService } from '@neko/content-domain/node';
import { resolveWorkspaceContentLocator } from '@neko/assets-node';
import { createHostAgentContentAccessRuntime } from '../capability/host-content-access-runtime-adapter';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('HostAgentContentAccessRuntime document representations', () => {
  it('preserves the exact decoder failure instead of relabeling it unsupported-source', async () => {
    const documentAccess = {
      supports: () => true,
      hasDRM: async () => false,
      readContent: async () => ({ text: 'not used' }),
      getManifest: async () => {
        throw Object.assign(new Error("Cannot find module './epub-parser.cjs'"), {
          code: 'MODULE_NOT_FOUND',
        });
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
    const runtime = createHostAgentContentAccessRuntime({
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
      resolveDocumentHostFilePath: () => '/workspace/books/story.epub',
    });

    await expect(
      runtime.resolveDocumentContent({
        source: { file: { authority: 'workspace', path: 'books/story.epub' } },
        mode: 'manifest',
      }),
    ).resolves.toMatchObject({
      status: 'failed',
      diagnostics: [
        {
          code: 'MODULE_NOT_FOUND',
          message: "Document content could not be read: Cannot find module './epub-parser.cjs'",
        },
      ],
    });
  });

  it('reads a document through the managed Workspace media link without a Media Library locator', async () => {
    const workspacePath = await mkdtemp(path.join(tmpdir(), 'agent-linked-document-workspace-'));
    const libraryPath = await mkdtemp(path.join(tmpdir(), 'agent-linked-document-library-'));
    temporaryDirectories.push(workspacePath, libraryPath);
    await mkdir(path.join(workspacePath, 'neko', 'assets'), { recursive: true });
    await writeFile(path.join(libraryPath, 'story.md'), '# Linked story\n');
    await symlink(
      libraryPath,
      path.join(workspacePath, 'neko', 'assets', 'Reference'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const workspace = {
      workspaceId: 'workspace-linked-document',
      workspacePath,
      displayName: 'Workspace',
      locator: { kind: 'relative' as const, value: '.' },
    };
    const runtime = createHostAgentContentAccessRuntime({
      contentRead: createNodeHostContentReadService({ workspaceRoot: workspacePath }),
      documentAccess: createNodeDocumentAccessService(),
      resolveDocumentHostFilePath: (source) => resolveWorkspaceContentLocator(workspace, source),
    });

    const result = await runtime.resolveDocumentContent({
      source: { file: { authority: 'workspace', path: 'neko/assets/Reference/story.md' } },
    });

    expect(result).toMatchObject({
      status: 'ready',
      source: { file: { authority: 'workspace', path: 'neko/assets/Reference/story.md' } },
      text: '# Linked story\n',
    });
    expect(JSON.stringify(result)).not.toContain(libraryPath);
  });

  it('projects computed document pages as representation locators without physical paths', async () => {
    const getRepresentation = vi.fn(
      async (request: Parameters<ContentRepresentationService['getRepresentation']>[0]) => ({
        status: 'ready' as const,
        handle: {
          kind: 'content-representation-handle' as const,
          id: `page-${request.spec.kind === 'raster-page' ? request.spec.page : 0}`,
        },
        metadata: { mimeType: 'image/png', width: 640, height: 480, byteLength: 16 },
      }),
    );
    const runtime = createRuntime(createRepresentations(getRepresentation));

    const result = await runtime.resolveDocumentContent({
      source: { file: { authority: 'workspace', path: 'docs/story.pdf' } },
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
          contentLocator: {
            file: { authority: 'workspace', path: 'docs/story.pdf' },
            selector: { kind: 'page', pageNumber: 1, pageIndex: 0 },
          },
          representationHandle: { kind: 'content-representation-handle' },
        },
        {
          contentLocator: {
            file: { authority: 'workspace', path: 'docs/story.pdf' },
            selector: { kind: 'page', pageNumber: 2, pageIndex: 1 },
          },
          representationHandle: { kind: 'content-representation-handle' },
        },
      ],
    });
    expect(getRepresentation).toHaveBeenCalledTimes(2);
    expect(getRepresentation).toHaveBeenNthCalledWith(1, {
      source: { file: { authority: 'workspace', path: 'docs/story.pdf' } },
      spec: { kind: 'raster-page', page: 1, format: 'png' },
    });
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
      source: { file: { authority: 'workspace', path: 'docs/story.pdf' } },
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
    releaseRepresentation: () => undefined,
  };
}
