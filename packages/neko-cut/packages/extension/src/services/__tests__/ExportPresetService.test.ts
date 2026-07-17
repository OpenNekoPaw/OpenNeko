/**
 * ExportPresetService unit tests
 *
 * Uses a mock Memento to avoid VSCode dependency.
 * Tests the core preset management contract: built-in presets, user preset persistence.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ExportPresetService } from '../ExportPresetService';

// =============================================================================
// Mock Memento (minimal vscode.Memento implementation)
// =============================================================================

function createMockMemento() {
  const store: Record<string, unknown> = {};
  return {
    get<T>(key: string, defaultValue?: T): T {
      return (key in store ? store[key] : defaultValue) as T;
    },
    async update(key: string, value: unknown): Promise<void> {
      store[key] = value;
    },
    keys(): readonly string[] {
      return Object.keys(store);
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('ExportPresetService', () => {
  let service: ExportPresetService;
  let memento: ReturnType<typeof createMockMemento>;

  beforeEach(() => {
    memento = createMockMemento();
    service = new ExportPresetService(memento as never);
  });

  // ---------------------------------------------------------------------------
  // Built-in presets
  // ---------------------------------------------------------------------------

  describe('built-in presets', () => {
    it('should return 3 built-in presets by default', () => {
      const presets = service.listPresets();
      const builtins = presets.filter((p) => p.isBuiltin);
      expect(builtins).toHaveLength(3);
    });

    it('should include social media preset with correct id', () => {
      const presets = service.listPresets();
      const social = presets.find((p) => p.id === 'builtin-social');
      expect(social).toBeDefined();
      expect(social?.isBuiltin).toBe(true);
    });

    it('should include web preset with correct id', () => {
      const presets = service.listPresets();
      const web = presets.find((p) => p.id === 'builtin-web');
      expect(web).toBeDefined();
      expect(web?.isBuiltin).toBe(true);
    });

    it('should include master quality preset with correct id', () => {
      const presets = service.listPresets();
      const master = presets.find((p) => p.id === 'builtin-master');
      expect(master).toBeDefined();
      expect(master?.isBuiltin).toBe(true);
    });

    it('social preset should have expected settings', () => {
      const presets = service.listPresets();
      const social = presets.find((p) => p.id === 'builtin-social');
      expect(social?.settings.format).toBe('mp4');
      expect(social?.settings.videoCodec).toBe('h264');
      expect(social?.settings.width).toBe(1920);
      expect(social?.settings.height).toBe(1080);
      expect(social?.settings.fps).toBe(60);
    });

    it('web preset should use webm/vp9', () => {
      const presets = service.listPresets();
      const web = presets.find((p) => p.id === 'builtin-web');
      expect(web?.settings.format).toBe('webm');
      expect(web?.settings.videoCodec).toBe('vp9');
    });

    it('master preset should have 4K resolution', () => {
      const presets = service.listPresets();
      const master = presets.find((p) => p.id === 'builtin-master');
      expect(master?.settings.width).toBe(3840);
      expect(master?.settings.height).toBe(2160);
    });

    it('built-in presets should appear before user presets', () => {
      const presets = service.listPresets();
      const firstUserIndex = presets.findIndex((p) => !p.isBuiltin);
      const lastBuiltinIndex = presets.reduce((acc, p, i) => (p.isBuiltin ? i : acc), -1);
      // If there are no user presets, firstUserIndex is -1, which is fine
      if (firstUserIndex !== -1) {
        expect(lastBuiltinIndex).toBeLessThan(firstUserIndex);
      } else {
        // All presets are built-in
        expect(lastBuiltinIndex).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // User preset persistence
  // ---------------------------------------------------------------------------

  describe('savePreset', () => {
    it('should persist a user preset and return it', async () => {
      const preset = await service.savePreset('My Preset', {
        format: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1280,
        height: 720,
        fps: 30,
        quality: 'medium',
        audioBitrate: 128000,
      });

      expect(preset.name).toBe('My Preset');
      expect(preset.isBuiltin).toBe(false);
      expect(preset.id).toBeTruthy();
    });

    it('saved preset should appear in listPresets()', async () => {
      await service.savePreset('Test Preset', {
        format: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1920,
        height: 1080,
        fps: 30,
        quality: 'high',
        audioBitrate: 192000,
      });

      const presets = service.listPresets();
      const found = presets.find((p) => p.name === 'Test Preset');
      expect(found).toBeDefined();
      expect(found?.isBuiltin).toBe(false);
    });

    it('each saved preset should have a unique id', async () => {
      const p1 = await service.savePreset('Preset A', {
        format: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1920,
        height: 1080,
        fps: 30,
        quality: 'high',
        audioBitrate: 192000,
      });
      const p2 = await service.savePreset('Preset B', {
        format: 'webm',
        videoCodec: 'vp9',
        audioCodec: 'opus',
        width: 1280,
        height: 720,
        fps: 30,
        quality: 'medium',
        audioBitrate: 128000,
      });

      expect(p1.id).not.toBe(p2.id);
    });

    it('multiple saves should accumulate user presets', async () => {
      await service.savePreset('Preset A', {
        format: 'mp4',
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1920,
        height: 1080,
        fps: 30,
        quality: 'high',
        audioBitrate: 192000,
      });
      await service.savePreset('Preset B', {
        format: 'webm',
        videoCodec: 'vp9',
        audioCodec: 'opus',
        width: 1280,
        height: 720,
        fps: 30,
        quality: 'medium',
        audioBitrate: 128000,
      });

      const presets = service.listPresets();
      const userPresets = presets.filter((p) => !p.isBuiltin);
      expect(userPresets).toHaveLength(2);
    });

    it('total preset count should be built-ins plus user presets', async () => {
      await service.savePreset('Custom', {
        format: 'mov',
        videoCodec: 'h265',
        audioCodec: 'aac',
        width: 3840,
        height: 2160,
        fps: 60,
        quality: 'high',
        audioBitrate: 320000,
      });

      const presets = service.listPresets();
      // 3 built-ins + 1 user
      expect(presets).toHaveLength(4);
    });
  });
});
