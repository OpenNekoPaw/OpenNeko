import { describe, expect, it } from 'vitest';
import {
  createGenerationRecipe,
  isGenerationRecipe,
  projectGenerationRecipeRequest,
  purposeForGenerationRecipe,
} from '../recipe';

describe('Generation Recipe ownership', () => {
  it('creates canonical typed defaults for every kind', () => {
    expect(createGenerationRecipe('prompt')).toMatchObject({
      kind: 'prompt',
      prompt: '',
      temperature: 0.7,
      maxOutputTokens: 2048,
    });
    expect(createGenerationRecipe('image')).toMatchObject({
      kind: 'image',
      aspectRatio: '1:1',
      count: 1,
    });
    expect(createGenerationRecipe('audio')).toMatchObject({
      kind: 'audio',
      isMusic: false,
      format: 'mp3',
    });
    expect(createGenerationRecipe('video')).toMatchObject({
      kind: 'video',
      aspectRatio: '16:9',
      resolution: '720p',
    });
  });

  it('validates exact purpose and rejects unknown Recipe fields', () => {
    expect(
      isGenerationRecipe({
        kind: 'audio',
        prompt: 'score',
        isMusic: true,
        model: {
          purpose: 'audio.music.generate',
          providerId: 'provider',
          modelId: 'model',
        },
      }),
    ).toBe(true);
    expect(purposeForGenerationRecipe({ kind: 'audio', isMusic: true })).toBe(
      'audio.music.generate',
    );
    expect(isGenerationRecipe({ kind: 'image', prompt: '', unexpected: true })).toBe(false);
  });

  it('projects Canvas-neutral inputs into one canonical Job request', () => {
    const request = projectGenerationRecipeRequest(
      {
        kind: 'image',
        prompt: 'portrait',
        count: 2,
        model: {
          purpose: 'image.generate',
          providerId: 'provider',
          modelId: 'model',
        },
      },
      [
        {
          kind: 'text',
          sourceNodeId: 'text-node',
          text: 'warm light',
          digest: 'sha256:text',
        },
        {
          kind: 'image',
          sourceNodeId: 'image-node',
          locator: { file: { authority: 'workspace', path: 'references/portrait.png' } },
        },
      ],
    );

    expect(request).toEqual({
      generationType: 'image-to-image',
      providerId: 'provider',
      modelId: 'model',
      request: {
        prompt: 'portrait\n\nwarm light',
        providerId: 'provider',
        modelId: 'model',
        count: 2,
        referenceImageLocator: {
          file: { authority: 'workspace', path: 'references/portrait.png' },
        },
      },
    });
  });

  it('rejects unsupported audio references without selecting another path', () => {
    expect(() =>
      projectGenerationRecipeRequest(
        {
          kind: 'audio',
          prompt: 'voice',
          model: {
            purpose: 'audio.generate',
            providerId: 'provider',
            modelId: 'model',
          },
        },
        [
          {
            kind: 'audio',
            sourceNodeId: 'audio-node',
            locator: { file: { authority: 'workspace', path: 'references/voice.wav' } },
          },
        ],
      ),
    ).toThrow('does not support an audio reference input');
  });

  it('projects model-owned video controls without inventing fixed parameters', () => {
    expect(
      projectGenerationRecipeRequest(
        {
          kind: 'video',
          prompt: 'A quiet cinematic street',
          model: {
            purpose: 'video.generate',
            providerId: 'bytedance-provider',
            modelId: 'seedance-2',
          },
          aspectRatio: 'adaptive',
          resolution: '720p',
          duration: 5,
          generateAudio: true,
        },
        [],
      ),
    ).toEqual({
      generationType: 'text-to-video',
      providerId: 'bytedance-provider',
      modelId: 'seedance-2',
      request: {
        prompt: 'A quiet cinematic street',
        providerId: 'bytedance-provider',
        modelId: 'seedance-2',
        aspectRatio: 'adaptive',
        resolution: '720p',
        duration: 5,
        generateAudio: true,
      },
    });
  });
});
