import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AssetLibraryMembershipRecord,
  AssetLibraryMembershipRegistration,
  AssetLibraryMembershipRepository,
} from '@neko/assets-domain/global-library/membership';
import { importGlobalAssetFiles } from './global-asset-files';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('Desktop global Asset files', () => {
  it('publishes regular supported files without replacing conflicts or leaking source paths', async () => {
    const root = await createFixture();
    const assets = path.join(root, 'assets');
    const incoming = path.join(root, 'incoming');
    await mkdir(assets);
    await mkdir(incoming);
    await writeFile(path.join(assets, 'Existing.png'), 'original');
    await writeFile(path.join(incoming, 'Hero.png'), 'hero');
    await writeFile(path.join(incoming, 'Existing.png'), 'replacement');
    const memberships = createMembershipRepository();

    const outcomes = await importGlobalAssetFiles({
      globalAssetRoot: assets,
      sourcePaths: [path.join(incoming, 'Hero.png'), path.join(incoming, 'Existing.png')],
      memberships,
      createMembershipId: () => 'membership-hero',
    });

    expect(outcomes).toMatchObject([
      { status: 'added', label: 'Hero.png' },
      { status: 'conflict', label: 'Existing.png' },
    ]);
    expect(JSON.stringify(outcomes)).not.toContain(incoming);
    await expect(readFile(path.join(assets, 'Hero.png'), 'utf8')).resolves.toBe('hero');
    await expect(readFile(path.join(assets, 'Existing.png'), 'utf8')).resolves.toBe('original');
    await expect(lstat(path.join(assets, '.imports'))).resolves.toMatchObject({});
  });

  it('rejects directories, symbolic links, hidden files, and unsupported materials independently', async () => {
    const root = await createFixture();
    const assets = path.join(root, 'assets');
    const incoming = path.join(root, 'incoming');
    await mkdir(assets);
    await mkdir(incoming);
    await mkdir(path.join(incoming, 'Folder'));
    await writeFile(path.join(incoming, 'source.png'), 'source');
    await symlink(path.join(incoming, 'source.png'), path.join(incoming, 'linked.png'));
    await writeFile(path.join(incoming, '.hidden.png'), 'hidden');
    await writeFile(path.join(incoming, 'notes.bin'), 'unsupported');
    const memberships = createMembershipRepository();

    const outcomes = await importGlobalAssetFiles({
      globalAssetRoot: assets,
      sourcePaths: [
        path.join(incoming, 'Folder'),
        path.join(incoming, 'linked.png'),
        path.join(incoming, '.hidden.png'),
        path.join(incoming, 'notes.bin'),
      ],
      memberships,
    });

    expect(outcomes).toHaveLength(4);
    expect(outcomes.every((outcome) => outcome.status === 'rejected')).toBe(true);
    expect(await import('node:fs/promises').then((module) => module.readdir(assets))).toEqual([
      '.imports',
    ]);
  });

  it('reactivates an explicitly reimported preserved file with the same membership identity', async () => {
    const root = await createFixture();
    const assets = path.join(root, 'assets');
    const incoming = path.join(root, 'incoming');
    await mkdir(incoming);
    const sourcePath = path.join(incoming, 'Hero.png');
    await writeFile(sourcePath, 'hero');
    const memberships = createMembershipRepository();
    const first = await importGlobalAssetFiles({
      globalAssetRoot: assets,
      sourcePaths: [sourcePath],
      memberships,
      createMembershipId: () => 'membership-original',
    });
    expect(first).toMatchObject([{ status: 'added', assetId: 'membership-original' }]);
    await memberships.removeMany(['membership-original'], '2026-08-05T08:01:00.000Z');

    const second = await importGlobalAssetFiles({
      globalAssetRoot: assets,
      sourcePaths: [sourcePath],
      memberships,
      createMembershipId: () => 'discarded-reimport-id',
    });
    expect(second).toMatchObject([{ status: 'added', assetId: 'membership-original' }]);
    await expect(readFile(path.join(assets, 'Hero.png'), 'utf8')).resolves.toBe('hero');
  });

  it('rolls back a newly copied library file when persistent membership commit fails', async () => {
    const root = await createFixture();
    const assets = path.join(root, 'assets');
    const sourcePath = path.join(root, 'Hero.png');
    await writeFile(sourcePath, 'hero');
    const memberships = createMembershipRepository();
    memberships.activate = vi.fn(async () => {
      throw new Error('membership commit failed');
    });

    await expect(
      importGlobalAssetFiles({ globalAssetRoot: assets, sourcePaths: [sourcePath], memberships }),
    ).rejects.toThrow('membership commit failed');
    await expect(lstat(path.join(assets, 'Hero.png'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-global-assets-'));
  temporaryRoots.push(root);
  return root;
}

function createMembershipRepository(): AssetLibraryMembershipRepository {
  const records = new Map<string, AssetLibraryMembershipRecord>();
  const findByPath = (sourceRelativePath: string): AssetLibraryMembershipRecord | undefined =>
    [...records.values()].find((record) => record.sourceRelativePath === sourceRelativePath);
  return {
    async get(membershipId) {
      return records.get(membershipId) ?? null;
    },
    async findBySourceRelativePath(sourceRelativePath) {
      return findByPath(sourceRelativePath) ?? null;
    },
    async listActive() {
      return [...records.values()].filter((record) => record.state === 'active');
    },
    async initializeExistingInventory() {
      return { status: 'already-initialized' };
    },
    async activate(registration: AssetLibraryMembershipRegistration) {
      const existing = findByPath(registration.sourceRelativePath);
      const record: AssetLibraryMembershipRecord = {
        membershipId: existing?.membershipId ?? registration.membershipId,
        sourceRelativePath: registration.sourceRelativePath,
        label: registration.label,
        mediaType: registration.mediaType,
        byteLength: registration.byteLength,
        modifiedAt: registration.modifiedAt,
        state: 'active',
        createdAt: existing?.createdAt ?? registration.registeredAt,
        updatedAt: registration.registeredAt,
      };
      records.set(record.membershipId, record);
      return record;
    },
    async removeMany(membershipIds, removedAt) {
      const active = membershipIds.map((membershipId) => {
        const existing = records.get(membershipId);
        if (!existing || existing.state !== 'active') throw new Error('missing active membership');
        return existing;
      });
      return active.map((existing) => {
        const removed = { ...existing, state: 'removed' as const, updatedAt: removedAt };
        records.set(existing.membershipId, removed);
        return removed;
      });
    },
    async relocateMany(relocations) {
      const active = relocations.map((relocation) => {
        const existing = records.get(relocation.membershipId);
        if (
          !existing ||
          existing.state !== 'active' ||
          existing.sourceRelativePath !== relocation.expectedSourceRelativePath
        ) {
          throw new Error('missing active membership');
        }
        return { existing, relocation };
      });
      return active.map(({ existing, relocation }) => {
        const relocated = {
          ...existing,
          sourceRelativePath: relocation.sourceRelativePath,
          label: relocation.label,
          updatedAt: relocation.relocatedAt,
        };
        records.set(existing.membershipId, relocated);
        return relocated;
      });
    },
  };
}
