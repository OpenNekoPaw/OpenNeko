import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { initializeCoreLocalMetadataTables } from '@neko/local-metadata/sqlite';
import { EXPORT_JOB_KIND, type ExportJobSnapshot } from './contracts';
import {
  createInMemoryExportJobStore,
  createPersistentExportJobStore,
  initializeExportJobTables,
} from './store';
import { resolveNodeWorkspaceIdentity } from '@neko/local-metadata/node-workspace-identity';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';

describe('Export Job observation', () => {
  it('ends a pending observation immediately when its iterator is returned', async () => {
    const store = createInMemoryExportJobStore();
    const snapshot = exportSnapshot();
    await store.create(snapshot);
    const iterator = store.observe(snapshot.ref)[Symbol.asyncIterator]();
    const pending = iterator.next();

    await expect(iterator.return?.()).resolves.toEqual({ done: true, value: undefined });
    await expect(pending).resolves.toEqual({ done: true, value: undefined });

    await store.save({ ...snapshot, phase: 'running', updatedAt: 2 });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it('restores the canonical Job snapshot after a SQLite store restart', async () => {
    const home = await mkdtemp(join(tmpdir(), 'openneko-cut-export-store-'));
    const workspacePath = join(home, 'workspace');
    await mkdir(workspacePath, { recursive: true });
    const first = await openStore(home);
    const identity = await resolveNodeWorkspaceIdentity({
      workspaceRoot: workspacePath,
      homedir: home,
      metadataStore: first,
      createWorkspaceId: () => '9b2de3b5-5f50-4be4-9551-71fb5b512489',
    });
    const snapshot = exportSnapshot();
    const firstStore = createPersistentExportJobStore({
      metadataStore: first,
      workspaceId: identity.identity.workspaceId,
    });
    await firstStore.create(snapshot);
    await first.dispose();

    const second = await openStore(home);
    try {
      const restored = createPersistentExportJobStore({
        metadataStore: second,
        workspaceId: identity.identity.workspaceId,
      });
      await expect(restored.get(snapshot.ref)).resolves.toEqual(snapshot);
    } finally {
      await second.dispose();
      await rm(home, { recursive: true, force: true });
    }
  });
});

async function openStore(home: string) {
  const store = createNodeSqliteLocalMetadataStore({ homedir: home });
  await store.open({
    databasePath: resolveGlobalStorageLayout(home).database,
    busyTimeoutMs: 1_000,
  });
  await initializeCoreLocalMetadataTables(store);
  await initializeExportJobTables(store);
  return store;
}

function exportSnapshot(): ExportJobSnapshot {
  return {
    ref: { kind: EXPORT_JOB_KIND, jobId: 'export-1' },
    phase: 'pending',
    createdAt: 1,
    updatedAt: 1,
    request: {
      documentUri: 'cuts/story.otio',
      config: {
        outputPath: 'exports/story.mp4',
        format: 'mp4',
        width: 1920,
        height: 1080,
        fps: 30,
        quality: 'medium',
        audioBitrate: 192_000,
        videoBitrate: 8_000_000,
        includeAudio: true,
        audioSampleRate: 48_000,
      },
      executionConfig: {
        executionKey: 'execution-1',
        sessionId: 'session-1',
        sourceSnapshotId: 'request-1',
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
