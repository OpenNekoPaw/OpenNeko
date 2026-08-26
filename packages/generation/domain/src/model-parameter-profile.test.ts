import { describe, expect, it } from 'vitest';
import {
  conformVideoGenerationRecipeToProfile,
  createVideoGenerationRecipeForProfile,
  parseGenerationModelParameterProfile,
  resolveGenerationModelParameterProfile,
  validateVideoGenerationParameters,
} from './model-parameter-profile';

describe('Generation model parameter profiles', () => {
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
  const profile = resolveGenerationModelParameterProfile({ providerType, modelName });
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
