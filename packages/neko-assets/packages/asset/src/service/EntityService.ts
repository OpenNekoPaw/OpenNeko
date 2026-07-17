/**
 * Entity Service
 *
 * Handles CRUD operations for asset entities.
 */

import type {
  AssetEntity,
  CreateEntityInput,
  UpdateEntityInput,
  EntityCategory,
  EntityMetadata,
  MergeEntitiesInput,
  MergeEntitiesResult,
} from '@neko/shared';
import type { IAssetStorage } from '../storage/IAssetStorage';
import { generateEntityId } from './utils';

/**
 * Entity service for managing asset entities
 */
export class EntityService {
  constructor(private storage: IAssetStorage) {}

  /**
   * Create a new entity
   */
  async create(input: CreateEntityInput): Promise<AssetEntity> {
    const now = Date.now();

    const entity: AssetEntity = {
      id: generateEntityId(),
      name: input.name,
      category: input.category,
      description: input.description,
      metadata: input.metadata ?? {},
      variants: [],
      defaultVariantId: undefined,
      tags: input.tags ?? [],
      aliases: input.aliases,
      usageCount: 0,
      lastUsedAt: undefined,
      createdAt: now,
      updatedAt: now,
      ownership: input.ownership ?? { scope: 'project', access: 'editable' },
    };

    await this.storage.saveEntity(entity);
    return entity;
  }

  /**
   * Get entity by ID
   */
  async get(id: string): Promise<AssetEntity | null> {
    return this.storage.getEntity(id);
  }

  /**
   * Get all entities
   */
  async getAll(): Promise<AssetEntity[]> {
    return this.storage.getAllEntities();
  }

  /**
   * Update an entity
   */
  async update(id: string, updates: UpdateEntityInput): Promise<AssetEntity> {
    const entity = await this.storage.getEntity(id);
    if (!entity) {
      throw new Error(`Entity not found: ${id}`);
    }

    // Apply updates
    if (updates.name !== undefined) {
      entity.name = updates.name;
    }
    if (updates.category !== undefined) {
      entity.category = updates.category;
    }
    if (updates.description !== undefined) {
      entity.description = updates.description;
    }
    if (updates.metadata !== undefined) {
      // Deep merge metadata
      entity.metadata = this.deepMergeMetadata(entity.metadata, updates.metadata);
    }
    if (updates.tags !== undefined) {
      entity.tags = updates.tags;
    }
    if (updates.aliases !== undefined) {
      entity.aliases = updates.aliases;
    }
    if (updates.ownership !== undefined) {
      entity.ownership = updates.ownership;
    }
    if (updates.defaultVariantId !== undefined) {
      // Validate that the variant exists
      if (updates.defaultVariantId !== null) {
        const variant = entity.variants.find((v) => v.id === updates.defaultVariantId);
        if (!variant) {
          throw new Error(`Variant not found: ${updates.defaultVariantId}`);
        }
      }
      entity.defaultVariantId = updates.defaultVariantId ?? undefined;
    }

    entity.updatedAt = Date.now();
    await this.storage.saveEntity(entity);
    return entity;
  }

  /**
   * Delete an entity
   */
  async delete(id: string): Promise<boolean> {
    return this.storage.deleteEntity(id);
  }

  /**
   * Get entities by category
   */
  async getByCategory(category: EntityCategory): Promise<AssetEntity[]> {
    const all = await this.storage.getAllEntities();
    return all.filter((e) => e.category === category);
  }

  /**
   * Get entities by tags (all tags must match)
   */
  async getByTags(tags: string[]): Promise<AssetEntity[]> {
    const all = await this.storage.getAllEntities();
    return all.filter((e) => tags.every((tag) => e.tags.includes(tag)));
  }

  /**
   * Get recent entities
   */
  async getRecent(limit: number = 10): Promise<AssetEntity[]> {
    const all = await this.storage.getAllEntities();
    return all
      .sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt))
      .slice(0, limit);
  }

  /**
   * Record usage of an entity
   */
  async recordUsage(id: string): Promise<AssetEntity> {
    const entity = await this.storage.getEntity(id);
    if (!entity) {
      throw new Error(`Entity not found: ${id}`);
    }

    entity.usageCount += 1;
    entity.lastUsedAt = Date.now();
    entity.updatedAt = Date.now();

    await this.storage.saveEntity(entity);
    return entity;
  }

  /**
   * Add tags to an entity
   */
  async addTags(id: string, tags: string[]): Promise<AssetEntity> {
    const entity = await this.storage.getEntity(id);
    if (!entity) {
      throw new Error(`Entity not found: ${id}`);
    }

    const newTags = tags.filter((t) => !entity.tags.includes(t));
    if (newTags.length > 0) {
      entity.tags.push(...newTags);
      entity.updatedAt = Date.now();
      await this.storage.saveEntity(entity);
    }

    return entity;
  }

  /**
   * Remove tags from an entity
   */
  async removeTags(id: string, tags: string[]): Promise<AssetEntity> {
    const entity = await this.storage.getEntity(id);
    if (!entity) {
      throw new Error(`Entity not found: ${id}`);
    }

    const originalLength = entity.tags.length;
    entity.tags = entity.tags.filter((t) => !tags.includes(t));

    if (entity.tags.length !== originalLength) {
      entity.updatedAt = Date.now();
      await this.storage.saveEntity(entity);
    }

    return entity;
  }

  /**
   * Merge two entities - moves all variants from source to target and deletes source
   */
  async merge(input: MergeEntitiesInput): Promise<MergeEntitiesResult> {
    const { sourceEntityId, targetEntityId, mergeTags = true, mergeAliases = true } = input;

    // Validate same entity case
    if (sourceEntityId === targetEntityId) {
      throw new Error('Source and target entity cannot be the same');
    }

    // Get source entity
    const sourceEntity = await this.storage.getEntity(sourceEntityId);
    if (!sourceEntity) {
      throw new Error(`Source entity not found: ${sourceEntityId}`);
    }

    // Get target entity
    const targetEntity = await this.storage.getEntity(targetEntityId);
    if (!targetEntity) {
      throw new Error(`Target entity not found: ${targetEntityId}`);
    }

    // Move all variants from source to target
    const variantsMoved = sourceEntity.variants.length;
    for (const variant of sourceEntity.variants) {
      variant.entityId = targetEntityId;
      targetEntity.variants.push(variant);
    }

    // Set default variant if target had none
    if (!targetEntity.defaultVariantId && targetEntity.variants.length > 0) {
      targetEntity.defaultVariantId = targetEntity.variants[0]?.id;
    }

    // Merge tags
    const tagsMerged: string[] = [];
    if (mergeTags) {
      for (const tag of sourceEntity.tags) {
        if (!targetEntity.tags.includes(tag)) {
          targetEntity.tags.push(tag);
          tagsMerged.push(tag);
        }
      }
    }

    // Merge aliases
    const aliasesMerged: string[] = [];
    if (mergeAliases && sourceEntity.aliases) {
      if (!targetEntity.aliases) {
        targetEntity.aliases = [];
      }
      for (const alias of sourceEntity.aliases) {
        if (!targetEntity.aliases.includes(alias)) {
          targetEntity.aliases.push(alias);
          aliasesMerged.push(alias);
        }
      }
      // Also add source entity's name as alias
      if (!targetEntity.aliases.includes(sourceEntity.name)) {
        targetEntity.aliases.push(sourceEntity.name);
        aliasesMerged.push(sourceEntity.name);
      }
    }

    // Update timestamp
    targetEntity.updatedAt = Date.now();

    // Delete source entity and save target
    await this.storage.deleteEntity(sourceEntityId);
    await this.storage.saveEntity(targetEntity);

    return {
      entity: targetEntity,
      variantsMoved,
      tagsMerged,
      aliasesMerged,
    };
  }

  /**
   * Deep merge metadata objects
   */
  private deepMergeMetadata(target: EntityMetadata, source: EntityMetadata): EntityMetadata {
    const result: Record<string, unknown> = { ...target };

    for (const key of Object.keys(source) as Array<keyof EntityMetadata>) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (this.isPlainObject(sourceValue) && this.isPlainObject(targetValue)) {
        result[key] = {
          ...targetValue,
          ...sourceValue,
        };
      } else if (sourceValue !== undefined) {
        result[key] = sourceValue;
      }
    }

    return result as EntityMetadata;
  }

  /**
   * Check if value is a plain object
   */
  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
