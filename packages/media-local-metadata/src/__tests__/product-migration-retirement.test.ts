import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveStorageLayout } from '@neko/local-metadata';
import { afterEach, describe, expect, it } from 'vitest';

import { createNodeWorkspaceMediaMetadataBinding } from '../node-workspace-media-metadata-binding';

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Media Local Metadata product migration retirement', () => {
  it('leaves retired cache bytes untouched while opening the stable repository', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-media-stable-binding-'));
    temporaryDirectories.push(homedir);
    const workDir = join(homedir, 'workspace');
    const legacyPath = resolveStorageLayout(workDir, homedir).project.local.cache.mediaMetadata;
    const legacyBytes = '{"version":1,"entries":{"broken":true}}';
    await mkdir(dirname(legacyPath), { recursive: true });
    await writeFile(legacyPath, legacyBytes, 'utf8');

    const binding = await createNodeWorkspaceMediaMetadataBinding({ homedir, workDir });

    await expect(readFile(legacyPath, 'utf8')).resolves.toBe(legacyBytes);
    await expect(binding.repository.list(binding.partition)).resolves.toEqual([]);
    await binding.dispose();
  });

  it('keeps Media migration modules absent from package exports and binding startup', () => {
    expect(existsSync(join(sourceRoot, 'node-media-metadata-migration.ts'))).toBe(false);
    expect(existsSync(join(sourceRoot, 'node-proxy-manifest-migration.ts'))).toBe(false);
    expect(readFileSync(join(sourceRoot, 'index.ts'), 'utf8')).not.toContain('migration');
    expect(
      readFileSync(join(sourceRoot, 'node-workspace-media-metadata-binding.ts'), 'utf8'),
    ).not.toContain('migrateLegacy');
  });
});
