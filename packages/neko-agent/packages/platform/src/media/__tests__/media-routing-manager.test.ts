/**
 * Media Routing Manager Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MediaRoutingManager } from '../routing/media-routing-manager';
import { ConfigManager } from '../../config/config-manager';
import { getMediaAdapterRegistry } from '../adapters/media-adapter-registry';
import { OpenAICompatMediaAdapter } from '../adapters/openai-compat-media-adapter';
import { RunwayMediaAdapter } from '../adapters/runway-media-adapter';
import type { Provider, Model } from '../../types/provider';

describe('MediaRoutingManager', () => {
  let routingManager: MediaRoutingManager;
  let configManager: ConfigManager;

  // Mock providers
  const mockProviders: Provider[] = [
    {
      id: 'openai-provider',
      name: 'openai',
      displayName: 'OpenAI',
      type: 'openai',
      apiUrl: 'https://api.openai.com',
      apiKey: 'test-key',
      enabled: true,
    },
    {
      id: 'runway-provider',
      name: 'runway',
      displayName: 'Runway',
      type: 'runway',
      apiUrl: 'https://api.runwayml.com',
      apiKey: 'test-key',
      enabled: true,
    },
    {
      id: 'disabled-provider',
      name: 'disabled',
      displayName: 'Disabled',
      type: 'luma',
      apiUrl: 'https://api.luma.ai',
      apiKey: 'test-key',
      enabled: false,
    },
  ];

  // Mock models
  const mockModels: Model[] = [
    {
      id: 'sora-model',
      name: 'sora-1',
      displayName: 'Sora',
      providerId: 'openai-provider',
      capabilities: ['text_to_video', 'image_to_video'],
      enabled: true,
    },
    {
      id: 'dalle-model',
      name: 'dall-e-3',
      displayName: 'DALL-E 3',
      providerId: 'openai-provider',
      capabilities: ['text_to_image'],
      enabled: true,
    },
    {
      id: 'runway-model',
      name: 'gen3a_turbo',
      displayName: 'Gen-3 Alpha Turbo',
      providerId: 'runway-provider',
      capabilities: ['text_to_video', 'image_to_video'],
      enabled: true,
    },
    {
      id: 'disabled-model',
      name: 'disabled-model',
      displayName: 'Disabled Model',
      providerId: 'openai-provider',
      capabilities: ['text_to_video'],
      enabled: false,
    },
  ];

  beforeEach(() => {
    // Reset adapter registry
    const registry = getMediaAdapterRegistry();
    registry.registerBuiltin('openai', new OpenAICompatMediaAdapter());
    registry.registerBuiltin('runway', new RunwayMediaAdapter());

    // Create mock config manager
    configManager = {
      getProvider: (id: string) => mockProviders.find((p) => p.id === id),
      getProviders: () => mockProviders,
      getEnabledProviders: () => mockProviders.filter((p) => p.enabled),
      getModel: (id: string) => mockModels.find((m) => m.id === id),
      getModels: () => mockModels,
      getEnabledModels: () => mockModels.filter((m) => m.enabled),
      getModelsByProvider: (providerId: string) =>
        mockModels.filter((m) => m.providerId === providerId),
      getDefaultModelRef: (type: string) => {
        if (type === 'image') return { providerId: 'openai-provider', modelId: 'dalle-model' };
        if (type === 'video') return { providerId: 'openai-provider', modelId: 'sora-model' };
        return undefined;
      },
    } as unknown as ConfigManager;

    // Create provider registry
    // Create routing manager
    routingManager = new MediaRoutingManager(configManager);
  });

  describe('selectProvider', () => {
    it('should return specified provider and model when both are given', async () => {
      const result = await routingManager.selectProvider(
        'text-to-video',
        'openai-provider',
        'sora-model',
      );

      expect(result).not.toBeNull();
      expect(result?.providerId).toBe('openai-provider');
      expect(result?.modelId).toBe('sora-model');
      expect(result?.reason).toBe('User specified provider and model');
    });

    it('should return null for unknown provider', async () => {
      const result = await routingManager.selectProvider(
        'text-to-video',
        'unknown-provider',
        'unknown-model',
      );

      expect(result).toBeNull();
    });

    it('should return null when explicit provider does not own the model', async () => {
      const result = await routingManager.selectProvider(
        'text-to-video',
        'openai-provider',
        'runway-model',
      );

      expect(result).toBeNull();
    });

    it('should use configured default model when none specified', async () => {
      const result = await routingManager.selectProvider('text-to-video');

      expect(result).not.toBeNull();
      expect(result?.providerId).toBe('openai-provider');
      expect(result?.modelId).toBe('sora-model');
      expect(result?.reason).toBe('Configured default video model');
    });

    it('should use configured default model for image generation', async () => {
      const result = await routingManager.selectProvider('text-to-image');

      expect(result).not.toBeNull();
      expect(result?.providerId).toBe('openai-provider');
      expect(result?.modelId).toBe('dalle-model');
      expect(result?.reason).toBe('Configured default image model');
    });

    it('should reject partial routing when only model is specified', async () => {
      const result = await routingManager.selectProvider(
        'text-to-video',
        undefined,
        'runway-model',
      );

      expect(result).toBeNull();
    });

    it('should return null when no default configured for media type', async () => {
      // Override mock to return empty defaults
      configManager.getDefaultModelRef = () => undefined;

      const result = await routingManager.selectProvider('text-to-music');

      expect(result).toBeNull();
    });
  });

});
