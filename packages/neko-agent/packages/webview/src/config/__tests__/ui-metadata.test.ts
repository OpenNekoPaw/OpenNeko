import { describe, it, expect } from 'vitest';
import {
  getProviderUIMetadata,
  getProviderIcon,
  getProviderCategory,
  isNoKeyProvider,
  getProviderAuthFields,
  PROVIDER_UI_METADATA,
} from '../ui-metadata';

describe('Provider UI Metadata', () => {
  describe('getProviderUIMetadata()', () => {
    it('should return metadata for known provider', () => {
      const metadata = getProviderUIMetadata('openai');
      expect(metadata).toBeDefined();
      expect(metadata.icon).toBe('🟢');
      expect(metadata.category).toBe('chat');
    });

    it('should return default metadata for unknown provider', () => {
      const metadata = getProviderUIMetadata('unknown-provider');
      expect(metadata).toBeDefined();
      expect(metadata.icon).toBe('🔧');
      expect(metadata.category).toBe('chat');
    });
  });

  describe('getProviderIcon()', () => {
    it('should return correct icon for providers', () => {
      expect(getProviderIcon('openai')).toBe('🟢');
      expect(getProviderIcon('anthropic')).toBe('🟠');
      expect(getProviderIcon('google')).toBe('🔵');
      expect(getProviderIcon('ollama')).toBe('🦙');
      expect(getProviderIcon('ollama-local')).toBe('🦙');
      expect(getProviderIcon('neko-gateway')).toBe('🔗');
    });

    it('should return default icon for unknown provider', () => {
      expect(getProviderIcon('unknown')).toBe('🔧');
    });
  });

  describe('getProviderCategory()', () => {
    it('should return chat for chat providers', () => {
      expect(getProviderCategory('openai')).toBe('chat');
      expect(getProviderCategory('anthropic')).toBe('chat');
      expect(getProviderCategory('google')).toBe('chat');
      expect(getProviderCategory('deepseek')).toBe('chat');
    });

    it('should return media for media providers', () => {
      expect(getProviderCategory('midjourney')).toBe('media');
      expect(getProviderCategory('kling')).toBe('media');
      expect(getProviderCategory('vidu')).toBe('media');
      expect(getProviderCategory('suno')).toBe('media');
    });

    it('should return chat for unknown provider', () => {
      expect(getProviderCategory('unknown')).toBe('chat');
    });
  });

  describe('isNoKeyProvider()', () => {
    it('should return true for local providers', () => {
      expect(isNoKeyProvider('ollama')).toBe(true);
      expect(isNoKeyProvider('ollama-local')).toBe(true);
      expect(isNoKeyProvider('lmstudio')).toBe(true);
    });

    it('should return false for cloud providers', () => {
      expect(isNoKeyProvider('openai')).toBe(false);
      expect(isNoKeyProvider('anthropic')).toBe(false);
      expect(isNoKeyProvider('google')).toBe(false);
    });

    it('should return false for unknown provider', () => {
      expect(isNoKeyProvider('unknown')).toBe(false);
    });
  });

  describe('getProviderAuthFields()', () => {
    it('should return auth fields for providers with custom auth', () => {
      const azureFields = getProviderAuthFields('azure');
      expect(azureFields).toBeDefined();
      expect(azureFields!.length).toBeGreaterThan(1);
      expect(azureFields!.some((f) => f.key === 'apiKey')).toBe(true);
      expect(azureFields!.some((f) => f.key === 'resourceName')).toBe(true);
    });

    it('should return auth fields for Kling with access/secret keys', () => {
      const klingFields = getProviderAuthFields('kling');
      expect(klingFields).toBeDefined();
      expect(klingFields!.some((f) => f.key === 'accessKey')).toBe(true);
      expect(klingFields!.some((f) => f.key === 'secretKey')).toBe(true);
    });

    it('should return undefined for providers without custom auth', () => {
      expect(getProviderAuthFields('openai')).toBeUndefined();
      expect(getProviderAuthFields('anthropic')).toBeUndefined();
    });
  });

  describe('PROVIDER_UI_METADATA registry', () => {
    it('should have metadata for all chat providers', () => {
      const chatProviders = [
        'openai',
        'anthropic',
        'google',
        'azure',
        'ollama',
        'ollama-local',
        'deepseek',
        'kimi',
        'glm',
        'qwen',
        'lmstudio',
        'newapi',
        'neko-gateway',
        'custom-newapi',
        'generic',
      ];
      chatProviders.forEach((id) => {
        expect(PROVIDER_UI_METADATA[id]).toBeDefined();
        expect(PROVIDER_UI_METADATA[id].category).toBe('chat');
      });
    });

    it('should have metadata for all media providers', () => {
      const mediaProviders = [
        'midjourney',
        'liblib',
        'kling',
        'vidu',
        'runway',
        'luma',
        'minimax',
        'suno',
      ];
      mediaProviders.forEach((id) => {
        expect(PROVIDER_UI_METADATA[id]).toBeDefined();
        expect(PROVIDER_UI_METADATA[id].category).toBe('media');
      });
    });

    it('should have unique icons for major providers', () => {
      const icons = Object.entries(PROVIDER_UI_METADATA)
        .filter(([id]) => ['openai', 'anthropic', 'google', 'ollama', 'deepseek'].includes(id))
        .map(([_, meta]) => meta.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });
  });
});
