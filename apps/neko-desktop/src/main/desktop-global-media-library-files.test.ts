import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyDesktopGlobalMediaLibraryDirectory } from './desktop-global-media-library-files';

const temporaryRoots: string[] = [];

afterEach(async () => {
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('copyDesktopGlobalMediaLibraryDirectory', () => {
  it('rejects symbolic links without copying their targets', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-global-media-library-'));
    temporaryRoots.push(root);
    const source = path.join(root, 'source');
    const external = path.join(root, 'external');
    const destination = path.join(root, 'destination');
    await mkdir(source);
    await mkdir(external);
    await writeFile(path.join(external, 'private.mp4'), 'private');
    await symlink(external, path.join(source, 'linked'));

    await expect(copyDesktopGlobalMediaLibraryDirectory(source, destination)).rejects.toThrow(
      'refuses symbolic links',
    );
  });

  it('rejects a symbolic-link source directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'openneko-global-media-library-'));
    temporaryRoots.push(root);
    const physicalSource = path.join(root, 'physical');
    const linkedSource = path.join(root, 'linked');
    await mkdir(physicalSource);
    await symlink(physicalSource, linkedSource);

    await expect(
      copyDesktopGlobalMediaLibraryDirectory(linkedSource, path.join(root, 'destination')),
    ).rejects.toThrow('physical directory');
  });
});
