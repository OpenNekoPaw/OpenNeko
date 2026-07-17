/**
 * EntityService Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EntityService } from '../../service/EntityService';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import type { CreateEntityInput } from '@neko/shared';

describe('EntityService', () => {
  let storage: InMemoryStorage;
  let service: EntityService;

  beforeEach(async () => {
    storage = new InMemoryStorage();
    await storage.load();
    service = new EntityService(storage);
  });

  describe('create', () => {
    it('should create an entity with required fields', async () => {
      const input: CreateEntityInput = {
        name: 'Hero',
        category: 'character',
      };

      const entity = await service.create(input);

      expect(entity.id).toBeDefined();
      expect(entity.id).toMatch(/^ent_/);
      expect(entity.name).toBe('Hero');
      expect(entity.category).toBe('character');
      expect(entity.variants).toEqual([]);
      expect(entity.tags).toEqual([]);
      expect(entity.usageCount).toBe(0);
      expect(entity.createdAt).toBeDefined();
      expect(entity.updatedAt).toBeDefined();
    });

    it('should create an entity with optional fields', async () => {
      const input: CreateEntityInput = {
        name: 'Magic Sword',
        category: 'object',
        description: 'A legendary sword',
        tags: ['weapon', 'magic', 'legendary'],
        aliases: ['Excalibur', 'Holy Sword'],
        metadata: {
          object: {
            material: 'steel',
            size: 'medium',
          },
        },
      };

      const entity = await service.create(input);

      expect(entity.description).toBe('A legendary sword');
      expect(entity.tags).toEqual(['weapon', 'magic', 'legendary']);
      expect(entity.aliases).toEqual(['Excalibur', 'Holy Sword']);
      expect(entity.metadata.object?.material).toBe('steel');
    });
  });

  describe('get', () => {
    it('should retrieve an existing entity', async () => {
      const created = await service.create({
        name: 'Test Entity',
        category: 'object',
      });

      const retrieved = await service.get(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe('Test Entity');
    });

    it('should return null for non-existent entity', async () => {
      const retrieved = await service.get('non-existent-id');
      expect(retrieved).toBeNull();
    });
  });

  describe('getAll', () => {
    it('should return all entities', async () => {
      await service.create({ name: 'Entity 1', category: 'character' });
      await service.create({ name: 'Entity 2', category: 'object' });
      await service.create({ name: 'Entity 3', category: 'environment' });

      const all = await service.getAll();

      expect(all).toHaveLength(3);
    });

    it('should return empty array when no entities', async () => {
      const all = await service.getAll();
      expect(all).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update entity name', async () => {
      const entity = await service.create({
        name: 'Original Name',
        category: 'character',
      });

      // Wait a bit to ensure different timestamp
      await new Promise((r) => setTimeout(r, 5));

      const updated = await service.update(entity.id, {
        name: 'Updated Name',
      });

      expect(updated.name).toBe('Updated Name');
      expect(updated.updatedAt).toBeGreaterThanOrEqual(entity.createdAt);
    });

    it('should update entity category', async () => {
      const entity = await service.create({
        name: 'Test',
        category: 'object',
      });

      const updated = await service.update(entity.id, {
        category: 'character',
      });

      expect(updated.category).toBe('character');
    });

    it('should update entity tags', async () => {
      const entity = await service.create({
        name: 'Test',
        category: 'object',
        tags: ['old-tag'],
      });

      const updated = await service.update(entity.id, {
        tags: ['new-tag-1', 'new-tag-2'],
      });

      expect(updated.tags).toEqual(['new-tag-1', 'new-tag-2']);
    });

    it('should merge metadata', async () => {
      const entity = await service.create({
        name: 'Character',
        category: 'character',
        metadata: {
          character: { role: 'protagonist' },
        },
      });

      const updated = await service.update(entity.id, {
        metadata: {
          character: { gender: 'female' },
        },
      });

      expect(updated.metadata.character?.role).toBe('protagonist');
      expect(updated.metadata.character?.gender).toBe('female');
    });

    it('should throw error for non-existent entity', async () => {
      await expect(service.update('non-existent', { name: 'New Name' })).rejects.toThrow(
        'Entity not found',
      );
    });
  });

  describe('delete', () => {
    it('should delete an existing entity', async () => {
      const entity = await service.create({
        name: 'To Delete',
        category: 'object',
      });

      const result = await service.delete(entity.id);

      expect(result).toBe(true);
      expect(await service.get(entity.id)).toBeNull();
    });

    it('should return false for non-existent entity', async () => {
      const result = await service.delete('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getByCategory', () => {
    beforeEach(async () => {
      await service.create({ name: 'Hero', category: 'character' });
      await service.create({ name: 'Villain', category: 'character' });
      await service.create({ name: 'Sword', category: 'object' });
      await service.create({ name: 'Forest', category: 'environment' });
    });

    it('should return entities of specified category', async () => {
      const characters = await service.getByCategory('character');

      expect(characters).toHaveLength(2);
      expect(characters.every((e) => e.category === 'character')).toBe(true);
    });

    it('should return empty array for category with no entities', async () => {
      const effects = await service.getByCategory('effect');
      expect(effects).toEqual([]);
    });
  });

  describe('getByTags', () => {
    beforeEach(async () => {
      await service.create({
        name: 'Hero',
        category: 'character',
        tags: ['main', 'hero', 'good'],
      });
      await service.create({
        name: 'Villain',
        category: 'character',
        tags: ['main', 'villain', 'evil'],
      });
      await service.create({
        name: 'NPC',
        category: 'character',
        tags: ['npc', 'good'],
      });
    });

    it('should return entities with all specified tags', async () => {
      const entities = await service.getByTags(['main', 'hero']);

      expect(entities).toHaveLength(1);
      expect(entities[0]?.name).toBe('Hero');
    });

    it('should return entities matching single tag', async () => {
      const entities = await service.getByTags(['good']);

      expect(entities).toHaveLength(2);
    });

    it('should return empty array when no match', async () => {
      const entities = await service.getByTags(['nonexistent']);
      expect(entities).toEqual([]);
    });
  });

  describe('getRecent', () => {
    it('should return recent entities sorted by last used', async () => {
      const e1 = await service.create({ name: 'E1', category: 'object' });
      const e2 = await service.create({ name: 'E2', category: 'object' });
      const e3 = await service.create({ name: 'E3', category: 'object' });

      // Record usage to update lastUsedAt
      await service.recordUsage(e2.id);
      await new Promise((r) => setTimeout(r, 10));
      await service.recordUsage(e1.id);

      const recent = await service.getRecent(2);

      expect(recent).toHaveLength(2);
      expect(recent[0]?.name).toBe('E1'); // Most recently used
      expect(recent[1]?.name).toBe('E2');
    });

    it('should limit results', async () => {
      await service.create({ name: 'E1', category: 'object' });
      await service.create({ name: 'E2', category: 'object' });
      await service.create({ name: 'E3', category: 'object' });

      const recent = await service.getRecent(2);

      expect(recent).toHaveLength(2);
    });
  });

  describe('recordUsage', () => {
    it('should increment usage count', async () => {
      const entity = await service.create({
        name: 'Test',
        category: 'object',
      });

      expect(entity.usageCount).toBe(0);

      await service.recordUsage(entity.id);
      await service.recordUsage(entity.id);
      await service.recordUsage(entity.id);

      const updated = await service.get(entity.id);

      expect(updated?.usageCount).toBe(3);
    });

    it('should update lastUsedAt', async () => {
      const entity = await service.create({
        name: 'Test',
        category: 'object',
      });

      expect(entity.lastUsedAt).toBeUndefined();

      const updated = await service.recordUsage(entity.id);

      expect(updated.lastUsedAt).toBeDefined();
      expect(updated.lastUsedAt).toBeGreaterThan(0);
    });
  });

  describe('addTags / removeTags', () => {
    it('should add new tags', async () => {
      const entity = await service.create({
        name: 'Test',
        category: 'object',
        tags: ['existing'],
      });

      const updated = await service.addTags(entity.id, ['new1', 'new2']);

      expect(updated.tags).toContain('existing');
      expect(updated.tags).toContain('new1');
      expect(updated.tags).toContain('new2');
    });

    it('should not duplicate existing tags', async () => {
      const entity = await service.create({
        name: 'Test',
        category: 'object',
        tags: ['tag1'],
      });

      const updated = await service.addTags(entity.id, ['tag1', 'tag2']);

      expect(updated.tags).toEqual(['tag1', 'tag2']);
    });

    it('should remove tags', async () => {
      const entity = await service.create({
        name: 'Test',
        category: 'object',
        tags: ['keep', 'remove1', 'remove2'],
      });

      const updated = await service.removeTags(entity.id, ['remove1', 'remove2']);

      expect(updated.tags).toEqual(['keep']);
    });
  });
});
