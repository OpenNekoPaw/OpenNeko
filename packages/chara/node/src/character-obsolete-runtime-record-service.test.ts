import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import {
  CharacterObsoleteRuntimeRecordService,
  initializeCharacterPersistenceTables,
} from './index';

const roots: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('CharacterObsoleteRuntimeRecordService', () => {
  it('exports the exact stored bytes without converting or deleting the obsolete record', async () => {
    const fixture = await createFixture();
    const original = '{\n  "characterStorylineRunId": "obsolete-run-a",\n  "unexpected": true\n}';
    await insertObsolete(
      fixture.store,
      'chara_storyline_runs',
      'character_storyline_run_id',
      'obsolete-run-a',
      original,
    );
    const service = new CharacterObsoleteRuntimeRecordService({ metadataStore: fixture.store });
    const write = vi.fn(async () => undefined);

    const exported = await service.export(
      { kind: 'storyline-run', recordId: 'obsolete-run-a' },
      { write },
    );

    expect(Buffer.from(exported.originalPayload).toString('utf8')).toBe(original);
    expect(write).toHaveBeenCalledWith(exported, undefined);
    await expect(service.inspect(exported.selection)).resolves.toEqual(exported);
    await fixture.store.dispose();
  });

  it('preserves the original record when export fails', async () => {
    const fixture = await createFixture();
    const original = '{"characterMemoryScopeId":"obsolete-memory-a"}';
    await insertObsolete(
      fixture.store,
      'chara_memory_scopes',
      'character_memory_scope_id',
      'obsolete-memory-a',
      original,
    );
    const service = new CharacterObsoleteRuntimeRecordService({ metadataStore: fixture.store });

    await expect(
      service.export(
        { kind: 'character-memory-scope', recordId: 'obsolete-memory-a' },
        { write: async () => Promise.reject(new Error('destination unavailable')) },
      ),
    ).rejects.toThrow('destination unavailable');

    await expect(
      service.inspect({ kind: 'character-memory-scope', recordId: 'obsolete-memory-a' }),
    ).resolves.toMatchObject({
      selection: { kind: 'character-memory-scope', recordId: 'obsolete-memory-a' },
    });
    await fixture.store.dispose();
  });

  it('cleans only an exactly inspected record and rejects stale inspection bytes', async () => {
    const fixture = await createFixture();
    await insertObsolete(
      fixture.store,
      'chara_storyline_observation_candidates',
      'observation_candidate_id',
      'candidate-a',
      '{"candidate":"a"}',
    );
    await insertObsolete(
      fixture.store,
      'chara_storyline_observation_candidates',
      'observation_candidate_id',
      'candidate-b',
      '{"candidate":"b"}',
    );
    const service = new CharacterObsoleteRuntimeRecordService({ metadataStore: fixture.store });
    const inspected = await service.inspect({
      kind: 'storyline-observation-candidate',
      recordId: 'candidate-a',
    });
    await replacePayload(
      fixture.store,
      'chara_storyline_observation_candidates',
      'observation_candidate_id',
      'candidate-a',
      '{"candidate":"changed"}',
    );

    await expect(service.cleanup(inspected)).rejects.toThrow('changed after inspection');
    const current = await service.inspect(inspected.selection);
    await service.cleanup(current);

    await expect(service.inspect(inspected.selection)).rejects.toThrow('unavailable');
    await expect(
      service.inspect({
        kind: 'storyline-observation-candidate',
        recordId: 'candidate-b',
      }),
    ).resolves.toBeDefined();
    await fixture.store.dispose();
  });

  it('rejects unknown kinds and empty identities before touching persistence', async () => {
    const fixture = await createFixture();
    const service = new CharacterObsoleteRuntimeRecordService({ metadataStore: fixture.store });

    expect(() => service.inspect({ kind: 'storyline-run', recordId: ' ' })).toThrow(
      'identity is required',
    );
    expect(() =>
      service.inspect({ kind: 'unknown' as 'storyline-run', recordId: 'record-a' }),
    ).toThrow('Unknown obsolete Character runtime record kind');
    await fixture.store.dispose();
  });
});

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'openneko-character-obsolete-'));
  roots.push(root);
  const store = createNodeSqliteLocalMetadataStore({ homedir: root });
  await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
  await initializeCharacterPersistenceTables(store);
  return { store };
}

async function insertObsolete(
  store: Awaited<ReturnType<typeof createFixture>>['store'],
  tableName: string,
  idColumn: string,
  recordId: string,
  payload: string,
): Promise<void> {
  await store.transaction(
    { mode: 'state-write', ownership: 'state', operation: 'insert-obsolete-character-fixture' },
    async ({ sql }) => {
      const revisionColumn =
        tableName === 'chara_storyline_runs'
          ? 'storyline_revision'
          : tableName === 'chara_memory_scopes'
            ? 'memory_revision'
            : undefined;
      const columns = revisionColumn
        ? `${idColumn}, ${revisionColumn}, payload_json`
        : `${idColumn}, payload_json`;
      const values = revisionColumn ? '?, 0, ?' : '?, ?';
      await sql.run(`INSERT INTO ${tableName}(${columns}) VALUES (${values})`, [recordId, payload]);
    },
  );
}

async function replacePayload(
  store: Awaited<ReturnType<typeof createFixture>>['store'],
  tableName: string,
  idColumn: string,
  recordId: string,
  payload: string,
): Promise<void> {
  await store.transaction(
    { mode: 'state-write', ownership: 'state', operation: 'replace-obsolete-character-fixture' },
    async ({ sql }) => {
      await sql.run(`UPDATE ${tableName} SET payload_json = ? WHERE ${idColumn} = ?`, [
        payload,
        recordId,
      ]);
    },
  );
}
