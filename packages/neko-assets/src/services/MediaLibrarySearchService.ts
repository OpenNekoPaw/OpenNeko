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
  type AssetMediaType,
  type LocalMetadataPartition,
  type LocalMetadataPartitionRevision,
  type MediaFileMetadata,
  type SearchDocumentRepository,
} from '@neko/shared';
import { PathResolver } from '@neko/shared/path';
import type { MediaLibrarySettingsService } from './MediaLibrarySettingsService';
import type { MediaMetadataCache } from './MediaMetadataCache';
import { getLogger } from '../utils/logger';

const logger = getLogger('MediaLibrarySearch');

const MAX_RESULTS = 200;

// =============================================================================
// Types
// =============================================================================

export interface MediaSearchResult {
  /** Absolute file path */
  filePath: string;
  /** File name (basename) */
  fileName: string;
  /** Library display name */
  libraryName: string;
  /** Detected media type */
  mediaType: AssetMediaType;
  /** Cached metadata (if available, not extracted on-demand) */
  metadata?: MediaFileMetadata;
}

export interface SearchOptions {
  /** Filter by media type(s). If empty or undefined, match all types. */
  types?: AssetMediaType[];
  /** Maximum results to return (default MAX_RESULTS) */
  limit?: number;
}

interface IndexEntry {
  filePath: string;
  fileName: string;
  fileNameLower: string;
  libraryName: string;
  mediaType: AssetMediaType;
}

export interface MediaLibrarySearchIndexRecord {
  readonly filePath: string;
  readonly fileName: string;
  readonly libraryName: string;
  readonly mediaType: AssetMediaType;
}

export interface MediaLibrarySearchIndexStore {
  load(): Promise<readonly MediaLibrarySearchIndexRecord[] | undefined>;
  save(entries: readonly MediaLibrarySearchIndexRecord[]): Promise<void>;
}

export function createLocalMetadataMediaLibrarySearchIndexStore(options: {
  readonly repository: SearchDocumentRepository;
  readonly partition: LocalMetadataPartition;
  readonly pathResolver: PathResolver;
  readonly readRevision: () => Promise<LocalMetadataPartitionRevision | null>;
  readonly now?: () => string;
}): MediaLibrarySearchIndexStore {
  return {
    async load() {
      if (!(await options.readRevision())) return undefined;
      const documents = await options.repository.list(options.partition);
      const mediaDocuments = documents.filter(
        (document) => document.partition === 'media-library' && document.fileKey,
      );
      if (mediaDocuments.length === 0) return undefined;
      return mediaDocuments.flatMap((document) => {
        if (!document.fileKey) return [];
        const filePath = options.pathResolver.resolve(document.fileKey);
        if (!path.isAbsolute(filePath)) return [];
        const mediaType = readMediaType(document.metadata?.['mediaType']);
        const libraryName = readString(document.metadata?.['libraryName']);
        if (!mediaType || !libraryName) return [];
        return [{ filePath, fileName: document.label, libraryName, mediaType }];
      });
    },
    async save(entries) {
      const updatedAt = options.now ? options.now() : new Date().toISOString();
      await options.repository.replaceSearchPartition({
        partition: options.partition,
        searchPartition: 'media-library',
        documents: entries.map((entry) => {
          const fileKey = options.pathResolver.contract(entry.filePath).replace(/\\/gu, '/');
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

  constructor(
    private readonly settingsService: MediaLibrarySettingsService,
    private readonly metadataCache: MediaMetadataCache,
    private readonly indexStore: MediaLibrarySearchIndexStore,
  ) {
    // Invalidate index when libraries change
    this.disposables.push(
      settingsService.onDidChange(() => {
        this.fileIndex = null;
        this.disposeWatchers();
      }),
    );
  }

  dispose(): void {
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
    if (!this.fileIndex) {
      this.fileIndex = await this.loadOrBuildIndex();
    }
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

    const lower = keyword.toLowerCase();
    const typeFilter = options?.types?.length ? new Set(options.types) : null;
    const limit = options?.limit ?? MAX_RESULTS;
    const results: MediaSearchResult[] = [];

    for (const entry of this.fileIndex) {
      if (!entry.fileNameLower.includes(lower)) continue;
      if (typeFilter && !typeFilter.has(entry.mediaType)) continue;

      const metadata = await this.metadataCache.get(entry.filePath);

      results.push({
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

  // =========================================================================
  // Persistent index (L0)
  // =========================================================================

  private async loadOrBuildIndex(): Promise<IndexEntry[]> {
    const persisted = await this.indexStore.load();
    if (persisted !== undefined) {
      logger.info(`Loaded persisted search index: ${persisted.length} entries`);
      return persisted.map((entry) => ({
        ...entry,
        fileNameLower: entry.fileName.toLowerCase(),
      }));
    }

    return this.buildAndPersistIndex();
  }

  private async buildAndPersistIndex(): Promise<IndexEntry[]> {
    const entries = await this.buildIndex();

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

    const libraries = await this.settingsService.getResolvedLibraries();
    for (const lib of libraries) {
      if (!lib.enabled || !lib.accessible) continue;

      const pattern = new vscode.RelativePattern(lib.resolvedPath, '**/*');
      const watcher = vscode.workspace.createFileSystemWatcher(pattern);

      watcher.onDidCreate((uri) => this.handleFileEvent('create', uri, lib.name));
      watcher.onDidDelete((uri) => this.handleFileEvent('delete', uri, lib.name));

      this.watchers.set(lib.resolvedPath, watcher);
    }
  }

  private handleFileEvent(type: 'create' | 'delete', uri: vscode.Uri, libraryName: string): void {
    const filePath = uri.fsPath;
    const fileName = path.basename(filePath);

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
    const libraries = await this.settingsService.getResolvedLibraries();
    const entries: IndexEntry[] = [];

    for (const lib of libraries) {
      if (!lib.enabled || !lib.accessible) continue;

      try {
        await this.walkDirectory(lib.resolvedPath, lib.name, entries);
      } catch (error) {
        logger.debug(`Failed to index library ${lib.name}:`, error);
      }
    }

    logger.info(
      `Built search index: ${entries.length} files across ${libraries.filter((l) => l.enabled && l.accessible).length} libraries`,
    );
    return entries;
  }

  private async walkDirectory(
    dirPath: string,
    libraryName: string,
    entries: IndexEntry[],
  ): Promise<void> {
    let names: string[];
    try {
      names = await fs.readdir(dirPath);
    } catch {
      return;
    }

    for (const name of names) {
      if (name.startsWith('.')) continue;

      const fullPath = path.join(dirPath, name);

      let stat;
      try {
        stat = await fs.stat(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        await this.walkDirectory(fullPath, libraryName, entries);
      } else if (stat.isFile() && (isMediaFile(name) || isDocumentFile(name))) {
        entries.push({
          filePath: fullPath,
          fileName: name,
          fileNameLower: name.toLowerCase(),
          libraryName,
          mediaType: detectMediaType(fullPath),
        });
      }
    }
  }
}

function assertPortableSearchFileKey(fileKey: string): void {
  if (
    !fileKey.trim() ||
    path.posix.isAbsolute(fileKey) ||
    /^[A-Za-z]:\//u.test(fileKey) ||
    fileKey === '..' ||
    fileKey.startsWith('../') ||
    fileKey.includes('/../') ||
    fileKey.includes('/.neko/.cache/') ||
    fileKey.startsWith('.neko/.cache/')
  ) {
    throw new Error(`Media search source path cannot be persisted: ${fileKey}`);
  }
}

function readMediaType(value: unknown): AssetMediaType | undefined {
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
