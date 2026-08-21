import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { removeRetiredPiStorage } from '@neko/agent-runtime/application';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';

import { DesktopRetiredPiStorageFilePort } from './desktop-retired-pi-storage-file-port';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('DesktopRetiredPiStorageFilePort', () => {
  it('removes exact retired roots without touching unknown or DSH data', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'openneko-retired-pi-'));
    roots.push(home);
    const retiredRoot = path.join(home, '.neko');
    const dshSession = path.join(
      home,
      'Library',
      'Application Support',
      'OpenNeko',
      'dsh',
      'sessions',
    );
    await Promise.all([
      mkdir(path.join(retiredRoot, 'conversations'), { recursive: true }),
      mkdir(path.join(retiredRoot, 'journals'), { recursive: true }),
      mkdir(path.join(retiredRoot, 'unknown-agent-data'), { recursive: true }),
      mkdir(dshSession, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(retiredRoot, 'conversations', 'one.jsonl'), 'retired'),
      writeFile(path.join(retiredRoot, 'journals', 'one.jsonl'), 'retired'),
      writeFile(path.join(retiredRoot, 'unknown-agent-data', 'keep.txt'), 'keep'),
      writeFile(path.join(dshSession, 'keep.jsonl'), 'keep'),
    ]);

    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: home });
    await metadataStore.open({
      databasePath: path.join(home, '.neko', 'neko.db'),
      busyTimeoutMs: 1_000,
    });
    await metadataStore.transaction(
      {
        mode: 'system-write',
        ownership: 'system',
        operation: 'seed-retired-pi-storage',
      },
      async ({ sql }) => {
        for (const table of [
          'agent_conversation_records',
          'conversations',
          'pi_conversations',
          'pi_messages',
          'unrelated_agent_data',
        ]) {
          await sql.run(`CREATE TABLE ${table} (id TEXT PRIMARY KEY)`);
        }
      },
    );

    await removeRetiredPiStorage({
      metadataStore,
      files: new DesktopRetiredPiStorageFilePort(home),
    });

    const remainingTables = await metadataStore.transaction(
      { mode: 'read', ownership: 'system', operation: 'inspect-retired-pi-storage-cleanup' },
      ({ sql }) =>
        sql.all(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        ),
    );
    await metadataStore.dispose();

    await expect(readFile(path.join(retiredRoot, 'conversations', 'one.jsonl'))).rejects.toThrow();
    await expect(readFile(path.join(retiredRoot, 'journals', 'one.jsonl'))).rejects.toThrow();
    await expect(
      readFile(path.join(retiredRoot, 'unknown-agent-data', 'keep.txt'), 'utf8'),
    ).resolves.toBe('keep');
    await expect(readFile(path.join(dshSession, 'keep.jsonl'), 'utf8')).resolves.toBe('keep');
    expect(remainingTables.map((row) => row.name)).toContain('unrelated_agent_data');
    expect(remainingTables.map((row) => row.name)).not.toEqual(
      expect.arrayContaining([
        'agent_conversation_records',
        'conversations',
        'pi_conversations',
        'pi_messages',
      ]),
    );
  });

  it('rejects a relative home directory', () => {
    expect(() => new DesktopRetiredPiStorageFilePort(path.join('relative', 'home'))).toThrow(
      'absolute home directory',
    );
  });
});
