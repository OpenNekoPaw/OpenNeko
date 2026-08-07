import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import {
  DESKTOP_STATE_AUTHORITY_KEYS,
  SqliteJsonStateRepository,
  type DesktopStateAuthorityKey,
} from '../json-state-repository';
import type { LocalMetadataStore } from '../contracts';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SqliteJsonStateRepository', () => {
  it('persists two isolated state authorities in the canonical database', async () => {
    const { store, shell, settings } = await fixture('openneko-state-repository-');

    expect(await shell.read()).toEqual({ value: 'empty' });
    await shell.commit({ value: 'shell' });
    await settings.commit({ value: 'settings' });
    expect(await shell.read()).toEqual({ value: 'shell' });
    expect(await settings.read()).toEqual({ value: 'settings' });
    await store.dispose();
  });

  it('rejects secret-bearing adjacent data before SQLite mutation', async () => {
    const { store, shell } = await fixture('openneko-state-secret-');

    await expect(
      shell.commit({
        value: 'invalid',
        credentials: { token: 'must-not-persist' },
      }),
    ).rejects.toMatchObject({ code: 'metadata-secret-forbidden' });
    expect(await shell.read()).toEqual({ value: 'empty' });
    await store.dispose();
  });

  it('uses the owning codec serializer', async () => {
    const root = await createRoot('openneko-state-owned-serializer-');
    const store = await openStore(root);
    const repository = new SqliteJsonStateRepository<FixtureState>({
      store,
      authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.shell,
      codec: {
        createEmpty: () => ({ value: 'empty' }),
        parse: parseFixtureState,
        serialize: (state) => ({ ...state, preservedRecord: { field: 'unchanged' } }),
      },
    });
    await repository.prepare();

    await repository.commit({ value: 'canonical' });
    const rows = await store.transaction(
      { mode: 'read', ownership: 'state', operation: 'read-owned-serialized-state' },
      ({ sql }) =>
        sql.all('SELECT document_json FROM desktop_application_state WHERE authority_key = ?', [
          DESKTOP_STATE_AUTHORITY_KEYS.shell,
        ]),
    );

    expect(JSON.parse(String(rows[0]?.['document_json']))).toEqual({
      value: 'canonical',
      preservedRecord: { field: 'unchanged' },
    });
    await store.dispose();
  });

  it('updates an existing authority without rewriting unknown required columns', async () => {
    const root = await createRoot('openneko-state-additive-table-');
    const store = await openStore(root);
    await store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'seed-additive-state-table' },
      async ({ sql }) => {
        await sql.run(`CREATE TABLE desktop_application_state (
          authority_key TEXT PRIMARY KEY,
          opaque_required_marker INTEGER NOT NULL,
          document_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT`);
        await sql.run(
          `INSERT INTO desktop_application_state(
             authority_key, opaque_required_marker, document_json, updated_at
           ) VALUES (?, ?, ?, ?)`,
          [
            DESKTOP_STATE_AUTHORITY_KEYS.shell,
            41,
            JSON.stringify({ value: 'before' }),
            '2026-08-02T00:00:00.000Z',
          ],
        );
      },
    );
    const shell = repository(store, DESKTOP_STATE_AUTHORITY_KEYS.shell);
    await shell.prepare();

    await shell.commit({ value: 'after' });

    const rows = await store.transaction(
      { mode: 'read', ownership: 'state', operation: 'verify-additive-state-table' },
      ({ sql }) =>
        sql.all(
          `SELECT opaque_required_marker, document_json
             FROM desktop_application_state
            WHERE authority_key = ?`,
          [DESKTOP_STATE_AUTHORITY_KEYS.shell],
        ),
    );
    expect(rows).toEqual([
      {
        opaque_required_marker: 41,
        document_json: JSON.stringify({ value: 'after' }),
      },
    ]);
    await store.dispose();
  });

  it('leaves an invalid authority unchanged while valid siblings remain available', async () => {
    const { store, shell, settings } = await fixture('openneko-state-rejection-');
    const invalidDocument = '{"value":7}';
    const settingsDocument = '{"value":"settings"}';
    await store.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'seed-invalid-state-root' },
      async ({ sql }) => {
        await sql.run(
          `INSERT INTO desktop_application_state(
             authority_key, document_json, updated_at
           ) VALUES (?, ?, ?)`,
          [DESKTOP_STATE_AUTHORITY_KEYS.shell, invalidDocument, '2026-08-04T00:00:00.000Z'],
        );
        await sql.run(
          `INSERT INTO desktop_application_state(
             authority_key, document_json, updated_at
           ) VALUES (?, ?, ?)`,
          [
            DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings,
            settingsDocument,
            '2026-08-04T00:00:00.000Z',
          ],
        );
      },
    );

    await expect(shell.inspectInvalidState()).resolves.toMatchObject({
      rejectionId: 1,
      authorityKey: DESKTOP_STATE_AUTHORITY_KEYS.shell,
      diagnostic: 'Fixture state is invalid.',
      rejectedAt: '2026-08-03T00:00:00.000Z',
    });
    expect(await shell.read()).toEqual({ value: 'empty' });
    await expect(shell.commit({ value: 'session-only' })).resolves.toEqual({
      value: 'session-only',
    });
    expect(await shell.read()).toEqual({ value: 'session-only' });
    expect(await settings.read()).toEqual({ value: 'settings' });
    const rows = await store.transaction(
      { mode: 'read', ownership: 'state', operation: 'verify-invalid-state-retained' },
      ({ sql }) =>
        sql.all(
          `SELECT document_json
             FROM desktop_application_state
            WHERE authority_key = ?`,
          [DESKTOP_STATE_AUTHORITY_KEYS.shell],
        ),
    );
    expect(rows).toEqual([{ document_json: invalidDocument }]);
    await store.dispose();
  });

  it('does not create a schema registry or state repair table', async () => {
    const { store } = await fixture('openneko-state-stable-tables-');
    const tables = await store.transaction(
      { mode: 'read', ownership: 'system', operation: 'read-state-table-names' },
      ({ sql }) => sql.all(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`),
    );
    expect(tables.map((row) => row['name'])).toEqual(['desktop_application_state']);
    await store.dispose();
  });
});

interface FixtureState {
  readonly value: string;
  readonly credentials?: { readonly token: string };
}

async function fixture(prefix: string) {
  const root = await createRoot(prefix);
  const store = await openStore(root);
  const shell = repository(store, DESKTOP_STATE_AUTHORITY_KEYS.shell);
  const settings = repository(store, DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings);
  await shell.prepare();
  await settings.prepare();
  return { store, shell, settings };
}

async function createRoot(prefix: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

async function openStore(root: string) {
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  return store;
}

function repository(store: LocalMetadataStore, authorityKey: DesktopStateAuthorityKey) {
  return new SqliteJsonStateRepository<FixtureState>({
    store,
    authorityKey,
    codec: {
      createEmpty: () => ({ value: 'empty' }),
      parse: parseFixtureState,
    },
    now: () => '2026-08-03T00:00:00.000Z',
  });
}

function parseFixtureState(value: unknown): FixtureState {
  if (!isRecord(value)) throw new Error('Fixture state must be an object.');
  const stateValue = value['value'];
  if (typeof stateValue !== 'string') {
    throw new Error('Fixture state is invalid.');
  }
  const credentials = value['credentials'];
  if (credentials === undefined) return { value: stateValue };
  if (!isRecord(credentials) || typeof credentials['token'] !== 'string') {
    throw new Error('Fixture credentials are invalid.');
  }
  return {
    value: stateValue,
    credentials: { token: credentials['token'] },
  };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
