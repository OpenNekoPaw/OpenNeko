import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '../storage';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import {
  initializeAssetLibraryMembershipTables,
  initializeCoreLocalMetadataTables,
} from '../sqlite';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Asset Library membership repository', () => {
  it('initializes flat inventory once and preserves removed membership across reopen', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-asset-membership-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const first = createNodeSqliteLocalMetadataStore({ homedir });
    await first.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(first);
    await initializeAssetLibraryMembershipTables(first);
    const registration = {
      membershipId: 'membership-hero',
      sourceRelativePath: 'hero.png',
      label: 'hero.png',
      mediaType: 'image',
      byteLength: 4,
      modifiedAt: '2026-08-05T08:00:00.000Z',
      registeredAt: '2026-08-05T08:01:00.000Z',
    } as const;

    await expect(
      first.repositories.assetLibraryMemberships.initializeExistingInventory(
        [registration],
        registration.registeredAt,
      ),
    ).resolves.toEqual({ status: 'initialized', importedCount: 1 });
    await first.repositories.assetLibraryMemberships.remove(
      registration.membershipId,
      '2026-08-05T08:02:00.000Z',
    );
    await first.dispose();

    const reopened = createNodeSqliteLocalMetadataStore({ homedir });
    await reopened.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(reopened);
    await initializeAssetLibraryMembershipTables(reopened);
    await expect(
      reopened.repositories.assetLibraryMemberships.initializeExistingInventory(
        [{ ...registration, membershipId: 'new-scanner-id' }],
        '2026-08-05T08:03:00.000Z',
      ),
    ).resolves.toEqual({ status: 'already-initialized' });
    await expect(reopened.repositories.assetLibraryMemberships.listActive()).resolves.toEqual([]);
    await expect(
      reopened.repositories.assetLibraryMemberships.get(registration.membershipId),
    ).resolves.toMatchObject({ state: 'removed', sourceRelativePath: 'hero.png' });
    await reopened.dispose();
  });

  it('reactivates an explicitly imported source without changing its stable membership identity', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-asset-membership-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(store);
    await initializeAssetLibraryMembershipTables(store);
    const first = {
      membershipId: 'membership-original',
      sourceRelativePath: 'hero.png',
      label: 'hero.png',
      mediaType: 'image',
      byteLength: 4,
      modifiedAt: null,
      registeredAt: '2026-08-05T08:00:00.000Z',
    } as const;
    await store.repositories.assetLibraryMemberships.initializeExistingInventory(
      [first],
      first.registeredAt,
    );
    await store.repositories.assetLibraryMemberships.remove(
      first.membershipId,
      '2026-08-05T08:01:00.000Z',
    );

    await expect(
      store.repositories.assetLibraryMemberships.activate({
        ...first,
        membershipId: 'discarded-reimport-id',
        registeredAt: '2026-08-05T08:02:00.000Z',
      }),
    ).resolves.toMatchObject({ membershipId: first.membershipId, state: 'active' });
    await store.dispose();
  });
});
