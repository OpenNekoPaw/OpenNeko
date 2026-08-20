import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  AssetLibraryMembershipRecord,
  AssetLibraryMembershipRepository,
} from '@neko/assets-domain/global-library/membership';
import { WorkspaceAssetMaterializationService } from './workspace-asset-materialization';

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('Workspace Asset materialization', () => {
  it('copies an exact active Asset into a regular Workspace file', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.assetRoot, 'hero.png'), 'hero');
    const service = createService(fixture.assetRoot, record('asset-hero', 'hero.png'));

    const result = await service.materialize({
      request: { assetId: 'asset-hero' },
      workspaceRoot: fixture.workspaceRoot,
    });

    expect(result).toEqual({
      status: 'materialized',
      assetId: 'asset-hero',
      label: 'hero.png',
      contentLocator: { file: { authority: 'workspace', path: 'assets/hero.png' } },
    });
    await expect(
      readFile(path.join(fixture.workspaceRoot, 'assets/hero.png'), 'utf8'),
    ).resolves.toBe('hero');
    expect(
      (await lstat(path.join(fixture.workspaceRoot, 'assets/hero.png'))).isSymbolicLink(),
    ).toBe(false);
  });

  it('creates a unique sibling without overwriting Workspace content', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.assetRoot, 'hero.png'), 'new');
    await mkdir(path.join(fixture.workspaceRoot, 'assets'));
    await writeFile(path.join(fixture.workspaceRoot, 'assets/hero.png'), 'existing');
    const service = createService(fixture.assetRoot, record('asset-hero', 'hero.png'));

    const result = await service.materialize({
      request: { assetId: 'asset-hero' },
      workspaceRoot: fixture.workspaceRoot,
    });

    expect(result).toMatchObject({
      status: 'materialized',
      label: 'hero (2).png',
      contentLocator: { file: { path: 'assets/hero (2).png' } },
    });
    await expect(
      readFile(path.join(fixture.workspaceRoot, 'assets/hero.png'), 'utf8'),
    ).resolves.toBe('existing');
    await expect(
      readFile(path.join(fixture.workspaceRoot, 'assets/hero (2).png'), 'utf8'),
    ).resolves.toBe('new');
  });

  it('rejects stale membership and linked source without writing a Workspace file', async () => {
    const fixture = await createFixture();
    const external = path.join(fixture.root, 'external.png');
    await writeFile(external, 'external');
    await symlink(external, path.join(fixture.assetRoot, 'linked.png'));
    const records = new Map<string, AssetLibraryMembershipRecord>([
      ['removed', record('removed', 'removed.png', 'removed')],
      ['linked', record('linked', 'linked.png')],
      ['invalid', record('invalid', '../external.png')],
    ]);
    const service = createService(fixture.assetRoot, records);

    await expect(
      service.materialize({
        request: { assetId: 'missing' },
        workspaceRoot: fixture.workspaceRoot,
      }),
    ).resolves.toMatchObject({ diagnostic: { code: 'asset-membership-missing' } });
    await expect(
      service.materialize({
        request: { assetId: 'removed' },
        workspaceRoot: fixture.workspaceRoot,
      }),
    ).resolves.toMatchObject({ diagnostic: { code: 'asset-membership-removed' } });
    await expect(
      service.materialize({
        request: { assetId: 'linked' },
        workspaceRoot: fixture.workspaceRoot,
      }),
    ).resolves.toMatchObject({ diagnostic: { code: 'asset-source-unsupported' } });
    await expect(
      service.materialize({
        request: { assetId: 'invalid' },
        workspaceRoot: fixture.workspaceRoot,
      }),
    ).resolves.toMatchObject({ diagnostic: { code: 'asset-source-unauthorized' } });
    await expect(lstat(path.join(fixture.workspaceRoot, 'assets'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('rejects a symlinked Workspace target locally', async () => {
    const fixture = await createFixture();
    await writeFile(path.join(fixture.assetRoot, 'hero.png'), 'hero');
    const external = path.join(fixture.root, 'outside');
    await mkdir(external);
    await symlink(external, path.join(fixture.workspaceRoot, 'assets'));
    const service = createService(fixture.assetRoot, record('asset-hero', 'hero.png'));

    await expect(
      service.materialize({
        request: { assetId: 'asset-hero' },
        workspaceRoot: fixture.workspaceRoot,
      }),
    ).resolves.toMatchObject({ diagnostic: { code: 'workspace-target-unavailable' } });
    await expect(lstat(path.join(external, 'hero.png'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

async function createFixture(): Promise<{
  readonly root: string;
  readonly assetRoot: string;
  readonly workspaceRoot: string;
}> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-workspace-asset-'));
  roots.push(root);
  const assetRoot = path.join(root, 'global-assets');
  const workspaceRoot = path.join(root, 'workspace');
  await mkdir(assetRoot);
  await mkdir(workspaceRoot);
  return { root, assetRoot, workspaceRoot };
}

function createService(
  assetRoot: string,
  input: AssetLibraryMembershipRecord | ReadonlyMap<string, AssetLibraryMembershipRecord>,
): WorkspaceAssetMaterializationService {
  const records =
    'membershipId' in input
      ? new Map<string, AssetLibraryMembershipRecord>([[input.membershipId, input]])
      : new Map(input);
  const memberships: Pick<AssetLibraryMembershipRepository, 'get'> = {
    async get(assetId) {
      return records.get(assetId) ?? null;
    },
  };
  return new WorkspaceAssetMaterializationService({ globalAssetRoot: assetRoot, memberships });
}

function record(
  membershipId: string,
  sourceRelativePath: string,
  state: 'active' | 'removed' = 'active',
): AssetLibraryMembershipRecord {
  return {
    membershipId,
    sourceRelativePath,
    label: path.basename(sourceRelativePath),
    mediaType: 'image',
    byteLength: null,
    modifiedAt: null,
    state,
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:00:00.000Z',
  };
}
