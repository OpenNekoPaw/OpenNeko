/**
 * VariantService Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VariantService } from '../../service/VariantService';
import { EntityService } from '../../service/EntityService';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import type { AssetEntity, CreateVariantInput } from '@neko/shared';

describe('VariantService', () => {
  let storage: InMemoryStorage;
  let entityService: EntityService;
  let variantService: VariantService;
  let testEntity: AssetEntity;

  beforeEach(async () => {
    storage = new InMemoryStorage();
    await storage.load();
    entityService = new EntityService(storage);
    variantService = new VariantService(storage);

    // Create a test entity
    testEntity = await entityService.create({
      name: 'Test Character',
      category: 'character',
    });
  });

  describe('add', () => {
    it('should add a variant to an entity', async () => {
      const input: CreateVariantInput = {
        name: 'Front View',
        attributes: { view: 'front' },
      };

      const variant = await variantService.add(testEntity.id, input);

      expect(variant.id).toBeDefined();
      expect(variant.id).toMatch(/^var_/);
      expect(variant.entityId).toBe(testEntity.id);
      expect(variant.name).toBe('Front View');
      expect(variant.attributes.view).toBe('front');
      expect(variant.files).toEqual([]);
    });

    it('should set first variant as default', async () => {
      await variantService.add(testEntity.id, { name: 'First' });

      const entity = await entityService.get(testEntity.id);

      expect(entity?.defaultVariantId).toBeDefined();
      expect(entity?.variants).toHaveLength(1);
      expect(entity?.defaultVariantId).toBe(entity?.variants[0]?.id);
    });

    it('should add variant with optional fields', async () => {
      const variant = await variantService.add(testEntity.id, {
        name: 'Happy Expression',
        attributes: {
          expression: 'happy',
          view: 'front',
        },
        notes: 'Use for positive scenes',
        tags: ['emotion', 'positive'],
      });

      expect(variant.notes).toBe('Use for positive scenes');
      expect(variant.tags).toEqual(['emotion', 'positive']);
      expect(variant.attributes.expression).toBe('happy');
    });

    it('should throw error for non-existent entity', async () => {
      await expect(variantService.add('non-existent', { name: 'Test' })).rejects.toThrow(
        'Entity not found',
      );
    });
  });

  describe('get', () => {
    it('should retrieve an existing variant', async () => {
      const created = await variantService.add(testEntity.id, {
        name: 'Test Variant',
      });

      const retrieved = await variantService.get(testEntity.id, created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test Variant');
    });

    it('should return null for non-existent variant', async () => {
      const retrieved = await variantService.get(testEntity.id, 'non-existent');
      expect(retrieved).toBeNull();
    });

    it('should return null for non-existent entity', async () => {
      const retrieved = await variantService.get('non-existent', 'variant-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('update', () => {
    it('should update variant name', async () => {
      const variant = await variantService.add(testEntity.id, {
        name: 'Original',
      });

      const updated = await variantService.update(testEntity.id, variant.id, { name: 'Updated' });

      expect(updated.name).toBe('Updated');
    });

    it('should update variant attributes', async () => {
      const variant = await variantService.add(testEntity.id, {
        name: 'Test',
        attributes: { view: 'front' },
      });

      const updated = await variantService.update(testEntity.id, variant.id, {
        attributes: { expression: 'happy' },
      });

      expect(updated.attributes.view).toBe('front');
      expect(updated.attributes.expression).toBe('happy');
    });

    it('should throw error for non-existent variant', async () => {
      await expect(
        variantService.update(testEntity.id, 'non-existent', { name: 'New' }),
      ).rejects.toThrow('Variant not found');
    });
  });

  describe('delete', () => {
    it('should delete a variant', async () => {
      const variant = await variantService.add(testEntity.id, {
        name: 'To Delete',
      });

      const result = await variantService.delete(testEntity.id, variant.id);

      expect(result).toBe(true);
      expect(await variantService.get(testEntity.id, variant.id)).toBeNull();
    });

    it('should update default variant when deleted', async () => {
      const v1 = await variantService.add(testEntity.id, { name: 'V1' });
      const v2 = await variantService.add(testEntity.id, { name: 'V2' });

      // V1 should be default
      let entity = await entityService.get(testEntity.id);
      expect(entity?.defaultVariantId).toBe(v1.id);

      // Delete V1
      await variantService.delete(testEntity.id, v1.id);

      // V2 should now be default
      entity = await entityService.get(testEntity.id);
      expect(entity?.defaultVariantId).toBe(v2.id);
    });

    it('should return false for non-existent variant', async () => {
      const result = await variantService.delete(testEntity.id, 'non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getAllForEntity', () => {
    it('should return all variants for an entity', async () => {
      await variantService.add(testEntity.id, { name: 'V1' });
      await variantService.add(testEntity.id, { name: 'V2' });
      await variantService.add(testEntity.id, { name: 'V3' });

      const variants = await variantService.getAllForEntity(testEntity.id);

      expect(variants).toHaveLength(3);
    });

    it('should return empty array for entity with no variants', async () => {
      const variants = await variantService.getAllForEntity(testEntity.id);
      expect(variants).toEqual([]);
    });

    it('should return empty array for non-existent entity', async () => {
      const variants = await variantService.getAllForEntity('non-existent');
      expect(variants).toEqual([]);
    });
  });
});
