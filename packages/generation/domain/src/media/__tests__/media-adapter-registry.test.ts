/**
 * Media Adapter Registry Tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MediaAdapterRegistry,
  createMediaAdapterRegistry,
  getMediaAdapterRegistry,
} from '../adapters/media-adapter-registry';
import { RunwayMediaAdapter } from '../adapters/runway-media-adapter';
import { LumaMediaAdapter } from '../adapters/luma-media-adapter';
import { DashScopeMediaAdapter } from '../adapters/dashscope-media-adapter';
import { MidjourneyMediaAdapter } from '../adapters/midjourney-media-adapter';
import {
  isMediaAudioSubmitter,
  isMediaImageSubmitter,
  isMediaTaskCanceller,
  isMediaTaskDescriber,
  isMediaVideoSubmitter,
  requireMediaTaskCanceller,
} from '../media-adapter-capabilities';
import { createMediaPlatform } from '../index';

describe('MediaAdapterRegistry', () => {
  let registry: MediaAdapterRegistry;

  beforeEach(() => {
    registry = createMediaAdapterRegistry();
  });

  describe('registerBuiltin', () => {
    it('registers a built-in adapter by provider type', () => {
      const runway = new RunwayMediaAdapter();
      registry.registerBuiltin('runway', runway);

      expect(registry.getForType('runway')).toBe(runway);
    });
  });

  describe('unregisterBuiltin', () => {
    it('removes a built-in adapter', () => {
      const runway = new RunwayMediaAdapter();
      registry.registerBuiltin('runway', runway);
      registry.unregisterBuiltin('runway');

      expect(registry.getForType('runway')).toBeUndefined();
    });
  });

  describe('getForType', () => {
    it('returns the canonical adapter for a registered type', () => {
      const runway = new RunwayMediaAdapter();
      registry.registerBuiltin('runway', runway);

      expect(registry.getForType('runway')).toBe(runway);
    });

    it('returns undefined for an unknown type', () => {
      expect(registry.getForType('unknown')).toBeUndefined();
    });
  });
});

describe('canonical media execution stack split', () => {
  afterEach(() => {
    for (const type of [
      'runway',
      'luma',
      'liblib',
      'suno',
      'vidu',
      'midjourney',
      'fal',
      'dashscope',
    ] as const) {
      getMediaAdapterRegistry().unregisterBuiltin(type);
    }
  });

  it('registers only MediaAdapter types, never AI SDK types', () => {
    createMediaPlatform({
      configManager: {
        getProvider: () => undefined,
        getModel: () => undefined,
        getDefaultModelRef: () => undefined,
      },
      providerResolver: { resolveProvider: async () => undefined },
    });

    const registry = getMediaAdapterRegistry();
    for (const type of [
      'runway',
      'luma',
      'liblib',
      'suno',
      'vidu',
      'midjourney',
      'fal',
      'dashscope',
    ]) {
      expect(registry.getForType(type), `${type} should have a polling adapter`).toBeDefined();
    }
    for (const type of [
      'openai',
      'generic',
      'newapi',
      'xai',
      'kling',
      'oneapi',
      'minimax',
      'bytedance',
    ]) {
      expect(registry.getForType(type), `${type} must be AI SDK-only`).toBeUndefined();
    }
  });
});

describe('Media Adapters', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('async task capabilities', () => {
    it('exposes describe and cancel only when the provider implements them', () => {
      const runway = new RunwayMediaAdapter();
      const dashscope = new DashScopeMediaAdapter();
      const midjourney = new MidjourneyMediaAdapter();

      expect(isMediaImageSubmitter(runway)).toBe(false);
      expect(isMediaVideoSubmitter(runway)).toBe(true);
      expect(isMediaAudioSubmitter(runway)).toBe(false);
      expect(isMediaImageSubmitter(midjourney)).toBe(true);
      expect(isMediaVideoSubmitter(midjourney)).toBe(false);
      expect(isMediaAudioSubmitter(midjourney)).toBe(false);
      expect(isMediaTaskDescriber(runway)).toBe(true);
      expect(isMediaTaskDescriber(dashscope)).toBe(true);
      expect(isMediaTaskCanceller(runway)).toBe(true);
      expect(isMediaTaskCanceller(dashscope)).toBe(false);
      expect(() => requireMediaTaskCanceller(dashscope)).toThrowError(
        expect.objectContaining({
          code: 'media-task-cancel-unsupported',
        }),
      );
    });

    it('propagates a supported provider cancellation failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              error: {
                code: 'cancel-rejected',
                message: 'The provider rejected cancellation.',
              },
            }),
            {
              status: 409,
              headers: { 'content-type': 'application/json' },
            },
          ),
        ),
      );
      const runway = requireMediaTaskCanceller(new RunwayMediaAdapter());

      await expect(
        runway.cancelTask('external-1', {
          id: 'runway-provider',
          name: 'Runway',
          displayName: 'Runway',
          type: 'runway',
          apiUrl: 'https://example.test',
          apiKey: 'test-key',
          enabled: true,
        }),
      ).rejects.toMatchObject({
        code: 'cancel-rejected',
        statusCode: 409,
      });
    });
  });

  describe('RunwayMediaAdapter', () => {
    it('supports video generation types', () => {
      const adapter = new RunwayMediaAdapter();

      expect(adapter.getSupportedTypes()).toContain('text-to-video');
      expect(adapter.getSupportedTypes()).toContain('image-to-video');
      expect(adapter.getSupportedTypes()).not.toContain('text-to-image');
    });

    it('reports correct type', () => {
      const adapter = new RunwayMediaAdapter();
      expect(adapter.type).toBe('runway');
    });
  });

  describe('LumaMediaAdapter', () => {
    it('supports video generation types', () => {
      const adapter = new LumaMediaAdapter();

      expect(adapter.getSupportedTypes()).toContain('text-to-video');
      expect(adapter.getSupportedTypes()).toContain('image-to-video');
    });

    it('reports correct type', () => {
      const adapter = new LumaMediaAdapter();
      expect(adapter.type).toBe('luma');
    });
  });
});
