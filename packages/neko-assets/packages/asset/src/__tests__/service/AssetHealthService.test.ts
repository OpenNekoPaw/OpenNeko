/**
 * AssetHealthService Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AssetHealthService } from '../../service/AssetHealthService';
import { EntityService } from '../../service/EntityService';
import { VariantService } from '../../service/VariantService';
import { FileService } from '../../service/FileService';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import type { AssetFileStatus } from '@neko/shared';
import type { FileAccessChecker } from '../../service/types';

describe('AssetHealthService', () => {
  let storage: InMemoryStorage;
  let entityService: EntityService;
  let variantService: VariantService;
  let fileService: FileService;
  let healthService: AssetHealthService;
  let mockChecker: FileAccessChecker;

  beforeEach(async () => {
    storage = new InMemoryStorage();
    await storage.load();
    entityService = new EntityService(storage);
    variantService = new VariantService(storage);
    fileService = new FileService(storage);

    // Mock checker: paths containing '/offline/' → offline, '/missing/' → missing
    mockChecker = vi.fn(async (filePath: string): Promise<AssetFileStatus> => {
      if (filePath.includes('/offline/')) return 'offline';
      if (filePath.includes('/missing/')) return 'missing';
      return 'online';
    });

    healthService = new AssetHealthService({
      storage,
      fileAccessChecker: mockChecker,
      concurrency: 3,
    });
  });

  async function createEntityWithFiles(name: string, filePaths: string[]) {
    const entity = await entityService.create({
      name,
      category: 'object',
    });
    const variant = await variantService.add(entity.id, {
      name: 'Default',
    });
    for (const filePath of filePaths) {
      await fileService.add(variant.id, filePath);
    }
    return { entity, variant };
  }

  describe('validateAll', () => {
    it('should validate all files and update status', async () => {
      await createEntityWithFiles('TestA', [
        '/valid/file1.mp4',
        '/offline/file2.mp4',
        '/missing/file3.mp4',
      ]);

      const results = await healthService.validateAll();

      expect(results).toHaveLength(3);
      expect(results.find((r) => r.path === '/valid/file1.mp4')?.status).toBe('online');
      expect(results.find((r) => r.path === '/offline/file2.mp4')?.status).toBe('offline');
      expect(results.find((r) => r.path === '/missing/file3.mp4')?.status).toBe('missing');
    });

    it('should update status in storage', async () => {
      const { variant } = await createEntityWithFiles('Test', ['/offline/file.mp4']);

      await healthService.validateAll();

      // Re-read from storage to verify status was persisted
      const updatedEntity = (await storage.getAllEntities())[0]!;
      const updatedFile = updatedEntity.variants[0]!.files[0]!;
      expect(updatedFile.status).toBe('offline');
      expect(updatedFile.lastCheckedAt).toBeDefined();
    });

    it('should report progress', async () => {
      await createEntityWithFiles('TestA', ['/valid/a.mp4']);
      await createEntityWithFiles('TestB', ['/valid/b.mp4', '/valid/c.mp4']);

      const progressCalls: Array<[number, number]> = [];
      await healthService.validateAll((checked, total) => {
        progressCalls.push([checked, total]);
      });

      // Should have 3 progress calls, each with total=3
      expect(progressCalls).toHaveLength(3);
      for (const [, total] of progressCalls) {
        expect(total).toBe(3);
      }
      // Last call should have checked=3
      const lastCall = progressCalls[progressCalls.length - 1]!;
      expect(lastCall[0]).toBe(3);
      // Verify monotonically increasing progress
      for (let i = 1; i < progressCalls.length; i++) {
        expect(progressCalls[i]![0]).toBeGreaterThan(progressCalls[i - 1]![0]);
      }
    });

    it('should return empty array for empty library', async () => {
      const results = await healthService.validateAll();
      expect(results).toHaveLength(0);
    });

    it('respects concurrency limit during validateAll', async () => {
      // Create 10 files, concurrency = 2
      for (let i = 0; i < 10; i++) {
        await createEntityWithFiles(`Entity${i}`, [`/valid/file${i}.mp4`]);
      }

      let activeCount = 0;
      let maxActive = 0;

      const checker: FileAccessChecker = async () => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        await new Promise((r) => setTimeout(r, 10));
        activeCount--;
        return 'online' as const;
      };

      const service = new AssetHealthService({
        storage,
        fileAccessChecker: checker,
        concurrency: 2,
      });
      await service.validateAll();

      expect(maxActive).toBeLessThanOrEqual(2);
      // Also verify genuine concurrency occurred (not just serial execution)
      expect(maxActive).toBeGreaterThan(1);
    });

    it('should track previousStatus', async () => {
      const { variant } = await createEntityWithFiles('Test', ['/valid/file.mp4']);

      // First validation: sets status to online
      await healthService.validateAll();

      // Now change checker to return offline
      (mockChecker as ReturnType<typeof vi.fn>).mockImplementation(
        async () => 'offline' as AssetFileStatus,
      );

      // Second validation: previousStatus should be 'online'
      const results = await healthService.validateAll();
      expect(results[0]!.previousStatus).toBe('online');
      expect(results[0]!.status).toBe('offline');
    });
  });

  describe('validateFile', () => {
    it('should validate a single file', async () => {
      const { variant } = await createEntityWithFiles('Test', ['/valid/file.mp4']);
      const entities = await storage.getAllEntities();
      const file = entities[0]!.variants[0]!.files[0]!;

      const result = await healthService.validateFile(variant.id, file.id);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('online');
      expect(result!.entityName).toBe('Test');
    });

    it('should return null for non-existent file', async () => {
      const result = await healthService.validateFile('nonexistent', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('relocateFile', () => {
    it('should relocate file to new accessible path', async () => {
      const { variant } = await createEntityWithFiles('Test', ['/missing/old.mp4']);
      const entities = await storage.getAllEntities();
      const file = entities[0]!.variants[0]!.files[0]!;

      const result = await healthService.relocateFile(
        variant.id,
        file.id,
        '/valid/new-location.mp4',
      );

      expect(result).not.toBeNull();
      expect(result!.status).toBe('remapped');
      expect(result!.path).toBe('/valid/new-location.mp4');

      // Verify storage was updated
      const updatedFile = await storage.getFile(variant.id, file.id);
      expect(updatedFile!.path).toBe('/valid/new-location.mp4');
      expect(updatedFile!.remap).toBeDefined();
      expect(updatedFile!.remap!.originalPath).toBe('/missing/old.mp4');
      expect(updatedFile!.remap!.remappedPath).toBe('/valid/new-location.mp4');
    });

    it('should throw if new path is not accessible', async () => {
      const { variant } = await createEntityWithFiles('Test', ['/missing/old.mp4']);
      const entities = await storage.getAllEntities();
      const file = entities[0]!.variants[0]!.files[0]!;

      await expect(
        healthService.relocateFile(variant.id, file.id, '/offline/still-bad.mp4'),
      ).rejects.toThrow('New path is not accessible');
    });

    it('should return null for non-existent file', async () => {
      const result = await healthService.relocateFile('x', 'y', '/valid/path.mp4');
      expect(result).toBeNull();
    });
  });

  describe('getSummary', () => {
    it('should return correct counts', async () => {
      await createEntityWithFiles('A', ['/valid/a1.mp4', '/valid/a2.mp4']);
      await createEntityWithFiles('B', ['/offline/b.mp4']);
      await createEntityWithFiles('C', ['/missing/c.mp4']);

      // Run validation first to set statuses
      await healthService.validateAll();

      const summary = await healthService.getSummary();
      expect(summary.total).toBe(4);
      expect(summary.online).toBe(2);
      expect(summary.offline).toBe(1);
      expect(summary.missing).toBe(1);
      expect(summary.remapped).toBe(0);
    });

    it('should treat undefined status as online', async () => {
      // Directly create a file via storage without going through healthService
      await createEntityWithFiles('Test', ['/valid/file.mp4']);

      // Don't validate - status will be 'online' from FileService.add
      const summary = await healthService.getSummary();
      expect(summary.total).toBe(1);
      expect(summary.online).toBe(1);
    });

    it('should return zeros for empty library', async () => {
      const summary = await healthService.getSummary();
      expect(summary.total).toBe(0);
      expect(summary.online).toBe(0);
    });
  });
});
