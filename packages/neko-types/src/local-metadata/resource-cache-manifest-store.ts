import {
  isResourceCacheManifest,
  type ResourceCacheEntry,
  type ResourceCacheManifest,
  type ResourceCacheManifestLoadOptions,
  type ResourceCacheManifestStore,
} from '../types/resource-cache';
import { LocalMetadataError, type LocalMetadataStore } from './contracts';
import type { LocalMetadataPartition } from './model';
import type { ResourceCacheMetadataRepository } from './repositories';

export interface LocalMetadataResourceCacheManifestStoreOptions {
  readonly metadataStore: LocalMetadataStore;
  readonly partition: LocalMetadataPartition;
  readonly projectRoot?: string;
  readonly now?: () => string;
}

export class LocalMetadataResourceCacheManifestStore implements ResourceCacheManifestStore {
  private readonly now: () => string;

  constructor(private readonly options: LocalMetadataResourceCacheManifestStoreOptions) {
    if (options.partition.domain !== 'resource-cache') {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'create-resource-cache-manifest-store',
        message: 'ResourceCache manifest store requires the resource-cache partition domain',
      });
    }
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async load(_options: ResourceCacheManifestLoadOptions = {}): Promise<ResourceCacheManifest> {
    return this.loadFrom(this.options.metadataStore.repositories.resourceCache);
  }

  async save(manifest: ResourceCacheManifest): Promise<void> {
    this.assertManifest(manifest);
    await this.options.metadataStore.repositories.resourceCache.replacePartition({
      partition: this.options.partition,
      entries: Object.values(manifest.entries),
      updatedAt: manifest.updatedAt,
    });
  }

  async update(
    operation: (
      manifest: ResourceCacheManifest,
    ) => ResourceCacheManifest | Promise<ResourceCacheManifest>,
  ): Promise<ResourceCacheManifest> {
    return this.options.metadataStore.transaction(
      {
        mode: 'cache-write',
        ownership: 'cache',
        operation: 'update-resource-cache-manifest',
      },
      async ({ repositories }) => {
        const current = await this.loadFrom(repositories.resourceCache);
        const updated = await operation(current);
        if (updated === current) return current;
        this.assertManifest(updated);
        await repositories.resourceCache.replacePartition({
          partition: this.options.partition,
          entries: Object.values(updated.entries),
          updatedAt: updated.updatedAt,
        });
        return updated;
      },
    );
  }

  invalidateCache(): void {}

  private async loadFrom(
    repository: ResourceCacheMetadataRepository,
  ): Promise<ResourceCacheManifest> {
    const entries = await repository.list(this.options.partition);
    const now = this.now();
    return {
      version: 1,
      ...(this.options.projectRoot ? { projectRoot: this.options.projectRoot } : {}),
      createdAt: earliestTimestamp(entries, 'createdAt') ?? now,
      updatedAt: latestTimestamp(entries, 'updatedAt') ?? now,
      entries: Object.fromEntries(entries.map((entry) => [entry.resource.id, entry])),
    };
  }

  private assertManifest(manifest: ResourceCacheManifest): void {
    if (!isResourceCacheManifest(manifest)) {
      throw new LocalMetadataError({
        code: 'metadata-transaction-failed',
        operation: 'persist-resource-cache-manifest',
        message: 'ResourceCache metadata projection is invalid',
      });
    }
  }
}

function earliestTimestamp(
  entries: readonly ResourceCacheEntry[],
  field: 'createdAt' | 'updatedAt',
): string | undefined {
  return entries.map((entry) => entry[field]).sort((left, right) => left.localeCompare(right))[0];
}

function latestTimestamp(
  entries: readonly ResourceCacheEntry[],
  field: 'createdAt' | 'updatedAt',
): string | undefined {
  return entries.map((entry) => entry[field]).sort((left, right) => right.localeCompare(left))[0];
}
