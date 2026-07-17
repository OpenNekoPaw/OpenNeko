/**
 * Variant Service
 *
 * Handles CRUD operations for asset variants.
 */

import type {
  AssetVariant,
  CreateVariantInput,
  UpdateVariantInput,
  MoveVariantInput,
  MoveVariantResult,
} from '@neko/shared';
import type { IAssetStorage } from '../storage/IAssetStorage';
import { generateVariantId } from './utils';

/**
 * Variant service for managing asset variants
 */
export class VariantService {
  constructor(private storage: IAssetStorage) {}

  /**
   * Add a variant to an entity
   */
  async add(entityId: string, input: CreateVariantInput): Promise<AssetVariant> {
    const entity = await this.storage.getEntity(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }

    const isFirstVariant = entity.variants.length === 0;

    const variant: AssetVariant = {
      id: generateVariantId(),
      entityId,
      name: input.name,
      attributes: input.attributes ?? {},
      files: [],
      thumbnailFileId: undefined,
      notes: input.notes,
      tags: input.tags,
      createdAt: Date.now(),
    };

    await this.storage.saveVariant(entityId, variant);

    // Set as default if it's the first variant
    if (isFirstVariant) {
      const updatedEntity = await this.storage.getEntity(entityId);
      if (updatedEntity) {
        updatedEntity.defaultVariantId = variant.id;
        await this.storage.saveEntity(updatedEntity);
      }
    }

    return variant;
  }

  /**
   * Get a variant by ID
   */
  async get(entityId: string, variantId: string): Promise<AssetVariant | null> {
    return this.storage.getVariant(entityId, variantId);
  }

  /**
   * Update a variant
   */
  async update(
    entityId: string,
    variantId: string,
    updates: UpdateVariantInput,
  ): Promise<AssetVariant> {
    const variant = await this.storage.getVariant(entityId, variantId);
    if (!variant) {
      throw new Error(`Variant not found: ${variantId}`);
    }

    if (updates.name !== undefined) {
      variant.name = updates.name;
    }
    if (updates.attributes !== undefined) {
      variant.attributes = { ...variant.attributes, ...updates.attributes };
    }
    if (updates.notes !== undefined) {
      variant.notes = updates.notes;
    }
    if (updates.tags !== undefined) {
      variant.tags = updates.tags;
    }
    if (updates.thumbnailFileId !== undefined) {
      // Validate file exists
      if (updates.thumbnailFileId !== null) {
        const file = variant.files.find((f) => f.id === updates.thumbnailFileId);
        if (!file) {
          throw new Error(`File not found: ${updates.thumbnailFileId}`);
        }
      }
      variant.thumbnailFileId = updates.thumbnailFileId ?? undefined;
    }
    if (updates.thumbnailPath !== undefined) {
      variant.thumbnailPath = updates.thumbnailPath ?? undefined;
    }

    await this.storage.saveVariant(entityId, variant);
    return variant;
  }

  /**
   * Delete a variant
   */
  async delete(entityId: string, variantId: string): Promise<boolean> {
    const entity = await this.storage.getEntity(entityId);
    if (!entity) {
      return false;
    }

    const result = await this.storage.deleteVariant(entityId, variantId);

    // Update default variant if deleted variant was default
    if (result && entity.defaultVariantId === variantId) {
      const updatedEntity = await this.storage.getEntity(entityId);
      if (updatedEntity && updatedEntity.variants.length > 0) {
        updatedEntity.defaultVariantId = updatedEntity.variants[0]?.id;
        await this.storage.saveEntity(updatedEntity);
      } else if (updatedEntity) {
        updatedEntity.defaultVariantId = undefined;
        await this.storage.saveEntity(updatedEntity);
      }
    }

    return result;
  }

  /**
   * Get all variants for an entity
   */
  async getAllForEntity(entityId: string): Promise<AssetVariant[]> {
    const entity = await this.storage.getEntity(entityId);
    if (!entity) {
      return [];
    }
    return entity.variants;
  }

  /**
   * Move a variant from one entity to another
   */
  async moveToEntity(input: MoveVariantInput): Promise<MoveVariantResult> {
    const { sourceEntityId, variantId, targetEntityId } = input;

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

    // Find the variant in source entity
    const variantIndex = sourceEntity.variants.findIndex((v) => v.id === variantId);
    if (variantIndex === -1) {
      throw new Error(`Variant ${variantId} not found in entity ${sourceEntityId}`);
    }

    // Remove variant from source
    const [variant] = sourceEntity.variants.splice(variantIndex, 1);
    if (!variant) {
      throw new Error(`Failed to remove variant: ${variantId}`);
    }

    // Update variant's entityId
    variant.entityId = targetEntityId;

    // Handle source entity's defaultVariantId
    if (sourceEntity.defaultVariantId === variantId) {
      sourceEntity.defaultVariantId = sourceEntity.variants[0]?.id;
    }

    // Add variant to target entity
    targetEntity.variants.push(variant);

    // Set as default if it's the first variant in target
    if (targetEntity.variants.length === 1) {
      targetEntity.defaultVariantId = variant.id;
    }

    // Update timestamps
    const now = Date.now();
    sourceEntity.updatedAt = now;
    targetEntity.updatedAt = now;

    // Check if source entity should be deleted (no variants left)
    const sourceEntityDeleted = sourceEntity.variants.length === 0;

    if (sourceEntityDeleted) {
      await this.storage.deleteEntity(sourceEntityId);
    } else {
      await this.storage.saveEntity(sourceEntity);
    }

    await this.storage.saveEntity(targetEntity);

    return {
      variant,
      sourceEntity: sourceEntityDeleted ? null : sourceEntity,
      targetEntity,
      sourceEntityDeleted,
    };
  }
}
