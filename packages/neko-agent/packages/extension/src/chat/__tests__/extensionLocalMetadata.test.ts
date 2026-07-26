import { access, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { createExtensionLocalMetadata } from '../extensionLocalMetadata';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('Extension local metadata binding', () => {
  it('owns workspace metadata without registering a transcript revision domain', async () => {
    const homedir = await createTemporaryDirectory('neko-extension-metadata-');
    const workDir = join(homedir, 'workspace');
    await mkdir(workDir, { recursive: true });
    const binding = await createExtensionLocalMetadata({ homedir, workDir });
    await expect(binding.pollRevisions()).resolves.toEqual({
      changedDomains: [],
      revisions: {},
    });
    expect(binding).not.toHaveProperty('storage');
    expect(binding).not.toHaveProperty('initialRecords');
    expect(binding).not.toHaveProperty('migrationReport');
    await binding.disposeHost();
  });

  it('reports deprecated workspace hooks through the metadata binding', async () => {
    const homedir = await createTemporaryDirectory('neko-extension-hooks-home-');
    const workDir = join(homedir, 'workspace');
    await mkdir(join(workDir, '.neko', 'hooks'), { recursive: true });

    const binding = await createExtensionLocalMetadata({ homedir, workDir });

    expect(binding.workspaceStorageInspection.entries).toEqual([
      expect.objectContaining({
        code: 'deprecated-hook-catalog',
        relativePath: '.neko/hooks',
        suggestedTarget: '.neko/settings.local.json',
      }),
    ]);
    await binding.disposeHost();
  });

  it('restores workspace identity without attempting transcript recovery', async () => {
    const homedir = await createTemporaryDirectory('neko-extension-identity-home-');
    const workDir = join(homedir, 'workspace');
    const first = await createExtensionLocalMetadata({ homedir, workDir });
    const workspaceId = first.workspaceId;
    await first.disposeHost();
    await rm(join(workDir, '.neko'), { recursive: true, force: true });

    const reopened = await createExtensionLocalMetadata({ homedir, workDir });

    expect(reopened.workspaceId).toBe(workspaceId);
    await expect(readFile(join(workDir, '.neko', 'workspace.json'), 'utf8')).resolves.toContain(
      workspaceId,
    );
    await expect(access(join(workDir, '.neko', 'config.toml'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(access(join(workDir, '.neko', 'memory.md'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await reopened.disposeHost();
  });
});

async function createTemporaryDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}
