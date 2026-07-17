import { describe, expect, it, vi } from 'vitest';
import type { AccountAiCatalogSnapshot, IAuthSession } from '@neko/shared';
import {
  AccountAiCatalogCache,
  isAuthorizationFailure,
  type AccountAiCatalogAuthApi,
} from './accountAiCatalogCache';

const session: IAuthSession = {
  user: 'alice@example.com',
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresAt: 10_000,
};

function createSnapshot(expiresAt = 5_000): AccountAiCatalogSnapshot {
  return {
    source: 'account-gateway',
    status: 'available',
    provider: {
      id: 'neko-account-gateway',
      name: 'neko-account-gateway',
      displayName: 'Neko Official',
      type: 'newapi',
      apiUrl: '',
      enabled: true,
      connectionKind: 'gateway',
      protocolProfile: 'newapi',
      supportLevel: 'verified',
      requiresApiKey: false,
    },
    models: [
      {
        id: 'gpt-4o-mini',
        name: 'gpt-4o-mini',
        providerId: 'neko-account-gateway',
        type: 'llm',
        capabilities: ['chat'],
        enabled: true,
      },
    ],
    entitlement: { allowedModelIds: ['gpt-4o-mini'] },
    version: 'v1',
    etag: 'etag-1',
    expiresAt,
  };
}

function createAuthApi(input?: {
  session?: IAuthSession | null;
  snapshot?: AccountAiCatalogSnapshot | null;
  error?: unknown;
}): AccountAiCatalogAuthApi & {
  getSession: ReturnType<typeof vi.fn>;
  getAccountAiCatalog: ReturnType<typeof vi.fn>;
} {
  return {
    getSession: vi.fn().mockResolvedValue(input && 'session' in input ? input.session : session),
    getAccountAiCatalog: input?.error
      ? vi.fn().mockRejectedValue(input.error)
      : vi.fn().mockResolvedValue(input?.snapshot ?? createSnapshot()),
  };
}

describe('AccountAiCatalogCache', () => {
  it('reuses a fresh cached catalog for new Agent sessions', async () => {
    let now = 1_000;
    const auth = createAuthApi({ snapshot: createSnapshot(10_000) });
    const cache = new AccountAiCatalogCache({
      getAuth: async () => auth,
      now: () => now,
    });

    await expect(cache.getSnapshot()).resolves.toMatchObject({
      refreshed: true,
      snapshot: { version: 'v1' },
    });
    await expect(cache.getSnapshot()).resolves.toMatchObject({
      refreshed: false,
      snapshot: { version: 'v1' },
    });
    now = 2_000;
    await expect(cache.getSnapshot()).resolves.toMatchObject({
      refreshed: false,
      snapshot: { version: 'v1' },
    });
    expect(auth.getAccountAiCatalog).toHaveBeenCalledTimes(1);
  });

  it('refreshes when the cached catalog is expired', async () => {
    let now = 1_000;
    const auth = createAuthApi({ snapshot: createSnapshot(1_500) });
    const cache = new AccountAiCatalogCache({
      getAuth: async () => auth,
      now: () => now,
    });

    await cache.getSnapshot();
    now = 2_000;
    await cache.getSnapshot();

    expect(auth.getAccountAiCatalog).toHaveBeenCalledTimes(2);
  });

  it('forces refresh on manual refresh requests even when cache is fresh', async () => {
    const auth = createAuthApi({ snapshot: createSnapshot(10_000) });
    const cache = new AccountAiCatalogCache({
      getAuth: async () => auth,
      now: () => 1_000,
    });

    await cache.getSnapshot();
    await cache.getSnapshot({ forceRefresh: true });

    expect(auth.getAccountAiCatalog).toHaveBeenCalledTimes(2);
    expect(auth.getAccountAiCatalog).toHaveBeenLastCalledWith({ forceRefresh: true });
  });

  it('clears the cached catalog on logout session changes', async () => {
    const auth = createAuthApi({ snapshot: createSnapshot(10_000) });
    const cache = new AccountAiCatalogCache({
      getAuth: async () => auth,
      now: () => 1_000,
    });

    await cache.getSnapshot();
    await expect(cache.handleSessionChanged(null)).resolves.toEqual({
      snapshot: null,
      refreshed: true,
    });

    expect(cache.peekSnapshot()).toBeNull();
  });

  it('refreshes on login or silent refresh session changes', async () => {
    const auth = createAuthApi({ snapshot: createSnapshot(10_000) });
    const cache = new AccountAiCatalogCache({
      getAuth: async () => auth,
      now: () => 1_000,
    });

    await cache.handleSessionChanged(session);

    expect(auth.getAccountAiCatalog).toHaveBeenCalledWith({ forceRefresh: true });
    expect(cache.peekSnapshot()).toMatchObject({ source: 'account-gateway' });
  });

  it('clears the cached catalog when auth disappears or no session exists', async () => {
    const auth = createAuthApi({ snapshot: createSnapshot(10_000) });
    const noSessionAuth = createAuthApi({ session: null });
    const providers = [auth, undefined, noSessionAuth];
    const cache = new AccountAiCatalogCache({
      getAuth: async () => providers.shift(),
      now: () => 1_000,
    });

    await cache.getSnapshot();
    expect(cache.peekSnapshot()).not.toBeNull();

    await expect(cache.getSnapshot({ forceRefresh: true })).resolves.toEqual({
      snapshot: null,
      refreshed: true,
    });
    expect(cache.peekSnapshot()).toBeNull();

    await cache.getSnapshot({ forceRefresh: true });
    expect(cache.peekSnapshot()).toBeNull();
  });

  it('invalidates the cache on authorization or entitlement failure', async () => {
    const auth = createAuthApi({ snapshot: createSnapshot(10_000) });
    const unauthorized = Object.assign(new Error('unauthorized'), {
      status: 401,
      isTokenInvalid: true,
    });
    const failingAuth = createAuthApi({ error: unauthorized });
    const providers = [auth, failingAuth];
    const cache = new AccountAiCatalogCache({
      getAuth: async () => providers.shift(),
      now: () => 1_000,
    });

    await cache.getSnapshot();
    await expect(cache.getSnapshot({ forceRefresh: true })).rejects.toThrow('unauthorized');

    expect(cache.peekSnapshot()).toBeNull();
  });

  it('invalidates the cache on catalog version or ETag mismatch', async () => {
    const auth = createAuthApi({ snapshot: createSnapshot(10_000) });
    const cache = new AccountAiCatalogCache({
      getAuth: async () => auth,
      now: () => 1_000,
    });

    await cache.getSnapshot();

    expect(cache.invalidateIfVersionMismatch({ version: 'v1', etag: 'etag-1' })).toBe(false);
    expect(cache.peekSnapshot()).not.toBeNull();
    expect(cache.invalidateIfVersionMismatch({ version: 'v2' })).toBe(true);
    expect(cache.peekSnapshot()).toBeNull();
  });
});

describe('isAuthorizationFailure', () => {
  it('recognizes 401, 403, token invalidation, and entitlement errors', () => {
    expect(isAuthorizationFailure({ status: 401 })).toBe(true);
    expect(isAuthorizationFailure({ status: 403 })).toBe(true);
    expect(isAuthorizationFailure({ isTokenInvalid: true })).toBe(true);
    expect(isAuthorizationFailure({ code: 'AUTH_ENTITLEMENT_ERROR' })).toBe(true);
    expect(isAuthorizationFailure({ status: 500 })).toBe(false);
  });
});
