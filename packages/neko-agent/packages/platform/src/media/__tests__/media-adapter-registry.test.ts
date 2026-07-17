/**
 * Media Adapter Registry Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MediaAdapterRegistry,
  createMediaAdapterRegistry,
} from '../adapters/media-adapter-registry';
import { OpenAICompatMediaAdapter } from '../adapters/openai-compat-media-adapter';
import { RunwayMediaAdapter } from '../adapters/runway-media-adapter';
import { LumaMediaAdapter } from '../adapters/luma-media-adapter';

describe('MediaAdapterRegistry', () => {
  let registry: MediaAdapterRegistry;

  beforeEach(() => {
    registry = createMediaAdapterRegistry();
  });

  describe('registerBuiltin', () => {
    it('should register a built-in adapter', () => {
      const adapter = new OpenAICompatMediaAdapter();
      registry.registerBuiltin('openai', adapter);

      expect(registry.get('openai')).toBe(adapter);
    });

    it('should register multiple adapters', () => {
      const openaiAdapter = new OpenAICompatMediaAdapter();
      const runwayAdapter = new RunwayMediaAdapter();
      const lumaAdapter = new LumaMediaAdapter();

      registry.registerBuiltin('openai', openaiAdapter);
      registry.registerBuiltin('runway', runwayAdapter);
      registry.registerBuiltin('luma', lumaAdapter);

      expect(registry.get('openai')).toBe(openaiAdapter);
      expect(registry.get('runway')).toBe(runwayAdapter);
      expect(registry.get('luma')).toBe(lumaAdapter);
    });
  });

  describe('register/getCustom', () => {
    it('should register and retrieve custom adapters', () => {
      const adapter = new OpenAICompatMediaAdapter();
      registry.register('custom-provider', adapter);

      expect(registry.getCustom('custom-provider')).toBe(adapter);
    });

    it('should unregister custom adapters', () => {
      const adapter = new OpenAICompatMediaAdapter();
      registry.register('custom-provider', adapter);
      registry.unregister('custom-provider');

      expect(registry.getCustom('custom-provider')).toBeUndefined();
    });
  });

  describe('getForType', () => {
    it('should return built-in adapter for known type', () => {
      const adapter = new OpenAICompatMediaAdapter();
      registry.registerBuiltin('openai', adapter);

      expect(registry.getForType('openai')).toBe(adapter);
    });

    it('should return custom adapter for custom type', () => {
      const adapter = new RunwayMediaAdapter();
      registry.register('my-runway', adapter);

      expect(registry.getForType('my-runway')).toBe(adapter);
    });

    it('should return undefined for unknown type', () => {
      expect(registry.getForType('unknown')).toBeUndefined();
    });

    it('should prefer custom over built-in with same name', () => {
      // Custom adapters should override builtin adapters
      // This allows users to customize behavior for built-in provider types
      const builtinAdapter = new OpenAICompatMediaAdapter();
      const customAdapter = new RunwayMediaAdapter();

      registry.registerBuiltin('openai', builtinAdapter);
      registry.register('openai', customAdapter);

      expect(registry.getForType('openai')).toBe(customAdapter);
    });
  });

  describe('listTypes', () => {
    it('should list all registered adapter types', () => {
      registry.registerBuiltin('openai', new OpenAICompatMediaAdapter());
      registry.registerBuiltin('runway', new RunwayMediaAdapter());
      registry.register('custom', new LumaMediaAdapter());

      const types = registry.listTypes();

      expect(types).toContain('openai');
      expect(types).toContain('runway');
      expect(types).toContain('custom');
    });

    it('should return empty array when no adapters registered', () => {
      expect(registry.listTypes()).toEqual([]);
    });
  });

  describe('has', () => {
    it('should return true for registered built-in type', () => {
      registry.registerBuiltin('openai', new OpenAICompatMediaAdapter());
      expect(registry.has('openai')).toBe(true);
    });

    it('should return true for registered custom type', () => {
      registry.register('custom', new OpenAICompatMediaAdapter());
      expect(registry.has('custom')).toBe(true);
    });

    it('should return false for unknown type', () => {
      expect(registry.has('unknown')).toBe(false);
    });
  });
});

describe('Media Adapters', () => {
  describe('OpenAICompatMediaAdapter', () => {
    it('should support expected generation types', () => {
      const adapter = new OpenAICompatMediaAdapter();

      expect(adapter.getSupportedTypes()).toContain('text-to-image');
      expect(adapter.getSupportedTypes()).toContain('text-to-video');
      expect(adapter.getSupportedTypes()).toContain('image-to-video');
    });

    it('should report correct type', () => {
      const adapter = new OpenAICompatMediaAdapter();
      expect(adapter.type).toBe('openai-compat');
    });

    it('should check type support correctly', () => {
      const adapter = new OpenAICompatMediaAdapter();

      expect(adapter.supportsType('text-to-image')).toBe(true);
      expect(adapter.supportsType('text-to-music')).toBe(false);
    });
  });

  describe('RunwayMediaAdapter', () => {
    it('should support video generation types', () => {
      const adapter = new RunwayMediaAdapter();

      expect(adapter.getSupportedTypes()).toContain('text-to-video');
      expect(adapter.getSupportedTypes()).toContain('image-to-video');
      expect(adapter.getSupportedTypes()).not.toContain('text-to-image');
    });

    it('should report correct type', () => {
      const adapter = new RunwayMediaAdapter();
      expect(adapter.type).toBe('runway');
    });
  });

  describe('LumaMediaAdapter', () => {
    it('should support video generation types', () => {
      const adapter = new LumaMediaAdapter();

      expect(adapter.getSupportedTypes()).toContain('text-to-video');
      expect(adapter.getSupportedTypes()).toContain('image-to-video');
    });

    it('should report correct type', () => {
      const adapter = new LumaMediaAdapter();
      expect(adapter.type).toBe('luma');
    });
  });
});
