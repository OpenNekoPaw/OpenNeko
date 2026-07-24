import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createResourceFingerprint,
  createResourceRef,
  resolveGlobalStorageLayout,
  type LocalMetadataStore,
} from '@neko/shared';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import { M1_LOCAL_METADATA_MIGRATIONS } from '@neko/shared/local-metadata/sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { GenerationJobSnapshot } from '../contracts';
import { GENERATION_JOB_MIGRATIONS, createPersistentGenerationJobStore } from '../store';

const WORKSPACE_ID = '4ff3de02-2d72-4853-a455-73169675ab22';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('persistent GenerationJobStore', () => {
  it('migrates v1 snapshots to explicit detached lifecycle ownership', async () => {
    const metadata = await createMetadata({ generationVersion: 1 });
    const current = snapshot();
    const { lifecycleMode: _removedLifecycleMode, ...legacy } = current;
    await metadata.transaction(
      {
        mode: 'state-write',
        ownership: 'state',
        operation: 'insert-generation-job-v1-fixture',
      },
      async ({ sql }) => {
        await sql.run(
          `INSERT INTO generation_jobs (
            workspace_id, job_id, phase, revision, snapshot_version,
            snapshot_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
          [
            WORKSPACE_ID,
            legacy.ref.jobId,
            legacy.phase,
            legacy.revision,
            JSON.stringify(legacy),
            legacy.createdAt,
            legacy.updatedAt,
          ],
        );
      },
    );

    await metadata.migrateNamespace(GENERATION_JOB_MIGRATIONS);
    const store = createPersistentGenerationJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });

    await expect(store.get(current.ref)).resolves.toEqual({
      ...current,
      lifecycleMode: 'detached',
    });
    await metadata.dispose();
  });

  it('persists exact snapshots and enforces CAS across store instances', async () => {
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
      revision: 2,
      updatedAt: 2,
      providerTask: { providerId: 'provider-1', externalTaskId: 'external-1' },
      progress: { stage: 'waiting-provider', percent: 30 },
    };

    await first.commit({ ref: initial.ref, expectedRevision: 1, next: running });

    await expect(second.get(initial.ref)).resolves.toEqual(running);
    await expect(second.listRecoverable()).resolves.toEqual([running]);
    await expect(
      second.commit({
        ref: initial.ref,
        expectedRevision: 1,
        next: { ...running, revision: 3, updatedAt: 3 },
      }),
    ).rejects.toMatchObject({ code: 'stale-revision' });
    await expect(first.get(initial.ref)).resolves.toEqual(running);
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
    await store.commit({
      ref: initial.ref,
      expectedRevision: 1,
      next: {
        ...initial,
        phase: 'succeeded',
        revision: 2,
        updatedAt: 2,
        progress: { stage: 'completed', percent: 100 },
        resultRefs: [resultRef()],
      },
    });

    await expect(store.listRecoverable()).resolves.toEqual([]);
    await metadata.dispose();
  });

  it('rejects secret-bearing generation requests before persistence', async () => {
    const metadata = await createMetadata();
    const store = createPersistentGenerationJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    const initial = snapshot();

    await expect(
      store.create({
        ...initial,
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

  it('fails visibly when persisted snapshot JSON is invalid', async () => {
    const metadata = await createMetadata();
    const store = createPersistentGenerationJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    const initial = snapshot();
    await store.create(initial);
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
          ['{"phase":"unknown"}', WORKSPACE_ID, initial.ref.jobId],
        );
      },
    );

    await expect(store.get(initial.ref)).rejects.toMatchObject({
      code: 'generation-job-persistence-invalid',
    });
    await metadata.dispose();
  });
});

async function createMetadata(options?: {
  readonly generationVersion?: 1 | 2;
}): Promise<LocalMetadataStore> {
  const homedir = await mkdtemp(join(tmpdir(), 'neko-generation-job-store-'));
  temporaryDirectories.push(homedir);
  const metadata = createNodeSqliteLocalMetadataStore({ homedir });
  await metadata.open({
    databasePath: resolveGlobalStorageLayout(homedir).database,
    busyTimeoutMs: 1_000,
  });
  await metadata.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
  await metadata.migrateNamespace(
    options?.generationVersion === 1 ? [GENERATION_JOB_MIGRATIONS[0]!] : GENERATION_JOB_MIGRATIONS,
  );
  await metadata.repositories.workspaces.bind({
    identity: { version: 1, workspaceId: WORKSPACE_ID },
    locator: { kind: 'variable', value: '${HOME}/workspace' },
    seenAt: '2026-07-24T00:00:00.000Z',
  });
  return metadata;
}

function snapshot(): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: 'generation-1' },
    lifecycleMode: 'detached',
    phase: 'pending',
    revision: 1,
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

function resultRef() {
  return createResourceRef({
    id: 'generated-1',
    scope: 'project',
    provider: 'generated-asset',
    kind: 'generated',
    source: { kind: 'generated-asset', generatedAssetId: 'generated-1' },
    fingerprint: createResourceFingerprint({
      strategy: 'hash',
      value: 'sha256:generated-1',
    }),
  });
}
