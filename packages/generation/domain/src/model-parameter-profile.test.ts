import { describe, expect, it } from 'vitest';
import {
  conformVideoGenerationRecipeToProfile,
  conformVideoGenerationRequestToProfile,
  createVideoGenerationRecipeForProfile,
  parseGenerationModelParameterProfile,
  resolveImageGenerationModelParameterProfile,
  resolveGenerationModelParameterProfile,
  resolveVideoGenerationModelParameterProfile,
  validateVideoGenerationParameters,
} from './model-parameter-profile';

describe('Generation model parameter profiles', () => {
  it('declares the exact GPT Image 2 controls used by generation surfaces', () => {
    const profile = resolveImageGenerationModelParameterProfile({
      providerType: 'newapi',
      modelName: 'gpt-image-2',
    });
    if (!profile) throw new Error('GPT Image 2 parameter profile is unavailable.');

    expect(profile.controls.aspectRatio.values).toEqual([
      '1:1',
      '16:9',
      '9:16',
      '3:4',
      '4:3',
      '3:2',
      '2:3',
      '5:4',
      '4:5',
      '21:9',
      '2:1',
      '1:2',
      '3:1',
      '1:3',
    ]);
    expect(profile.controls.resolution.suggestedValues).toEqual([1024, 2048, 4096]);
    expect(profile.controls.quality).toEqual({
      kind: 'string-enum',
      required: true,
      values: ['low', 'standard', 'hd'],
      defaultValue: 'standard',
    });
    expect(parseGenerationModelParameterProfile(structuredClone(profile))).toEqual(profile);
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
