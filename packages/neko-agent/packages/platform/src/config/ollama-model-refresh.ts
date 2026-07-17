import type { Model, Provider } from '../types/provider';

export interface OllamaModelRefreshConfig {
  getProviders(): Provider[];
  getModelsByProvider(providerId: string): Model[];
  setModel(model: Model): Promise<void>;
}

export interface OllamaModelRefreshLogger {
  warn?(message: string, metadata?: unknown): void;
}

export interface RefreshOllamaModelsInput {
  readonly config: OllamaModelRefreshConfig;
  readonly fetch?: typeof fetch;
  readonly logger?: OllamaModelRefreshLogger;
}

export interface RefreshOllamaModelsResult {
  readonly added: number;
  readonly checkedProviders: number;
  readonly failedProviders: readonly string[];
}

export async function refreshOllamaModels(
  input: RefreshOllamaModelsInput,
): Promise<RefreshOllamaModelsResult> {
  const ollamaProviders = input.config
    .getProviders()
    .filter((provider) => provider.type === 'ollama');
  let added = 0;
  const failedProviders: string[] = [];

  for (const provider of ollamaProviders) {
    try {
      const existing = new Set(
        input.config.getModelsByProvider(provider.id).map((model) => model.name),
      );
      const discovered = await listOllamaModels(provider, input.fetch ?? fetch);

      for (const name of discovered) {
        if (!name || existing.has(name)) continue;
        await input.config.setModel({
          id: `${provider.id}-${name}`,
          name,
          providerId: provider.id,
          capabilities: ['chat'],
          enabled: true,
        });
        existing.add(name);
        added++;
      }
    } catch (error) {
      failedProviders.push(provider.id);
      input.logger?.warn?.('Failed to refresh Ollama models', {
        providerId: provider.id,
        error,
      });
    }
  }

  return {
    added,
    checkedProviders: ollamaProviders.length,
    failedProviders,
  };
}

async function listOllamaModels(provider: Provider, request: typeof fetch): Promise<string[]> {
  const baseUrl = (provider.apiUrl ?? 'http://127.0.0.1:11434')
    .replace(/\/+$/, '')
    .replace(/\/api$/u, '');
  const response = await request(`${baseUrl}/api/tags`);
  if (!response.ok) {
    throw new Error(`Ollama model listing failed with HTTP ${response.status}.`);
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload['models'])) {
    throw new Error('Ollama model listing returned an invalid response.');
  }
  return payload['models'].flatMap((entry) =>
    isRecord(entry) && typeof entry['name'] === 'string' ? [entry['name']] : [],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
