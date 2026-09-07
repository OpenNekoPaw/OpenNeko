import { describe, expect, it } from 'vitest';
import {
  conformImageGenerationRequestToProfile,
  conformImageGenerationRecipeToProfile,
  conformVideoGenerationRecipeToProfile,
  conformVideoGenerationRequestToProfile,
  createVideoGenerationRecipeForProfile,
  createImageGenerationRecipeForProfile,
  parseGenerationModelParameterProfile,
  resolveImageGenerationModelParameterProfile,
  resolveGenerationModelParameterProfile,
  resolveVideoGenerationModelParameterProfile,
  validateImageGenerationParameters,
  validateVideoGenerationParameters,
} from './model-parameter-profile';

describe('Generation model parameter profiles', () => {
  it('declares the exact GPT Image 2 controls used by generation surfaces', () => {
    const profile = resolveImageGenerationModelParameterProfile({
      providerType: 'newapi',
      modelName: 'gpt-image-2',
    });
    if (!profile) throw new Error('GPT Image 2 parameter profile is unavailable.');

    expect(profile.controls.size).toEqual({
      kind: 'image-size-enum',
      values: [
        { id: 'auto' },
        { id: '1024x1024', width: 1024, height: 1024, aspectRatio: '1:1' },
        { id: '1536x1024', width: 1536, height: 1024, aspectRatio: '3:2' },
        { id: '1024x1536', width: 1024, height: 1536, aspectRatio: '2:3' },
        { id: '2048x2048', width: 2048, height: 2048, aspectRatio: '1:1' },
        { id: '2048x1152', width: 2048, height: 1152, aspectRatio: '16:9' },
        { id: '3840x2160', width: 3840, height: 2160, aspectRatio: '16:9' },
        { id: '2160x3840', width: 2160, height: 3840, aspectRatio: '9:16' },
      ],
      defaultValue: 'auto',
    });
    expect(profile.controls.quality).toEqual({
      kind: 'string-enum',
      required: true,
      values: ['auto', 'low', 'medium', 'high'],
      defaultValue: 'auto',
    });
    expect(parseGenerationModelParameterProfile(structuredClone(profile))).toEqual(profile);
  });

  it('keeps legacy image quality names available to profiles for other providers', () => {
    const profile = {
      kind: 'image',
      controls: {
        size: {
          kind: 'image-size-enum',
          values: [{ id: 'auto' }],
          defaultValue: 'auto',
        },
        quality: {
          kind: 'string-enum',
          required: true,
          values: ['standard', 'hd'],
          defaultValue: 'standard',
        },
      },
      fixed: { outputCount: 1 },
    };

    expect(parseGenerationModelParameterProfile(profile)).toEqual(profile);
  });

  it('resolves the verified NewAPI GPT Image 2 gateway model name without fuzzy matching', () => {
    expect(
      resolveImageGenerationModelParameterProfile({
        providerType: 'newapi',
        modelName: 'gpt-image-2-pro-all',
      }),
    ).toEqual(
      resolveImageGenerationModelParameterProfile({
        providerType: 'newapi',
        modelName: 'gpt-image-2',
      }),
    );
    expect(
      resolveImageGenerationModelParameterProfile({
        providerType: 'newapi',
        modelName: 'gpt-image-2-unknown',
      }),
    ).toBeUndefined();
  });

  it('creates and conforms image Recipes from the exact model profile', () => {
    const profile = resolveImageGenerationModelParameterProfile({
      providerType: 'newapi',
      modelName: 'gpt-image-2',
    });
    if (!profile) throw new Error('GPT Image 2 parameter profile is unavailable.');
    const model = {
      purpose: 'image.generate' as const,
      providerId: 'image-provider',
      modelId: 'gpt-image-2',
    };

    expect(createImageGenerationRecipeForProfile(model, profile)).toEqual({
      kind: 'image',
      prompt: '',
      model,
      count: 1,
      quality: 'auto',
    });
    expect(
      conformImageGenerationRecipeToProfile(
        {
          kind: 'image',
          prompt: 'Keep this prompt',
          model,
          width: 4096,
          height: 2304,
          aspectRatio: '16:9',
          count: 4,
          quality: 'high',
        },
        profile,
      ),
    ).toEqual({
      recipe: {
        kind: 'image',
        prompt: 'Keep this prompt',
        model,
        count: 1,
        quality: 'high',
      },
      adjustments: [
        { parameter: 'size', reason: 'invalid' },
        { parameter: 'count', reason: 'invalid' },
      ],
    });
  });

  it('conforms Agent image requests to automatic model defaults with visible adjustments', () => {
    const profile = resolveImageGenerationModelParameterProfile({
      providerType: 'newapi',
      modelName: 'gpt-image-2',
    });
    if (!profile) throw new Error('GPT Image 2 parameter profile is unavailable.');

    expect(
      conformImageGenerationRequestToProfile(
        {
          prompt: 'Recompose the supplied frame as a 16:9 environment.',
          operation: 'edit',
          referenceImageLocator: {
            file: { authority: 'workspace', path: 'references/source.png' },
          },
          aspectRatio: '16:9',
          quality: 'hd',
        },
        profile,
      ),
    ).toEqual({
      request: {
        prompt: 'Recompose the supplied frame as a 16:9 environment.',
        operation: 'edit',
        referenceImageLocator: {
          file: { authority: 'workspace', path: 'references/source.png' },
        },
        count: 1,
        quality: 'auto',
      },
      adjustments: [
        { parameter: 'size', reason: 'invalid' },
        { parameter: 'quality', reason: 'invalid' },
      ],
    });
  });

  it('validates GPT Image 2 dimensions against the same controls shown by Canvas', () => {
    const profile = resolveImageGenerationModelParameterProfile({
      providerType: 'newapi',
      modelName: 'gpt-image-2',
    });
    if (!profile) throw new Error('GPT Image 2 parameter profile is unavailable.');

    expect(
      validateImageGenerationParameters(profile, {
        width: 1536,
        height: 1024,
        aspectRatio: '3:2',
        count: 1,
        quality: 'high',
      }),
    ).toEqual([]);
    expect(
      validateImageGenerationParameters(profile, {
        width: 1920,
        height: 1080,
        aspectRatio: '16:9',
        count: 2,
      }),
    ).toEqual([
      expect.objectContaining({ parameter: 'size', reason: 'invalid' }),
      expect.objectContaining({ parameter: 'count', reason: 'invalid' }),
    ]);
    expect(
      validateImageGenerationParameters(profile, {
        width: 1536,
        height: 1024,
        aspectRatio: '16:9',
      }),
    ).toEqual([expect.objectContaining({ parameter: 'size', reason: 'invalid' })]);

    expect(
      validateImageGenerationParameters(profile, {
        count: 1,
        quality: 'auto',
      }),
    ).toEqual([]);
  });

  it('declares exact MiniMax H3 defaults without an FPS control', () => {
    const profile = requireProfile('minimax', 'MiniMax-H3');
    const recipe = createVideoGenerationRecipeForProfile(modelBinding(), profile);

    expect(recipe).toEqual({
      kind: 'video',
      prompt: '',
      model: modelBinding(),
      aspectRatio: '16:9',
      resolution: '768P',
      duration: 5,
    });
    expect(profile.controls.fps).toBeUndefined();
    expect(profile.supportedParameters).not.toContain('fps');
  });

  it('locally repairs generic video defaults for MiniMax H3 and reports each adjustment', () => {
    const profile = requireProfile('minimax', 'MiniMax-H3');
    const result = conformVideoGenerationRecipeToProfile(
      {
        kind: 'video',
        prompt: 'Animate the cat',
        model: modelBinding(),
        aspectRatio: '16:9',
        resolution: '720p',
        duration: 5,
        fps: 24,
      },
      profile,
    );

    expect(result.recipe).toEqual({
      kind: 'video',
      prompt: 'Animate the cat',
      model: modelBinding(),
      aspectRatio: '16:9',
      resolution: '768P',
      duration: 5,
    });
    expect(result.adjustments).toEqual([
      { parameter: 'resolution', reason: 'invalid' },
      { parameter: 'fps', reason: 'unsupported' },
    ]);
  });

  it('rejects unsupported or invalid H3 request parameters before provider execution', () => {
    const profile = requireProfile('minimax', 'MiniMax-H3');

    expect(
      validateVideoGenerationParameters(profile, {
        duration: 5,
        resolution: '720p',
        aspectRatio: '16:9',
        fps: 24,
      }),
    ).toEqual([
      expect.objectContaining({ parameter: 'resolution', reason: 'invalid' }),
      expect.objectContaining({ parameter: 'fps', reason: 'unsupported' }),
    ]);
  });

  it('conforms an Agent video request to the same MiniMax H3 profile as Canvas', () => {
    const profile = requireProfile('minimax', 'MiniMax-H3');
    const result = conformVideoGenerationRequestToProfile(
      {
        prompt: 'Slowly push upward through the structure',
        providerId: 'minimax-provider',
        modelId: 'minimax-h3',
        inputs: [
          {
            type: 'image',
            role: 'first-frame',
            locator: { file: { authority: 'workspace', path: 'shots/SH01.png' } },
          },
        ],
        negativePrompt: 'text and watermarks',
        duration: 6,
        resolution: '1080p',
        fps: 24,
        aspectRatio: '16:9',
        generateAudio: false,
        motionStrength: 0.25,
        cameraMovement: 'dolly-in',
        shotScale: 'extreme-wide',
      },
      profile,
    );

    expect(result.request).toEqual({
      prompt: 'Slowly push upward through the structure',
      providerId: 'minimax-provider',
      modelId: 'minimax-h3',
      inputs: [
        {
          type: 'image',
          role: 'first-frame',
          locator: { file: { authority: 'workspace', path: 'shots/SH01.png' } },
        },
      ],
      duration: 6,
      resolution: '768P',
      aspectRatio: '16:9',
      shotScale: 'extreme-wide',
    });
    expect(result.adjustments).toEqual([
      { parameter: 'negativePrompt', reason: 'unsupported' },
      { parameter: 'resolution', reason: 'invalid' },
      { parameter: 'fps', reason: 'unsupported' },
      { parameter: 'generateAudio', reason: 'unsupported' },
      { parameter: 'motionStrength', reason: 'unsupported' },
      { parameter: 'cameraMovement', reason: 'unsupported' },
    ]);
  });

  it('fills required MiniMax H3 defaults for a minimal Agent video request', () => {
    const profile = requireProfile('minimax', 'MiniMax-H3');
    const result = conformVideoGenerationRequestToProfile(
      { prompt: 'A slow upward push' },
      profile,
    );

    expect(result.request).toEqual({
      prompt: 'A slow upward push',
      duration: 5,
      resolution: '768P',
      aspectRatio: '16:9',
    });
    expect(result.adjustments).toEqual([
      { parameter: 'duration', reason: 'missing-required' },
      { parameter: 'resolution', reason: 'missing-required' },
      { parameter: 'aspectRatio', reason: 'missing-required' },
    ]);
  });

  it('projects Seedance fixed FPS as metadata instead of an editable parameter', () => {
    const profile = requireProfile('bytedance', 'doubao-seedance-2-0-260128');

    expect(profile.fixed).toEqual({ outputCount: 1, fps: 24 });
    expect(profile.controls.fps).toBeUndefined();
    expect(profile.controls.resolution?.values).toEqual(['480p', '720p', '1080p', '4k']);
    expect(profile.controls.aspectRatio?.defaultValue).toBe('adaptive');
    expect(profile.controls.generateAudio).toEqual({ kind: 'boolean', required: false });
  });

  it('strictly decodes a detached profile and rejects unknown fields', () => {
    const profile = requireProfile('minimax', 'MiniMax-H3');
    expect(parseGenerationModelParameterProfile(structuredClone(profile))).toEqual(profile);
    expect(() => parseGenerationModelParameterProfile({ ...profile, unexpected: true })).toThrow(
      'unexpected fields',
    );
  });

  it('does not guess parameter support for a custom gateway model', () => {
    expect(
      resolveGenerationModelParameterProfile({
        providerType: 'newapi',
        modelName: 'custom-video-model',
      }),
    ).toBeUndefined();
  });
});

function requireProfile(providerType: 'minimax' | 'bytedance', modelName: string) {
  const profile = resolveVideoGenerationModelParameterProfile({ providerType, modelName });
  if (!profile) throw new Error('Test model profile is unavailable.');
  return profile;
}

function modelBinding() {
  return {
    purpose: 'video.generate' as const,
    providerId: 'provider-1',
    modelId: 'model-1',
  };
}
