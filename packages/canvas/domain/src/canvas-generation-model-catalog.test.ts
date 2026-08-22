import { describe, expect, it } from 'vitest';

import { projectCanvasGenerationModels } from './canvas-generation-model-catalog';

describe('Canvas Generation model catalog', () => {
  it('projects enabled purpose-qualified labels without provider secrets or options', () => {
    const providers = [
      {
        id: 'provider-1',
        displayName: 'Provider One',
        apiKey: 'must-not-project',
        apiUrl: 'https://private.example.test',
      },
    ];
    const models = [
      {
        id: 'image-model',
        name: 'wire-image-model',
        displayName: 'Image Model',
        providerId: 'provider-1',
        capabilities: ['image.generate'],
        options: { privateProviderParameter: true },
      },
      {
        id: 'music-model',
        name: 'wire-music-model',
        displayName: 'Music Model',
        providerId: 'provider-1',
        capabilities: ['audio.music.generate'],
      },
    ];

    const catalog = projectCanvasGenerationModels({
      providers,
      models,
      supportsPurpose: (model, purpose) => model.capabilities.includes(purpose),
      getDefaultModelRef: (type) =>
        type === 'image'
          ? { providerId: 'provider-1', modelId: 'image-model' }
          : type === 'audio'
            ? { providerId: 'provider-1', modelId: 'audio-model' }
            : undefined,
      getDefaultModelPurposeRef: (purpose) =>
        purpose === 'audio.music.generate'
          ? { providerId: 'provider-1', modelId: 'music-model' }
          : undefined,
    });

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
    expect(JSON.stringify(catalog)).not.toMatch(/apiKey|apiUrl|options|must-not-project/u);
  });
});
