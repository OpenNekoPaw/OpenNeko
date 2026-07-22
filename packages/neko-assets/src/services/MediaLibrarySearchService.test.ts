import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  MediaLibrarySearchService,
  createLocalMetadataMediaLibrarySearchIndexStore,
  type MediaLibrarySearchIndexStore,
} from './MediaLibrarySearchService';
import type { WorkspaceLinkedMediaLibraryService } from './WorkspaceLinkedMediaLibraryService';
import type { MediaMetadataCache } from './MediaMetadataCache';
import type { LocalMetadataPartition, SearchDocumentRepository } from '@neko/shared';

vi.mock('vscode', () => ({
  RelativePattern: vi.fn(function RelativePattern(base: string, pattern: string) {
    return { base, pattern };
  }),
  workspace: {
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    })),
  },
}));

vi.mock('../utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  }),
}));

describe('MediaLibrarySearchService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warms persisted filename index and installs watchers without metadata probing', async () => {
    const indexStore: MediaLibrarySearchIndexStore = {
      load: vi.fn(async () => [
        {
          filePath: 'neko/assets/Library/cat.mp4',
          fileName: 'cat.mp4',
          libraryName: 'Library',
          mediaType: 'video' as const,
        },
      ]),
      save: vi.fn(),
    };
    const linkedLibraries = {
      workspaceRoot: '/workspace',
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      list: vi.fn(async () => [
        {
          name: 'Library',
          workspacePath: 'neko/assets/Library',
          availability: 'available',
        },
      ]),
      resolveWorkspacePath: vi.fn((workspacePath: string) => `/workspace/${workspacePath}`),
    } as unknown as WorkspaceLinkedMediaLibraryService;
    const metadataCache = {
      get: vi.fn(),
    } as unknown as MediaMetadataCache;
    const service = new MediaLibrarySearchService(
      linkedLibraries,
      '/workspace',
      metadataCache,
      indexStore,
    );

    await service.warmup();

    expect(service.indexSize).toBe(1);
    expect(indexStore.load).toHaveBeenCalledOnce();
    expect(indexStore.save).not.toHaveBeenCalled();
    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    expect(metadataCache.get).not.toHaveBeenCalled();
  });

  it('deduplicates persisted entries by canonical locator', async () => {
    const duplicate = {
      filePath: 'neko/assets/Library/cat.mp4',
      fileName: 'cat.mp4',
      libraryName: 'Library',
      mediaType: 'video' as const,
    };
    const service = new MediaLibrarySearchService(
      {
        workspaceRoot: '/workspace',
        onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
        list: vi.fn(async () => []),
      } as unknown as WorkspaceLinkedMediaLibraryService,
      '/workspace',
      { get: vi.fn() } as unknown as MediaMetadataCache,
      { load: vi.fn(async () => [duplicate, duplicate]), save: vi.fn() },
    );

    await service.warmup();

    expect(service.indexSize).toBe(1);
    service.dispose();
  });

  it('stores recent use as canonical locator paths and filters missing files', async () => {
    const save = vi.fn(async () => undefined);
    const service = new MediaLibrarySearchService(
      {
        workspaceRoot: '/workspace',
        onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
        list: vi.fn(async () => []),
      } as unknown as WorkspaceLinkedMediaLibraryService,
      '/workspace',
      { get: vi.fn(async () => null) } as unknown as MediaMetadataCache,
      {
        load: vi.fn(async () => [
          {
            filePath: 'neko/assets/Library/cat.mp4',
            fileName: 'cat.mp4',
            libraryName: 'Library',
            mediaType: 'video' as const,
          },
        ]),
        save: vi.fn(),
      },
      {
        load: vi.fn(async () => ['neko/assets/Library/missing.mp4', 'neko/assets/Library/cat.mp4']),
        save,
      },
    );

    await service.warmup();
    await service.recordRecentUse({
      kind: 'workspace-file',
      path: 'neko/assets/Library/cat.mp4',
    });

    await expect(service.getRecent()).resolves.toEqual([
      expect.objectContaining({
        locator: { kind: 'workspace-file', path: 'neko/assets/Library/cat.mp4' },
      }),
    ]);
    expect(save).toHaveBeenCalledWith([
      'neko/assets/Library/cat.mp4',
      'neko/assets/Library/missing.mp4',
    ]);
    await expect(
      service.recordRecentUse({ kind: 'workspace-file', path: '../outside.mp4' }),
    ).rejects.toThrow('Media Library recent use requires a canonical workspace locator.');
    service.dispose();
  });

  it('rejects stale persisted search projections so they can be rebuilt', async () => {
    const repository = {
      list: vi.fn(async () => []),
      query: vi.fn(async () => []),
      replacePartition: vi.fn(async () => undefined),
      replaceSearchPartition: vi.fn(async () => undefined),
      insertMissingSearchPartition: vi.fn(async () => ({
        insertedDocumentIds: [],
        preservedDocumentIds: [],
      })),
    } satisfies SearchDocumentRepository;
    const partition: LocalMetadataPartition = {
      scope: 'workspace',
      workspaceId: 'workspace-stale',
      domain: 'project-search',
    };
    const store = createLocalMetadataMediaLibrarySearchIndexStore({
      repository,
      partition,
      readRevision: async () => ({
        partition,
        revision: 2,
        freshness: 'stale',
        diagnostic: null,
        updatedAt: '2026-07-22T00:00:00.000Z',
      }),
    });

    await expect(store.load()).resolves.toBeUndefined();
    expect(repository.list).not.toHaveBeenCalled();
  });

  it('rebuilds the whole derived partition when persisted media paths use retired variables', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-media-search-'));
    const mediaDirectory = path.join(workspaceRoot, 'neko', 'assets', 'B', 'epub');
    await fs.mkdir(mediaDirectory, { recursive: true });
    await fs.writeFile(path.join(mediaDirectory, 'book.epub'), 'fixture');

    const partition: LocalMetadataPartition = {
      scope: 'workspace',
      workspaceId: 'workspace-test',
      domain: 'project-search',
    };
    const replaceSearchPartition = vi.fn(async () => undefined);
    const repository = {
      list: vi.fn(async () => [
        {
          documentId: 'media:legacy',
          partition: 'media-library' as const,
          kind: 'media' as const,
          label: 'legacy.epub',
          source: {
            partition: 'media-library' as const,
            sourceId: '${A}/epub/legacy.epub',
            filePath: '${A}/epub/legacy.epub',
          },
          fileKey: '${A}/epub/legacy.epub',
          searchText: 'legacy.epub A document',
          freshness: 'fresh' as const,
          metadata: { mediaType: 'document', libraryName: 'A' },
          updatedAt: '2026-07-20T00:00:00.000Z',
        },
      ]),
      query: vi.fn(async () => []),
      replacePartition: vi.fn(async () => undefined),
      replaceSearchPartition,
      insertMissingSearchPartition: vi.fn(async () => ({
        insertedDocumentIds: [],
        preservedDocumentIds: [],
      })),
    } satisfies SearchDocumentRepository;
    const indexStore = createLocalMetadataMediaLibrarySearchIndexStore({
      repository,
      partition,
      readRevision: async () => ({
        partition,
        revision: 1,
        freshness: 'fresh',
        diagnostic: null,
        updatedAt: '2026-07-20T00:00:00.000Z',
      }),
    });
    const linkedLibraries = {
      workspaceRoot,
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      list: vi.fn(async () => [
        {
          name: 'B',
          workspacePath: 'neko/assets/B',
          availability: 'available',
        },
      ]),
    } as unknown as WorkspaceLinkedMediaLibraryService;
    const service = new MediaLibrarySearchService(
      linkedLibraries,
      workspaceRoot,
      { get: vi.fn() } as unknown as MediaMetadataCache,
      indexStore,
    );

    try {
      await service.warmup();

      expect(service.indexSize).toBe(1);
      expect(replaceSearchPartition).toHaveBeenCalledOnce();
      expect(replaceSearchPartition).toHaveBeenCalledWith(
        expect.objectContaining({
          searchPartition: 'media-library',
          documents: [
            expect.objectContaining({
              fileKey: 'neko/assets/B/epub/book.epub',
              source: expect.objectContaining({
                filePath: 'neko/assets/B/epub/book.epub',
              }),
            }),
          ],
        }),
      );
    } finally {
      service.dispose();
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('rebuilds the persisted partition after a linked-library mutation before the next search', async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-media-relink-search-'));
    const mediaDirectory = path.join(workspaceRoot, 'neko', 'assets', 'B');
    await fs.mkdir(mediaDirectory, { recursive: true });
    await fs.writeFile(path.join(mediaDirectory, 'old.epub'), 'old');

    let notifyLibrariesChanged: (() => void) | undefined;
    const indexStore: MediaLibrarySearchIndexStore = {
      load: vi.fn(async () => [
        {
          filePath: 'neko/assets/B/old.epub',
          fileName: 'old.epub',
          libraryName: 'B',
          mediaType: 'document' as const,
        },
      ]),
      save: vi.fn(async () => undefined),
    };
    const linkedLibraries = {
      workspaceRoot,
      onDidChange: vi.fn((listener: () => void) => {
        notifyLibrariesChanged = listener;
        return { dispose: vi.fn() };
      }),
      list: vi.fn(async () => [
        {
          name: 'B',
          workspacePath: 'neko/assets/B',
          availability: 'available',
        },
      ]),
    } as unknown as WorkspaceLinkedMediaLibraryService;
    const service = new MediaLibrarySearchService(
      linkedLibraries,
      workspaceRoot,
      { get: vi.fn() } as unknown as MediaMetadataCache,
      indexStore,
    );

    try {
      await service.warmup();
      await fs.rm(path.join(mediaDirectory, 'old.epub'));
      await fs.writeFile(path.join(mediaDirectory, 'new.epub'), 'new');

      if (!notifyLibrariesChanged) throw new Error('Library change listener was not registered.');
      notifyLibrariesChanged();
      const results = await service.search('new');

      expect(results.map((result) => result.filePath)).toEqual(['neko/assets/B/new.epub']);
      expect(indexStore.load).toHaveBeenCalledOnce();
      expect(indexStore.save).toHaveBeenLastCalledWith([
        expect.objectContaining({ filePath: 'neko/assets/B/new.epub' }),
      ]);
    } finally {
      service.dispose();
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});
