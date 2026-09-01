import { describe, expect, it, vi } from 'vitest';
import type { Model, Provider, ProviderCredentialReader } from '@neko/host/settings';

import {
  createDesktopDshProviderRuntimeProjection,
  OPENNEKO_DSH_MAX_REQUEST_IMAGE_BYTES,
  OPENNEKO_DSH_REQUEST_IMAGE_MAX_BYTES,
  OPENNEKO_DSH_REQUEST_IMAGE_PIXEL_BUDGET,
} from './desktop-dsh-provider-runtime';

describe('Desktop DSH provider runtime projection', () => {
  it('projects exact Host provider routes, API model names, and subprocess-only credentials', async () => {
    const credentials: ProviderCredentialReader = {
      read: vi.fn(async (providerId) => ({
        type: 'api_key' as const,
        key: `${providerId}-secret`,
      })),
    };
    const projection = await createDesktopDshProviderRuntimeProjection({
      providers: [
        provider({
          id: 'nekoapi-chat',
          displayName: 'Neko API Chat',
          type: 'newapi',
          protocolProfile: 'newapi',
          apiUrl: 'https://gateway.example.test',
          protocolVariant: { basePath: '/v1', authType: 'bearer' },
        }),
        provider({
          id: 'deepseek-chat',
          displayName: 'DeepSeek Chat',
          type: 'generic',
          protocolProfile: 'openai-chat',
          apiUrl: 'https://api.deepseek.example/v1',
        }),
      ],
      models: [
        model({
          id: 'product-luna',
          name: 'gpt-5.6-luna',
          providerId: 'nekoapi-chat',
          contextWindow: 256_000,
          maxOutputTokens: 128_000,
        }),
        model({
          id: 'product-deepseek-flash',
          name: 'deepseek-v4-flash',
          providerId: 'deepseek-chat',
        }),
      ],
      credentials,
    });

    expect(projection.executionCatalog.resolve('nekoapi-chat', 'product-luna')).toEqual({
      providerId: 'nekoapi-chat',
      productModelId: 'product-luna',
      apiModelName: 'gpt-5.6-luna',
      input: ['text'],
    });
    expect(projection.executionCatalog.resolve('deepseek-chat', 'product-deepseek-flash')).toEqual({
      providerId: 'deepseek-chat',
      productModelId: 'product-deepseek-flash',
      apiModelName: 'deepseek-v4-flash',
      input: ['text'],
    });
    expect(projection.credentialEnvironment).toEqual({
      OPENNEKO_DSH_PROVIDER_CREDENTIAL_0: 'nekoapi-chat-secret',
      OPENNEKO_DSH_PROVIDER_CREDENTIAL_1: 'deepseek-chat-secret',
    });
    const serializedPatch = JSON.stringify(projection.profilePatchEntries);
    expect(serializedPatch).toContain('"nekoapi-chat"');
    expect(serializedPatch).toContain('"baseURL":"https://gateway.example.test/v1"');
    expect(serializedPatch).toContain('"id":"gpt-5.6-luna"');
    expect(serializedPatch).toContain('"deepseek-chat"');
    expect(serializedPatch.match(/"requestImagePixelBudget":4194304/gu)).toHaveLength(2);
    expect(serializedPatch.match(/"requestImageMaxBytes":1048576/gu)).toHaveLength(2);
    expect(serializedPatch.match(/"maxRequestImageBytes":6291456/gu)).toHaveLength(2);
    expect(OPENNEKO_DSH_REQUEST_IMAGE_PIXEL_BUDGET).toBe(2048 * 2048);
    expect(OPENNEKO_DSH_REQUEST_IMAGE_MAX_BYTES).toBe(1024 * 1024);
    expect(OPENNEKO_DSH_MAX_REQUEST_IMAGE_BYTES).toBe(6 * 1024 * 1024);
    expect(serializedPatch).not.toContain('secret');
    expect(projection.diagnostics).toEqual([]);
  });

  it('advertises image input only for models with the canonical vision capability', async () => {
    const projection = await createDesktopDshProviderRuntimeProjection({
      providers: [provider({ id: 'vision-provider', requiresApiKey: false })],
      models: [
        model({
          id: 'vision-model',
          providerId: 'vision-provider',
          capabilities: ['chat', 'vision'],
        }),
        model({ id: 'text-model', providerId: 'vision-provider', capabilities: ['chat'] }),
      ],
      credentials: { read: vi.fn(async () => undefined) },
    });

    expect(projection.executionCatalog.resolve('vision-provider', 'vision-model')?.input).toEqual([
      'text',
      'image',
    ]);
    expect(projection.executionCatalog.resolve('vision-provider', 'text-model')?.input).toEqual([
      'text',
    ]);
    expect(JSON.stringify(projection.profilePatchEntries)).toContain('"input":["text","image"]');
  });

  it('projects local Ollama dialogue models through its OpenAI-compatible endpoint without credentials', async () => {
    const readCredential = vi.fn(async () => undefined);
    const projection = await createDesktopDshProviderRuntimeProjection({
      providers: [
        provider({
          id: 'ollama-local',
          type: 'ollama',
          apiUrl: 'http://localhost:11434/api',
          connectionKind: 'local',
          protocolProfile: 'ollama',
          requiresApiKey: false,
          useBearerAuth: false,
        }),
      ],
      models: [model({ id: 'llama-local', providerId: 'ollama-local', name: 'llama3.2' })],
      credentials: { read: readCredential },
    });

    expect(projection.executionCatalog.resolve('ollama-local', 'llama-local')).toEqual({
      providerId: 'ollama-local',
      productModelId: 'llama-local',
      apiModelName: 'llama3.2',
      input: ['text'],
    });
    expect(JSON.stringify(projection.profilePatchEntries)).toContain(
      '"baseURL":"http://localhost:11434/v1"',
    );
    expect(projection.credentialEnvironment).toEqual({});
    expect(projection.diagnostics).toEqual([]);
    expect(readCredential).not.toHaveBeenCalled();
  });

  it('lets a DSH catalog route inherit its protocol and endpoint', async () => {
    const projection = await createDesktopDshProviderRuntimeProjection({
      providers: [
        provider({
          id: 'openai',
          type: 'openai',
          apiUrl: '',
          protocolProfile: undefined,
        }),
      ],
      models: [model({ id: 'catalog-model', providerId: 'openai', name: 'gpt-catalog' })],
      credentials: {
        read: vi.fn(async () => ({ type: 'api_key' as const, key: 'catalog-secret' })),
      },
    });

    expect(projection.executionCatalog.resolve('openai', 'catalog-model')).toMatchObject({
      apiModelName: 'gpt-catalog',
    });
    const profile = JSON.parse(JSON.stringify(projection.profilePatchEntries))[0].config.providers
      .openai as Record<string, unknown>;
    expect(profile).not.toHaveProperty('api');
    expect(profile).not.toHaveProperty('baseURL');
    expect(profile).toMatchObject({
      apiKeyEnv: 'OPENNEKO_DSH_PROVIDER_CREDENTIAL_0',
      models: [expect.objectContaining({ id: 'gpt-catalog' })],
    });
    expect(projection.diagnostics).toEqual([]);
  });

  it('projects the canonical Host reasoning effort catalog into the DSH model profile', async () => {
    const projection = await createDesktopDshProviderRuntimeProjection({
      providers: [
        provider({
          id: 'openai-provider',
          type: 'openai',
          protocolProfile: 'openai-responses',
          requiresApiKey: false,
        }),
      ],
      models: [
        model({
          id: 'reasoning-model',
          providerId: 'openai-provider',
          capabilities: ['chat', 'reasoning'],
        }),
      ],
      credentials: { read: vi.fn(async () => undefined) },
    });

    expect(JSON.parse(JSON.stringify(projection.profilePatchEntries))).toMatchObject([
      {
        config: {
          providers: {
            'openai-provider': {
              models: [
                {
                  id: 'reasoning-model',
                  reasoningEfforts: {
                    off: null,
                    minimal: 'minimal',
                    low: 'low',
                    medium: 'medium',
                    high: 'high',
                    xhigh: 'xhigh',
                  },
                },
              ],
            },
          },
        },
      },
    ]);
  });

  it('uses explicit custom-gateway effort metadata without inferring extra levels', async () => {
    const projection = await createDesktopDshProviderRuntimeProjection({
      providers: [provider({ id: 'custom-gateway', requiresApiKey: false })],
      models: [
        model({
          id: 'custom-reasoning-model',
          providerId: 'custom-gateway',
          options: {
            llmCapabilities: {
              reasoningEffortValues: ['none', 'low', 'high'],
            },
          },
        }),
      ],
      credentials: { read: vi.fn(async () => undefined) },
    });

    const serializedPatch = JSON.stringify(projection.profilePatchEntries);
    expect(serializedPatch).toContain('"reasoningEfforts":{"off":null,"low":"low","high":"high"}');
    expect(serializedPatch).not.toContain('"medium":"medium"');
    expect(serializedPatch).not.toContain('"none"');
  });

  it('explicitly removes inherited DSH reasoning for models without Host support', async () => {
    const projection = await createDesktopDshProviderRuntimeProjection({
      providers: [provider({ id: 'text-provider', requiresApiKey: false })],
      models: [model({ id: 'text-model', providerId: 'text-provider' })],
      credentials: { read: vi.fn(async () => undefined) },
    });

    expect(JSON.stringify(projection.profilePatchEntries)).toContain('"reasoningEfforts":false');
  });

  it('isolates missing credentials, unsupported providers, and duplicate API model names', async () => {
    const projection = await createDesktopDshProviderRuntimeProjection({
      providers: [
        provider({ id: 'missing-key' }),
        provider({ id: 'unsupported-google', type: 'google', protocolProfile: 'google' }),
        provider({ id: 'usable', requiresApiKey: false }),
      ],
      models: [
        model({ id: 'missing-model', providerId: 'missing-key' }),
        model({ id: 'google-model', providerId: 'unsupported-google' }),
        model({ id: 'duplicate-a', name: 'same-api-model', providerId: 'usable' }),
        model({ id: 'duplicate-b', name: 'same-api-model', providerId: 'usable' }),
        model({ id: 'usable-model', name: 'unique-api-model', providerId: 'usable' }),
      ],
      credentials: { read: vi.fn(async () => undefined) },
    });

    expect(projection.executionCatalog.resolve('missing-key', 'missing-model')).toBeUndefined();
    expect(
      projection.executionCatalog.resolve('unsupported-google', 'google-model'),
    ).toBeUndefined();
    expect(projection.executionCatalog.resolve('usable', 'duplicate-a')).toBeUndefined();
    expect(projection.executionCatalog.resolve('usable', 'usable-model')).toMatchObject({
      apiModelName: 'unique-api-model',
    });
    expect(projection.diagnostics.map((diagnostic) => diagnostic.providerId)).toEqual([
      'missing-key',
      'unsupported-google',
      'usable',
      'usable',
    ]);
  });

  it('does not register the base profile native route through a second adapter', async () => {
    const readCredential = vi.fn(async () => ({
      type: 'api_key' as const,
      key: 'must-not-be-read',
    }));
    const projection = await createDesktopDshProviderRuntimeProjection({
      providers: [provider({ id: 'deepseek-official' })],
      models: [model({ id: 'deepseek-model', providerId: 'deepseek-official' })],
      credentials: { read: readCredential },
    });

    expect(
      projection.executionCatalog.resolve('deepseek-official', 'deepseek-model'),
    ).toBeUndefined();
    expect(projection.credentialEnvironment).toEqual({});
    expect(projection.diagnostics[0]?.message).toMatch(/cannot be expressed/u);
    expect(readCredential).not.toHaveBeenCalled();
  });
});

function provider(overrides: Partial<Provider> & Pick<Provider, 'id'>): Provider {
  const { id, ...rest } = overrides;
  return {
    id,
    name: id,
    displayName: id,
    type: 'generic',
    apiUrl: 'https://api.example.test/v1',
    enabled: true,
    protocolProfile: 'openai-chat',
    requiresApiKey: true,
    useBearerAuth: true,
    ...rest,
  };
}

function model(overrides: Partial<Model> & Pick<Model, 'id' | 'providerId'>): Model {
  const { id, providerId, ...rest } = overrides;
  return {
    id,
    name: id,
    displayName: id,
    providerId,
    type: 'llm',
    capabilities: ['chat'],
    enabled: true,
    ...rest,
  };
}
