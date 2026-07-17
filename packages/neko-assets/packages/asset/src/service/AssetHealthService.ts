/**
 * Asset Health Service
 *
 * Validates file accessibility for all assets in the library.
 * Core library (zero vscode deps) — file system access is injected.
 */

import type { AssetFileStatus } from '@neko/shared';
import type { IAssetStorage } from '../storage/IAssetStorage';
import type { FileAccessChecker, FileHealthResult, HealthCheckProgress } from './types';

const DEFAULT_CONCURRENCY = 10;

export interface AssetHealthServiceConfig {
  /** Storage implementation */
  storage: IAssetStorage;
  /** Injected file access checker */
  fileAccessChecker: FileAccessChecker;
  /** Max concurrent checks (default: 10) */
  concurrency?: number;
}

export class AssetHealthService {
  private readonly storage: IAssetStorage;
  private readonly checker: FileAccessChecker;
  private readonly concurrency: number;

  constructor(config: AssetHealthServiceConfig) {
    this.storage = config.storage;
    this.checker = config.fileAccessChecker;
    this.concurrency = config.concurrency ?? DEFAULT_CONCURRENCY;
  }

  /**
   * Validate all files in the library.
   * Updates status field on each AssetFile and returns results.
   */
  async validateAll(onProgress?: HealthCheckProgress): Promise<FileHealthResult[]> {
    const entities = await this.storage.getAllEntities();
    const results: FileHealthResult[] = [];

    // Flatten all files with parent info
    const fileEntries: Array<{
      fileId: string;
      variantId: string;
      entityId: string;
      entityName: string;
      path: string;
      previousStatus?: AssetFileStatus;
    }> = [];

    for (const entity of entities) {
      for (const variant of entity.variants) {
        for (const file of variant.files) {
          fileEntries.push({
            fileId: file.id,
            variantId: variant.id,
            entityId: entity.id,
            entityName: entity.name,
            path: file.path,
            previousStatus: file.status,
          });
        }
      }
    }

    const total = fileEntries.length;
    if (total === 0) return [];

    // Process single entry and update storage
    const processEntry = async (entry: (typeof fileEntries)[number]): Promise<void> => {
      const status = await this.checker(entry.path);

      // Update file in storage
      const file = await this.storage.getFile(entry.variantId, entry.fileId);
      if (file) {
        file.status = status;
        file.lastCheckedAt = Date.now();
        await this.storage.saveFile(entry.variantId, file);
      }

      results.push({
        fileId: entry.fileId,
        variantId: entry.variantId,
        entityId: entry.entityId,
        entityName: entry.entityName,
        path: entry.path,
        status,
        previousStatus: entry.previousStatus,
      });

      onProgress?.(results.length, total);
    };

    // Correct concurrency pool: Set<Promise> + .finally() removal
    // Errors are collected so all in-flight tasks complete before rethrowing,
    // preventing orphaned tasks that still mutate results and call onProgress.
    const errors: unknown[] = [];

    const processEntrySafe = async (entry: (typeof fileEntries)[number]): Promise<void> => {
      try {
        await processEntry(entry);
      } catch (err) {
        errors.push(err);
      }
    };

    const active = new Set<Promise<void>>();
    for (const entry of fileEntries) {
      // NOTE: task! uses definite assignment assertion because the .finally() closure
      const task: Promise<void> = processEntrySafe(entry).then(
        () => {
          active.delete(task);
        },
        () => {
          active.delete(task);
        },
      );
      active.add(task);
      if (active.size >= this.concurrency) {
        await Promise.race(active);
      }
    }
    await Promise.all(active);

    if (errors.length > 0) {
      throw errors[0];
    }

    return results;
  }

  /**
   * Validate a single file and update its status.
   */
  async validateFile(variantId: string, fileId: string): Promise<FileHealthResult | null> {
    const file = await this.storage.getFile(variantId, fileId);
    if (!file) return null;

    // Find parent entity
    const entities = await this.storage.getAllEntities();
    let entityId = '';
    let entityName = '';
    for (const entity of entities) {
      const variant = entity.variants.find((v) => v.id === variantId);
      if (variant) {
        entityId = entity.id;
        entityName = entity.name;
        break;
      }
    }

    const previousStatus = file.status;
    const status = await this.checker(file.path);

    file.status = status;
    file.lastCheckedAt = Date.now();
    await this.storage.saveFile(variantId, file);

    return {
      fileId,
      variantId,
      entityId,
      entityName,
      path: file.path,
      status,
      previousStatus,
    };
  }

  /**
   * Relocate a file to a new path.
   * Validates new path, updates AssetFile.path and remap record.
   */
  async relocateFile(
    variantId: string,
    fileId: string,
    newPath: string,
  ): Promise<FileHealthResult | null> {
    const file = await this.storage.getFile(variantId, fileId);
    if (!file) return null;

    // Validate new path is accessible
    const newStatus = await this.checker(newPath);
    if (newStatus !== 'online') {
      throw new Error(`New path is not accessible: ${newPath}`);
    }

    // Find parent entity
    const entities = await this.storage.getAllEntities();
    let entityId = '';
    let entityName = '';
    for (const entity of entities) {
      const variant = entity.variants.find((v) => v.id === variantId);
      if (variant) {
        entityId = entity.id;
        entityName = entity.name;
        break;
      }
    }

    const previousStatus = file.status;
    const originalPath = file.path;

    // Update file
    file.remap = {
      originalPath,
      remappedPath: newPath,
      remappedAt: Date.now(),
    };
    file.path = newPath;
    file.status = 'remapped';
    file.lastCheckedAt = Date.now();
    await this.storage.saveFile(variantId, file);

    return {
      fileId,
      variantId,
      entityId,
      entityName,
      path: newPath,
      status: 'remapped',
      previousStatus,
    };
  }

  /**
   * Get summary counts by status.
   */
  async getSummary(): Promise<{
    total: number;
    online: number;
    offline: number;
    missing: number;
    remapped: number;
  }> {
    const entities = await this.storage.getAllEntities();
    const summary = { total: 0, online: 0, offline: 0, missing: 0, remapped: 0 };

    for (const entity of entities) {
      for (const variant of entity.variants) {
        for (const file of variant.files) {
          summary.total++;
          const status = file.status ?? 'online';
          summary[status]++;
        }
      }
    }

    return summary;
  }
}
