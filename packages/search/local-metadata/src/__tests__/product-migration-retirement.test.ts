import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeWorkspaceSearchMetadataBinding } from '../node-workspace-search-metadata-binding';

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Search Local Metadata product migration retirement', () => {
  it('does not inspect or rewrite retired Search projection files during binding', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-search-stable-binding-'));
    temporaryDirectories.push(homedir);
    const workDir = join(homedir, 'workspace');
    const searchPath = join(workDir, '.neko', '.cache', 'search-index.json');
    const semanticPath = join(workDir, '.neko', 'semantic-index', 'source-1', 'index.json');
    const searchBytes = '{"version":1,"entries":"invalid"}';
    const semanticBytes = '{"version":1,"source":"invalid"}';
    await mkdir(dirname(searchPath), { recursive: true });
    await mkdir(dirname(semanticPath), { recursive: true });
    await writeFile(searchPath, searchBytes, 'utf8');
    await writeFile(semanticPath, semanticBytes, 'utf8');

    const binding = await createNodeWorkspaceSearchMetadataBinding({ homedir, workDir });

    await expect(readFile(searchPath, 'utf8')).resolves.toBe(searchBytes);
    await expect(readFile(semanticPath, 'utf8')).resolves.toBe(semanticBytes);
    await expect(binding.searchDocuments.list(binding.searchPartition)).resolves.toEqual([]);
    await expect(binding.semanticProjections.list(binding.semanticPartition)).resolves.toEqual({
      records: [],
      diagnostics: [],
    });
    await binding.dispose();
  });

  it('keeps the Search projection migrator absent from exports and startup', () => {
    expect(existsSync(join(sourceRoot, 'node-search-projection-migration.ts'))).toBe(false);
    expect(readFileSync(join(sourceRoot, 'index.ts'), 'utf8')).not.toContain('migration');
    expect(
      readFileSync(join(sourceRoot, 'node-workspace-search-metadata-binding.ts'), 'utf8'),
    ).not.toContain('migrateLegacy');
  });
});
