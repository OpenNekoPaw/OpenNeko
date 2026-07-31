import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  importDesktopGlobalAssetFiles,
  removeDesktopGlobalAssetFile,
} from './desktop-global-asset-files';

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

    const outcomes = await importDesktopGlobalAssetFiles({
      globalAssetRoot: assets,
      sourcePaths: [path.join(incoming, 'Hero.png'), path.join(incoming, 'Existing.png')],
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

    const outcomes = await importDesktopGlobalAssetFiles({
      globalAssetRoot: assets,
      sourcePaths: [
        path.join(incoming, 'Folder'),
        path.join(incoming, 'linked.png'),
        path.join(incoming, '.hidden.png'),
        path.join(incoming, 'notes.bin'),
      ],
    });

    expect(outcomes).toHaveLength(4);
    expect(outcomes.every((outcome) => outcome.status === 'rejected')).toBe(true);
    expect(await import('node:fs/promises').then((module) => module.readdir(assets))).toEqual([
      '.imports',
    ]);
  });

  it('trashes only an owned regular file and preserves it when trash fails', async () => {
    const root = await createFixture();
    const assets = path.join(root, 'assets');
    const assetPath = path.join(assets, 'Hero.png');
    await mkdir(assets);
    await writeFile(assetPath, 'hero');
    const trash = vi.fn(async () => undefined);

    await removeDesktopGlobalAssetFile({
      globalAssetRoot: assets,
      assetPath,
      trash,
    });
    expect(trash).toHaveBeenCalledWith(await import('node:fs/promises').then((fs) => fs.realpath(assetPath)));

    trash.mockRejectedValueOnce(new Error('trash unavailable'));
    await expect(
      removeDesktopGlobalAssetFile({
        globalAssetRoot: assets,
        assetPath,
        trash,
      }),
    ).rejects.toThrow('trash unavailable');
    await expect(readFile(assetPath, 'utf8')).resolves.toBe('hero');
  });

  it('rejects hidden staging, directories, symbolic links, and paths outside the owned root', async () => {
    const root = await createFixture();
    const assets = path.join(root, 'assets');
    const outside = path.join(root, 'outside.png');
    await mkdir(path.join(assets, '.imports'), { recursive: true });
    await writeFile(path.join(assets, '.imports', 'stage.png'), 'stage');
    await mkdir(path.join(assets, 'Folder'));
    await writeFile(outside, 'outside');
    await symlink(outside, path.join(assets, 'linked.png'));
    const trash = vi.fn(async () => undefined);

    for (const assetPath of [
      path.join(assets, '.imports', 'stage.png'),
      path.join(assets, 'Folder'),
      path.join(assets, 'linked.png'),
      outside,
    ]) {
      await expect(
        removeDesktopGlobalAssetFile({ globalAssetRoot: assets, assetPath, trash }),
      ).rejects.toThrow();
    }
    expect(trash).not.toHaveBeenCalled();
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-global-assets-'));
  temporaryRoots.push(root);
  return root;
}
