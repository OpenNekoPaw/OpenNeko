import { lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDesktopGlobalMediaLibraryConnection,
  listDesktopGlobalMediaLibraryConnections,
  removeDesktopGlobalMediaLibraryConnection,
  resolveDesktopGlobalMediaLibraryTarget,
} from './desktop-global-media-library-files';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('Desktop global Media Library connections', () => {
  it('connects a directory without copying it into the registry', async () => {
    const root = await createFixture();
    const source = path.join(root, 'Footage');
    const registry = path.join(root, 'registry');
    await mkdir(source);
    await writeFile(path.join(source, 'shot.mp4'), 'original');

    const result = await createDesktopGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      sourceDirectory: source,
      locationKind: 'nas',
    });

    expect(result.libraryId).toBe('media-library:nas:Footage');
    expect((await lstat(path.join(registry, 'nas', 'Footage'))).isSymbolicLink()).toBe(true);
    await writeFile(path.join(source, 'new.mp4'), 'new');
    await expect(readFile(path.join(registry, 'nas', 'Footage', 'new.mp4'), 'utf8')).resolves.toBe(
      'new',
    );
  });

  it('removes only the managed link and preserves the target directory', async () => {
    const root = await createFixture();
    const source = path.join(root, 'Footage');
    const registry = path.join(root, 'registry');
    await mkdir(source);
    await writeFile(path.join(source, 'shot.mp4'), 'original');
    const { libraryId } = await createDesktopGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      sourceDirectory: source,
      locationKind: 'local',
    });

    await removeDesktopGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      libraryId,
    });

    await expect(readFile(path.join(source, 'shot.mp4'), 'utf8')).resolves.toBe('original');
    await expect(lstat(path.join(registry, 'local', 'Footage'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('reports broken connections as unavailable and still removes them', async () => {
    const root = await createFixture();
    const registry = path.join(root, 'registry');
    const group = path.join(registry, 'cloud');
    await mkdir(group, { recursive: true });
    await symlink(path.join(root, 'missing'), path.join(group, 'References'));

    await expect(listDesktopGlobalMediaLibraryConnections(registry)).resolves.toMatchObject([
      {
        libraryId: 'media-library:cloud:References',
        availability: 'unavailable',
      },
    ]);
    await removeDesktopGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      libraryId: 'media-library:cloud:References',
    });
    await expect(lstat(path.join(group, 'References'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('resolves only managed links to directory targets', async () => {
    const root = await createFixture();
    const source = path.join(root, 'Footage');
    const registry = path.join(root, 'registry');
    await mkdir(source);
    const { libraryId } = await createDesktopGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      sourceDirectory: source,
      locationKind: 'local',
    });

    await expect(
      resolveDesktopGlobalMediaLibraryTarget({ mediaLibraryRoot: registry, libraryId }),
    ).resolves.toBe(await pathResolve(source));
  });
});

async function createFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'openneko-global-media-library-'));
  temporaryRoots.push(root);
  return root;
}

async function pathResolve(targetPath: string): Promise<string> {
  return (await import('node:fs/promises')).realpath(targetPath);
}
