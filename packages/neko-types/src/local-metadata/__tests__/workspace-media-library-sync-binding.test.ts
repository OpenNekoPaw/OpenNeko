import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import {
  AGENT_STATE_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
  MEDIA_METADATA_MIGRATIONS,
} from '../sqlite';
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
  it('uses existing partitions and keeps state committed when a later cache write fails', async () => {
    const fixture = await createFixture();
    const binding = createWorkspaceMediaLibrarySyncMetadataBinding({
      workspaceId: fixture.workspaceId,
      repositories: fixture.store.repositories,
    });
    await binding.recordProjection({
      freshness: 'fresh',
      diagnostic: null,
      updatedAt: '2026-08-01T00:00:00.000Z',
    });
    await binding.writeSnapshotTask(
      {
        version: 1,
        workspaceId: fixture.workspaceId,
        snapshotId: 'snapshot-a',
        requirementRevision: 'revision-a',
        status: 'running',
        completedEntryCount: 0,
        totalEntryCount: 1,
      },
      1,
    );
    await binding.writeSnapshotTask(
      {
        version: 1,
        workspaceId: fixture.workspaceId,
        snapshotId: 'snapshot-completed',
        requirementRevision: 'revision-a',
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
          sourceKey: 'neko/assets/Footage/shot.mov',
          sourceMtimeMs: -1,
          metadata: {
            path: 'neko/assets/Footage/shot.mov',
            size: 1,
            duration: 1,
            type: 'video',
            format: 'mov',
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
    await expect(binding.readProjectionRevision()).resolves.toMatchObject({
      partition: { domain: 'workspace-media-library-sync' },
      freshness: 'fresh',
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
          version: 1,
          workspaceId: fixture.workspaceId,
          snapshotId: 'snapshot-a',
          requirementRevision: 'revision-a',
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
  await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
  await store.migrateNamespace(AGENT_STATE_MIGRATIONS);
  await store.migrateNamespace(MEDIA_METADATA_MIGRATIONS);
  const workspaceId = 'workspace-a';
  await store.repositories.workspaces.bind({
    identity: { version: 1, workspaceId },
    locator: { kind: 'relative', value: 'workspace' },
    seenAt: '2026-08-01T00:00:00.000Z',
  });
  return { home, store, workspaceId };
}
