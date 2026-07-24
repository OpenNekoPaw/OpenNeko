/**
 * Media Library Search Service
 *
 * Provides search across all configured media libraries with:
 * - L0 persistent file index (FileSystemWatcher-driven incremental updates)
 * - Type filtering (video/audio/image/document/text)
 * - Configurable result limit (default 200, up from 50)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'node:crypto';
import * as vscode from 'vscode';
import {
  isMediaFile,
  isDocumentFile,
  detectMediaType,
  WORKSPACE_MEDIA_LIBRARY_DIRECTORY,
  validateWorkspaceLinkedMediaLibraryName,
  type MediaFileType,
  type LocalMetadataPartition,
  type LocalMetadataPartitionRevision,
  type MediaFileMetadata,
  type SearchDocumentRepository,
  type WorkspaceFileContentLocator,
} from '@neko/shared';
import type { WorkspaceLinkedMediaLibraryService } from './WorkspaceLinkedMediaLibraryService';
import type { MediaMetadataCache } from './MediaMetadataCache';
import { getLogger } from '../utils/logger';

const logger = getLogger('MediaLibrarySearch');

const MAX_RESULTS = 200;

// =============================================================================
// Types
// =============================================================================

export interface MediaSearchResult {
  /** Canonical resource identity used by Search and content consumers. */
  locator: WorkspaceFileContentLocator;
  /** Exact workspace-relative file path */
  filePath: string;
  /** File name (basename) */
  fileName: string;
  /** Library display name */
  libraryName: string;
  /** Detected media type */
  mediaType: MediaFileType;
  /** Cached metadata (if available, not extracted on-demand) */
  metadata?: MediaFileMetadata;
}

export interface SearchOptions {
  /** Filter by media type(s). If empty or undefined, match all types. */
  types?: MediaFileType[];
  /** Maximum results to return (default MAX_RESULTS) */
  limit?: number;
}

interface IndexEntry {
  filePath: string;
  fileName: string;
  fileNameLower: string;
  libraryName: string;
  mediaType: MediaFileType;
}

export interface MediaLibrarySearchIndexRecord {
  readonly filePath: string;
  readonly fileName: string;
  readonly libraryName: string;
  readonly mediaType: MediaFileType;
}

export interface MediaLibrarySearchIndexStore {
  load(): Promise<readonly MediaLibrarySearchIndexRecord[] | undefined>;
  save(entries: readonly MediaLibrarySearchIndexRecord[]): Promise<void>;
}

export interface MediaLibraryRecentStore {
  load(): Promise<readonly string[]>;
  save(paths: readonly string[]): Promise<void>;
}

export function createLocalMetadataMediaLibrarySearchIndexStore(options: {
  readonly repository: SearchDocumentRepository;
  readonly partition: LocalMetadataPartition;
  readonly readRevision: () => Promise<LocalMetadataPartitionRevision | null>;
  readonly now?: () => string;
}): MediaLibrarySearchIndexStore {
  return {
    async load() {
      const revision = await options.readRevision();
      if (!revision || revision.freshness !== 'fresh') return undefined;
      const documents = await options.repository.list(options.partition);
      const mediaDocuments = documents.filter((document) => document.partition === 'media-library');
      if (mediaDocuments.length === 0) return undefined;
      if (mediaDocuments.some((document) => document.freshness !== 'fresh')) return undefined;
      const entries: MediaLibrarySearchIndexRecord[] = [];
      for (const document of mediaDocuments) {
        if (!document.fileKey || !isPortableSearchFileKey(document.fileKey)) return undefined;
        const filePath = document.fileKey;
        const mediaType = readMediaType(document.metadata?.['mediaType']);
        const libraryName = readString(document.metadata?.['libraryName']);
        if (!mediaType || !libraryName || libraryName !== readLibraryName(filePath))
          return undefined;
        entries.push({ filePath, fileName: document.label, libraryName, mediaType });
      }
      return entries;
    },
    async save(entries) {
      const updatedAt = options.now ? options.now() : new Date().toISOString();
      await options.repository.replaceSearchPartition({
        partition: options.partition,
        searchPartition: 'media-library',
        documents: entries.map((entry) => {
          const fileKey = entry.filePath.replace(/\\/gu, '/');
          assertPortableSearchFileKey(fileKey);
          return {
            documentId: `media:${createHash('sha256').update(fileKey).digest('hex').slice(0, 24)}`,
            partition: 'media-library',
            kind: 'media',
            label: entry.fileName,
            description: entry.libraryName,
            source: {
              partition: 'media-library',
              sourceId: fileKey,
              filePath: fileKey,
              metadata: { mediaType: entry.mediaType, libraryName: entry.libraryName },
            },
            fileKey,
            searchText: `${entry.fileName} ${entry.libraryName} ${entry.mediaType}`,
            freshness: 'fresh',
            metadata: { mediaType: entry.mediaType, libraryName: entry.libraryName },
            updatedAt,
          };
        }),
        updatedAt,
      });
    },
  };
}

// =============================================================================
// Implementation
// =============================================================================

export class MediaLibrarySearchService implements vscode.Disposable {
  private fileIndex: IndexEntry[] | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;
  private libraryRevision = 0;
  private rebuildPromise: Promise<void> | null = null;
  private projectionInvalidated = false;
  private disposed = false;
  private recentLoaded = false;
  private recentPaths: string[] = [];

  constructor(
    private readonly libraryService: WorkspaceLinkedMediaLibraryService,
    private readonly workspaceRoot: string,
    private readonly metadataCache: MediaMetadataCache,
    private readonly indexStore: MediaLibrarySearchIndexStore,
    private readonly recentStore?: MediaLibraryRecentStore,
  ) {
    // Invalidate index when libraries change
    this.disposables.push(
      libraryService.onDidChange(() => {
        this.scheduleLibraryRebuild();
      }),
    );
  }

  dispose(): void {
    this.disposed = true;
    this.disposeWatchers();
    this.disposables.forEach((d) => d.dispose());
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
  }

  /**
   * Warm up the lightweight filename index and install watchers.
   *
   * This does not probe media metadata, generate thumbnails, or build embeddings.
   * If the persisted index is absent, it reuses the existing bounded file-name
   * index path in the background.
   */
  async warmup(): Promise<void> {
    const pendingRebuild = this.rebuildPromise;
    if (pendingRebuild) await pendingRebuild;
    if (!this.fileIndex) {
      this.fileIndex = this.projectionInvalidated
        ? await this.buildAndPersistIndex()
        : await this.loadOrBuildIndex();
      this.projectionInvalidated = false;
    }
    await this.loadRecentProjection();
    await this.setupWatchers();
  }

  /**
   * Search media files across all libraries by file name.
   *
   * On first call, attempts to load the persisted SQLite projection.
   * Falls back to full directory walk if persisted index is missing.
   */
  async search(keyword: string, options?: SearchOptions): Promise<MediaSearchResult[]> {
    if (!this.fileIndex) {
      await this.warmup();
    }
    const fileIndex = this.fileIndex;
    if (!fileIndex) {
      throw new Error('Media library search warmup completed without an index.');
    }

    const lower = keyword.toLowerCase();
    const typeFilter = options?.types?.length ? new Set(options.types) : null;
    const limit = options?.limit ?? MAX_RESULTS;
    const results: MediaSearchResult[] = [];

    for (const entry of fileIndex) {
      if (!entry.fileNameLower.includes(lower)) continue;
      if (typeFilter && !typeFilter.has(entry.mediaType)) continue;

      const metadata = await this.metadataCache.get(this.resolveWorkspacePath(entry.filePath));

      results.push({
        locator: { kind: 'workspace-file', path: entry.filePath },
        filePath: entry.filePath,
        fileName: entry.fileName,
        libraryName: entry.libraryName,
        mediaType: entry.mediaType,
        metadata: metadata ?? undefined,
      });

      if (results.length >= limit) break;
    }

    return results;
  }

  async recordRecentUse(locator: WorkspaceFileContentLocator): Promise<void> {
    if (!isPortableSearchFileKey(locator.path)) {
      throw new Error('Media Library recent use requires a canonical workspace locator.');
    }
    await this.loadRecentProjection();
    this.recentPaths = [
      locator.path,
      ...this.recentPaths.filter((path) => path !== locator.path),
    ].slice(0, 50);
    await this.recentStore?.save(this.recentPaths);
  }

  async getRecent(limit = 20): Promise<MediaSearchResult[]> {
    if (!this.fileIndex) await this.warmup();
    else await this.loadRecentProjection();
    const entriesByPath = new Map((this.fileIndex ?? []).map((entry) => [entry.filePath, entry]));
    const results: MediaSearchResult[] = [];
    for (const filePath of this.recentPaths.slice(0, Math.max(0, limit))) {
      const entry = entriesByPath.get(filePath);
      if (!entry) continue;
      const metadata = await this.metadataCache.get(this.resolveWorkspacePath(entry.filePath));
      results.push({
        locator: { kind: 'workspace-file', path: entry.filePath },
        filePath: entry.filePath,
        fileName: entry.fileName,
        libraryName: entry.libraryName,
        mediaType: entry.mediaType,
        metadata: metadata ?? undefined,
      });
    }
    return results;
  }

  /**
   * Clear the file index (forces rebuild on next search).
   */
  invalidateIndex(): void {
    this.fileIndex = null;
  }

  /**
   * Get count of indexed files (for diagnostics).
   */
  get indexSize(): number {
    return this.fileIndex?.length ?? 0;
  }

  private async loadRecentProjection(): Promise<void> {
    if (this.recentLoaded) return;
    this.recentLoaded = true;
    const stored = (await this.recentStore?.load()) ?? [];
    this.recentPaths = stored.filter(isPortableSearchFileKey).filter(dedupeString).slice(0, 50);
  }

  // =========================================================================
  // Persistent index (L0)
  // =========================================================================

  private async loadOrBuildIndex(): Promise<IndexEntry[]> {
    const persisted = await this.indexStore.load();
    if (persisted !== undefined) {
      logger.info(`Loaded persisted search index: ${persisted.length} entries`);
      return dedupeIndexByLocator(
        persisted.map((entry) => ({
          ...entry,
          fileNameLower: entry.fileName.toLowerCase(),
        })),
      );
    }

    return this.buildAndPersistIndex();
  }

  private async buildAndPersistIndex(): Promise<IndexEntry[]> {
    const entries = dedupeIndexByLocator(await this.buildIndex());

    try {
      await this.persistIndex(entries);
      logger.debug('Persisted media library search projection');
    } catch (error) {
      logger.warn('Failed to persist media library search projection', { error });
    }

    return entries;
  }

  // =========================================================================
  // FileSystemWatcher (incremental updates)
  // =========================================================================

  private async setupWatchers(): Promise<void> {
    this.disposeWatchers();

    const libraries = await this.libraryService.list();
    for (const lib of libraries) {
      if (lib.availability !== 'available') continue;

      const libraryRoot = this.resolveWorkspacePath(lib.workspacePath);
      const pattern = new vscode.RelativePattern(libraryRoot, '**/*');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidCreate((uri) => this.handleFileEvent('create', uri, lib.name));
      watcher.onDidDelete((uri) => this.handleFileEvent('delete', uri, lib.name));

      this.watchers.set(lib.workspacePath, watcher);
    }
  }

  private handleFileEvent(type: 'create' | 'delete', uri: vscode.Uri, libraryName: string): void {
    const absolutePath = uri.fsPath;
    const filePath = path.relative(this.workspaceRoot, absolutePath).replace(/\\/gu, '/');
    const fileName = path.basename(absolutePath);

    if (fileName.startsWith('.')) return;
    if (!isMediaFile(fileName) && !isDocumentFile(fileName)) return;
    if (!this.fileIndex) return;

    if (type === 'create') {
      // Avoid duplicates
      if (!this.fileIndex.some((e) => e.filePath === filePath)) {
        this.fileIndex.push({
          filePath,
          fileName,
          fileNameLower: fileName.toLowerCase(),
          libraryName,
          mediaType: detectMediaType(filePath),
        });
      }
    } else {
      const idx = this.fileIndex.findIndex((e) => e.filePath === filePath);
      if (idx >= 0) this.fileIndex.splice(idx, 1);
    }

    // Debounce persist
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    this.rebuildTimer = setTimeout(() => {
      if (this.fileIndex) {
        void this.persistIndex(this.fileIndex).catch((error) =>
          logger.warn('Failed to persist media library search projection', { error }),
        );
      }
    }, 2000);
  }

  private async persistIndex(entries: IndexEntry[]): Promise<void> {
    await this.indexStore.save(
      entries.map((entry) => ({
        filePath: entry.filePath,
        fileName: entry.fileName,
        libraryName: entry.libraryName,
        mediaType: entry.mediaType,
      })),
    );
  }

  private scheduleLibraryRebuild(): void {
    this.libraryRevision += 1;
    this.projectionInvalidated = true;
    this.fileIndex = null;
    this.disposeWatchers();
    if (this.rebuildPromise) return;

    const rebuild = this.rebuildUntilCurrent();
    this.rebuildPromise = rebuild;
    void rebuild
      .catch((error) => logger.warn('Failed to rebuild media library search projection', { error }))
      .finally(() => {
        if (this.rebuildPromise === rebuild) this.rebuildPromise = null;
      });
  }

  private async rebuildUntilCurrent(): Promise<void> {
    while (!this.disposed) {
      const revision = this.libraryRevision;
      const entries = await this.buildAndPersistIndex();
      if (revision !== this.libraryRevision) continue;

      this.fileIndex = entries;
      this.projectionInvalidated = false;
      await this.setupWatchers();
      if (revision === this.libraryRevision) return;

      this.fileIndex = null;
      this.projectionInvalidated = true;
      this.disposeWatchers();
    }
  }

  private disposeWatchers(): void {
    for (const watcher of this.watchers.values()) {
      watcher.dispose();
    }
    this.watchers.clear();
  }

  // =========================================================================
  // Full directory walk (initial build)
  // =========================================================================

  private async buildIndex(): Promise<IndexEntry[]> {
    const libraries = await this.libraryService.list();
    const entries: IndexEntry[] = [];

    for (const lib of libraries) {
      if (lib.availability !== 'available') continue;

      try {
        await this.walkDirectory(this.resolveWorkspacePath(lib.workspacePath), lib.name, entries);
      } catch (error) {
        logger.debug(`Failed to index library ${lib.name}:`, error);
      }
    }

    logger.info(
      `Built search index: ${entries.length} files across ${libraries.filter((library) => library.availability === 'available').length} libraries`,
    );
    return entries;
  }

  private async walkDirectory(
    dirPath: string,
    libraryName: string,
    entries: IndexEntry[],
  ): Promise<void> {
    let children: import('node:fs').Dirent[];
    try {
      children = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const child of children) {
      const name = child.name;
      if (name.startsWith('.')) continue;
      if (child.isSymbolicLink()) continue;

      const fullPath = path.join(dirPath, name);
      if (child.isDirectory()) {
        await this.walkDirectory(fullPath, libraryName, entries);
      } else if (child.isFile() && (isMediaFile(name) || isDocumentFile(name))) {
        const workspacePath = path.relative(this.workspaceRoot, fullPath).replace(/\\/gu, '/');
        entries.push({
          filePath: workspacePath,
          fileName: name,
          fileNameLower: name.toLowerCase(),
          libraryName,
          mediaType: detectMediaType(fullPath),
        });
      }
    }
  }

  private resolveWorkspacePath(workspacePath: string): string {
    return path.join(this.workspaceRoot, ...workspacePath.split('/'));
  }
}

function assertPortableSearchFileKey(fileKey: string): void {
  if (!isPortableSearchFileKey(fileKey)) {
    throw new Error(`Media search source path cannot be persisted: ${fileKey}`);
  }
}

function isPortableSearchFileKey(fileKey: string): boolean {
  const linkedPrefix = `${WORKSPACE_MEDIA_LIBRARY_DIRECTORY}/`;
  const linkedSegments = fileKey.startsWith(linkedPrefix)
    ? fileKey.slice(linkedPrefix.length).split('/')
    : [];
  const libraryName = linkedSegments[0];
  return !(
    !fileKey.trim() ||
    fileKey.normalize('NFC') !== fileKey ||
    path.posix.isAbsolute(fileKey) ||
    /^[A-Za-z]:\//u.test(fileKey) ||
    /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(fileKey) ||
    fileKey.startsWith('${') ||
    fileKey === '..' ||
    fileKey.startsWith('../') ||
    fileKey.includes('/../') ||
    fileKey.includes('/.neko/.cache/') ||
    fileKey.startsWith('.neko/.cache/') ||
    linkedSegments.length < 2 ||
    !libraryName ||
    validateWorkspaceLinkedMediaLibraryName(libraryName) !== undefined ||
    linkedSegments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')
  );
}

function readLibraryName(fileKey: string): string | undefined {
  return fileKey.split('/')[2];
}

function readMediaType(value: unknown): MediaFileType | undefined {
  return value === 'video' ||
    value === 'audio' ||
    value === 'image' ||
    value === 'sequence' ||
    value === 'text' ||
    value === 'document'
    ? value
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function dedupeIndexByLocator(entries: readonly IndexEntry[]): IndexEntry[] {
  const byPath = new Map<string, IndexEntry>();
  for (const entry of entries) {
    if (!byPath.has(entry.filePath)) byPath.set(entry.filePath, entry);
  }
  return [...byPath.values()];
}

function dedupeString(value: string, index: number, values: readonly string[]): boolean {
  return values.indexOf(value) === index;
}
