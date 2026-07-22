import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { MediaLibraryTreeProvider } from './MediaLibraryTreeProvider';
import type { WorkspaceLinkedMediaLibraryService } from '../services/WorkspaceLinkedMediaLibraryService';
import type { ThumbnailService } from '../services/ThumbnailService';

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('vscode', () => {
  class ThemeIcon {
    static readonly Folder = new ThemeIcon('folder');
    static readonly File = new ThemeIcon('file');

    constructor(
      readonly id: string,
      readonly color?: unknown,
    ) {}
  }

  return {
    TreeItem: class TreeItem {
      label: unknown;
      collapsibleState: unknown;
      description?: string;
      contextValue?: string;
      iconPath?: unknown;
      tooltip?: unknown;
      resourceUri?: unknown;
      command?: unknown;

      constructor(label: unknown, collapsibleState: unknown) {
        this.label = label;
        this.collapsibleState = collapsibleState;
      }
    },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon,
    ThemeColor: class ThemeColor {
      constructor(readonly id: string) {}
    },
    Uri: {
      file: (fsPath: string) => ({ fsPath, toString: () => `file://${fsPath}` }),
    },
    EventEmitter: class EventEmitter<T> {
      readonly event = (_listener: (event: T) => void) => ({ dispose() {} });
      fire(_event: T) {}
      dispose() {}
    },
  };
});

describe('MediaLibraryTreeProvider', () => {
  it('opens a linked media file without registering it for Git decorations', () => {
    const storedPath = 'neko/assets/B/epub/book.epub';
    const absolutePath = path.join('/workspace', ...storedPath.split('/'));
    const provider = new MediaLibraryTreeProvider({
      libraryService: {
        workspaceRoot: '/workspace',
        resolveWorkspacePath: vi.fn(() => absolutePath),
        onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      } as unknown as WorkspaceLinkedMediaLibraryService,
      thumbnailService: {
        onDidGenerateThumbnail: vi.fn(() => ({ dispose: vi.fn() })),
      } as unknown as ThumbnailService,
      metadataExtractor: vi.fn(),
    });

    const item = provider.getMediaFileTreeItem(storedPath);

    expect(item.projection).toEqual({
      locator: { kind: 'workspace-file', path: storedPath },
      label: 'book.epub',
      availability: 'available',
      capabilities: ['read', 'preview', 'bind', 'copy', 'delete'],
    });
    expect(item.resourceUri).toBeUndefined();
    expect(item.command?.arguments).toEqual([
      expect.objectContaining({ fsPath: absolutePath }),
      'neko.epubPreview',
    ]);
    provider.dispose();
  });

  it('rejects files outside the linked Media Library projection', () => {
    const provider = new MediaLibraryTreeProvider({
      libraryService: {
        workspaceRoot: '/workspace',
        resolveWorkspacePath: vi.fn((value: string) => value),
        onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
      } as unknown as WorkspaceLinkedMediaLibraryService,
      thumbnailService: {
        onDidGenerateThumbnail: vi.fn(() => ({ dispose: vi.fn() })),
      } as unknown as ThumbnailService,
      metadataExtractor: vi.fn(),
    });

    expect(() => provider.getMediaFileTreeItem('/outside/book.epub')).toThrow(
      'Media Library projection requires a canonical linked workspace file path.',
    );
    provider.dispose();
  });
});
