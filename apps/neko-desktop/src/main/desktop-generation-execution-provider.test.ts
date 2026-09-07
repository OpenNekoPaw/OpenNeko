import { describe, expect, it, vi } from 'vitest';

import { createDesktopGenerationExecutionProviderResolver } from './desktop-generation-execution-provider';

const configuredProvider = {
  id: 'image-provider',
  name: 'image-provider',
  displayName: 'Image Provider',
  type: 'newapi' as const,
  apiUrl: 'https://image.example.test/api',
  enabled: true,
  requiresApiKey: true,
};

describe('Desktop generation execution provider resolver', () => {
  it('hydrates an ephemeral exact provider and does not retain a removed credential', async () => {
    let credential: { readonly type: 'api_key'; readonly key: string } | undefined = {
      type: 'api_key',
      key: 'current-secret',
    };
    const read = vi.fn(async () => credential);
    const resolver = createDesktopGenerationExecutionProviderResolver({
      config: {
        getProvider: (providerId) =>
          providerId === configuredProvider.id ? configuredProvider : undefined,
      },
      credentials: { read },
    });

    await expect(resolver.resolveProvider(configuredProvider.id)).resolves.toEqual({
      ...configuredProvider,
      apiKey: 'current-secret',
    });
    expect(configuredProvider).not.toHaveProperty('apiKey');
    expect(read).toHaveBeenCalledWith(configuredProvider.id);

    credential = undefined;
    await expect(resolver.resolveProvider(configuredProvider.id)).resolves.toBeUndefined();
    await expect(resolver.resolveProvider('another-provider')).resolves.toBeUndefined();
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('does not read a credential for a disabled provider', async () => {
    const read = vi.fn(async () => ({ type: 'api_key' as const, key: 'must-not-be-read' }));
    const resolver = createDesktopGenerationExecutionProviderResolver({
      config: { getProvider: () => ({ ...configuredProvider, enabled: false }) },
      credentials: { read },
    });

    await expect(resolver.resolveProvider(configuredProvider.id)).resolves.toBeUndefined();
    expect(read).not.toHaveBeenCalled();
  });
});
