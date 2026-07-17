/**
 * Media Library Tree View Provider
 *
 * TreeView for browsing configured external media directories.
 * Supports lazy-loading subdirectories and drag-and-drop to timeline.
 *
 * Phase 4 enhancements:
 * - Thumbnails for video/image files
 * - Metadata tooltips (resolution, duration, codec, etc.)
 * - Preview integration (video/audio/image)
 * - Fixed drag protocol (ASSET_DRAG_MIME + MediaFileDragData)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  isMediaFile,
  isDocumentFile,
  detectMediaType,
  ASSET_DRAG_MIME,
  type MediaFileMetadata,
  type MediaFileDragData,
} from '@neko/shared';
import type { ResolvedMediaLibrary } from '@neko/shared';
import type { MediaLibrarySettingsService } from '../services/MediaLibrarySettingsService';
import type { ThumbnailService } from '../services/ThumbnailService';
import type { MediaMetadataCache } from '../services/MediaMetadataCache';
import { formatDuration, formatResolution, buildMetadataTooltipLines } from '../utils/formatters';
import { createThumbnailTooltip } from '../utils/thumbnailTooltip';
import { getPreviewViewType } from '../utils/preview';
import { t } from '../i18n';

// =============================================================================
// Dependencies
// =============================================================================

export interface MediaLibraryDeps {
  settingsService: MediaLibrarySettingsService;
  thumbnailService: ThumbnailService;
  metadataExtractor: (filePath: string) => Promise<MediaFileMetadata>;
  metadataCache?: MediaMetadataCache;
}

// =============================================================================
// Tree Item Types
// =============================================================================

export type MediaLibraryItem = LibraryRootItem | DirectoryItem | MediaFileItem;

class LibraryRootItem extends vscode.TreeItem {
  readonly type = 'libraryRoot' as const;

  constructor(public readonly library: ResolvedMediaLibrary) {
    super(library.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = library.resolvedPath;
    this.contextValue = library.accessible ? 'mediaLibrary' : 'mediaLibrary:offline';

    this.iconPath = library.accessible
      ? new vscode.ThemeIcon('folder-library')
      : new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));

    this.tooltip = [
      library.name,
      `Path: ${library.resolvedPath}`,
      `Variable: \${${library.variable}}`,
      library.overridden ? `Overridden from: ${library.originalPath}` : null,
      library.accessible ? t('mediaLibrary.status.online') : t('mediaLibrary.status.offline'),
    ]
      .filter(Boolean)
      .join('\n');
  }
}

class DirectoryItem extends vscode.TreeItem {
  readonly type = 'directory' as const;

  constructor(
    public readonly dirPath: string,
    dirName: string,
    fileCount?: number,
  ) {
    super(dirName, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'mediaLibrary:directory';
    this.iconPath = vscode.ThemeIcon.Folder;
    if (fileCount !== undefined && fileCount > 0) {
      this.description =
        fileCount === 1
          ? t('mediaLibrary.fileCount', { count: fileCount })
          : t('mediaLibrary.fileCount.plural', { count: fileCount });
    }
  }
}

class MediaFileItem extends vscode.TreeItem {
  readonly type = 'file' as const;

  constructor(
    public readonly filePath: string,
    fileName: string,
    metadata?: MediaFileMetadata,
    thumbnailPath?: string | null,
  ) {
    super(fileName, vscode.TreeItemCollapsibleState.None);
    this.resourceUri = vscode.Uri.file(filePath);

    const mediaType = detectMediaType(filePath);
    // Encode media type into contextValue so view/item/context `when` clauses can
    // filter menu items precisely (e.g. don't show "Add to Timeline" for documents).
    this.contextValue = `mediaLibrary:file:${mediaType}`;
    const uri = vscode.Uri.file(filePath);
    const viewType = getPreviewViewType(filePath);

    // Command: route to the registered preview editor when one exists, otherwise
    // fall back to VS Code's default file opener.
    this.command = viewType
      ? {
          command: 'vscode.openWith',
          title:
            mediaType === 'video'
              ? t('command.previewVideo')
              : mediaType === 'audio'
                ? t('command.previewAudio')
                : t('command.openFile'),
          arguments: [uri, viewType],
        }
      : {
          command: 'vscode.open',
          title: t('command.openFile'),
          arguments: [uri],
        };

    // Icon: thumbnail or image preview when available; otherwise let
    // resourceUri + active file icon theme resolve the correct icon.
    if (thumbnailPath) {
      this.iconPath = vscode.Uri.file(thumbnailPath);
    } else if (mediaType === 'image') {
      // Images use original file as icon (VSCode auto-scales)
      this.iconPath = uri;
    }
    // For other types (video/audio/document/text), no explicit iconPath —
    // VSCode uses resourceUri to match the active file icon theme.

    // Tooltip: thumbnail + metadata
    const metaLines = metadata ? [fileName, ...buildMetadataTooltipLines(metadata)] : [fileName];
    this.tooltip = createThumbnailTooltip(thumbnailPath, metaLines);
  }
}

// =============================================================================
// Provider
// =============================================================================

export class MediaLibraryTreeProvider
  implements
    vscode.TreeDataProvider<MediaLibraryItem>,
    vscode.TreeDragAndDropController<MediaLibraryItem>,
    vscode.Disposable
{
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<MediaLibraryItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  // TreeDragAndDropController
  readonly dragMimeTypes = [ASSET_DRAG_MIME];
  readonly dropMimeTypes: string[] = [];

  private disposables: vscode.Disposable[] = [];

  // Caches
  private thumbnailCache = new Map<string, string | null>();
  private metadataCache = new Map<string, MediaFileMetadata>();
  private pendingThumbnails = new Set<string>();
  private refreshDebounceTimer?: NodeJS.Timeout;
  // Directory listing cache — keyed by absolute dir path
  private directoryCache = new Map<string, MediaLibraryItem[]>();
  // One FileSystemWatcher per watched directory
  private directoryWatchers = new Map<string, vscode.FileSystemWatcher>();
  // Disposables for directory watchers — replaced on each refresh()
  private watcherDisposables: vscode.Disposable[] = [];

  // Concurrency queues — prevent flooding the engine when a large directory is expanded.
  // Metadata: up to 3 parallel probes; thumbnails: up to 2 parallel ffmpeg invocations.
  private metadataQueue: Array<() => Promise<void>> = [];
  private metadataRunning = 0;
  private readonly metadataConcurrency = 3;

  private thumbnailTaskQueue: Array<() => Promise<void>> = [];
  private thumbnailRunning = 0;
  private readonly thumbnailConcurrency = 2;

  private readonly settingsService: MediaLibrarySettingsService;
  private readonly thumbnailService: ThumbnailService;
  private readonly metadataExtractor: (filePath: string) => Promise<MediaFileMetadata>;
  private readonly persistentCache?: MediaMetadataCache;

  constructor(deps: MediaLibraryDeps) {
    this.settingsService = deps.settingsService;
    this.thumbnailService = deps.thumbnailService;
    this.metadataExtractor = deps.metadataExtractor;
    this.persistentCache = deps.metadataCache;

    this.disposables.push(deps.settingsService.onDidChange(() => this.refresh()));
    this.disposables.push(
      deps.thumbnailService.onDidGenerateThumbnail((fp) => this.debouncedRefresh(fp)),
    );
  }

  refresh(): void {
    // Clear all caches including directory listings
    this.directoryCache.clear();
    // Dispose all watcher-related disposables and start fresh
    for (const d of this.watcherDisposables) {
      d.dispose();
    }
    this.watcherDisposables = [];
    this.directoryWatchers.clear();
    this.thumbnailCache.clear();
    // Keep metadataCache — it's backed by persistent storage and mtime-validated
    this.pendingThumbnails.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: MediaLibraryItem): vscode.TreeItem {
    return element;
  }

  getMediaFileTreeItem(filePath: string): MediaLibraryItem {
    return new MediaFileItem(filePath, path.basename(filePath));
  }

  async getParent(element: MediaLibraryItem): Promise<MediaLibraryItem | undefined> {
    if (element instanceof LibraryRootItem) {
      return undefined;
    }
    if (element instanceof DirectoryItem) {
      return this.getParentForPath(element.dirPath);
    }
    if (element instanceof MediaFileItem) {
      return this.getParentForPath(element.filePath);
    }
    return undefined;
  }

  async getChildren(element?: MediaLibraryItem): Promise<MediaLibraryItem[]> {
    if (!element) {
      return this.getRootItems();
    }
    if (element instanceof LibraryRootItem) {
      if (!element.library.accessible) return [];
      return this.listDirectory(element.library.resolvedPath);
    }
    if (element instanceof DirectoryItem) {
      return this.listDirectory(element.dirPath);
    }
    return [];
  }

  // Drag support
  handleDrag(source: readonly MediaLibraryItem[], dataTransfer: vscode.DataTransfer): void {
    const files = source.filter((s): s is MediaFileItem => s instanceof MediaFileItem);
    if (files.length === 0) return;

    const dragData: MediaFileDragData = {
      type: 'media-file',
      files: files.map((f) => ({
        path: f.filePath,
        name: path.basename(f.filePath),
        mediaType: detectMediaType(f.filePath) as 'video' | 'audio' | 'image',
      })),
    };

    dataTransfer.set(ASSET_DRAG_MIME, new vscode.DataTransferItem(JSON.stringify(dragData)));
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async getRootItems(): Promise<MediaLibraryItem[]> {
    const libraries = await this.settingsService.getResolvedLibraries();
    if (libraries.length === 0) {
      return [this.createPlaceholder()];
    }
    return libraries.filter((lib) => lib.enabled).map((lib) => new LibraryRootItem(lib));
  }

  private async getParentForPath(targetPath: string): Promise<MediaLibraryItem | undefined> {
    const parentPath = path.dirname(targetPath);
    const root = await this.findLibraryRootForPath(targetPath);
    if (!root) return undefined;
    if (normalizePath(parentPath) === normalizePath(root.library.resolvedPath)) {
      return root;
    }
    return new DirectoryItem(parentPath, path.basename(parentPath));
  }

  private async findLibraryRootForPath(targetPath: string): Promise<LibraryRootItem | undefined> {
    const libraries = await this.settingsService.getResolvedLibraries();
    const normalizedTarget = normalizePath(targetPath);
    const candidates = libraries
      .filter((library) => library.enabled && library.accessible)
      .filter((library) => normalizedTarget.startsWith(normalizePath(library.resolvedPath)))
      .sort((a, b) => b.resolvedPath.length - a.resolvedPath.length);
    return candidates[0] ? new LibraryRootItem(candidates[0]) : undefined;
  }

  private async listDirectory(dirPath: string): Promise<MediaLibraryItem[]> {
    // Return cached listing if available
    const cached = this.directoryCache.get(dirPath);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const items: MediaLibraryItem[] = [];

      // Directories first (skip hidden), then media files
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
        .sort((a, b) => a.name.localeCompare(b.name));

      const files = entries
        .filter((e) => e.isFile() && (isMediaFile(e.name) || isDocumentFile(e.name)))
        .sort((a, b) => a.name.localeCompare(b.name));

      const mediaFileCount = files.length;

      for (const dir of dirs) {
        items.push(new DirectoryItem(path.join(dirPath, dir.name), dir.name, mediaFileCount));
      }

      for (const file of files) {
        const filePath = path.join(dirPath, file.name);
        const mediaType = detectMediaType(filePath);

        const metadata = this.metadataCache.get(filePath);
        if (!metadata) {
          this.enqueueMetadata(filePath);
        }

        let thumbnailPath: string | null | undefined = this.thumbnailCache.get(filePath);
        if (thumbnailPath === undefined && mediaType === 'video') {
          this.enqueueThumbnail(filePath);
          thumbnailPath = null;
        }

        items.push(new MediaFileItem(filePath, file.name, metadata, thumbnailPath));
      }

      // Cache result and start watching for changes
      this.directoryCache.set(dirPath, items);
      this.watchDirectory(dirPath);

      return items;
    } catch {
      return [];
    }
  }

  private async extractMetadata(filePath: string): Promise<void> {
    try {
      // Check persistent cache first (survives VSCode restarts)
      if (this.persistentCache) {
        const cached = await this.persistentCache.get(filePath);
        if (cached) {
          this.metadataCache.set(filePath, cached);
          this.debouncedRefresh(filePath);
          return;
        }
      }

      // Cache miss — extract via engine probe
      const metadata = await this.metadataExtractor(filePath);
      this.metadataCache.set(filePath, metadata);

      // Persist for next restart
      if (this.persistentCache) {
        void this.persistentCache.set(filePath, metadata);
      }

      this.debouncedRefresh(filePath);
    } catch {
      // Silently ignore metadata extraction failures
    }
  }

  private async generateThumbnail(filePath: string): Promise<void> {
    // Prevent duplicate requests
    if (this.pendingThumbnails.has(filePath)) return;
    this.pendingThumbnails.add(filePath);

    try {
      const result = await this.thumbnailService.generate(filePath);
      this.thumbnailCache.set(filePath, result?.path ?? null);
      if (result) {
        this.debouncedRefresh(filePath);
      }
    } catch {
      this.thumbnailCache.set(filePath, null);
    } finally {
      this.pendingThumbnails.delete(filePath);
    }
  }

  private enqueueMetadata(filePath: string): void {
    this.metadataQueue.push(() => this.extractMetadata(filePath));
    this.drainMetadataQueue();
  }

  private drainMetadataQueue(): void {
    while (this.metadataRunning < this.metadataConcurrency && this.metadataQueue.length > 0) {
      const task = this.metadataQueue.shift()!;
      this.metadataRunning++;
      void task().finally(() => {
        this.metadataRunning--;
        this.drainMetadataQueue();
      });
    }
  }

  private enqueueThumbnail(filePath: string): void {
    if (this.pendingThumbnails.has(filePath)) return;
    this.thumbnailTaskQueue.push(() => this.generateThumbnail(filePath));
    this.drainThumbnailQueue();
  }

  private drainThumbnailQueue(): void {
    while (
      this.thumbnailRunning < this.thumbnailConcurrency &&
      this.thumbnailTaskQueue.length > 0
    ) {
      const task = this.thumbnailTaskQueue.shift()!;
      this.thumbnailRunning++;
      void task().finally(() => {
        this.thumbnailRunning--;
        this.drainThumbnailQueue();
      });
    }
  }

  private debouncedRefresh(_filePath: string): void {
    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer);
    }
    this.refreshDebounceTimer = setTimeout(() => {
      this._onDidChangeTreeData.fire(undefined);
    }, 500);
  }

  private watchDirectory(dirPath: string): void {
    if (this.directoryWatchers.has(dirPath)) return; // already watching

    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(dirPath, '*'),
    );

    const invalidate = () => {
      // Invalidate directory listing
      this.directoryCache.delete(dirPath);
      // Invalidate metadata/thumbnail for files in this dir
      const prefix = dirPath + path.sep;
      for (const key of this.metadataCache.keys()) {
        if (key.startsWith(prefix)) this.metadataCache.delete(key);
      }
      for (const key of this.thumbnailCache.keys()) {
        if (key.startsWith(prefix)) this.thumbnailCache.delete(key);
      }
      // Debounced tree refresh
      this.debouncedRefresh(dirPath);
    };

    this.watcherDisposables.push(
      watcher,
      watcher.onDidCreate(invalidate),
      watcher.onDidDelete(invalidate),
      watcher.onDidChange(invalidate),
    );
    this.directoryWatchers.set(dirPath, watcher);
  }

  private createPlaceholder(): vscode.TreeItem {
    const item = new vscode.TreeItem(t('mediaLibrary.placeholder'));
    item.command = {
      command: 'neko.assets.addMediaLibrary',
      title: t('mediaLibrary.placeholder.action'),
    };
    return item;
  }

  dispose(): void {
    if (this.refreshDebounceTimer) {
      clearTimeout(this.refreshDebounceTimer);
    }
    this._onDidChangeTreeData.dispose();
    for (const d of this.watcherDisposables) {
      d.dispose();
    }
    this.watcherDisposables = [];
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

function normalizePath(value: string): string {
  return path.resolve(value);
}
