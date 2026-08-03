import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import {
  DESKTOP_STATE_AUTHORITY_KEYS,
  SqliteVersionedJsonStateRepository,
  type DesktopStateAuthorityKey,
} from '../versioned-json-state-repository';
import type { LocalMetadataStore } from '../contracts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SqliteVersionedJsonStateRepository', () => {
  it('persists two isolated state authorities with revision CAS in the canonical database', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-state-repository-'));
    roots.push(root);
    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    const shell = repository(store, DESKTOP_STATE_AUTHORITY_KEYS.shell);
    const settings = repository(store, DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings);
    await shell.prepare();
    await settings.prepare();

    expect(await shell.read()).toEqual({ storageRevision: 0, value: 'empty' });
    await shell.commit(0, { storageRevision: 1, value: 'shell' });
    await settings.commit(0, { storageRevision: 1, value: 'settings' });
    expect(await shell.read()).toEqual({ storageRevision: 1, value: 'shell' });
    expect(await settings.read()).toEqual({ storageRevision: 1, value: 'settings' });
    await expect(shell.commit(0, { storageRevision: 1, value: 'stale' })).rejects.toThrow('stale');
    await store.dispose();
  });

  it('rejects secret-bearing adjacent data before SQLite mutation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'openneko-state-secret-'));
    roots.push(root);
    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    const shell = repository(store, DESKTOP_STATE_AUTHORITY_KEYS.shell);
    await shell.prepare();
    await expect(
      shell.commit(0, {
        storageRevision: 1,
        value: 'invalid',
        credentials: { token: 'must-not-persist' },
      }),
    ).rejects.toMatchObject({ code: 'metadata-secret-forbidden' });
    expect(await shell.read()).toEqual({ storageRevision: 0, value: 'empty' });
    await store.dispose();
  });
});

interface FixtureState {
  readonly storageRevision: number;
  readonly value: string;
  readonly credentials?: { readonly token: string };
}

function repository(store: LocalMetadataStore, authorityKey: DesktopStateAuthorityKey) {
  return createRepository(store, authorityKey);
}

function createRepository(store: LocalMetadataStore, authorityKey: DesktopStateAuthorityKey) {
  return new SqliteVersionedJsonStateRepository<FixtureState>({
    store,
    authorityKey,
    codec: {
      createEmpty: () => ({ storageRevision: 0, value: 'empty' }),
      parse: (value) => {
        if (!isRecord(value)) {
          throw new Error('Fixture state must be an object.');
        }
        const record = value;
        const storageRevision = record['storageRevision'];
        const stateValue = record['value'];
        if (typeof storageRevision !== 'number' || typeof stateValue !== 'string') {
          throw new Error('Fixture state is invalid.');
        }
        const credentials = record['credentials'];
        if (credentials === undefined) {
          return {
            storageRevision,
            value: stateValue,
          };
        }
        if (
          typeof credentials !== 'object' ||
          credentials === null ||
          Array.isArray(credentials) ||
          !('token' in credentials) ||
          typeof credentials.token !== 'string'
        ) {
          throw new Error('Fixture credentials are invalid.');
        }
        return {
          storageRevision,
          value: stateValue,
          credentials: { token: credentials.token },
        };
      },
      readStorageRevision: (state) => state.storageRevision,
    },
    now: () => '2026-08-03T00:00:00.000Z',
  });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
