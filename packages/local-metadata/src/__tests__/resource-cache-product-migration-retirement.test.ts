import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveStorageLayout } from '../storage';
import { createNodeWorkspaceResourceCacheMetadataBinding } from '../node-workspace-resource-cache-binding';

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Resource Cache product migration retirement', () => {
  it('leaves retired manifest bytes untouched while opening the stable cache store', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-resource-cache-stable-binding-'));
    temporaryDirectories.push(homedir);
    const workDir = join(homedir, 'workspace');
    const manifestPath = resolveStorageLayout(workDir, homedir).project.local.cache
      .resourceManifest;
    const manifestBytes = '{"version":1,"entries":"invalid"}';
    await mkdir(dirname(manifestPath), { recursive: true });
    await writeFile(manifestPath, manifestBytes, 'utf8');

    const binding = await createNodeWorkspaceResourceCacheMetadataBinding({ homedir, workDir });

    await expect(readFile(manifestPath, 'utf8')).resolves.toBe(manifestBytes);
    await expect(binding.manifestStore.load()).resolves.toMatchObject({ entries: {} });
    await binding.dispose();
  });

  it('keeps the Resource Cache manifest migrator physically absent', () => {
    expect(existsSync(join(sourceRoot, 'node-resource-cache-manifest-migration.ts'))).toBe(false);
  });
});
