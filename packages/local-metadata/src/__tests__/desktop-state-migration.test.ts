import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { LocalMetadataStore } from '../contracts';
import {
  exportDesktopStateForDowngrade,
  migrateDesktopStateToSqlite,
  type DesktopRetiredJsonStatePort,
} from '../desktop-state-migration';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import {
  DESKTOP_STATE_AUTHORITY_KEYS,
  SqliteVersionedJsonStateRepository,
  type VersionedJsonStateCodec,
} from '../versioned-json-state-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('Desktop JSON to SQLite state migration', () => {
  it('imports both authorities atomically, archives sources, and restarts from SQLite only', async () => {
    const fixture = await createFixture();
    try {
      const result = await migrateDesktopStateToSqlite(fixture.options);
      expect(result).toEqual({
        status: 'imported',
        archived: ['shell', 'application-settings'],
      });
      expect(await fixture.shellRepository.read()).toEqual(state(3, 'shell'));
      expect(await fixture.settingsRepository.read()).toEqual(state(7, 'settings'));
      expect(fixture.retiredJson.sources).toEqual({
        shell: null,
        'application-settings': null,
      });
      const readsAfterCompletedMigration = fixture.retiredJson.readCount;

      await expect(migrateDesktopStateToSqlite(fixture.options)).resolves.toEqual({
        status: 'verified',
        archived: [],
      });
      expect(fixture.retiredJson.readCount).toBe(readsAfterCompletedMigration);
    } finally {
      await fixture.store.dispose();
    }
  });

  it('rejects either corrupt source before writing or archiving either authority', async () => {
    const fixture = await createFixture({
      settings: '{"storageRevision":"invalid","value":"settings"}',
    });
    try {
      await expect(migrateDesktopStateToSqlite(fixture.options)).rejects.toThrow(
        'Fixture state is invalid',
      );
      expect(fixture.retiredJson.archived).toEqual([]);
      expect(await fixture.shellRepository.read()).toEqual(state(0, 'empty'));
      expect(await fixture.settingsRepository.read()).toEqual(state(0, 'empty'));
    } finally {
      await fixture.store.dispose();
    }
  });

  it('imports a single present authority and initializes the absent authority without a fallback read', async () => {
    const fixture = await createFixture({ settings: null });
    try {
      await expect(migrateDesktopStateToSqlite(fixture.options)).resolves.toEqual({
        status: 'imported',
        archived: ['shell'],
      });
      expect(await fixture.shellRepository.read()).toEqual(state(3, 'shell'));
      expect(await fixture.settingsRepository.read()).toEqual(state(0, 'empty'));
      expect(fixture.retiredJson.sources).toEqual({
        shell: null,
        'application-settings': null,
      });

      const readsAfterCompletedMigration = fixture.retiredJson.readCount;
      await expect(migrateDesktopStateToSqlite(fixture.options)).resolves.toEqual({
        status: 'verified',
        archived: [],
      });
      expect(fixture.retiredJson.readCount).toBe(readsAfterCompletedMigration);
    } finally {
      await fixture.store.dispose();
    }
  });

  it('resumes post-commit archival without importing or overwriting state again', async () => {
    const fixture = await createFixture();
    fixture.retiredJson.failArchiveOnce = 'shell';
    try {
      await expect(migrateDesktopStateToSqlite(fixture.options)).rejects.toThrow(
        'injected archive failure',
      );
      expect(await fixture.shellRepository.read()).toEqual(state(3, 'shell'));
      expect(await fixture.settingsRepository.read()).toEqual(state(7, 'settings'));

      await expect(migrateDesktopStateToSqlite(fixture.options)).resolves.toEqual({
        status: 'verified',
        archived: ['shell', 'application-settings'],
      });
    } finally {
      await fixture.store.dispose();
    }
  });

  it('fails visibly when a committed but unarchived source changes', async () => {
    const fixture = await createFixture();
    fixture.retiredJson.failArchiveOnce = 'shell';
    try {
      await expect(migrateDesktopStateToSqlite(fixture.options)).rejects.toThrow(
        'injected archive failure',
      );
      fixture.retiredJson.sources.shell = JSON.stringify(state(4, 'changed'));
      await expect(migrateDesktopStateToSqlite(fixture.options)).rejects.toThrow(
        'changed after SQLite migration commit',
      );
      expect(fixture.retiredJson.archived).toEqual([]);
    } finally {
      await fixture.store.dispose();
    }
  });

  it('exports a codec-validated pair only through the explicit downgrade port', async () => {
    const fixture = await createFixture();
    try {
      await migrateDesktopStateToSqlite(fixture.options);
      await exportDesktopStateForDowngrade(fixture.options);
      expect(fixture.retiredJson.published).toEqual({
        shell: `${JSON.stringify(state(3, 'shell'), null, 2)}\n`,
        applicationSettings: `${JSON.stringify(state(7, 'settings'), null, 2)}\n`,
      });
    } finally {
      await fixture.store.dispose();
    }
  });
});

interface FixtureState {
  readonly storageRevision: number;
  readonly value: string;
}

class FixtureRetiredJsonStatePort implements DesktopRetiredJsonStatePort {
  readonly sources: Record<'shell' | 'application-settings', string | null>;
  readonly archived: ('shell' | 'application-settings')[] = [];
  readCount = 0;
  failArchiveOnce: 'shell' | 'application-settings' | undefined;
  published: { readonly shell: string; readonly applicationSettings: string } | undefined;

  constructor(shell: string | null, settings: string | null) {
    this.sources = { shell, 'application-settings': settings };
  }

  async read(authority: 'shell' | 'application-settings'): Promise<string | null> {
    this.readCount += 1;
    return this.sources[authority];
  }

  async archive(authority: 'shell' | 'application-settings'): Promise<void> {
    if (this.failArchiveOnce === authority) {
      this.failArchiveOnce = undefined;
      throw new Error('injected archive failure');
    }
    if (this.sources[authority] === null) throw new Error('source is already archived');
    this.sources[authority] = null;
    this.archived.push(authority);
  }

  async publishPair(input: {
    readonly shell: string;
    readonly applicationSettings: string;
  }): Promise<void> {
    this.published = input;
  }
}

async function createFixture(overrides?: {
  readonly shell?: string | null;
  readonly settings?: string | null;
}) {
  const root = await mkdtemp(join(tmpdir(), 'openneko-desktop-state-migration-'));
  roots.push(root);
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  const codec: VersionedJsonStateCodec<FixtureState> = {
    createEmpty: () => state(0, 'empty'),
    parse: (value) => {
      if (!isRecord(value)) throw new Error('Fixture state is invalid');
      const storageRevision = value['storageRevision'];
      const stateValue = value['value'];
      if (!Number.isSafeInteger(storageRevision) || typeof stateValue !== 'string') {
        throw new Error('Fixture state is invalid');
      }
      return state(storageRevision as number, stateValue);
    },
    readStorageRevision: (value) => value.storageRevision,
  };
  const retiredJson = new FixtureRetiredJsonStatePort(
    overrides && 'shell' in overrides
      ? (overrides.shell ?? null)
      : JSON.stringify(state(3, 'shell')),
    overrides && 'settings' in overrides
      ? (overrides.settings ?? null)
      : JSON.stringify(state(7, 'settings')),
  );
  const options = {
    store,
    retiredJson,
    shellCodec: codec,
    settingsCodec: codec,
    digest: (content: string) => `digest:${content}`,
    now: () => '2026-08-03T00:00:00.000Z',
  };
  return {
    store,
    retiredJson,
    options,
    shellRepository: repository(store, DESKTOP_STATE_AUTHORITY_KEYS.shell, codec),
    settingsRepository: repository(store, DESKTOP_STATE_AUTHORITY_KEYS.applicationSettings, codec),
  };
}

function repository(
  store: LocalMetadataStore,
  authorityKey: (typeof DESKTOP_STATE_AUTHORITY_KEYS)[keyof typeof DESKTOP_STATE_AUTHORITY_KEYS],
  codec: VersionedJsonStateCodec<FixtureState>,
): SqliteVersionedJsonStateRepository<FixtureState> {
  return new SqliteVersionedJsonStateRepository({ store, authorityKey, codec });
}

function state(storageRevision: number, value: string): FixtureState {
  return { storageRevision, value };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
