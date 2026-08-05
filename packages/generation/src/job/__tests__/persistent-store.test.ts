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

async function createMetadata(): Promise<LocalMetadataStore> {
  const homedir = await mkdtemp(join(tmpdir(), 'neko-generation-job-store-'));
  temporaryDirectories.push(homedir);
  const metadata = createNodeSqliteLocalMetadataStore({ homedir });
  await metadata.open({
    databasePath: resolveGlobalStorageLayout(homedir).database,
    busyTimeoutMs: 1_000,
  });
  await initializeCoreLocalMetadataTables(metadata);
  await initializeGenerationJobTables(metadata);
  await metadata.repositories.workspaces.bind({
    identity: { version: 1, workspaceId: WORKSPACE_ID },
    locator: { kind: 'variable', value: '${HOME}/workspace' },
    seenAt: '2026-07-24T00:00:00.000Z',
  });
  return metadata;
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
    revision: 'revision-generated-1',
    digest: 'sha256:generated-1',
    path: 'neko/generated/image/generated-1.png',
  };
}
