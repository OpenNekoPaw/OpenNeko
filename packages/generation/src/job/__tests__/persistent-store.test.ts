import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import type { LocalMetadataStore } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import { initializeCoreLocalMetadataTables } from '@neko/local-metadata/sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { GenerationJobSnapshot } from '../contracts';
import { createPersistentGenerationJobStore, initializeGenerationJobTables } from '../store';

const WORKSPACE_ID = '4ff3de02-2d72-4853-a455-73169675ab22';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('persistent GenerationJobStore', () => {
  it('replaces an empty non-canonical Generation Job table before the first submission', async () => {
    const metadata = await createMetadata({ initializeGeneration: false });
    await createRetiredGenerationJobTable(metadata);

    await initializeGenerationJobTables(metadata);

    await expect(readGenerationJobColumns(metadata)).resolves.toEqual([
      'workspace_id',
      'job_id',
      'phase',
      'snapshot_json',
      'created_at',
      'updated_at',
    ]);
    const store = createPersistentGenerationJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    await expect(store.create(snapshot())).resolves.toEqual(snapshot());
    await metadata.dispose();
  });

  it('preserves a populated non-canonical Generation Job table and rejects its owner', async () => {
    const metadata = await createMetadata({ initializeGeneration: false });
    await createRetiredGenerationJobTable(metadata);
    await insertRetiredGenerationJob(metadata);

    await expect(initializeGenerationJobTables(metadata)).rejects.toMatchObject({
      code: 'generation-job-persistence-invalid',
    });

    await expect(readGenerationJobColumns(metadata)).resolves.toContain('snapshot_version');
    await expect(readRetiredGenerationJobCount(metadata)).resolves.toBe(1);
    await metadata.dispose();
  });

  it('persists exact snapshots through the serialized owner save path', async () => {
    const metadata = await createMetadata();
    const first = createPersistentGenerationJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    const second = createPersistentGenerationJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    const initial = snapshot();
    await first.create(initial);
    const running: GenerationJobSnapshot = {
      ...initial,
      phase: 'running',
      updatedAt: 2,
      providerTask: { providerId: 'provider-1', externalTaskId: 'external-1' },
      progress: { stage: 'waiting-provider', percent: 30 },
    };

    await first.save(running);

    await expect(second.get(initial.ref)).resolves.toEqual(running);
    await expect(second.listRecoverable()).resolves.toEqual({
      snapshots: [running],
      diagnostics: [],
    });
    await metadata.dispose();
  });

  it('excludes immutable terminal snapshots from the recoverable scan', async () => {
    const metadata = await createMetadata();
    const store = createPersistentGenerationJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    const initial = snapshot();
    await store.create(initial);
    await store.save({
      ...initial,
      phase: 'succeeded',
      updatedAt: 2,
      progress: { stage: 'completed', percent: 100 },
      resultLocators: [resultLocator()],
    });

    await expect(store.listRecoverable()).resolves.toEqual({ snapshots: [], diagnostics: [] });
    await metadata.dispose();
  });

  it('rejects secret-bearing generation requests before persistence', async () => {
    const metadata = await createMetadata();
    const store = createPersistentGenerationJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });

    await expect(
      store.create({
        ...snapshot(),
        request: {
          generationType: 'text-to-image',
          providerId: 'provider-1',
          modelId: 'image-model',
          request: {
            prompt: 'cat',
            metadata: { apiKey: 'must-not-enter-sqlite' },
          },
        },
      }),
    ).rejects.toMatchObject({
      code: 'metadata-secret-forbidden',
      operation: 'persist-generation-job',
    });
    await metadata.dispose();
  });

  it('fails the exact read when persisted snapshot JSON is invalid', async () => {
    const metadata = await createMetadata();
    const store = createPersistentGenerationJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    const initial = snapshot();
    await store.create(initial);
    await corruptSnapshot(metadata, initial.ref.jobId);

    await expect(store.get(initial.ref)).rejects.toMatchObject({
      code: 'generation-job-persistence-invalid',
    });
    await metadata.dispose();
  });

  it('reports one invalid recoverable Job while preserving its valid sibling', async () => {
    const metadata = await createMetadata();
    const store = createPersistentGenerationJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    const invalid = snapshot({ jobId: 'generation-invalid' });
    const valid = snapshot({ jobId: 'generation-valid' });
    await store.create(invalid);
    await store.create(valid);
    await corruptSnapshot(metadata, invalid.ref.jobId);

    await expect(store.listRecoverable()).resolves.toEqual({
      snapshots: [valid],
      diagnostics: [
        expect.objectContaining({
          code: 'generation-job-persistence-invalid',
          ref: invalid.ref,
        }),
      ],
    });
    await metadata.dispose();
  });
});

async function corruptSnapshot(metadata: LocalMetadataStore, jobId: string): Promise<void> {
  await metadata.transaction(
    {
      mode: 'state-write',
      ownership: 'state',
      operation: 'corrupt-generation-job-fixture',
    },
    async ({ sql }) => {
      await sql.run(
        `UPDATE generation_jobs SET snapshot_json = ?
          WHERE workspace_id = ? AND job_id = ?`,
        ['{"phase":"unknown"}', WORKSPACE_ID, jobId],
      );
    },
  );
}

async function createMetadata(
  options: { readonly initializeGeneration?: boolean } = {},
): Promise<LocalMetadataStore> {
  const homedir = await mkdtemp(join(tmpdir(), 'neko-generation-job-store-'));
  temporaryDirectories.push(homedir);
  const metadata = createNodeSqliteLocalMetadataStore({ homedir });
  await metadata.open({
    databasePath: resolveGlobalStorageLayout(homedir).database,
    busyTimeoutMs: 1_000,
  });
  await initializeCoreLocalMetadataTables(metadata);
  await metadata.repositories.workspaces.bind({
    identity: { workspaceId: WORKSPACE_ID },
    locator: { kind: 'variable', value: '${HOME}/workspace' },
    seenAt: '2026-07-24T00:00:00.000Z',
  });
  if (options.initializeGeneration !== false) {
    await initializeGenerationJobTables(metadata);
  }
  return metadata;
}

async function createRetiredGenerationJobTable(metadata: LocalMetadataStore): Promise<void> {
  await metadata.transaction(
    {
      mode: 'system-write',
      ownership: 'state',
      operation: 'create-retired-generation-job-table-fixture',
    },
    async ({ sql }) => {
      await sql.run(
        `CREATE TABLE generation_jobs (
          workspace_id TEXT NOT NULL,
          job_id TEXT NOT NULL,
          phase TEXT NOT NULL,
          revision INTEGER NOT NULL,
          snapshot_version INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (workspace_id, job_id),
          FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id) ON DELETE CASCADE
        ) STRICT`,
      );
      await sql.run(
        `CREATE INDEX generation_jobs_workspace_phase_updated_idx
          ON generation_jobs(workspace_id, phase, updated_at DESC)`,
      );
    },
  );
}

async function insertRetiredGenerationJob(metadata: LocalMetadataStore): Promise<void> {
  const value = snapshot({ jobId: 'retired-generation-1' });
  await metadata.transaction(
    {
      mode: 'state-write',
      ownership: 'state',
      operation: 'insert-retired-generation-job-fixture',
    },
    ({ sql }) =>
      sql.run(
        `INSERT INTO generation_jobs (
          workspace_id, job_id, phase, revision, snapshot_version,
          snapshot_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          WORKSPACE_ID,
          value.ref.jobId,
          value.phase,
          1,
          2,
          JSON.stringify(value),
          value.createdAt,
          value.updatedAt,
        ],
      ),
  );
}

async function readGenerationJobColumns(metadata: LocalMetadataStore): Promise<readonly unknown[]> {
  const rows = await metadata.transaction(
    { mode: 'read', ownership: 'state', operation: 'read-generation-job-columns-fixture' },
    ({ sql }) => sql.all(`SELECT name FROM pragma_table_info('generation_jobs') ORDER BY cid`),
  );
  return rows.map((row) => row['name']);
}

async function readRetiredGenerationJobCount(metadata: LocalMetadataStore): Promise<number> {
  const rows = await metadata.transaction(
    { mode: 'read', ownership: 'state', operation: 'count-retired-generation-jobs-fixture' },
    ({ sql }) => sql.all('SELECT COUNT(*) AS row_count FROM generation_jobs'),
  );
  return Number(rows[0]?.['row_count']);
}

function snapshot(options: { readonly jobId?: string } = {}): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: options.jobId ?? 'generation-1' },
    lifecycleMode: 'detached',
    phase: 'pending',
    createdAt: 1,
    updatedAt: 1,
    request: {
      generationType: 'text-to-image',
      providerId: 'provider-1',
      modelId: 'image-model',
      request: {
        prompt: 'cat',
        providerId: 'provider-1',
        modelId: 'image-model',
      },
    },
    progress: { stage: 'queued', percent: 0 },
  };
}

function resultLocator() {
  return {
    kind: 'generated-output' as const,
    outputId: 'generated-1',
    digest: 'sha256:generated-1',
    path: 'neko/generated/image/generated-1.png',
  };
}
