import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NodeJsonEntityFileStore } from '../host-vscode';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('NodeJsonEntityFileStore', () => {
  it('returns undefined only for a missing file', async () => {
    const root = await createTempDir();
    const store = new NodeJsonEntityFileStore();
    await expect(store.readJson(path.join(root, 'missing.json'))).resolves.toBeUndefined();
    await expect(store.exists(path.join(root, 'missing.json'))).resolves.toBe(false);
  });

  it('fails visibly for malformed persisted facts', async () => {
    const root = await createTempDir();
    const filePath = path.join(root, 'invalid.json');
    await fs.writeFile(filePath, '{', 'utf8');

    const store = new NodeJsonEntityFileStore();
    await expect(store.readJson(filePath)).rejects.toBeInstanceOf(SyntaxError);
  });
});

async function createTempDir(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-entity-store-'));
  tempDirs.push(root);
  return root;
}
