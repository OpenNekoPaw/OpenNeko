import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = join(import.meta.dirname, '../../../../');
const productionRoots = [
  join(repositoryRoot, 'apps/neko-desktop/src/main'),
  join(repositoryRoot, 'packages/agent/runtime/src'),
  join(repositoryRoot, 'packages/agent/contracts/src'),
];

describe('retired Pi data access poison', () => {
  it('keeps retired reader and mutation entry points out of production source', async () => {
    const sources = await collectProductionSources(productionRoots);
    const forbidden = [
      'NodePiConversationCatalogReader',
      'PiConversationCatalogReader',
      'importRetiredPi',
      'repairRetiredPi',
      'cleanupRetiredPi',
      'deleteRetiredPi',
      ['mig', 'ratePiTranscript'].join(''),
      'removeRetiredPiStorage',
      'RetiredPiStorageFilePort',
      'remove-retired-pi-agent-storage',
    ];
    for (const source of sources) {
      const content = await readFile(source, 'utf8');
      for (const token of forbidden) expect(content, source).not.toContain(token);
    }
  });
});

async function collectProductionSources(rootPaths: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const root of rootPaths) await visit(root, files);
  return files;
}

async function visit(directory: string, files: string[]): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') await visit(path, files);
    } else if (/\.(ts|tsx)$/u.test(entry.name) && !entry.name.endsWith('.test.ts')) {
      files.push(path);
    }
  }
}
