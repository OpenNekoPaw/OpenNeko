import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createProvider, type OAuthCredential } from '@earendil-works/pi-ai';
import { builtinProviders } from '@earendil-works/pi-ai/providers/all';
import { describe, expect, it, vi } from 'vitest';

import {
  InMemoryUserCredentialPersistence,
  NodeSqliteUserCredentialPersistence,
  OpenNekoCredentialStore,
  PiProviderAuthController,
  type UserCredentialPersistence,
} from '../credential-store';

describe('OpenNekoCredentialStore', () => {
  it('retains Pi built-in OAuth providers instead of reimplementing their flows', () => {
    const oauthProviders = builtinProviders().filter(
      (provider) => provider.auth.oauth !== undefined,
    );

    expect(oauthProviders.length).toBeGreaterThan(0);
    for (const provider of oauthProviders) {
      expect(provider.auth.oauth).toMatchObject({
        name: expect.any(String),
        login: expect.any(Function),
        refresh: expect.any(Function),
        toAuth: expect.any(Function),
      });
    }
  });

  it('persists one user-global credential view across Host connections', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-pi-credentials-'));
    const tuiPersistence = NodeSqliteUserCredentialPersistence.open({ userDataRoot: root });
    const tui = new OpenNekoCredentialStore(tuiPersistence, () => 1_800_000_000_000);
    await tui.replace('newapi', { type: 'api_key', key: 'shared-secret' }, 'user-config-import');
    tui.dispose();

    const vscodePersistence = NodeSqliteUserCredentialPersistence.open({
      userDataRoot: root,
    });
    const vscode = new OpenNekoCredentialStore(vscodePersistence);
    await expect(vscode.read('newapi')).resolves.toEqual({
      type: 'api_key',
      key: 'shared-secret',
    });
    await expect(vscode.status('newapi')).resolves.toMatchObject({
      provenance: 'user-config-import',
      fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    expect((await stat(join(root, 'agent', 'pi', 'credentials.sqlite'))).mode & 0o777).toBe(0o600);
    vscode.dispose();
    await rm(root, { recursive: true, force: true });
  });

  it('shares one program-level durable view across TUI and VS Code consumers', async () => {
    const persistence = new InMemoryUserCredentialPersistence();
    const programStore = new OpenNekoCredentialStore(persistence, () => 1_800_000_000_000);
    const tuiConsumer = programStore;
    const vscodeConsumer = programStore;

    const status = await tuiConsumer.replace(
      'newapi',
      { type: 'api_key', key: 'secret-value' },
      'user-config-import',
    );

    expect(await vscodeConsumer.read('newapi')).toEqual({
      type: 'api_key',
      key: 'secret-value',
    });
    expect(status).toEqual({
      providerId: 'newapi',
      type: 'api_key',
      provenance: 'user-config-import',
      fingerprint: expect.stringMatching(/^[0-9a-f]{16}$/),
      updatedAt: '2027-01-15T08:00:00.000Z',
    });
    expect(JSON.stringify(status)).not.toContain('secret-value');
  });

  it('serializes refresh writes per provider', async () => {
    const store = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    await store.replace('oauth-provider', oauth('access-0', 'refresh-0'), 'interactive');
    const observed: string[] = [];

    await Promise.all([
      store.modify('oauth-provider', async (current) => {
        observed.push(current?.type === 'oauth' ? current.access : 'missing');
        await Promise.resolve();
        return oauth('access-1', 'refresh-1');
      }),
      store.modify('oauth-provider', async (current) => {
        observed.push(current?.type === 'oauth' ? current.access : 'missing');
        return oauth('access-2', 'refresh-2');
      }),
    ]);

    expect(observed).toEqual(['access-0', 'access-1']);
    expect(await store.read('oauth-provider')).toMatchObject({ access: 'access-2' });
  });

  it('uses Pi provider OAuth with Host-specific interaction and persists login/refresh/logout', async () => {
    const store = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const login = vi.fn(async (callbacks) => {
      callbacks.notify({ type: 'auth_url', url: 'https://auth.example.invalid' });
      const code = await callbacks.prompt({ type: 'text', message: 'Code' });
      return oauth(`access-${code}`, 'refresh-1');
    });
    const refresh = vi.fn(async () => oauth('access-refreshed', 'refresh-2'));
    const provider = createProvider({
      id: 'oauth-provider',
      models: [],
      auth: {
        oauth: {
          name: 'Fixture OAuth',
          login,
          refresh,
          toAuth: async (credential) => ({ apiKey: credential.access }),
        },
      },
      api: {
        stream: () => {
          throw new Error('not used');
        },
        streamSimple: () => {
          throw new Error('not used');
        },
      },
    });
    const interaction = {
      prompt: vi.fn(async () => 'fixture-code'),
      notify: vi.fn(),
    };
    const controller = new PiProviderAuthController(store);

    await controller.login({ provider, method: 'oauth', interaction });
    expect(interaction.notify).toHaveBeenCalledWith({
      type: 'auth_url',
      url: 'https://auth.example.invalid',
    });
    expect(await store.read('oauth-provider')).toMatchObject({
      type: 'oauth',
      access: 'access-fixture-code',
    });

    await controller.refresh(provider);
    expect(await store.read('oauth-provider')).toMatchObject({ access: 'access-refreshed' });
    await controller.logout('oauth-provider');
    expect(await store.read('oauth-provider')).toBeUndefined();
  });

  it('surfaces persistence failure instead of presenting refreshed credentials as durable', async () => {
    const durable = new InMemoryUserCredentialPersistence();
    const failing: UserCredentialPersistence = {
      read: (providerId) => durable.read(providerId),
      modify: async () => {
        throw new Error('disk full');
      },
      delete: (providerId) => durable.delete(providerId),
    };
    const store = new OpenNekoCredentialStore(failing);

    await expect(
      store.replace('openai', { type: 'api_key', key: 'secret' }, 'interactive'),
    ).rejects.toMatchObject({ code: 'persistence' });
    expect(await store.read('openai')).toBeUndefined();
  });

  it('propagates Host cancellation from Pi login prompts', async () => {
    const store = new OpenNekoCredentialStore(new InMemoryUserCredentialPersistence());
    const provider = createProvider({
      id: 'api-key-provider',
      models: [],
      auth: {
        apiKey: {
          name: 'API key',
          login: async (callbacks) => ({
            type: 'api_key',
            key: await callbacks.prompt({ type: 'secret', message: 'Key' }),
          }),
          resolve: async () => undefined,
        },
      },
      api: {
        stream: () => {
          throw new Error('not used');
        },
        streamSimple: () => {
          throw new Error('not used');
        },
      },
    });
    const cancellation = new Error('user cancelled');

    await expect(
      new PiProviderAuthController(store).login({
        provider,
        method: 'api-key',
        interaction: {
          prompt: async () => {
            throw cancellation;
          },
          notify: () => undefined,
        },
      }),
    ).rejects.toBe(cancellation);
    expect(await store.read('api-key-provider')).toBeUndefined();
  });
});

function oauth(access: string, refresh: string): OAuthCredential {
  return {
    type: 'oauth',
    access,
    refresh,
    expires: Date.now() + 60_000,
  };
}
