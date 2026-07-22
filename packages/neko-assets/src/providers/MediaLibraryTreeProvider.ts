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
 * - Stable Media Library file drag protocol
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import {
  isMediaFile,
  isDocumentFile,
  detectMediaType,
  MEDIA_LIBRARY_DRAG_MIME,
  normalizeWorkspaceContentPath,
  WORKSPACE_MEDIA_LIBRARY_DIRECTORY,
  type MediaFileMetadata,
  type MediaLibraryDragData,
  type MediaLibraryProjectionEntry,
  type WorkspaceFileContentLocator,
  type WorkspaceLinkedMediaLibrary,
} from '@neko/shared';
import type { WorkspaceLinkedMediaLibraryService } from '../services/WorkspaceLinkedMediaLibraryService';
import type { ThumbnailService } from '../services/ThumbnailService';
import type { MediaMetadataCache } from '../services/MediaMetadataCache';
import { buildMetadataTooltipLines } from '../utils/formatters';
import { createThumbnailTooltip } from '../utils/thumbnailTooltip';
import { getPreviewViewType } from '../utils/preview';
import { t } from '../i18n';

// =============================================================================
// Dependencies
// =============================================================================

export interface MediaLibraryDeps {
  libraryService: WorkspaceLinkedMediaLibraryService;
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

  constructor(public readonly library: WorkspaceLinkedMediaLibrary) {
    super(library.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = library.workspacePath;
    this.contextValue =
      library.availability === 'available' ? 'mediaLibrary' : 'mediaLibrary:offline';

    this.iconPath =
      library.availability === 'available'
        ? new vscode.ThemeIcon('folder-library')
        : new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));

    this.tooltip = [
      library.name,
      `Path: ${library.workspacePath}`,
      library.availability === 'available'
        ? t('mediaLibrary.status.online')
        : t('mediaLibrary.status.offline'),
      library.diagnostic?.message,
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
  readonly filePath: string;

  constructor(
    public readonly projection: MediaLibraryProjectionEntry & {
      readonly locator: WorkspaceFileContentLocator;
    },
    public readonly absolutePath: string,
    fileName: string,
    metadata?: MediaFileMetadata,
    thumbnailUri?: vscode.Uri | null,
  ) {
    super(fileName, vscode.TreeItemCollapsibleState.None);
    this.filePath = projection.locator.path;

    const mediaType = detectMediaType(this.filePath);
    // Encode media type into contextValue so view/item/context `when` clauses can
    // filter menu items precisely (e.g. don't show "Add to Timeline" for documents).
    this.contextValue = `mediaLibrary:file:${mediaType}`;
    const uri = vscode.Uri.file(absolutePath);
    const viewType = getPreviewViewType(this.filePath);

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

    // Keep linked descendants out of VS Code Git decorations: Git rejects
    // pathspecs below symlinks. The command URI remains the file-open boundary.
    if (thumbnailUri) {
      this.iconPath = thumbnailUri;
    } else if (mediaType === 'image') {
      // Images use original file as icon (VSCode auto-scales)
      this.iconPath = uri;
    } else {
      this.iconPath = new vscode.ThemeIcon(mediaType === 'document' ? 'file' : 'file-media');
    }

    // Tooltip: thumbnail + metadata
    const metaLines = metadata ? [fileName, ...buildMetadataTooltipLines(metadata)] : [fileName];
    this.tooltip = createThumbnailTooltip(thumbnailUri, metaLines);
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
  readonly dragMimeTypes = [MEDIA_LIBRARY_DRAG_MIME];
  readonly dropMimeTypes: string[] = [];

  private disposables: vscode.Disposable[] = [];

  // Caches
  private thumbnailCache = new Map<string, vscode.Uri | null>();
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

  private readonly libraryService: WorkspaceLinkedMediaLibraryService;
  private readonly thumbnailService: ThumbnailService;
  private readonly metadataExtractor: (filePath: string) => Promise<MediaFileMetadata>;
  private readonly persistentCache?: MediaMetadataCache;

  constructor(deps: MediaLibraryDeps) {
    this.libraryService = deps.libraryService;
    this.thumbnailService = deps.thumbnailService;
    this.metadataExtractor = deps.metadataExtractor;
    this.persistentCache = deps.metadataCache;

    this.disposables.push(deps.libraryService.onDidChange(() => this.refresh()));
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
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : this.libraryService.resolveWorkspacePath(filePath);
    const workspacePath = path
      .relative(this.libraryService.workspaceRoot, absolutePath)
      .replace(/\\/gu, '/');
    return new MediaFileItem(
      createMediaFileProjection(workspacePath, path.basename(absolutePath)),
      absolutePath,
      path.basename(absolutePath),
    );
  }

  async getParent(element: MediaLibraryItem): Promise<MediaLibraryItem | undefined> {
    if (element instanceof LibraryRootItem) {
      return undefined;
    }
    if (element instanceof DirectoryItem) {
      return this.getParentForPath(element.dirPath);
    }
    if (element instanceof MediaFileItem) {
      return this.getParentForPath(element.absolutePath);
    }
    return undefined;
  }

  async getChildren(element?: MediaLibraryItem): Promise<MediaLibraryItem[]> {
    if (!element) {
      return this.getRootItems();
    }
    if (element instanceof LibraryRootItem) {
      if (element.library.availability !== 'available') return [];
      return this.listDirectory(
        this.libraryService.resolveWorkspacePath(element.library.workspacePath),
      );
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

    const dragData: MediaLibraryDragData = {
      type: 'media-file',
      files: files.map((f) => ({
        path: f.filePath,
        name: path.basename(f.filePath),
        mediaType: detectMediaType(f.filePath) as 'video' | 'audio' | 'image',
      })),
    };

    dataTransfer.set(
      MEDIA_LIBRARY_DRAG_MIME,
      new vscode.DataTransferItem(JSON.stringify(dragData)),
    );
  }

  // =========================================================================
  // Private
  // =========================================================================

  private async getRootItems(): Promise<MediaLibraryItem[]> {
    const libraries = await this.libraryService.list();
    if (libraries.length === 0) {
      return [this.createPlaceholder()];
    }
    return libraries.map((library) => new LibraryRootItem(library));
  }

  private async getParentForPath(targetPath: string): Promise<MediaLibraryItem | undefined> {
    const parentPath = path.dirname(targetPath);
    const root = await this.findLibraryRootForPath(targetPath);
    if (!root) return undefined;
    const rootPath = this.libraryService.resolveWorkspacePath(root.library.workspacePath);
    if (normalizePath(parentPath) === normalizePath(rootPath)) {
      return root;
    }
    return new DirectoryItem(parentPath, path.basename(parentPath));
  }

  private async findLibraryRootForPath(targetPath: string): Promise<LibraryRootItem | undefined> {
    const libraries = await this.libraryService.list();
    const normalizedTarget = normalizePath(targetPath);
    const candidates = libraries
      .filter((library) => library.availability === 'available')
      .filter((library) =>
        normalizedTarget.startsWith(
          normalizePath(this.libraryService.resolveWorkspacePath(library.workspacePath)),
        ),
      )
      .sort((a, b) => b.workspacePath.length - a.workspacePath.length);
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

        let thumbnailUri: vscode.Uri | null | undefined = this.thumbnailCache.get(filePath);
        if (thumbnailUri === undefined && mediaType === 'video') {
          this.enqueueThumbnail(filePath);
          thumbnailUri = null;
        }

        const workspacePath = path
          .relative(this.libraryService.workspaceRoot, filePath)
          .replace(/\\/gu, '/');
        items.push(
          new MediaFileItem(
            createMediaFileProjection(workspacePath, file.name, metadata),
            filePath,
            file.name,
            metadata,
            thumbnailUri,
          ),
        );
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
      this.thumbnailCache.set(filePath, result?.uri ?? null);
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

function createMediaFileProjection(
  workspacePath: string,
  fileName: string,
  metadata?: MediaFileMetadata,
): MediaLibraryProjectionEntry & { readonly locator: WorkspaceFileContentLocator } {
  const normalizedPath = normalizeWorkspaceContentPath(workspacePath);
  const linkedPrefix = `${WORKSPACE_MEDIA_LIBRARY_DIRECTORY}/`;
  if (normalizedPath !== workspacePath || !workspacePath.startsWith(linkedPrefix)) {
    throw new Error('Media Library projection requires a canonical linked workspace file path.');
  }
  return {
    locator: { kind: 'workspace-file', path: workspacePath },
    label: fileName,
    availability: 'available',
    capabilities: ['read', 'preview', 'bind', 'copy', 'delete'],
    ...(metadata
      ? {
          metadata: {
            mediaType: metadata.mimeType,
            byteLength: metadata.fileSize,
            ...(metadata.width !== undefined ? { width: metadata.width } : {}),
            ...(metadata.height !== undefined ? { height: metadata.height } : {}),
            ...(metadata.duration !== undefined ? { durationSeconds: metadata.duration } : {}),
          },
        }
      : {}),
  };
}
