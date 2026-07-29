import { describe, expect, it } from 'vitest';
import type { ConfigReadResult } from '@neko/shared/config/config-reader';
import type { Model, Provider } from '../../types/provider';
import { resolveAiProviderSources } from '../ai-provider-source-resolver';

const provider: Provider = {
  id: 'user-newapi',
  name: 'user-newapi',
  displayName: 'User NewAPI',
  type: 'newapi',
  apiUrl: 'https://gateway.example.com/v1',
  apiKey: 'sk-user',
  enabled: true,
  connectionKind: 'gateway',
  protocolProfile: 'newapi',
};

const model: Model = {
  id: 'user-chat',
  name: 'gpt-4o-mini',
  displayName: 'User Chat',
  providerId: provider.id,
  type: 'llm',
  protocolProfile: 'anthropic',
  capabilities: ['chat'],
  enabled: true,
};

function createReadResult(config: Record<string, unknown>): ConfigReadResult {
  return { status: 'ok', filePath: '<test-config>', config } as ConfigReadResult;
}

describe('resolveAiProviderSources', () => {
  it('projects only explicitly configured providers and models', () => {
    const projection = resolveAiProviderSources({
      providers: [provider],
      models: [model],
      userConfigReadResult: createReadResult({ providers: [provider], models: [model] }),
    });

    expect(projection.modelGroups).toEqual([
      expect.objectContaining({ source: 'explicit-config', providerId: provider.id }),
    ]);
    expect(projection.chatModelOptions).toEqual([
      expect.objectContaining({
        id: 'user-newapi:user-chat',
        providerId: provider.id,
        modelId: model.id,
        protocolProfile: 'anthropic',
      }),
    ]);
    expect(projection.hasSelectableModels).toBe(true);
  });

  it('keeps invalid explicit configuration visible', () => {
    const diagnostic = {
      code: 'missingProvider' as const,
      filePath: '<test-config>',
      message: 'missing provider',
    };
    const projection = resolveAiProviderSources({
      providers: [],
      models: [],
      userConfigReadResult: createReadResult({ defaultProvider: 'missing' }),
      configDiagnostic: diagnostic,
    });

    expect(projection.explicitAiConfig).toEqual({
      isExplicit: true,
      invalidDiagnostic: diagnostic,
    });
    expect(projection.modelGroups).toEqual([]);
    expect(projection.hasSelectableModels).toBe(false);
  });

  it('does not expose provider secrets', () => {
    const projection = resolveAiProviderSources({
      providers: [provider],
      models: [model],
      userConfigReadResult: createReadResult({ providers: [provider] }),
    });

    const serialized = JSON.stringify(projection);
    expect(serialized).not.toContain('sk-user');
    expect(serialized).not.toContain('apiKey');
  });
});
