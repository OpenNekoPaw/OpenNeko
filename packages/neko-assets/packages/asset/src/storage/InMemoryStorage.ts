/**
 * In-Memory Asset Storage
 *
 * In-memory implementation of IAssetStorage for testing purposes.
 */

import type { AssetEntity, AssetFile, AssetVariant, AssetQuery, SearchResult } from '@neko/shared';
import type {
  IAssetStorageWithEvents,
  StorageEventListener,
  StorageEventType,
} from './IAssetStorage';
import { getLogger } from '../utils/logger';

const logger = getLogger('InMemoryStorage');

/**
 * In-memory storage implementation
 */
export class InMemoryStorage implements IAssetStorageWithEvents {
  private entities: Map<string, AssetEntity> = new Map();
  private listeners: Set<StorageEventListener> = new Set();
  private initialized = false;

  // =========================================================================
  // Entity Operations
  // =========================================================================

  async getEntity(id: string): Promise<AssetEntity | null> {
    return this.entities.get(id) ?? null;
  }

  async getAllEntities(): Promise<AssetEntity[]> {
    return Array.from(this.entities.values());
  }

  async saveEntity(entity: AssetEntity): Promise<void> {
    const isNew = !this.entities.has(entity.id);
    this.entities.set(entity.id, { ...entity });
    this.emit({
      type: isNew ? 'entity:created' : 'entity:updated',
      entityId: entity.id,
    });
  }

  async deleteEntity(id: string): Promise<boolean> {
    const existed = this.entities.delete(id);
    if (existed) {
      this.emit({ type: 'entity:deleted', entityId: id });
    }
    return existed;
  }

  // =========================================================================
  // Variant Operations
  // =========================================================================

  async getVariant(entityId: string, variantId: string): Promise<AssetVariant | null> {
    const entity = this.entities.get(entityId);
    if (!entity) return null;
    return entity.variants.find((v) => v.id === variantId) ?? null;
  }

  async saveVariant(entityId: string, variant: AssetVariant): Promise<void> {
    const entity = this.entities.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const index = entity.variants.findIndex((v) => v.id === variant.id);
    const isNew = index === -1;

    if (isNew) {
      entity.variants.push({ ...variant });
    } else {
      entity.variants[index] = { ...variant };
    }

    entity.updatedAt = Date.now();
    this.entities.set(entityId, entity);

    this.emit({
      type: isNew ? 'variant:created' : 'variant:updated',
      entityId,
      variantId: variant.id,
    });
  }

  async deleteVariant(entityId: string, variantId: string): Promise<boolean> {
    const entity = this.entities.get(entityId);
    if (!entity) return false;

    const index = entity.variants.findIndex((v) => v.id === variantId);
    if (index === -1) return false;

    entity.variants.splice(index, 1);
    entity.updatedAt = Date.now();
    this.entities.set(entityId, entity);

    this.emit({ type: 'variant:deleted', entityId, variantId });
    return true;
  }

  // =========================================================================
  // File Operations
  // =========================================================================

  async getFile(variantId: string, fileId: string): Promise<AssetFile | null> {
    for (const entity of this.entities.values()) {
      const variant = entity.variants.find((v) => v.id === variantId);
      if (variant) {
        return variant.files.find((f) => f.id === fileId) ?? null;
      }
    }
    return null;
  }

  async saveFile(variantId: string, file: AssetFile): Promise<void> {
    for (const entity of this.entities.values()) {
      const variantIndex = entity.variants.findIndex((v) => v.id === variantId);
      if (variantIndex !== -1) {
        const variant = entity.variants[variantIndex];
        if (!variant) continue;

        const fileIndex = variant.files.findIndex((f) => f.id === file.id);
        const isNew = fileIndex === -1;

        if (isNew) {
          variant.files.push({ ...file });
        } else {
          variant.files[fileIndex] = { ...file };
        }

        entity.updatedAt = Date.now();
        this.entities.set(entity.id, entity);

        this.emit({
          type: 'file:created',
          entityId: entity.id,
          variantId,
          fileId: file.id,
        });
        return;
      }
    }
    throw new Error(`Variant not found: ${variantId}`);
  }

  async deleteFile(variantId: string, fileId: string): Promise<boolean> {
    for (const entity of this.entities.values()) {
      const variant = entity.variants.find((v) => v.id === variantId);
      if (variant) {
        const index = variant.files.findIndex((f) => f.id === fileId);
        if (index === -1) return false;

        variant.files.splice(index, 1);
        entity.updatedAt = Date.now();
        this.entities.set(entity.id, entity);

        this.emit({
          type: 'file:deleted',
          entityId: entity.id,
          variantId,
          fileId,
        });
        return true;
      }
    }
    return false;
  }

  // =========================================================================
  // Search Operations
  // =========================================================================

  async search(query: AssetQuery): Promise<SearchResult> {
    let results = Array.from(this.entities.values());

    // Filter by keyword
    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      results = results.filter(
        (e) =>
          e.name.toLowerCase().includes(keyword) ||
          e.description?.toLowerCase().includes(keyword) ||
          e.tags.some((t) => t.toLowerCase().includes(keyword)) ||
          e.aliases?.some((a) => a.toLowerCase().includes(keyword)),
      );
    }

    // Filter by categories
    if (query.categories && query.categories.length > 0) {
      results = results.filter((e) => query.categories!.includes(e.category));
    }

    // Filter by tags (AND logic)
    if (query.tags && query.tags.length > 0) {
      results = results.filter((e) => query.tags!.every((tag) => e.tags.includes(tag)));
    }

    // Filter by any tags (OR logic)
    if (query.anyTags && query.anyTags.length > 0) {
      results = results.filter((e) => query.anyTags!.some((tag) => e.tags.includes(tag)));
    }

    // Filter by source types
    if (query.sourceTypes && query.sourceTypes.length > 0) {
      results = results.filter(
        (e) => e.metadata.source?.type && query.sourceTypes!.includes(e.metadata.source.type),
      );
    }

    // Filter by date ranges
    if (query.createdAfter) {
      results = results.filter((e) => e.createdAt >= query.createdAfter!);
    }
    if (query.createdBefore) {
      results = results.filter((e) => e.createdAt <= query.createdBefore!);
    }
    if (query.usedAfter) {
      results = results.filter((e) => e.lastUsedAt && e.lastUsedAt >= query.usedAfter!);
    }
    if (query.usedBefore) {
      results = results.filter((e) => e.lastUsedAt && e.lastUsedAt <= query.usedBefore!);
    }

    // Filter by usage count
    if (query.minUsageCount !== undefined) {
      results = results.filter((e) => e.usageCount >= query.minUsageCount!);
    }

    // Filter by variant attributes
    if (query.variantAttributes) {
      const attrs = query.variantAttributes;
      results = results.filter((e) => {
        // Check if any variant matches the attribute filters
        return e.variants.some((v) => {
          // Check view filter
          if (attrs.views && attrs.views.length > 0) {
            if (!v.attributes.view || !attrs.views.includes(v.attributes.view)) {
              return false;
            }
          }
          // Check expression filter
          if (attrs.expressions && attrs.expressions.length > 0) {
            if (!v.attributes.expression || !attrs.expressions.includes(v.attributes.expression)) {
              return false;
            }
          }
          // Check action filter
          if (attrs.actions && attrs.actions.length > 0) {
            if (!v.attributes.action || !attrs.actions.includes(v.attributes.action)) {
              return false;
            }
          }
          // Check outfit filter
          if (attrs.outfits && attrs.outfits.length > 0) {
            if (!v.attributes.outfit || !attrs.outfits.includes(v.attributes.outfit)) {
              return false;
            }
          }
          return true;
        });
      });
    }

    const total = results.length;

    // Sort
    const sortField = query.sortBy ?? 'createdAt';
    const sortDir = query.sortDirection ?? 'desc';
    results.sort((a, b) => {
      let aVal: string | number | undefined;
      let bVal: string | number | undefined;

      switch (sortField) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'createdAt':
          aVal = a.createdAt;
          bVal = b.createdAt;
          break;
        case 'updatedAt':
          aVal = a.updatedAt;
          bVal = b.updatedAt;
          break;
        case 'usageCount':
          aVal = a.usageCount;
          bVal = b.usageCount;
          break;
        case 'lastUsedAt':
          aVal = a.lastUsedAt ?? 0;
          bVal = b.lastUsedAt ?? 0;
          break;
      }

      if (aVal === undefined || bVal === undefined) return 0;
      if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    // Pagination
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 50;
    const paginated = results.slice(offset, offset + limit);

    return {
      entities: paginated,
      total,
      query,
      hasMore: offset + limit < total,
    };
  }

  async getAllTags(): Promise<Array<{ tag: string; count: number }>> {
    const tagCounts = new Map<string, number>();

    for (const entity of this.entities.values()) {
      for (const tag of entity.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
      }
    }

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  // =========================================================================
  // Persistence (no-op for in-memory)
  // =========================================================================

  async flush(): Promise<void> {
    this.emit({ type: 'storage:flushed' });
  }

  async load(): Promise<void> {
    this.initialized = true;
    this.emit({ type: 'storage:loaded' });
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // =========================================================================
  // Events
  // =========================================================================

  addEventListener(listener: StorageEventListener): void {
    this.listeners.add(listener);
  }

  removeEventListener(listener: StorageEventListener): void {
    this.listeners.delete(listener);
  }

  private emit(event: {
    type: StorageEventType;
    entityId?: string;
    variantId?: string;
    fileId?: string;
  }): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        logger.error('Storage event listener error:', e);
      }
    }
  }

  // =========================================================================
  // Test Helpers
  // =========================================================================

  /**
   * Clear all data (for testing)
   */
  clear(): void {
    this.entities.clear();
  }

  /**
   * Get entity count (for testing)
   */
  getEntityCount(): number {
    return this.entities.size;
  }
}
