/**
 * InMemoryStorage Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import type { AssetEntity, CreateEntityInput } from '@neko/shared';

describe('InMemoryStorage', () => {
  let storage: InMemoryStorage;

  beforeEach(async () => {
    storage = new InMemoryStorage();
    await storage.load();
  });

  describe('Entity Operations', () => {
    it('should save and retrieve an entity', async () => {
      const entity: AssetEntity = {
        id: 'test-entity-1',
        name: 'Test Character',
        category: 'character',
        description: 'A test character',
        metadata: {},
        variants: [],
        tags: ['test', 'character'],
        usageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.saveEntity(entity);
      const retrieved = await storage.getEntity('test-entity-1');

      expect(retrieved).not.toBeNull();
      expect(retrieved?.name).toBe('Test Character');
      expect(retrieved?.category).toBe('character');
    });

    it('should return null for non-existent entity', async () => {
      const retrieved = await storage.getEntity('non-existent');
      expect(retrieved).toBeNull();
    });

    it('should delete an entity', async () => {
      const entity: AssetEntity = {
        id: 'test-entity-2',
        name: 'To Delete',
        category: 'object',
        metadata: {},
        variants: [],
        tags: [],
        usageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.saveEntity(entity);
      expect(await storage.getEntity('test-entity-2')).not.toBeNull();

      const deleted = await storage.deleteEntity('test-entity-2');
      expect(deleted).toBe(true);
      expect(await storage.getEntity('test-entity-2')).toBeNull();
    });

    it('should return false when deleting non-existent entity', async () => {
      const deleted = await storage.deleteEntity('non-existent');
      expect(deleted).toBe(false);
    });

    it('should get all entities', async () => {
      const entity1: AssetEntity = {
        id: 'entity-1',
        name: 'Entity 1',
        category: 'character',
        metadata: {},
        variants: [],
        tags: [],
        usageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const entity2: AssetEntity = {
        id: 'entity-2',
        name: 'Entity 2',
        category: 'object',
        metadata: {},
        variants: [],
        tags: [],
        usageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.saveEntity(entity1);
      await storage.saveEntity(entity2);

      const all = await storage.getAllEntities();
      expect(all).toHaveLength(2);
    });
  });

  describe('Search Operations', () => {
    beforeEach(async () => {
      // Create test entities
      const entities: AssetEntity[] = [
        {
          id: 'char-1',
          name: 'Hero Character',
          category: 'character',
          description: 'The main hero',
          metadata: { source: { type: 'manual' } },
          variants: [],
          tags: ['hero', 'main'],
          usageCount: 10,
          lastUsedAt: Date.now() - 1000,
          createdAt: Date.now() - 10000,
          updatedAt: Date.now() - 1000,
        },
        {
          id: 'char-2',
          name: 'Villain Character',
          category: 'character',
          metadata: { source: { type: 'ai-generated' } },
          variants: [],
          tags: ['villain', 'enemy'],
          usageCount: 5,
          createdAt: Date.now() - 5000,
          updatedAt: Date.now() - 2000,
        },
        {
          id: 'obj-1',
          name: 'Magic Sword',
          category: 'object',
          metadata: {},
          variants: [],
          tags: ['weapon', 'magic'],
          usageCount: 3,
          createdAt: Date.now() - 3000,
          updatedAt: Date.now(),
        },
        {
          id: 'imported-1',
          name: 'Imported Dialogue',
          category: 'object',
          metadata: { source: { type: 'imported' } },
          variants: [],
          tags: ['imported'],
          usageCount: 1,
          createdAt: Date.now() - 2000,
          updatedAt: Date.now(),
        },
      ];

      for (const entity of entities) {
        await storage.saveEntity(entity);
      }
    });

    it('should search by keyword', async () => {
      const result = await storage.search({ keyword: 'hero' });
      expect(result.total).toBe(1);
      expect(result.entities[0]?.name).toBe('Hero Character');
    });

    it('should search by category', async () => {
      const result = await storage.search({ categories: ['character'] });
      expect(result.total).toBe(2);
    });

    it('should search by tags (AND logic)', async () => {
      const result = await storage.search({ tags: ['hero', 'main'] });
      expect(result.total).toBe(1);
    });

    it('should search by any tags (OR logic)', async () => {
      const result = await storage.search({ anyTags: ['hero', 'villain'] });
      expect(result.total).toBe(2);
    });

    it('should search imported assets by source type', async () => {
      const result = await storage.search({ sourceTypes: ['imported'] });
      expect(result.entities.map((entity) => entity.id)).toEqual(['imported-1']);
    });

    it('should sort by usage count', async () => {
      const result = await storage.search({
        sortBy: 'usageCount',
        sortDirection: 'desc',
      });
      expect(result.entities[0]?.usageCount).toBe(10);
    });

    it('should paginate results', async () => {
      const result = await storage.search({ limit: 2, offset: 0 });
      expect(result.entities).toHaveLength(2);
      expect(result.hasMore).toBe(true);
    });
  });

  describe('Tag Operations', () => {
    it('should get all tags with counts', async () => {
      const entity1: AssetEntity = {
        id: 'e1',
        name: 'E1',
        category: 'object',
        metadata: {},
        variants: [],
        tags: ['tag1', 'tag2'],
        usageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const entity2: AssetEntity = {
        id: 'e2',
        name: 'E2',
        category: 'object',
        metadata: {},
        variants: [],
        tags: ['tag1', 'tag3'],
        usageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.saveEntity(entity1);
      await storage.saveEntity(entity2);

      const tags = await storage.getAllTags();
      expect(tags).toHaveLength(3);

      const tag1 = tags.find((t) => t.tag === 'tag1');
      expect(tag1?.count).toBe(2);
    });
  });

  describe('Events', () => {
    it('should emit events on entity operations', async () => {
      const events: string[] = [];
      storage.addEventListener((event) => {
        events.push(event.type);
      });

      const entity: AssetEntity = {
        id: 'event-test',
        name: 'Event Test',
        category: 'object',
        metadata: {},
        variants: [],
        tags: [],
        usageCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await storage.saveEntity(entity);
      expect(events).toContain('entity:created');

      entity.name = 'Updated';
      await storage.saveEntity(entity);
      expect(events).toContain('entity:updated');

      await storage.deleteEntity('event-test');
      expect(events).toContain('entity:deleted');
    });
  });
});
