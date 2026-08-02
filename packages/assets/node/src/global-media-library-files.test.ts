import { lstat, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ContentLocator, ContentReadService } from '@neko/content';
import {
  copyDesktopGlobalMediaLibraryContent,
  createGlobalMediaLibraryConnection,
  listGlobalMediaLibraryConnections,
  removeGlobalMediaLibraryConnection,
  replaceGlobalMediaLibraryConnection,
  resolveGlobalMediaLibraryTarget,
} from './global-media-library-files';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('Desktop global Media Library connections', () => {
  it('rejects a dot-prefixed source name before creating a managed link', async () => {
    const root = await createFixture();
    const source = path.join(root, '.hidden-library');
    const registry = path.join(root, 'registry');
    await mkdir(source);
    await writeFile(path.join(source, 'shot.mp4'), 'original');

    await expect(
      createGlobalMediaLibraryConnection({
        mediaLibraryRoot: registry,
        sourceDirectory: source,
        locationKind: 'local',
      }),
    ).rejects.toThrow('name is invalid');
    await expect(lstat(path.join(registry, 'local', '.hidden-library'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(readFile(path.join(source, 'shot.mp4'), 'utf8')).resolves.toBe('original');
  });

  it('connects a directory without copying it into the registry', async () => {
    const root = await createFixture();
    const source = path.join(root, 'Footage');
    const registry = path.join(root, 'registry');
    await mkdir(source);
    await writeFile(path.join(source, 'shot.mp4'), 'original');

    const result = await createGlobalMediaLibraryConnection({
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
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      sourceDirectory: source,
      locationKind: 'local',
    });

    await removeGlobalMediaLibraryConnection({
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

    await expect(listGlobalMediaLibraryConnections(registry)).resolves.toMatchObject([
      {
        libraryId: 'media-library:cloud:References',
        availability: 'unavailable',
      },
    ]);
    await removeGlobalMediaLibraryConnection({
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
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      sourceDirectory: source,
      locationKind: 'local',
    });

    await expect(
      resolveGlobalMediaLibraryTarget({ mediaLibraryRoot: registry, libraryId }),
    ).resolves.toBe(await pathResolve(source));
  });

  it('relinks a managed connection without changing either target directory', async () => {
    const root = await createFixture();
    const original = path.join(root, 'Original');
    const replacement = path.join(root, 'Replacement');
    const registry = path.join(root, 'registry');
    await mkdir(original);
    await mkdir(replacement);
    await writeFile(path.join(original, 'original.png'), 'original');
    await writeFile(path.join(replacement, 'replacement.png'), 'replacement');
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      sourceDirectory: original,
      locationKind: 'local',
    });

    await replaceGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      libraryId,
      sourceDirectory: replacement,
    });

    await expect(
      readFile(path.join(registry, 'local', 'Original', 'replacement.png'), 'utf8'),
    ).resolves.toBe('replacement');
    await expect(readFile(path.join(original, 'original.png'), 'utf8')).resolves.toBe('original');
    await expect(readFile(path.join(replacement, 'replacement.png'), 'utf8')).resolves.toBe(
      'replacement',
    );
  });

  it('copies source bytes into an explicit global library destination without changing source identity', async () => {
    const root = await createFixture();
    const sourceDirectory = path.join(root, 'Footage');
    const registry = path.join(root, 'registry');
    await mkdir(sourceDirectory);
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      sourceDirectory,
      locationKind: 'local',
    });
    const source: ContentLocator = { kind: 'workspace-file', path: 'shots/source.mp4' };

    const result = await copyDesktopGlobalMediaLibraryContent({
      mediaLibraryRoot: registry,
      globalLibraryId: libraryId,
      source,
      destinationDirectory: 'Sequences/Opening',
      fileName: 'source.mp4',
      conflict: 'fail-if-exists',
      reader: createReader(source, 'copied-bytes'),
    });

    expect(result).toMatchObject({
      status: 'copied',
      source,
      globalLibraryId: libraryId,
      entryId: 'Sequences/Opening/source.mp4',
      byteLength: 12,
      fingerprint: { strategy: 'sha256' },
    });
    await expect(
      readFile(path.join(sourceDirectory, 'Sequences', 'Opening', 'source.mp4'), 'utf8'),
    ).resolves.toBe('copied-bytes');
  });

  it('requires an explicit replace policy before overwriting a global library entry', async () => {
    const root = await createFixture();
    const sourceDirectory = path.join(root, 'Footage');
    const registry = path.join(root, 'registry');
    await mkdir(sourceDirectory);
    await writeFile(path.join(sourceDirectory, 'shot.mp4'), 'existing');
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      sourceDirectory,
      locationKind: 'nas',
    });
    const source: ContentLocator = { kind: 'workspace-file', path: 'incoming/shot.mp4' };

    await expect(
      copyDesktopGlobalMediaLibraryContent({
        mediaLibraryRoot: registry,
        globalLibraryId: libraryId,
        source,
        destinationDirectory: '',
        fileName: 'shot.mp4',
        conflict: 'fail-if-exists',
        reader: createReader(source, 'replacement'),
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-conflict' },
    });
    await expect(readFile(path.join(sourceDirectory, 'shot.mp4'), 'utf8')).resolves.toBe(
      'existing',
    );

    await expect(
      copyDesktopGlobalMediaLibraryContent({
        mediaLibraryRoot: registry,
        globalLibraryId: libraryId,
        source,
        destinationDirectory: '',
        fileName: 'shot.mp4',
        conflict: 'replace',
        reader: createReader(source, 'replacement'),
      }),
    ).resolves.toMatchObject({ status: 'copied' });
    await expect(readFile(path.join(sourceDirectory, 'shot.mp4'), 'utf8')).resolves.toBe(
      'replacement',
    );
  });

  it('rejects destination directory links that escape the connected global library', async () => {
    const root = await createFixture();
    const sourceDirectory = path.join(root, 'Footage');
    const outsideDirectory = path.join(root, 'outside');
    const registry = path.join(root, 'registry');
    await mkdir(sourceDirectory);
    await mkdir(outsideDirectory);
    await symlink(outsideDirectory, path.join(sourceDirectory, 'escape'));
    const { libraryId } = await createGlobalMediaLibraryConnection({
      mediaLibraryRoot: registry,
      sourceDirectory,
      locationKind: 'cloud',
    });
    const source: ContentLocator = { kind: 'workspace-file', path: 'incoming/shot.mp4' };

    await expect(
      copyDesktopGlobalMediaLibraryContent({
        mediaLibraryRoot: registry,
        globalLibraryId: libraryId,
        source,
        destinationDirectory: 'escape',
        fileName: 'shot.mp4',
        conflict: 'fail-if-exists',
        reader: createReader(source, 'must-not-escape'),
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'content-unauthorized' },
    });
    await expect(readFile(path.join(outsideDirectory, 'shot.mp4'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
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

function createReader(source: ContentLocator, value: string): ContentReadService {
  return {
    stat: async () => ({
      status: 'ready',
      locator: source,
      byteLength: value.length,
      fingerprint: { strategy: 'sha256', value: 'sha256:source' },
    }),
    read: async () => ({
      status: 'ready',
      locator: source,
      bytes: new TextEncoder().encode(value),
      offset: 0,
      totalByteLength: value.length,
      fingerprint: { strategy: 'sha256', value: 'sha256:source' },
    }),
  };
}
