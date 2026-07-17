/**
 * Workspace media probe metadata projected through the shared local metadata repository.
 * Artifact bytes and media-library facts remain files; this cache only stores rebuildable probes.
 */

import * as fs from 'node:fs/promises';
import type * as vscode from 'vscode';
import { PathResolver, type MediaFileMetadata } from '@neko/shared';
import type {
  LocalMetadataPartition,
  MediaMetadataRecord,
  MediaMetadataRepository,
} from '@neko/shared/local-metadata';
import { getLogger } from '../utils/logger';

const logger = getLogger('MediaMetadataCache');

export interface MediaMetadataCacheOptions {
  readonly repository: MediaMetadataRepository;
  readonly partition: LocalMetadataPartition;
  readonly pathResolver: PathResolver;
  readonly now?: () => string;
}

export class MediaMetadataCache implements vscode.Disposable {
  private readonly entries = new Map<string, MediaMetadataRecord>();
  private readonly now: () => string;

  constructor(private readonly options: MediaMetadataCacheOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async load(): Promise<void> {
    const records = await this.options.repository.list(this.options.partition);
    this.entries.clear();
    for (const record of records) {
      this.entries.set(record.sourceKey, record);
    }
    logger.info(`Loaded ${this.entries.size} cached metadata entries`);
  }

  async get(filePath: string): Promise<MediaFileMetadata | null> {
    const sourceKey = this.toKey(filePath);
    const record = await this.options.repository.get(this.options.partition, sourceKey);
    if (!record) {
      this.entries.delete(sourceKey);
      return null;
    }
    this.entries.set(sourceKey, record);

    try {
      const stat = await fs.stat(filePath);
      if (Math.abs(stat.mtimeMs - record.sourceMtimeMs) < 1) {
        return record.metadata;
      }
      await this.options.repository.delete(this.options.partition, sourceKey);
      this.entries.delete(sourceKey);
      return null;
    } catch {
      // Offline media-library roots may become available again without invalidating metadata.
      return null;
    }
  }

  async set(filePath: string, metadata: MediaFileMetadata): Promise<void> {
    const sourceKey = this.toKey(filePath);
    try {
      const stat = await fs.stat(filePath);
      const record: MediaMetadataRecord = {
        sourceKey,
        sourceMtimeMs: stat.mtimeMs,
        metadata,
        updatedAt: this.now(),
      };
      await this.options.repository.upsert({ partition: this.options.partition, record });
      this.entries.set(sourceKey, record);
    } catch (error) {
      if (hasFileSystemCode(error, 'ENOENT') || hasFileSystemCode(error, 'EACCES')) {
        return;
      }
      throw error;
    }
  }

  dispose(): void {
    this.entries.clear();
  }

  private toKey(filePath: string): string {
    const sourceKey = this.options.pathResolver.contract(filePath).replace(/\\/gu, '/');
    if (
      !sourceKey.trim() ||
      sourceKey.startsWith('/') ||
      /^[A-Za-z]:\//u.test(sourceKey) ||
      sourceKey === '..' ||
      sourceKey.startsWith('../') ||
      sourceKey.includes('/../')
    ) {
      throw new Error(`Media metadata source path is not portable: ${filePath}`);
    }
    return sourceKey;
  }
}

function hasFileSystemCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && Reflect.get(error, 'code') === code;
}
