import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, it } from 'vitest';
import { runLocalMetadataAdapterContract } from './testing';
import { createNodeSqliteLocalMetadataStore } from './node-sqlite-local-metadata-store';

const temporaryDirectories: string[] = [];

async function createTemporaryHome(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'neko-node-sqlite-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('Desktop node:sqlite local metadata store', () => {
  it('passes the shared local metadata adapter contract', async () => {
    await runLocalMetadataAdapterContract({
      sourceHome: await createTemporaryHome(),
      backupHome: await createTemporaryHome(),
      createStore: (homedir) => createNodeSqliteLocalMetadataStore({ homedir }),
    });
  }, 30_000);
});
