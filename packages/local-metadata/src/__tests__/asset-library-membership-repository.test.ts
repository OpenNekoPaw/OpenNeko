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
  it('registers new discoveries and preserves removed membership across reopen', async () => {
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

    await first.repositories.assetLibraryMemberships.registerDiscovered([registration]);
    await first.repositories.assetLibraryMemberships.removeMany(
      [registration.membershipId],
      '2026-08-05T08:02:00.000Z',
    );
    await first.dispose();

    const reopened = createNodeSqliteLocalMetadataStore({ homedir });
    await reopened.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(reopened);
    await initializeAssetLibraryMembershipTables(reopened);
    await reopened.repositories.assetLibraryMemberships.registerDiscovered([
      { ...registration, membershipId: 'new-scanner-id', registeredAt: '2026-08-05T08:03:00.000Z' },
      {
        ...registration,
        membershipId: 'membership-new',
        sourceRelativePath: 'new.png',
        label: 'new.png',
        registeredAt: '2026-08-05T08:03:00.000Z',
      },
    ]);
    await expect(reopened.repositories.assetLibraryMemberships.listActive()).resolves.toMatchObject(
      [{ membershipId: 'membership-new', sourceRelativePath: 'new.png', state: 'active' }],
    );
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
    await store.repositories.assetLibraryMemberships.registerDiscovered([first]);
    await store.repositories.assetLibraryMemberships.removeMany(
      [first.membershipId],
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

  it('relocates and removes complete batches atomically', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-asset-membership-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(store);
    await initializeAssetLibraryMembershipTables(store);
    const registeredAt = '2026-08-05T08:00:00.000Z';
    await store.repositories.assetLibraryMemberships.registerDiscovered([
      registration('membership-a', 'a.png', registeredAt),
      registration('membership-b', 'b.png', registeredAt),
      registration('membership-conflict', 'folder/conflict.png', registeredAt),
    ]);

    await expect(
      store.repositories.assetLibraryMemberships.relocateMany([
        relocation('membership-a', 'a.png', 'folder/a.png'),
        relocation('membership-b', 'b.png', 'folder/b.png'),
      ]),
    ).resolves.toMatchObject([
      { membershipId: 'membership-a', sourceRelativePath: 'folder/a.png' },
      { membershipId: 'membership-b', sourceRelativePath: 'folder/b.png' },
    ]);

    await expect(
      store.repositories.assetLibraryMemberships.relocateMany([
        relocation('membership-a', 'folder/a.png', 'next/a.png'),
        relocation('membership-b', 'folder/b.png', 'folder/conflict.png'),
      ]),
    ).rejects.toThrow('Asset membership target already exists');
    await expect(
      store.repositories.assetLibraryMemberships.get('membership-a'),
    ).resolves.toMatchObject({ sourceRelativePath: 'folder/a.png', state: 'active' });

    await expect(
      store.repositories.assetLibraryMemberships.removeMany(
        ['membership-a', 'missing-membership'],
        '2026-08-05T08:03:00.000Z',
      ),
    ).rejects.toThrow('Active Asset membership does not exist');
    await expect(
      store.repositories.assetLibraryMemberships.get('membership-a'),
    ).resolves.toMatchObject({ state: 'active' });

    await expect(
      store.repositories.assetLibraryMemberships.removeMany(
        ['membership-a', 'membership-b'],
        '2026-08-05T08:04:00.000Z',
      ),
    ).resolves.toMatchObject([
      { membershipId: 'membership-a', state: 'removed' },
      { membershipId: 'membership-b', state: 'removed' },
    ]);
    await store.dispose();
  });
});

function registration(membershipId: string, sourceRelativePath: string, registeredAt: string) {
  return {
    membershipId,
    sourceRelativePath,
    label: sourceRelativePath.split('/').at(-1) ?? sourceRelativePath,
    mediaType: 'image',
    byteLength: 4,
    modifiedAt: registeredAt,
    registeredAt,
  } as const;
}

function relocation(
  membershipId: string,
  expectedSourceRelativePath: string,
  sourceRelativePath: string,
) {
  return {
    membershipId,
    expectedSourceRelativePath,
    sourceRelativePath,
    label: sourceRelativePath.split('/').at(-1) ?? sourceRelativePath,
    relocatedAt: '2026-08-05T08:02:00.000Z',
  } as const;
}
