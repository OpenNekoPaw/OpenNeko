import type { ConfigManager } from '@neko/host/settings';
import { describe, expect, it } from 'vitest';
import { projectDesktopCanvasGenerationModels } from './desktop-canvas-generation-model-catalog';

describe('Desktop Canvas Generation model catalog', () => {
  it('projects enabled purpose-qualified labels without provider secrets or options', () => {
    const config = {
      getEnabledProviders: () => [
        {
          id: 'provider-1',
          displayName: 'Provider One',
          apiKey: 'must-not-project',
          apiUrl: 'https://private.example.test',
          enabled: true,
        },
      ],
      getEnabledModels: () => [
        {
          id: 'image-model',
          name: 'wire-image-model',
          displayName: 'Image Model',
          providerId: 'provider-1',
          capabilities: ['image.generate'],
          enabled: true,
          options: { privateProviderParameter: true },
        },
        {
          id: 'music-model',
          name: 'wire-music-model',
          displayName: 'Music Model',
          providerId: 'provider-1',
          capabilities: ['audio.music.generate'],
          enabled: true,
        },
      ],
      getDefaultModelRef: (type: string) =>
        type === 'image'
          ? { providerId: 'provider-1', modelId: 'image-model' }
          : type === 'audio'
            ? { providerId: 'provider-1', modelId: 'audio-model' }
            : undefined,
      getDefaultModelPurposeRef: (purpose: string) =>
        purpose === 'audio.music.generate'
          ? { providerId: 'provider-1', modelId: 'music-model' }
          : undefined,
    } as unknown as ConfigManager;

    const catalog = projectDesktopCanvasGenerationModels(config);

    expect(catalog).toEqual([
      {
        binding: {
          purpose: 'image.generate',
          providerId: 'provider-1',
          modelId: 'image-model',
        },
        label: 'Image Model',
        providerLabel: 'Provider One',
        isDefault: true,
      },
      {
        binding: {
          purpose: 'audio.music.generate',
          providerId: 'provider-1',
          modelId: 'music-model',
        },
        label: 'Music Model',
        providerLabel: 'Provider One',
        isDefault: true,
      },
    ]);
    expect(JSON.stringify(catalog)).not.toMatch(/apiKey|apiUrl|options|must-not-project/);
  });
});
