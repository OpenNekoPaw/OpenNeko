import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { createNodeWorkspaceEntityAssetMetadataBinding } from './node-workspace-entity-asset-metadata-binding';

const sourceRoot = dirname(fileURLToPath(import.meta.url));
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Entity projection product migration retirement', () => {
  it('does not inspect or rewrite a retired asset graph during binding', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-entity-stable-binding-'));
    temporaryDirectories.push(homedir);
    const workDir = join(homedir, 'workspace');
    const graphPath = join(workDir, '.neko', '.cache', 'asset-graph.json');
    const graphBytes = '{"version":1,"nodes":"invalid"}';
    await mkdir(dirname(graphPath), { recursive: true });
    await writeFile(graphPath, graphBytes, 'utf8');

    const binding = await createNodeWorkspaceEntityAssetMetadataBinding({ homedir, workDir });

    await expect(readFile(graphPath, 'utf8')).resolves.toBe(graphBytes);
    await expect(binding.repository.list({ partition: binding.partition })).resolves.toEqual({
      records: [],
      diagnostics: [],
    });
    await binding.dispose();
  });

  it('keeps Entity migration, inventory, archive and restore paths absent from exports', () => {
    for (const moduleName of [
      'node-entity-asset-projection-migration',
      'node-project-entity-migration-inventory',
      'node-project-entity-migration',
      'node-project-entity-restore-runtime',
    ]) {
      expect(existsSync(join(sourceRoot, `${moduleName}.ts`))).toBe(false);
      expect(readFileSync(join(sourceRoot, 'index.ts'), 'utf8')).not.toContain(moduleName);
    }
    expect(
      readFileSync(join(sourceRoot, 'node-workspace-entity-asset-metadata-binding.ts'), 'utf8'),
    ).not.toContain('migrateLegacy');
  });
});
