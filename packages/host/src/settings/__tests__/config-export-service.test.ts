import { describe, expect, it, vi } from 'vitest';
import {
  ConfigExportService,
  parseConfigExportData,
  type IConfigOperations,
} from '../config-export-service';
import type { Model, Provider } from '../types/provider';

const PROVIDER: Provider = {
  id: 'deepseek-direct',
  name: 'deepseek',
  displayName: 'DeepSeek Direct',
  type: 'generic',
  apiUrl: 'https://api.deepseek.com/api',
  apiKey: 'not-exportable',
  enabled: true,
  connectionKind: 'direct',
  protocolProfile: 'openai-chat',
  requiresApiKey: true,
};

const MODEL: Model = {
  id: 'deepseek-chat',
  name: 'deepseek-chat',
  displayName: 'DeepSeek Chat',
  providerId: PROVIDER.id,
  type: 'llm',
  capabilities: ['chat'],
  enabled: true,
};

function createOperations(): IConfigOperations & {
  readonly setProvider: ReturnType<typeof vi.fn>;
  readonly setModel: ReturnType<typeof vi.fn>;
} {
  const setProvider = vi.fn(async (_provider: Provider) => undefined);
  const setModel = vi.fn(async (_model: Model) => undefined);
  return { setProvider, setModel };
}

describe('ConfigExportService', () => {
  it('exports portable provider and model definitions without credentials', () => {
    const result = new ConfigExportService().exportConfig(
      new Map([[PROVIDER.id, PROVIDER]]),
      new Map([[MODEL.id, MODEL]]),
    );

    expect(result.providers).toEqual([
      expect.objectContaining({ id: PROVIDER.id, apiUrl: PROVIDER.apiUrl }),
    ]);
    expect(result.models).toEqual([MODEL]);
    expect(JSON.stringify(result)).not.toContain('not-exportable');
    expect(result.providers[0]).not.toHaveProperty('apiKey');
  });

  it('rejects corrupt or secret-bearing import documents before writes', async () => {
    expect(() =>
      parseConfigExportData({
        exportedAt: new Date().toISOString(),
        providers: [{ ...PROVIDER }],
        models: [MODEL],
      }),
    ).toThrow("unknown field 'apiKey'");

    const operations = createOperations();
    const result = await new ConfigExportService().importConfig(
      {
        exportedAt: 'not-a-date',
        providers: [],
        models: [],
      },
      operations,
    );
    expect(result.success).toBe(false);
    expect(operations.setProvider).not.toHaveBeenCalled();
    expect(operations.setModel).not.toHaveBeenCalled();
  });

  it('imports validated definitions through the product config owner', async () => {
    const service = new ConfigExportService();
    const exported = service.exportConfig(
      new Map([[PROVIDER.id, PROVIDER]]),
      new Map([[MODEL.id, MODEL]]),
    );
    const operations = createOperations();

    const result = await service.importConfig(exported, operations);

    expect(result).toEqual({
      success: true,
      message: 'Imported 2 configuration definitions',
      importedCount: 2,
    });
    expect(operations.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({ id: PROVIDER.id, connectionKind: 'direct' }),
    );
    expect(operations.setModel).toHaveBeenCalledWith(MODEL);
  });

  it('creates custom provider definitions without accepting credential data', async () => {
    const service = new ConfigExportService();
    const operations = createOperations();

    const result = await service.addCustomProvider(
      {
        id: 'ollama-local',
        name: 'ollama',
        type: 'ollama',
        baseUrl: 'http://localhost:11434/api',
      },
      operations,
    );

    expect(result.success).toBe(true);
    expect(operations.setProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'ollama-local',
        connectionKind: 'local',
        protocolProfile: 'ollama',
        requiresApiKey: false,
      }),
    );
  });
});
