/**
 * AssetLibrary Integration Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AssetLibrary } from '../../service/AssetLibrary';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import type { IAssetClassifier } from '../../classifier/IClassifier';
import type { ClassificationResult, SuggestedEntity } from '@neko/shared';

describe('AssetLibrary', () => {
  let storage: InMemoryStorage;
  let library: AssetLibrary;

  beforeEach(async () => {
    storage = new InMemoryStorage();
    library = new AssetLibrary({ storage });
    await library.initialize();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const newStorage = new InMemoryStorage();
      const newLibrary = new AssetLibrary({ storage: newStorage });

      expect(newStorage.isInitialized()).toBe(false);
      await newLibrary.initialize();
      expect(newStorage.isInitialized()).toBe(true);
    });

    it('should not re-initialize if already initialized', async () => {
      // storage is already initialized from beforeEach
      expect(storage.isInitialized()).toBe(true);
      await library.initialize(); // Should not throw
      expect(storage.isInitialized()).toBe(true);
    });
  });

  describe('entity operations', () => {
    it('should create and retrieve entity', async () => {
      const entity = await library.createEntity({
        name: 'Hero Character',
        category: 'character',
      });

      expect(entity.id).toBeDefined();
      expect(entity.name).toBe('Hero Character');
      expect(entity.category).toBe('character');

      const retrieved = await library.getEntity(entity.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(entity.id);
    });

    it('should get all entities', async () => {
      await library.createEntity({ name: 'Entity 1', category: 'character' });
      await library.createEntity({ name: 'Entity 2', category: 'object' });
      await library.createEntity({ name: 'Entity 3', category: 'environment' });

      const all = await library.getAllEntities();
      expect(all).toHaveLength(3);
    });

    it('should update entity', async () => {
      const entity = await library.createEntity({
        name: 'Original',
        category: 'object',
      });

      const updated = await library.updateEntity(entity.id, {
        name: 'Updated',
        tags: ['new-tag'],
      });

      expect(updated.name).toBe('Updated');
      expect(updated.tags).toContain('new-tag');
    });

    it('should delete entity', async () => {
      const entity = await library.createEntity({
        name: 'To Delete',
        category: 'object',
      });

      const result = await library.deleteEntity(entity.id);
      expect(result).toBe(true);

      const retrieved = await library.getEntity(entity.id);
      expect(retrieved).toBeNull();
    });

    it('should get entities by category', async () => {
      await library.createEntity({ name: 'Char 1', category: 'character' });
      await library.createEntity({ name: 'Char 2', category: 'character' });
      await library.createEntity({ name: 'Obj 1', category: 'object' });

      const characters = await library.getByCategory('character');
      expect(characters).toHaveLength(2);
      expect(characters.every((e) => e.category === 'character')).toBe(true);
    });

    it('should get entities by tags', async () => {
      await library.createEntity({
        name: 'Tagged 1',
        category: 'character',
        tags: ['hero', 'main'],
      });
      await library.createEntity({
        name: 'Tagged 2',
        category: 'character',
        tags: ['villain', 'main'],
      });

      const mainCharacters = await library.getByTags(['main']);
      expect(mainCharacters).toHaveLength(2);

      const heroes = await library.getByTags(['hero', 'main']);
      expect(heroes).toHaveLength(1);
      expect(heroes[0]?.name).toBe('Tagged 1');
    });

    it('should record usage', async () => {
      const entity = await library.createEntity({
        name: 'Usage Test',
        category: 'object',
      });

      expect(entity.usageCount).toBe(0);

      await library.recordUsage(entity.id);
      await library.recordUsage(entity.id);

      const updated = await library.getEntity(entity.id);
      expect(updated?.usageCount).toBe(2);
      expect(updated?.lastUsedAt).toBeDefined();
    });

    it('should get recent entities sorted by lastUsedAt', async () => {
      const e1 = await library.createEntity({ name: 'E1', category: 'object' });
      await new Promise((r) => setTimeout(r, 5));
      await library.createEntity({ name: 'E2', category: 'object' });
      await new Promise((r) => setTimeout(r, 5));
      const e3 = await library.createEntity({ name: 'E3', category: 'object' });

      // Wait to ensure recordUsage timestamps are after creation
      await new Promise((r) => setTimeout(r, 10));

      // Record usage: E3 first, then E1
      await library.recordUsage(e3.id);
      await new Promise((r) => setTimeout(r, 10));
      await library.recordUsage(e1.id);

      // Expected order: E1 (most recent use), E3 (second most recent use), E2 (by createdAt)
      const recent = await library.getRecent(3);
      expect(recent).toHaveLength(3);
      expect(recent[0]?.name).toBe('E1');
      expect(recent[1]?.name).toBe('E3');
    });
  });

  describe('variant operations', () => {
    it('should add and retrieve variant', async () => {
      const entity = await library.createEntity({
        name: 'Test Entity',
        category: 'character',
      });

      const variant = await library.addVariant(entity.id, {
        name: 'Front View',
        attributes: { view: 'front' },
      });

      expect(variant.id).toBeDefined();
      expect(variant.entityId).toBe(entity.id);
      expect(variant.name).toBe('Front View');

      const retrieved = await library.getVariant(entity.id, variant.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(variant.id);
    });

    it('should set first variant as default', async () => {
      const entity = await library.createEntity({
        name: 'Test Entity',
        category: 'character',
      });

      const variant = await library.addVariant(entity.id, { name: 'First' });

      const updatedEntity = await library.getEntity(entity.id);
      expect(updatedEntity?.defaultVariantId).toBe(variant.id);
    });

    it('should update variant', async () => {
      const entity = await library.createEntity({
        name: 'Test',
        category: 'character',
      });
      const variant = await library.addVariant(entity.id, { name: 'Original' });

      const updated = await library.updateVariant(entity.id, variant.id, {
        name: 'Updated',
        notes: 'Test notes',
      });

      expect(updated.name).toBe('Updated');
      expect(updated.notes).toBe('Test notes');
    });

    it('should delete variant', async () => {
      const entity = await library.createEntity({
        name: 'Test',
        category: 'character',
      });
      const variant = await library.addVariant(entity.id, { name: 'To Delete' });

      const result = await library.deleteVariant(entity.id, variant.id);
      expect(result).toBe(true);

      const retrieved = await library.getVariant(entity.id, variant.id);
      expect(retrieved).toBeNull();
    });
  });

  describe('file operations', () => {
    it('should add and remove file', async () => {
      const entity = await library.createEntity({
        name: 'Test',
        category: 'character',
      });
      const variant = await library.addVariant(entity.id, { name: 'Default' });

      const file = await library.addFile(variant.id, '/assets/hero.png');

      expect(file.id).toBeDefined();
      expect(file.variantId).toBe(variant.id);
      expect(file.mediaType).toBe('image');

      const removeResult = await library.removeFile(variant.id, file.id);
      expect(removeResult).toBe(true);
    });
  });

  describe('search operations', () => {
    beforeEach(async () => {
      await library.createEntity({
        name: 'Hero',
        category: 'character',
        tags: ['main', 'protagonist'],
      });
      await library.createEntity({
        name: 'Villain',
        category: 'character',
        tags: ['main', 'antagonist'],
      });
      await library.createEntity({
        name: 'Magic Sword',
        category: 'object',
        tags: ['weapon'],
      });
    });

    it('should search by keyword', async () => {
      const result = await library.search({ keyword: 'Hero' });
      expect(result.entities).toHaveLength(1);
      expect(result.entities[0]?.name).toBe('Hero');
    });

    it('should search by category', async () => {
      const result = await library.search({ categories: ['character'] });
      expect(result.entities).toHaveLength(2);
    });

    it('should search by tags', async () => {
      const result = await library.search({ tags: ['main'] });
      expect(result.entities).toHaveLength(2);
    });

    it('should get all tags', async () => {
      const tags = await library.getAllTags();
      expect(tags.length).toBeGreaterThan(0);

      const mainTag = tags.find((t) => t.tag === 'main');
      expect(mainTag).toBeDefined();
      expect(mainTag?.count).toBe(2);
    });
  });

  describe('import operations', () => {
    it('should import file with auto-created entity and variant', async () => {
      const result = await library.importFile('/assets/character/hero.png');

      expect(result.isNewEntity).toBe(true);
      expect(result.isNewVariant).toBe(true);
      expect(result.entity.name).toBe('hero');
      expect(result.file.path).toBe('/assets/character/hero.png');
    });

    it('should import file to existing entity', async () => {
      const entity = await library.createEntity({
        name: 'Existing',
        category: 'character',
      });

      const result = await library.importFile('/assets/new.png', {
        entityId: entity.id,
      });

      expect(result.isNewEntity).toBe(false);
      expect(result.isNewVariant).toBe(true);
      expect(result.entity.id).toBe(entity.id);
    });

    it('should import file to existing variant', async () => {
      const entity = await library.createEntity({
        name: 'Test',
        category: 'character',
      });
      const variant = await library.addVariant(entity.id, { name: 'Existing' });

      const result = await library.importFile('/assets/another.png', {
        entityId: entity.id,
        variantId: variant.id,
      });

      expect(result.isNewEntity).toBe(false);
      expect(result.isNewVariant).toBe(false);
      expect(result.variant.id).toBe(variant.id);
    });

    it('should import with custom entity input', async () => {
      const result = await library.importFile('/assets/custom.png', {
        entityInput: {
          name: 'Custom Name',
          category: 'effect',
          tags: ['custom-tag'],
        },
      });

      expect(result.entity.name).toBe('Custom Name');
      expect(result.entity.category).toBe('effect');
      expect(result.entity.tags).toContain('custom-tag');
    });

    it('should throw error for non-existent entity', async () => {
      await expect(
        library.importFile('/assets/file.png', { entityId: 'non-existent' }),
      ).rejects.toThrow('Entity not found');
    });

    it('should throw error for non-existent variant', async () => {
      const entity = await library.createEntity({
        name: 'Test',
        category: 'object',
      });

      await expect(
        library.importFile('/assets/file.png', {
          entityId: entity.id,
          variantId: 'non-existent',
        }),
      ).rejects.toThrow('Variant not found');
    });
  });

  describe('AI classification', () => {
    it('should return null when no classifier', async () => {
      const result = await library.classifyFile('/assets/test.png');
      expect(result).toBeNull();
    });

    it('should return empty array for similar entities without classifier', async () => {
      const result = await library.findSimilarEntities('/assets/test.png');
      expect(result).toEqual([]);
    });

    it('should return empty array for suggested tags without classifier', async () => {
      const result = await library.suggestTags('/assets/test.png');
      expect(result).toEqual([]);
    });

    it('should use classifier when available', async () => {
      // Create a mock entity for similar entities result
      const mockEntity = await library.createEntity({
        name: 'Similar Entity',
        category: 'character',
      });

      const mockClassifier: IAssetClassifier = {
        analyze: async (): Promise<ClassificationResult> => ({
          suggestedCategory: 'character',
          suggestedName: 'Hero',
          suggestedTags: ['protagonist', 'main'],
          confidence: 0.9,
          detectedAttributes: {},
          description: 'A heroic character',
        }),
        findSimilarEntities: async (): Promise<SuggestedEntity[]> => [
          {
            entity: mockEntity,
            similarity: 0.95,
            matchType: 'visual',
          },
        ],
        suggestTags: async (): Promise<string[]> => ['tag1', 'tag2'],
        suggestVariantAttributes: async () => ({}),
      };

      const libraryWithClassifier = new AssetLibrary({
        storage,
        classifier: mockClassifier,
      });

      const classification = await libraryWithClassifier.classifyFile('/assets/test.png');
      expect(classification?.suggestedCategory).toBe('character');
      expect(classification?.suggestedName).toBe('Hero');

      const similar = await libraryWithClassifier.findSimilarEntities('/assets/test.png');
      expect(similar).toHaveLength(1);
      expect(similar[0]?.entity.name).toBe('Similar Entity');

      const tags = await libraryWithClassifier.suggestTags('/assets/test.png');
      expect(tags).toEqual(['tag1', 'tag2']);
    });

    it('should auto-classify on import when requested', async () => {
      const mockClassifier: IAssetClassifier = {
        analyze: async (): Promise<ClassificationResult> => ({
          suggestedCategory: 'effect',
          suggestedName: 'Fire Effect',
          suggestedTags: ['fire', 'vfx'],
          confidence: 0.85,
          detectedAttributes: {},
          description: 'A fire effect',
        }),
        findSimilarEntities: async () => [],
        suggestTags: async () => [],
        suggestVariantAttributes: async () => ({}),
      };

      const libraryWithClassifier = new AssetLibrary({
        storage: new InMemoryStorage(),
        classifier: mockClassifier,
      });
      await libraryWithClassifier.initialize();

      const result = await libraryWithClassifier.importFile('/assets/fire.png', {
        autoClassify: true,
      });

      expect(result.classification).toBeDefined();
      expect(result.entity.name).toBe('Fire Effect');
      expect(result.entity.category).toBe('effect');
      expect(result.entity.tags).toContain('fire');
    });
  });

  describe('flush', () => {
    it('should flush changes to storage', async () => {
      await library.createEntity({ name: 'Test', category: 'object' });
      await library.flush();
      // Should not throw
    });
  });
});
