import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import {
  initializeAgentStateTables,
  initializeCoreLocalMetadataTables,
  initializeMediaMetadataTables,
} from '@neko/local-metadata/sqlite';
import { createWorkspaceMediaLibrarySyncMetadataBinding } from '../workspace-media-library-sync-binding';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('Workspace Media Library sync metadata binding', () => {
  it('keeps task state committed when a later cache write fails', async () => {
    const fixture = await createFixture();
    const binding = createWorkspaceMediaLibrarySyncMetadataBinding({
      workspaceId: fixture.workspaceId,
      repositories: fixture.store.repositories,
    });
    await binding.writeSnapshotTask(
      {
        workspaceId: fixture.workspaceId,
        snapshotId: 'snapshot-a',
        requirementFingerprint: 'revision-a',
        status: 'running',
        completedEntryCount: 0,
        totalEntryCount: 1,
      },
      1,
    );
    await binding.writeSnapshotTask(
      {
        workspaceId: fixture.workspaceId,
        snapshotId: 'snapshot-completed',
        requirementFingerprint: 'revision-a',
        status: 'completed',
        completedEntryCount: 1,
        totalEntryCount: 1,
      },
      2,
    );

    await expect(
      binding.mediaMetadata.upsert({
        partition: binding.mediaProbePartition,
        record: {
          sourceKey: 'media-library:Footage/shot.mov',
          sourceMtimeMs: -1,
          metadata: {
            fileSize: 1,
            mimeType: 'video/quicktime',
            duration: 1,
          },
          updatedAt: '2026-08-01T00:00:00.000Z',
        },
      }),
    ).rejects.toThrow();
    await expect(binding.readSnapshotTask('snapshot-a')).resolves.toMatchObject({
      status: 'running',
      snapshotId: 'snapshot-a',
    });
    await expect(binding.findCompletedSnapshot('revision-a')).resolves.toMatchObject({
      status: 'completed',
      snapshotId: 'snapshot-completed',
    });
    await expect(binding.findCompletedSnapshot('revision-stale')).resolves.toBeNull();
    await expect(binding.findResumableSnapshot()).resolves.toMatchObject({
      status: 'running',
      snapshotId: 'snapshot-a',
    });
    const tableNames = await fixture.store.transaction(
      { mode: 'read', ownership: 'system', operation: 'inspect-media-library-schema' },
      async ({ sql }) =>
        (await sql.all("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")).map(
          (row) => row['name'],
        ),
    );
    expect(tableNames).not.toContain('media_libraries');
    expect(tableNames).not.toContain('workspace_media_library_links');
    expect(
      (await readdir(path.join(fixture.home, '.neko'))).filter((name) => name.endsWith('.json')),
    ).toEqual([]);
  });

  it('fails visibly after the SQLite owner is disposed without writing JSON fallback', async () => {
    const fixture = await createFixture();
    const binding = createWorkspaceMediaLibrarySyncMetadataBinding({
      workspaceId: fixture.workspaceId,
      repositories: fixture.store.repositories,
    });
    await fixture.store.dispose();

    await expect(
      binding.writeSnapshotCheckpoint(
        {
          workspaceId: fixture.workspaceId,
          snapshotId: 'snapshot-a',
          requirementFingerprint: 'revision-a',
          completedEntryKeys: [],
        },
        1,
      ),
    ).rejects.toThrow();
    expect(
      (await readdir(path.join(fixture.home, '.neko'))).filter((name) => name.endsWith('.json')),
    ).toEqual([]);
  });
});

async function createFixture() {
  const home = await mkdtemp(path.join(tmpdir(), 'neko-media-sync-metadata-'));
  temporaryDirectories.push(home);
  const store = createNodeSqliteLocalMetadataStore({ homedir: home });
  await store.open({
    databasePath: path.join(home, '.neko', 'neko.db'),
    busyTimeoutMs: 2_000,
  });
  await initializeCoreLocalMetadataTables(store);
  await initializeAgentStateTables(store);
  await initializeMediaMetadataTables(store);
  const workspaceId = 'workspace-a';
  await store.repositories.workspaces.bind({
    identity: { workspaceId },
    locator: { kind: 'relative', value: 'workspace' },
    seenAt: '2026-08-01T00:00:00.000Z',
  });
  return { home, store, workspaceId };
}
