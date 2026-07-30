import { describe, expect, it, vi } from 'vitest';
import { refreshOllamaModels, type OllamaModelRefreshConfig } from '../ollama-model-refresh';
import type { Model, Provider } from '../../types/provider';

const ollamaProvider: Provider = {
  id: 'ollama-local',
  name: 'ollama',
  displayName: 'Ollama',
  type: 'ollama',
  apiUrl: 'http://localhost:11434/api',
  enabled: true,
  connectionKind: 'local',
  protocolProfile: 'ollama',
  requiresApiKey: false,
};

function createConfig(existingModels: Model[] = []): {
  config: OllamaModelRefreshConfig;
  setModel: ReturnType<typeof vi.fn>;
} {
  const models = [...existingModels];
  const setModel = vi.fn(async (model: Model) => void models.push(model));
  return {
    config: {
      getProviders: () => [ollamaProvider],
      getModelsByProvider: (providerId) =>
        models.filter((model) => model.providerId === providerId),
      setModel,
    },
    setModel,
  };
}

describe('refreshOllamaModels', () => {
  it('discovers models through the Ollama-owned HTTP API', async () => {
    const { config, setModel } = createConfig([
      {
        id: 'ollama-local-llama3',
        name: 'llama3',
        providerId: 'ollama-local',
        capabilities: ['chat'],
        enabled: true,
      },
    ]);
    const request = vi.fn(
      async () =>
        new Response(JSON.stringify({ models: [{ name: 'llama3' }, { name: 'qwen2.5' }] }), {
          status: 200,
        }),
    );

    await expect(refreshOllamaModels({ config, fetch: request })).resolves.toEqual({
      added: 1,
      checkedProviders: 1,
      failedProviders: [],
    });
    expect(request).toHaveBeenCalledWith('http://localhost:11434/api/tags');
    expect(setModel).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'qwen2.5', providerId: 'ollama-local' }),
    );
  });

  it('reports HTTP failures without falling back to a chat adapter', async () => {
    const { config, setModel } = createConfig();
    const logger = { warn: vi.fn() };
    await expect(
      refreshOllamaModels({
        config,
        fetch: async () => new Response('offline', { status: 503 }),
        logger,
      }),
    ).resolves.toEqual({
      added: 0,
      checkedProviders: 1,
      failedProviders: ['ollama-local'],
    });
    expect(setModel).not.toHaveBeenCalled();
  });
});
