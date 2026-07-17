/**
 * FileService Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FileService } from '../../service/FileService';
import { VariantService } from '../../service/VariantService';
import { EntityService } from '../../service/EntityService';
import { InMemoryStorage } from '../../storage/InMemoryStorage';
import type { AssetEntity, AssetVariant } from '@neko/shared';

describe('FileService', () => {
  let storage: InMemoryStorage;
  let entityService: EntityService;
  let variantService: VariantService;
  let fileService: FileService;
  let testEntity: AssetEntity;
  let testVariant: AssetVariant;

  beforeEach(async () => {
    storage = new InMemoryStorage();
    await storage.load();
    entityService = new EntityService(storage);
    variantService = new VariantService(storage);
    fileService = new FileService(storage);

    // Create test entity and variant
    testEntity = await entityService.create({
      name: 'Test Character',
      category: 'character',
    });
    testVariant = await variantService.add(testEntity.id, {
      name: 'Front View',
    });
  });

  describe('add', () => {
    it('should add a file to a variant', async () => {
      const file = await fileService.add(testVariant.id, '/assets/character/hero_front.png');

      expect(file.id).toBeDefined();
      expect(file.id).toMatch(/^file_/);
      expect(file.variantId).toBe(testVariant.id);
      expect(file.path).toBe('/assets/character/hero_front.png');
      expect(file.name).toBe('hero_front.png');
      expect(file.mediaType).toBe('image');
      expect(file.purpose).toBe('main');
    });

    it('should detect video media type', async () => {
      const file = await fileService.add(testVariant.id, '/assets/videos/intro.mp4');

      expect(file.mediaType).toBe('video');
      expect(file.metadata.mimeType).toBe('video/mp4');
    });

    it('should detect audio media type', async () => {
      const file = await fileService.add(testVariant.id, '/assets/audio/bgm.mp3');

      expect(file.mediaType).toBe('audio');
      expect(file.metadata.mimeType).toBe('audio/mpeg');
    });

    it('should use custom name and purpose', async () => {
      const file = await fileService.add(testVariant.id, '/assets/thumb.jpg', {
        name: 'Custom Thumbnail',
        purpose: 'thumbnail',
      });

      expect(file.name).toBe('Custom Thumbnail');
      expect(file.purpose).toBe('thumbnail');
    });

    it('should use provided metadata', async () => {
      const file = await fileService.add(testVariant.id, '/assets/image.png', {
        metadata: {
          width: 1920,
          height: 1080,
          fileSize: 1024000,
        },
      });

      expect(file.metadata.width).toBe(1920);
      expect(file.metadata.height).toBe(1080);
      expect(file.metadata.fileSize).toBe(1024000);
    });

    it('should persist character asset dimension metadata', async () => {
      const file = await fileService.add(testVariant.id, '/assets/hero.glb', {
        characterAsset: {
          assetDimension: 'model',
          mediaKind: 'model-3d',
          storageMode: 'disk',
          sourceOrigin: '/imports/hero.glb',
          sourceHash: 'sha256:hero',
        },
      });

      expect(file.characterAsset).toEqual({
        assetDimension: 'model',
        mediaKind: 'model-3d',
        storageMode: 'disk',
        sourceOrigin: '/imports/hero.glb',
        sourceHash: 'sha256:hero',
      });
      await expect(storage.getFile(testVariant.id, file.id)).resolves.toMatchObject({
        characterAsset: {
          assetDimension: 'model',
          mediaKind: 'model-3d',
          storageMode: 'disk',
        },
      });
    });

    it('should throw error for non-existent variant', async () => {
      await expect(fileService.add('non-existent', '/path/to/file.png')).rejects.toThrow(
        'Variant not found',
      );
    });
  });

  describe('get', () => {
    it('should retrieve an existing file', async () => {
      const created = await fileService.add(testVariant.id, '/assets/test.png');

      const retrieved = await fileService.get(testVariant.id, created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.path).toBe('/assets/test.png');
    });

    it('should return null for non-existent file', async () => {
      const retrieved = await fileService.get(testVariant.id, 'non-existent');
      expect(retrieved).toBeNull();
    });
  });

  describe('remove', () => {
    it('should remove a file', async () => {
      const file = await fileService.add(testVariant.id, '/assets/test.png');

      const result = await fileService.remove(testVariant.id, file.id);

      expect(result).toBe(true);
      expect(await fileService.get(testVariant.id, file.id)).toBeNull();
    });

    it('should return false for non-existent file', async () => {
      const result = await fileService.remove(testVariant.id, 'non-existent');
      expect(result).toBe(false);
    });
  });

  describe('updateMetadata', () => {
    it('should update file metadata', async () => {
      const file = await fileService.add(testVariant.id, '/assets/video.mp4');

      const updated = await fileService.updateMetadata(testVariant.id, file.id, {
        duration: 120,
        frameRate: 30,
        width: 1920,
        height: 1080,
      });

      expect(updated.metadata.duration).toBe(120);
      expect(updated.metadata.frameRate).toBe(30);
      expect(updated.metadata.width).toBe(1920);
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        fileService.updateMetadata(testVariant.id, 'non-existent', {
          duration: 100,
        }),
      ).rejects.toThrow('File not found');
    });
  });

  describe('media type detection', () => {
    const testCases = [
      // Images
      { path: '/test.jpg', expectedType: 'image', expectedMime: 'image/jpeg' },
      { path: '/test.jpeg', expectedType: 'image', expectedMime: 'image/jpeg' },
      { path: '/test.png', expectedType: 'image', expectedMime: 'image/png' },
      { path: '/test.gif', expectedType: 'image', expectedMime: 'image/gif' },
      { path: '/test.webp', expectedType: 'image', expectedMime: 'image/webp' },
      { path: '/test.svg', expectedType: 'image', expectedMime: 'image/svg+xml' },
      // Videos
      { path: '/test.mp4', expectedType: 'video', expectedMime: 'video/mp4' },
      { path: '/test.mov', expectedType: 'video', expectedMime: 'video/quicktime' },
      { path: '/test.webm', expectedType: 'video', expectedMime: 'video/webm' },
      { path: '/test.avi', expectedType: 'video', expectedMime: 'video/x-msvideo' },
      // Audio
      { path: '/test.mp3', expectedType: 'audio', expectedMime: 'audio/mpeg' },
      { path: '/test.wav', expectedType: 'audio', expectedMime: 'audio/wav' },
      { path: '/test.ogg', expectedType: 'audio', expectedMime: 'audio/ogg' },
      { path: '/test.flac', expectedType: 'audio', expectedMime: 'audio/flac' },
    ];

    for (const { path, expectedType, expectedMime } of testCases) {
      it(`should detect ${path} as ${expectedType}`, async () => {
        const file = await fileService.add(testVariant.id, path);

        expect(file.mediaType).toBe(expectedType);
        expect(file.metadata.mimeType).toBe(expectedMime);
      });
    }
  });
});
