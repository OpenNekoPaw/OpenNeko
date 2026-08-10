import type { MediaProvider } from '@neko/generation/media';
import { describe, expect, it, vi } from 'vitest';

import { createDesktopMediaExecutionProviderResolver } from './desktop-media-execution-provider';

const configuredProvider: MediaProvider = {
  id: 'image-provider',
  name: 'image-provider',
  displayName: 'Image Provider',
  type: 'newapi',
  apiUrl: 'https://image.example.test/api',
  enabled: true,
  requiresApiKey: true,
};

describe('Desktop media execution provider resolver', () => {
  it('hydrates an ephemeral exact provider and does not retain a removed credential', async () => {
    let credential: { readonly type: 'api_key'; readonly key: string } | undefined = {
      type: 'api_key',
      key: 'current-secret',
    };
    const read = vi.fn(async () => credential);
    const resolver = createDesktopMediaExecutionProviderResolver({
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

  it('fails visibly for a non-API-key credential instead of changing provider', async () => {
    const resolver = createDesktopMediaExecutionProviderResolver({
      config: { getProvider: () => configuredProvider },
      credentials: {
        read: async () => ({
          type: 'oauth',
          access: 'access-token',
          refresh: 'refresh-token',
          expires: Date.now() + 60_000,
        }),
      },
    });

    await expect(resolver.resolveProvider(configuredProvider.id)).rejects.toThrow(
      "Media provider 'image-provider' requires an API-key credential.",
    );
  });
});
