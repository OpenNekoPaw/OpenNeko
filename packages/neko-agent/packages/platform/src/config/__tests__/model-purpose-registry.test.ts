import { describe, expect, it } from 'vitest';
import type { Model } from '../../types/provider';
import {
  getModelPurposeCapabilityMatches,
  MEDIA_UNDERSTANDING_PURPOSE_CAPABILITIES,
  modelSupportsPurpose,
} from '../model-purpose-registry';

const providerId = 'neko-gateway';

function createModel(input: Pick<Model, 'id' | 'type' | 'capabilities'> & Partial<Model>): Model {
  return {
    name: input.id,
    providerId,
    enabled: true,
    ...input,
  };
}

describe('model-purpose-registry', () => {
  it('treats existing catalog capability fields as satisfying internal purposes', () => {
    expect(
      modelSupportsPurpose(
        createModel({ id: 'suno-v4', type: 'audio', capabilities: ['text_to_music'] }),
        'audio.music.generate',
      ),
    ).toBe(true);
    expect(
      modelSupportsPurpose(
        createModel({ id: 'gpt', type: 'llm', capabilities: ['chat', 'streaming'] }),
        'canvas.prompt',
      ),
    ).toBe(true);
    expect(
      modelSupportsPurpose(
        createModel({ id: 'embedding', type: 'llm', capabilities: ['embedding'] }),
        'text.embed',
      ),
    ).toBe(true);
    expect(
      modelSupportsPurpose(
        createModel({ id: 'kling', type: 'video', capabilities: ['text_to_video'] }),
        'video.generate',
      ),
    ).toBe(true);
  });

  it('requires explicit native video understanding instead of generic vision', () => {
    expect(
      modelSupportsPurpose(
        createModel({ id: 'vision-only', type: 'llm', capabilities: ['chat', 'vision'] }),
        'video.understand',
      ),
    ).toBe(false);
    expect(
      modelSupportsPurpose(
        createModel({
          id: 'gemini-video',
          type: 'llm',
          capabilities: ['chat', 'vision_video'],
        }),
        'video.understand',
      ),
    ).toBe(true);
  });

  it('requires explicit native image and audio understanding capabilities', () => {
    expect(
      modelSupportsPurpose(
        createModel({ id: 'vision-only', type: 'llm', capabilities: ['chat', 'vision'] }),
        'image.understand',
      ),
    ).toBe(true);
    expect(
      modelSupportsPurpose(
        createModel({ id: 'tts', type: 'audio', capabilities: ['text_to_audio', 'audio'] }),
        'audio.understand',
      ),
    ).toBe(false);
    expect(
      modelSupportsPurpose(
        createModel({
          id: 'gemini-media',
          type: 'llm',
          capabilities: ['chat', 'vision', 'audio'],
        }),
        'image.understand',
      ),
    ).toBe(true);
    expect(
      modelSupportsPurpose(
        createModel({
          id: 'gemini-media',
          type: 'llm',
          capabilities: ['chat', 'vision', 'audio'],
        }),
        'audio.understand',
      ),
    ).toBe(true);
  });

  it('maps media understanding purposes to canonical current capabilities while reading legacy aliases', () => {
    expect(MEDIA_UNDERSTANDING_PURPOSE_CAPABILITIES).toEqual({
      'image.understand': 'vision',
      'audio.understand': 'audio',
      'video.understand': 'vision_video',
    });
    expect(getModelPurposeCapabilityMatches('image.understand')).toEqual([
      'vision',
      'image.understand',
    ]);
    expect(getModelPurposeCapabilityMatches('audio.understand')).toEqual([
      'audio',
      'audio.understand',
    ]);
    expect(getModelPurposeCapabilityMatches('video.understand')).toEqual([
      'vision_video',
      'video.understand',
    ]);

    expect(
      modelSupportsPurpose(
        createModel({
          id: 'legacy-video',
          type: 'llm',
          capabilities: ['chat', 'video.understand'],
        }),
        'video.understand',
      ),
    ).toBe(true);
  });

  it('does not infer image or standalone audio understanding from video understanding', () => {
    const videoOnly = createModel({
      id: 'video-only',
      type: 'llm',
      capabilities: ['chat', 'vision_video'],
    });

    expect(modelSupportsPurpose(videoOnly, 'video.understand')).toBe(true);
    expect(modelSupportsPurpose(videoOnly, 'image.understand')).toBe(false);
    expect(modelSupportsPurpose(videoOnly, 'audio.understand')).toBe(false);
  });
});
