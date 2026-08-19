import { describe, expect, it, vi } from 'vitest';

import { ProviderCredentialAuthority } from '../provider-credential-authority';

describe('ProviderCredentialAuthority', () => {
  it('uses the exact config-owned API key without reading or mutating SecretStorage', async () => {
    const secrets = createSecrets();
    const authority = new ProviderCredentialAuthority(secrets, {
      read: async (providerId) =>
        providerId === 'configured-provider'
          ? {
              status: 'configured',
              apiKey: 'config-secret',
              updatedAt: '2026-08-18T00:00:00.000Z',
            }
          : undefined,
    });

    await expect(authority.read('configured-provider')).resolves.toEqual({
      type: 'api_key',
      key: 'config-secret',
    });
    await expect(authority.replaceApiKey('configured-provider', 'replacement')).rejects.toThrow(
      'owned by providers.configured-provider.api_key',
    );
    await expect(authority.delete('configured-provider')).rejects.toThrow(
      'owned by providers.configured-provider.api_key',
    );
    expect(secrets.get).not.toHaveBeenCalled();
    expect(secrets.set).not.toHaveBeenCalled();
    expect(secrets.delete).not.toHaveBeenCalled();
  });

  it('fails visibly for invalid config without reading SecretStorage or exposing a value', async () => {
    const secrets = createSecrets();
    const authority = new ProviderCredentialAuthority(secrets, {
      read: async () => ({ status: 'invalid', path: 'providers.invalid.api_key' }),
    });

    const failure = await authority.read('invalid').then(
      () => 'unexpected success',
      (error: unknown) => String(error),
    );
    expect(failure).toContain('providers.invalid.api_key');
    expect(failure).not.toContain('stored-secret');
    expect(secrets.get).not.toHaveBeenCalled();
  });

  it('stores only under the canonical non-Pi key and rejects malformed identities locally', async () => {
    const stored = new Map<string, string>();
    const secrets = createSecrets(stored);
    const authority = new ProviderCredentialAuthority(secrets, { read: async () => undefined });

    await authority.replaceApiKey('image-provider', 'stored-secret');
    expect(secrets.set).toHaveBeenCalledWith(
      'openneko.provider.credential:image-provider',
      'stored-secret',
    );
    expect([...stored.keys()]).not.toContain('openneko.agent.pi.credential:image-provider');
    await expect(authority.read('image-provider')).resolves.toEqual({
      type: 'api_key',
      key: 'stored-secret',
    });
    await authority.delete('image-provider');
    await expect(authority.read('image-provider')).resolves.toBeUndefined();

    for (const providerId of ['', ' image-provider', 'image/provider']) {
      await expect(authority.read(providerId)).rejects.toThrow(
        'Provider credential identity is invalid.',
      );
    }
    expect(secrets.get).toHaveBeenCalledTimes(2);
  });

  it('rejects an empty stored credential without echoing credential material', async () => {
    const secrets = createSecrets(new Map([['openneko.provider.credential:empty', '']]));
    const authority = new ProviderCredentialAuthority(secrets, { read: async () => undefined });

    await expect(authority.read('empty')).rejects.toThrow(
      'Provider API-key credential must not be empty.',
    );
  });
});

function createSecrets(stored = new Map<string, string>()) {
  return {
    get: vi.fn(async (key: string) => stored.get(key)),
    set: vi.fn(async (key: string, value: string) => {
      stored.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      stored.delete(key);
    }),
  };
}
