import { describe, expect, it } from 'vitest';
import { resolveGenerationModelParameterProfile } from '@neko/generation-domain';

import {
  canvasGenerationModelSupportsPurpose,
  projectCanvasGenerationModels,
} from './canvas-generation-model-catalog';

describe('Canvas Generation model catalog', () => {
  it('projects enabled models by configured type without provider secrets or options', () => {
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
        type: 'image' as const,
        capabilities: ['audio'],
        options: { privateProviderParameter: true },
      },
      {
        id: 'music-model',
        name: 'wire-music-model',
        displayName: 'Music Model',
        providerId: 'provider-1',
        type: 'audio' as const,
        capabilities: ['audio.music.generate'],
      },
      {
        id: 'video-model',
        name: 'MiniMax-H3',
        displayName: 'MiniMax H3',
        providerId: 'provider-1',
        type: 'video' as const,
        capabilities: [],
      },
      {
        id: 'chat-model',
        name: 'wire-chat-model',
        displayName: 'Chat Model',
        providerId: 'provider-1',
        type: 'llm' as const,
        capabilities: ['audio'],
      },
    ];

    const catalog = projectCanvasGenerationModels({
      providers,
      models,
      resolveParameterProfile: (model) =>
        resolveGenerationModelParameterProfile({
          providerType: 'minimax',
          modelName: model.name,
        }),
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
          purpose: 'audio.generate',
          providerId: 'provider-1',
          modelId: 'music-model',
        },
        label: 'Music Model',
        providerLabel: 'Provider One',
        isDefault: false,
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
      {
        binding: {
          purpose: 'canvas.prompt',
          providerId: 'provider-1',
          modelId: 'chat-model',
        },
        label: 'Chat Model',
        providerLabel: 'Provider One',
        isDefault: false,
      },
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
          purpose: 'video.generate',
          providerId: 'provider-1',
          modelId: 'video-model',
        },
        label: 'MiniMax H3',
        providerLabel: 'Provider One',
        isDefault: false,
        parameterProfile: expect.objectContaining({
          kind: 'video',
          supportedParameters: ['duration', 'resolution', 'aspectRatio'],
          fixed: { outputCount: 1 },
        }),
      },
    ]);
    expect(JSON.stringify(catalog)).not.toMatch(/apiKey|apiUrl|options|must-not-project/u);
  });

  it('uses model type instead of generic capabilities for Canvas purpose matching', () => {
    expect(canvasGenerationModelSupportsPurpose({ type: 'llm' }, 'audio.generate')).toBe(false);
    expect(canvasGenerationModelSupportsPurpose({ type: 'audio' }, 'audio.generate')).toBe(true);
    expect(canvasGenerationModelSupportsPurpose({ type: 'audio' }, 'audio.music.generate')).toBe(
      true,
    );
    expect(canvasGenerationModelSupportsPurpose({}, 'canvas.prompt')).toBe(false);
  });

  it('offers every audio model in both audio modes and orders each configured default first', () => {
    const catalog = projectCanvasGenerationModels({
      providers: [{ id: 'provider-1', displayName: 'Provider One' }],
      models: [
        {
          id: 'audio-model',
          name: 'audio-model',
          displayName: 'Audio Model',
          providerId: 'provider-1',
          type: 'audio',
          capabilities: [],
        },
        {
          id: 'music-model',
          name: 'music-model',
          displayName: 'Music Model',
          providerId: 'provider-1',
          type: 'audio',
          capabilities: ['chat'],
        },
      ],
      getDefaultModelRef: (type) =>
        type === 'audio' ? { providerId: 'provider-1', modelId: 'audio-model' } : undefined,
      getDefaultModelPurposeRef: (purpose) =>
        purpose === 'audio.music.generate'
          ? { providerId: 'provider-1', modelId: 'music-model' }
          : undefined,
    });

    expect(
      catalog
        .filter((option) => option.binding.purpose === 'audio.generate')
        .map((option) => [option.label, option.isDefault]),
    ).toEqual([
      ['Audio Model', true],
      ['Music Model', false],
    ]);
    expect(
      catalog
        .filter((option) => option.binding.purpose === 'audio.music.generate')
        .map((option) => [option.label, option.isDefault]),
    ).toEqual([
      ['Music Model', true],
      ['Audio Model', false],
    ]);
  });
});
