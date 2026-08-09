import { describe, expect, it, vi } from 'vitest';
import { PromptGenerationService } from './prompt-generation-service';

describe('PromptGenerationService', () => {
  it('validates the exact provider/model and delegates to the narrow completion port', async () => {
    const complete = vi.fn(async () => ({ text: 'Generated text' }));
    const service = new PromptGenerationService(config(), { complete });

    await expect(
      service.generatePrompt({
        providerId: 'provider-1',
        modelId: 'text-model',
        prompt: 'Write a scene',
        context: [{ sourceNodeId: 'notes-1', text: 'Rain', digest: 'sha256:rain' }],
        temperature: 0.5,
      }),
    ).resolves.toMatchObject({
      type: 'prompt',
      providerId: 'provider-1',
      modelId: 'text-model',
      text: 'Generated text',
    });
    expect(complete).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Write a scene\n\nReference context:\nRain' }),
    );
  });

  it('rejects unsupported or mismatched bindings without invoking completion', async () => {
    const complete = vi.fn();
    const service = new PromptGenerationService(config(), { complete });

    await expect(
      service.generatePrompt({
        providerId: 'provider-1',
        modelId: 'image-model',
        prompt: 'Write a scene',
      }),
    ).rejects.toThrow('does not support canvas.prompt');
    await expect(
      service.generatePrompt({
        providerId: 'missing-provider',
        modelId: 'text-model',
        prompt: 'Write a scene',
      }),
    ).rejects.toThrow('provider');
    expect(complete).not.toHaveBeenCalled();
  });
});

function config() {
  const provider = {
    id: 'provider-1',
    name: 'provider-1',
    displayName: 'Provider',
    type: 'openai' as const,
    apiUrl: 'https://example.test/completions',
    apiKey: 'secret',
    enabled: true,
  };
  return {
    getProvider: (id: string) => (id === provider.id ? provider : undefined),
    getModel: (id: string) => {
      if (id === 'text-model') {
        return {
          id,
          name: id,
          providerId: provider.id,
          type: 'llm' as const,
          capabilities: ['llm.chat'],
          enabled: true,
        };
      }
      if (id === 'image-model') {
        return {
          id,
          name: id,
          providerId: provider.id,
          type: 'image' as const,
          capabilities: ['image.generate'],
          enabled: true,
        };
      }
      return undefined;
    },
  };
}
