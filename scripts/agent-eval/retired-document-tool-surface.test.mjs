import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const suitesRoot = resolve('scripts/agent-eval/suites');
const retiredNames = ['ReadDocument', 'ReadImage', 'read_document', 'read_document_image'];

describe('active Agent Evaluation DSH document surface', () => {
  it('does not expose retired Pi document/image tool names', async () => {
    const files = await listCatalogJsonFiles(suitesRoot);
    const violations = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      for (const name of retiredNames) {
        if (source.includes(name)) violations.push(`${relative(process.cwd(), file)}: ${name}`);
      }
    }
    expect(violations).toEqual([]);
  });
});

async function listCatalogJsonFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listCatalogJsonFiles(path)));
    else if (
      entry.isFile() &&
      entry.name.endsWith('.json') &&
      (entry.name === 'suite.json' || entry.name === 'index.json' || directory.endsWith('/cases'))
    ) {
      files.push(path);
    }
  }
  return files;
}
