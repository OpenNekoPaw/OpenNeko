import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  MediaLibrarySearchService,
  type MediaLibrarySearchIndexStore,
} from './MediaLibrarySearchService';
import type { MediaLibrarySettingsService } from './MediaLibrarySettingsService';
import type { MediaMetadataCache } from './MediaMetadataCache';

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
          filePath: '/library/cat.mp4',
          fileName: 'cat.mp4',
          libraryName: 'Library',
          mediaType: 'video',
        },
      ]),
      save: vi.fn(),
    };
    const settings = {
      onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      getResolvedLibraries: vi.fn(async () => [
        {
          name: 'Library',
          resolvedPath: '/library',
          enabled: true,
          accessible: true,
        },
      ]),
    } as unknown as MediaLibrarySettingsService;
    const metadataCache = {
      get: vi.fn(),
    } as unknown as MediaMetadataCache;
    const service = new MediaLibrarySearchService(settings, metadataCache, indexStore);

    await service.warmup();

    expect(service.indexSize).toBe(1);
    expect(indexStore.load).toHaveBeenCalledOnce();
    expect(indexStore.save).not.toHaveBeenCalled();
    expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
    expect(metadataCache.get).not.toHaveBeenCalled();
  });
});
