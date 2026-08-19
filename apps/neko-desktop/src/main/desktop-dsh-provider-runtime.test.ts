import { describe, expect, it, vi } from 'vitest';
import type { Model, Provider, ProviderCredentialReader } from '@neko/host/settings';

import { createDesktopDshProviderRuntimeProjection } from './desktop-dsh-provider-runtime';

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
    });
    expect(projection.executionCatalog.resolve('deepseek-chat', 'product-deepseek-flash')).toEqual({
      providerId: 'deepseek-chat',
      productModelId: 'product-deepseek-flash',
      apiModelName: 'deepseek-v4-flash',
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
    expect(serializedPatch).not.toContain('secret');
    expect(projection.diagnostics).toEqual([]);
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
