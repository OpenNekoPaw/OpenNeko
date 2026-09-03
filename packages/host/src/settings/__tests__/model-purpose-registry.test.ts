import { describe, expect, it } from 'vitest';
import type { Model } from '../types/provider';
import {
  getModelPurposeCapabilityMatches,
  isAgentModelPurpose,
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
  it('matches generation purposes by explicit model type and capability', () => {
    for (const [purpose, type, capability] of [
      ['image.generate', 'image', 'image.generate'],
      ['image.edit', 'image', 'image.edit'],
      ['video.generate', 'video', 'video.generate'],
      ['audio.generate', 'audio', 'audio.generate'],
      ['audio.tts', 'audio', 'audio.tts'],
      ['audio.asr', 'audio', 'audio.asr'],
    ] as const) {
      expect(
        modelSupportsPurpose(
          createModel({ id: `${type}-model`, type, capabilities: [capability] }),
          purpose,
        ),
      ).toBe(true);
    }
    expect(
      modelSupportsPurpose(
        createModel({ id: 'chat-audio', type: 'llm', capabilities: ['audio'] }),
        'audio.generate',
      ),
    ).toBe(false);
    expect(
      modelSupportsPurpose(
        createModel({ id: 'chat-image', type: 'llm', capabilities: ['image.generate'] }),
        'image.generate',
      ),
    ).toBe(false);
    expect(
      modelSupportsPurpose(
        createModel({ id: 'chat-video', type: 'llm', capabilities: ['video.generate'] }),
        'video.generate',
      ),
    ).toBe(false);
    expect(
      modelSupportsPurpose(
        createModel({ id: 'audio-model', type: 'audio', capabilities: ['audio.generate'] }),
        'audio.music.generate',
      ),
    ).toBe(false);
    expect(
      modelSupportsPurpose(
        createModel({ id: 'untyped-image', type: undefined, capabilities: ['image.generate'] }),
        'image.generate',
      ),
    ).toBe(false);
  });

  it('keeps non-generation purposes capability-qualified', () => {
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
        createModel({ id: 'wrong-chat', type: 'llm', capabilities: ['streaming'] }),
        'canvas.prompt',
      ),
    ).toBe(false);
  });

  it('rejects purposes outside the canonical registry', () => {
    expect(isAgentModelPurpose('media.analysis')).toBe(false);
    expect(getModelPurposeCapabilityMatches('llm.chat')).toEqual(['llm.chat', 'chat']);
  });
});
