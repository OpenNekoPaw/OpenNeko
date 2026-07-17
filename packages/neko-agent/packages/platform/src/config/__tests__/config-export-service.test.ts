import { describe, expect, it, vi } from 'vitest';
import { ConfigExportService, type IConfigOperations } from '../config-export-service';
import type { Provider } from '../../types/provider';

function createOperations(): IConfigOperations & {
  setProvider: ReturnType<typeof vi.fn>;
} {
  return {
    updateProviderOverride: vi.fn(),
    updateModelOverride: vi.fn(),
    setProvider: vi.fn(),
  } as IConfigOperations & { setProvider: ReturnType<typeof vi.fn> };
}

describe('ConfigExportService.addCustomProvider', () => {
  it('keeps generic custom providers on direct OpenAI-compatible routing by default', async () => {
    const service = new ConfigExportService();
    const operations = createOperations();

    const result = await service.addCustomProvider(
      {
        id: 'deepseek-direct',
        name: 'deepseek',
        displayName: 'DeepSeek Direct',
        type: 'generic',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-test',
      },
      operations,
    );

    expect(result.success).toBe(true);
    expect(operations.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'deepseek-direct',
        type: 'generic',
        apiUrl: 'https://api.deepseek.com/v1',
        connectionKind: 'direct',
        protocolProfile: 'openai-chat',
        requiresApiKey: true,
      } satisfies Partial<Provider>),
    );
  });

  it('uses gateway routing only when requested explicitly', async () => {
    const service = new ConfigExportService();
    const operations = createOperations();

    await service.addCustomProvider(
      {
        id: 'custom-newapi',
        name: 'custom-newapi',
        type: 'newapi',
        connectionKind: 'gateway',
        protocolProfile: 'newapi',
        baseUrl: 'https://www.nekoapi.com/v1',
      },
      operations,
    );

    expect(operations.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'custom-newapi',
        type: 'newapi',
        connectionKind: 'gateway',
        protocolProfile: 'newapi',
      } satisfies Partial<Provider>),
    );
  });

  it('keeps Ollama custom providers local by default', async () => {
    const service = new ConfigExportService();
    const operations = createOperations();

    await service.addCustomProvider(
      {
        id: 'ollama-local',
        name: 'ollama',
        type: 'ollama',
        baseUrl: 'http://localhost:11434/api',
      },
      operations,
    );

    expect(operations.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ollama-local',
        type: 'ollama',
        connectionKind: 'local',
        protocolProfile: 'ollama',
        requiresApiKey: false,
      } satisfies Partial<Provider>),
    );
  });
});
