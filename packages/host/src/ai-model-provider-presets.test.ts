import { describe, expect, it } from 'vitest';
import {
  requiredDesktopAiModelCapabilities,
  withRequiredDesktopAiModelCapabilities,
} from './ai-model-provider-presets';

describe('Desktop AI model provider presets', () => {
  it('defines the required capability for each model type', () => {
    expect(requiredDesktopAiModelCapabilities('llm')).toEqual(['chat', 'llm.chat']);
    expect(requiredDesktopAiModelCapabilities('image')).toEqual(['image.generate']);
    expect(requiredDesktopAiModelCapabilities('video')).toEqual(['video.generate']);
    expect(requiredDesktopAiModelCapabilities('audio')).toEqual(['audio.generate']);
  });

  it('adds missing required capabilities without replacing concrete generation modes', () => {
    expect(withRequiredDesktopAiModelCapabilities('image', ['text_to_image'])).toEqual([
      'text_to_image',
      'image.generate',
    ]);
  });

  it('does not duplicate required capabilities that are already present', () => {
    expect(
      withRequiredDesktopAiModelCapabilities('image', ['text_to_image', 'image.generate']),
    ).toEqual(['text_to_image', 'image.generate']);
  });
});
