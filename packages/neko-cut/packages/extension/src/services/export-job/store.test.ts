import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveGlobalStorageLayout, type LocalMetadataStore } from '@neko/shared';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import { M1_LOCAL_METADATA_MIGRATIONS } from '@neko/shared/local-metadata/sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { ExportJobSnapshot } from './contracts';
import { createPersistentExportJobStore, EXPORT_JOB_MIGRATIONS } from './store';

const WORKSPACE_ID = '7416ff87-264b-4817-88a6-a9b97690911e';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('persistent ExportJobStore', () => {
  it('persists exact snapshots and enforces CAS across store instances', async () => {
    const metadata = await createMetadata();
    const first = createPersistentExportJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    const second = createPersistentExportJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    const initial = snapshot();
    await first.create(initial);
    const running: ExportJobSnapshot = {
      ...initial,
      phase: 'running',
      revision: 2,
      updatedAt: 2,
      executionId: 'execution-1',
      progress: {
        ...initial.progress,
        stage: 'waiting-executor',
        percent: 30,
        currentFrame: 30,
        totalFrames: 100,
        elapsedMs: 1_000,
      },
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

  it('excludes terminal snapshots from recoverable scan', async () => {
    const metadata = await createMetadata();
    const store = createPersistentExportJobStore({
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
        progress: { ...initial.progress, stage: 'completed', percent: 100 },
        result: {
          outputPath: initial.request.config.outputPath,
          totalFrames: 100,
          elapsedMs: 2_000,
        },
      },
    });

    await expect(store.listRecoverable()).resolves.toEqual([]);
    await metadata.dispose();
  });

  it('rejects secret-bearing executor config before persistence', async () => {
    const metadata = await createMetadata();
    const store = createPersistentExportJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    const initial = snapshot();

    await expect(
      store.create({
        ...initial,
        request: {
          ...initial.request,
          executionConfig: { apiKey: 'must-not-enter-sqlite' },
        },
      }),
    ).rejects.toMatchObject({
      code: 'metadata-secret-forbidden',
      operation: 'persist-cut-export-job',
    });
    await metadata.dispose();
  });

  it('fails visibly when persisted snapshot JSON is invalid', async () => {
    const metadata = await createMetadata();
    const store = createPersistentExportJobStore({
      metadataStore: metadata,
      workspaceId: WORKSPACE_ID,
    });
    const initial = snapshot();
    await store.create(initial);
    await metadata.transaction(
      {
        mode: 'state-write',
        ownership: 'state',
        operation: 'corrupt-cut-export-job-fixture',
      },
      async ({ sql }) => {
        await sql.run(
          `UPDATE cut_export_jobs SET snapshot_json = ?
            WHERE workspace_id = ? AND job_id = ?`,
          ['{"phase":"unknown"}', WORKSPACE_ID, initial.ref.jobId],
        );
      },
    );

    await expect(store.get(initial.ref)).rejects.toMatchObject({
      code: 'export-job-persistence-invalid',
    });
    await metadata.dispose();
  });
});

async function createMetadata(): Promise<LocalMetadataStore> {
  const homedir = await mkdtemp(join(tmpdir(), 'neko-cut-export-job-store-'));
  temporaryDirectories.push(homedir);
  const metadata = createNodeSqliteLocalMetadataStore({ homedir });
  await metadata.open({
    databasePath: resolveGlobalStorageLayout(homedir).database,
    busyTimeoutMs: 1_000,
  });
  await metadata.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
  await metadata.migrateNamespace(EXPORT_JOB_MIGRATIONS);
  await metadata.repositories.workspaces.bind({
    identity: { version: 1, workspaceId: WORKSPACE_ID },
    locator: { kind: 'variable', value: '${HOME}/workspace' },
    seenAt: '2026-07-24T00:00:00.000Z',
  });
  return metadata;
}

function snapshot(): ExportJobSnapshot {
  return {
    ref: { kind: 'export', jobId: 'export-1' },
    phase: 'pending',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
    request: {
      documentUri: 'file:///workspace/project.otio',
      config: {
        outputPath: '/workspace/output/final.mp4',
        format: 'mp4',
        width: 1920,
        height: 1080,
        fps: 24,
        quality: 'high',
        audioBitrate: 192_000,
        videoBitrate: 8_000_000,
        includeAudio: true,
        audioSampleRate: 48_000,
      },
      executionConfig: {
        timeline: { version: 1, tracks: [] },
        output: { path: '/workspace/output/final.mp4' },
      },
    },
    progress: {
      stage: 'queued',
      percent: 0,
      currentFrame: 0,
      totalFrames: 0,
      elapsedMs: 0,
      estimatedRemainingMs: 0,
      currentFps: 0,
    },
  };
}
