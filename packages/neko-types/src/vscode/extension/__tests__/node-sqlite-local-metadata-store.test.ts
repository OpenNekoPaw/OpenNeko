import { execFile, spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { M1_LOCAL_METADATA_MIGRATIONS } from '../../../local-metadata/sqlite';
import { AGENT_STATE_MIGRATIONS } from '../../../local-metadata/sqlite/agent-state-schema';
import { MEDIA_METADATA_MIGRATIONS } from '../../../local-metadata/sqlite/media-metadata-schema';
import { RESOURCE_CACHE_MIGRATIONS } from '../../../local-metadata/sqlite/resource-cache-schema';
import { runLocalMetadataAdapterContract } from '../../../local-metadata/testing';
import type { LocalMetadataMigration } from '../../../local-metadata';
import { LocalMetadataResourceCacheManifestStore } from '../../../local-metadata';
import { resolveGlobalStorageLayout } from '../../../types/storage';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';

const WORKSPACE_ID = '9b2de3b5-5f50-4be4-9551-71fb5b512489';
const RECENT_ORPHAN_WORKSPACE_ID = 'bd82b3ee-b9d9-4aa0-a635-23fa356e67df';
const temporaryDirectories: string[] = [];
const execFileAsync = promisify(execFile);
const hasBunRuntime = spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0;

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

describe('node:sqlite local metadata store', () => {
  it('passes the shared local metadata adapter contract', async () => {
    await runLocalMetadataAdapterContract({
      sourceHome: await createTemporaryHome(),
      backupHome: await createTemporaryHome(),
      createStore: (homedir) => createNodeSqliteLocalMetadataStore({ homedir }),
    });
  }, 30_000);

  it('opens the canonical database, migrates M1, and persists a workspace', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });

    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/Git/neko-test' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });

    await expect(store.repositories.workspaces.get(WORKSPACE_ID)).resolves.toMatchObject({
      workspaceId: WORKSPACE_ID,
      currentLocator: { kind: 'variable', value: '${HOME}/Git/neko-test' },
      orphanedAt: null,
    });

    await store.dispose();
  });

  it('rolls back repository writes when a transaction fails', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);

    await expect(
      store.transaction(
        { mode: 'cache-write', ownership: 'cache', operation: 'rollback-test' },
        async ({ repositories }) => {
          await repositories.conversations.upsert({
            conversationId: 'conversation-rollback',
            workspaceId: null,
            journalId: 'journal-rollback',
            title: 'Must not survive',
            source: 'tui',
            model: null,
            createdAt: '2026-07-13T00:00:00.000Z',
            updatedAt: '2026-07-13T00:00:00.000Z',
          });
          throw new Error('reject transaction');
        },
      ),
    ).rejects.toThrow('reject transaction');
    await expect(store.repositories.conversations.get('conversation-rollback')).resolves.toBeNull();

    await store.dispose();
  });

  it('commits a conversation and its partition revision through typed repositories', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    const partition = { scope: 'workspace' as const, workspaceId: WORKSPACE_ID, domain: 'agent' };

    await store.transaction(
      { mode: 'cache-write', ownership: 'cache', operation: 'project-conversation' },
      async ({ repositories }) => {
        await repositories.conversations.upsert({
          conversationId: 'conversation-1',
          workspaceId: WORKSPACE_ID,
          journalId: 'journal-1',
          title: 'SQLite migration design',
          source: 'vscode',
          model: 'gpt-5',
          createdAt: '2026-07-13T00:00:00.000Z',
          updatedAt: '2026-07-13T01:00:00.000Z',
        });
        await repositories.projectionVersions.increment({
          partition,
          freshness: 'fresh',
          diagnostic: null,
          updatedAt: '2026-07-13T01:00:00.000Z',
        });
      },
    );

    await expect(
      store.repositories.conversations.list({
        workspaceId: WORKSPACE_ID,
        text: 'migration',
        limit: 20,
        offset: 0,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        conversationId: 'conversation-1',
        journalId: 'journal-1',
        title: 'SQLite migration design',
      }),
    ]);
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({
      revision: 1,
      freshness: 'fresh',
    });
    await expect(store.integrityCheck()).resolves.toMatchObject({ ok: true, messages: ['ok'] });

    await store.dispose();
  });

  it('shares state-owned tasks and recovery checkpoints across connections', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const writer = createNodeSqliteLocalMetadataStore({ homedir });
    await writer.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await writer.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await writer.migrateNamespace(AGENT_STATE_MIGRATIONS);
    await writer.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/Git/neko-test' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    await writer.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'persist-agent-task-state' },
      async ({ repositories }) => {
        await repositories.tasks.upsert({
          workspaceId: WORKSPACE_ID,
          taskKey: 'conversation:conv-1/task:task-1',
          taskId: 'task-1',
          status: 'running',
          payload: { id: 'task-1', progress: 40 },
          createdAt: 1_752_364_800_000,
          updatedAt: 1_752_368_400_000,
        });
        await repositories.taskCheckpoints.upsert({
          workspaceId: WORKSPACE_ID,
          taskKey: 'conversation:conv-1/task:task-1',
          taskId: 'task-1',
          payload: { providerId: 'runway', externalTaskId: 'provider-task-1' },
          updatedAt: 1_752_368_400_000,
        });
      },
    );

    const reader = createNodeSqliteLocalMetadataStore({ homedir });
    await reader.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await expect(
      reader.repositories.tasks.list({ workspaceId: WORKSPACE_ID, statuses: ['running'] }),
    ).resolves.toEqual([
      expect.objectContaining({
        taskId: 'task-1',
        status: 'running',
        payload: { id: 'task-1', progress: 40 },
      }),
    ]);
    await expect(
      reader.repositories.taskCheckpoints.get(WORKSPACE_ID, 'conversation:conv-1/task:task-1'),
    ).resolves.toMatchObject({
      taskId: 'task-1',
      payload: { providerId: 'runway', externalTaskId: 'provider-task-1' },
    });

    await reader.dispose();
    await writer.dispose();
  });

  it('replaces a workspace ResourceCache projection and its revision atomically', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(RESOURCE_CACHE_MIGRATIONS);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/Git/neko-test' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'resource-cache',
    };
    const entry = {
      resource: {
        id: 'resource-1',
        scope: 'project' as const,
        provider: 'document-archive',
        kind: 'document' as const,
        source: { kind: 'file' as const, projectRelativePath: 'books/comic.epub' },
        fingerprint: { strategy: 'hash' as const, value: 'sha256:source-v1' },
      },
      status: 'ready' as const,
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T01:00:00.000Z',
      lastAccessedAt: '2026-07-13T01:00:00.000Z',
      variants: [
        {
          key: 'thumbnail:256x256',
          role: 'thumbnail' as const,
          status: 'ready' as const,
          relativePath: 'documents/page-1.jpg',
          mimeType: 'image/jpeg',
          width: 256,
          height: 256,
          sizeBytes: 1024,
          sourceFingerprint: { strategy: 'hash' as const, value: 'sha256:source-v1' },
          createdAt: '2026-07-13T00:00:00.000Z',
          updatedAt: '2026-07-13T01:00:00.000Z',
          lastAccessedAt: '2026-07-13T01:00:00.000Z',
          pinned: false,
          sessionActive: false,
          promoted: false,
          rebuildable: true,
        },
      ],
    };

    await store.repositories.resourceCache.replacePartition({
      partition,
      entries: [entry],
      updatedAt: '2026-07-13T01:00:00.000Z',
    });

    await expect(store.repositories.resourceCache.list(partition)).resolves.toEqual([entry]);
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({
      revision: 1,
      freshness: 'fresh',
    });
    const manifestStore = new LocalMetadataResourceCacheManifestStore({
      metadataStore: store,
      partition,
      projectRoot: '/Users/feng/Git/neko-test',
    });
    await expect(manifestStore.load()).resolves.toMatchObject({
      projectRoot: '/Users/feng/Git/neko-test',
      entries: { 'resource-1': entry },
    });
    await manifestStore.update((current) => current);
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({ revision: 1 });

    await expect(
      store.repositories.cacheMaintenance.clearPartition({
        table: 'resource_cache_entries',
        partition,
        reason: 'rebuild',
        updatedAt: '2026-07-13T01:30:00.000Z',
      }),
    ).resolves.toEqual({ deletedRows: 1 });
    await expect(store.repositories.resourceCache.list(partition)).resolves.toEqual([]);
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({
      revision: 2,
      freshness: 'stale',
      diagnostic: 'cache-cleared:rebuild',
    });

    await store.repositories.resourceCache.replacePartition({
      partition,
      entries: [],
      updatedAt: '2026-07-13T02:00:00.000Z',
    });
    await expect(store.repositories.resourceCache.list(partition)).resolves.toEqual([]);
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({ revision: 3 });

    await store.dispose();
  });

  it('persists workspace media probe metadata and its revision atomically', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(MEDIA_METADATA_MIGRATIONS);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/Git/neko-test' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'media-metadata',
    };
    const record = {
      sourceKey: 'media/clip.mp4',
      sourceMtimeMs: 1_752_364_800_000,
      metadata: {
        fileSize: 4_096,
        mimeType: 'video/mp4',
        width: 1920,
        height: 1080,
        duration: 12.5,
        frameRate: 24,
        codec: 'h264',
      },
      updatedAt: '2026-07-13T01:00:00.000Z',
    };

    await store.repositories.mediaMetadata.upsert({ partition, record });

    await expect(
      store.repositories.mediaMetadata.get(partition, record.sourceKey),
    ).resolves.toEqual(record);
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({
      revision: 1,
      freshness: 'fresh',
    });

    await expect(
      store.repositories.mediaMetadata.delete(partition, record.sourceKey),
    ).resolves.toBe(true);
    await expect(
      store.repositories.mediaMetadata.get(partition, record.sourceKey),
    ).resolves.toBeNull();
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({ revision: 2 });

    await store.repositories.mediaMetadata.upsert({ partition, record });
    await expect(
      store.repositories.cacheMaintenance.clearPartition({
        table: 'media_metadata',
        partition,
        reason: 'rebuild',
        updatedAt: '2026-07-13T02:00:00.000Z',
      }),
    ).resolves.toEqual({ deletedRows: 1 });
    await expect(
      store.repositories.mediaMetadata.get(partition, record.sourceKey),
    ).resolves.toBeNull();
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({
      revision: 4,
      freshness: 'stale',
    });

    await store.dispose();
  });

  it('backs up a live WAL database that another store can reopen', async () => {
    const sourceHome = await createTemporaryHome();
    const destinationHome = await createTemporaryHome();
    const sourceLayout = resolveGlobalStorageLayout(sourceHome);
    const destinationLayout = resolveGlobalStorageLayout(destinationHome);
    const source = createNodeSqliteLocalMetadataStore({ homedir: sourceHome });
    await source.open({ databasePath: sourceLayout.database, busyTimeoutMs: 1_000 });
    await source.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await source.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/Git/neko-test' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });

    await expect(
      source.backup({ destinationPath: destinationLayout.database, reason: 'manual' }),
    ).resolves.toMatchObject({ destinationPath: destinationLayout.database });
    await source.dispose();

    const restored = createNodeSqliteLocalMetadataStore({ homedir: destinationHome });
    await restored.open({ databasePath: destinationLayout.database, busyTimeoutMs: 1_000 });
    await expect(restored.repositories.workspaces.get(WORKSPACE_ID)).resolves.toMatchObject({
      workspaceId: WORKSPACE_ID,
      currentLocator: { value: '${HOME}/Git/neko-test' },
    });
    await expect(restored.integrityCheck()).resolves.toMatchObject({ ok: true });
    await restored.dispose();
  });

  it('keeps migrations idempotent and fails visibly on checksum drift', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });

    await expect(store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS)).resolves.toMatchObject({
      previousVersion: 0,
      currentVersion: 1,
      appliedVersions: [1],
    });
    await expect(store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS)).resolves.toMatchObject({
      previousVersion: 1,
      currentVersion: 1,
      appliedVersions: [],
    });
    await expect(
      store.migrateNamespace(
        M1_LOCAL_METADATA_MIGRATIONS.map((migration) => ({
          ...migration,
          checksum: 'sha256:changed-after-apply',
        })),
      ),
    ).rejects.toMatchObject({ code: 'metadata-migration-checksum-mismatch' });

    await store.dispose();
  });

  it('does not create databases under workspace or extension-private storage', async () => {
    const homedir = await createTemporaryHome();
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    const retiredPaths = [
      join(homedir, 'project', '.neko', 'neko-local.db'),
      join(homedir, 'project', '.neko', '.cache', 'neko-cache.db'),
      join(homedir, 'Library', 'Code', 'globalStorage', 'neko.neko-agent', 'neko.db'),
    ];

    for (const databasePath of retiredPaths) {
      await expect(store.open({ databasePath, busyTimeoutMs: 1_000 })).rejects.toMatchObject({
        code: 'retired-workspace-database',
      });
      await expect(access(databasePath)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it.runIf(hasBunRuntime)(
    'round-trips repository records between live Node and Bun processes',
    async () => {
      const homedir = await createTemporaryHome();
      const layout = resolveGlobalStorageLayout(homedir);
      const store = createNodeSqliteLocalMetadataStore({ homedir });
      await store.open({ databasePath: layout.database, busyTimeoutMs: 2_000 });
      await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
      await store.migrateNamespace(RESOURCE_CACHE_MIGRATIONS);
      await store.repositories.conversations.upsert({
        conversationId: 'node-conversation',
        workspaceId: null,
        journalId: 'node-journal',
        title: 'Written by Node',
        source: 'vscode',
        model: null,
        createdAt: '2026-07-13T01:00:00.000Z',
        updatedAt: '2026-07-13T01:00:00.000Z',
      });
      await store.repositories.resourceCache.replacePartition({
        partition: { scope: 'global', workspaceId: null, domain: 'resource-cache' },
        updatedAt: '2026-07-13T01:00:00.000Z',
        entries: [createGlobalResourceCacheEntry('node-resource', 'node/thumbnail.jpg')],
      });

      const bunFixture = fileURLToPath(
        new URL(
          '../../../../../../scripts/test-orchestration/fixtures/bun-tui-sqlite-roundtrip.ts',
          import.meta.url,
        ),
      );
      await execFileAsync('bun', [bunFixture], {
        env: { ...process.env, NEKO_SQLITE_TEST_HOME: homedir },
      });

      await expect(store.repositories.conversations.get('bun-conversation')).resolves.toMatchObject(
        {
          journalId: 'bun-journal',
          source: 'tui',
          title: 'Written by Bun',
        },
      );
      await expect(
        store.repositories.resourceCache.list({
          scope: 'global',
          workspaceId: null,
          domain: 'resource-cache',
        }),
      ).resolves.toEqual([
        expect.objectContaining({ resource: expect.objectContaining({ id: 'bun-resource' }) }),
      ]);
      await expect(store.integrityCheck()).resolves.toMatchObject({ ok: true });
      await store.dispose();
    },
    30_000,
  );

  it('restores a verified backup into the canonical database while closed', async () => {
    const homedir = await createTemporaryHome();
    const backupHome = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const backupPath = join(backupHome, 'backups', 'neko.db');
    const source = createNodeSqliteLocalMetadataStore({ homedir });
    await source.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await source.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await source.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/before-backup' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    await source.backup({ destinationPath: backupPath, reason: 'recovery' });
    await source.repositories.workspaces.rebind({
      workspaceId: WORKSPACE_ID,
      locator: { kind: 'variable', value: '${HOME}/after-backup' },
      reboundAt: '2026-07-13T01:00:00.000Z',
    });
    await source.dispose();

    const recovery = createNodeSqliteLocalMetadataStore({ homedir });
    await recovery.restore({ sourcePath: backupPath });
    await recovery.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await expect(recovery.repositories.workspaces.get(WORKSPACE_ID)).resolves.toMatchObject({
      currentLocator: { value: '${HOME}/before-backup' },
    });
    await recovery.dispose();
  });

  it('clears only an allowlisted cache partition and preserves state', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const conversation = {
      journalId: 'workspace-journal',
      title: 'Workspace conversation',
      source: 'vscode' as const,
      model: null,
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    };
    await store.repositories.conversations.upsert({
      ...conversation,
      conversationId: 'workspace-conversation',
      workspaceId: WORKSPACE_ID,
    });
    await store.repositories.conversations.upsert({
      ...conversation,
      conversationId: 'global-conversation',
      workspaceId: null,
      journalId: 'global-journal',
    });

    await expect(
      store.repositories.cacheMaintenance.clearPartition({
        table: 'conversations',
        partition: { scope: 'workspace', workspaceId: WORKSPACE_ID, domain: 'conversations' },
        reason: 'rebuild',
        updatedAt: '2026-07-13T01:00:00.000Z',
      }),
    ).resolves.toEqual({ deletedRows: 1 });
    await expect(
      store.repositories.conversations.get('workspace-conversation'),
    ).resolves.toBeNull();
    await expect(
      store.repositories.conversations.get('global-conversation'),
    ).resolves.toMatchObject({ journalId: 'global-journal' });
    await expect(store.repositories.workspaces.get(WORKSPACE_ID)).resolves.toMatchObject({
      workspaceId: WORKSPACE_ID,
    });
    await expect(
      store.readPartitionRevision({
        scope: 'workspace',
        workspaceId: WORKSPACE_ID,
        domain: 'conversations',
      }),
    ).resolves.toMatchObject({ freshness: 'stale', diagnostic: 'cache-cleared:rebuild' });
    await expect(store.repositories.cacheMaintenance.vacuum()).resolves.toBeUndefined();
    await store.dispose();
  });

  it('returns a typed diagnostic when a concurrent writer exceeds busy timeout', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const first = createNodeSqliteLocalMetadataStore({ homedir });
    const second = createNodeSqliteLocalMetadataStore({ homedir });
    await first.open({ databasePath: layout.database, busyTimeoutMs: 100 });
    await first.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await second.open({ databasePath: layout.database, busyTimeoutMs: 25 });

    let releaseWriter: (() => void) | undefined;
    const writerGate = new Promise<void>((resolve) => {
      releaseWriter = resolve;
    });
    let notifyStarted: (() => void) | undefined;
    const writerStarted = new Promise<void>((resolve) => {
      notifyStarted = resolve;
    });
    const heldTransaction = first.transaction(
      { mode: 'state-write', ownership: 'state', operation: 'hold-write-lock' },
      async () => {
        notifyStarted?.();
        await writerGate;
      },
    );
    await writerStarted;

    await expect(
      second.repositories.workspaces.bind({
        identity: { version: 1, workspaceId: WORKSPACE_ID },
        locator: { kind: 'variable', value: '${HOME}/busy-workspace' },
        seenAt: '2026-07-13T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'metadata-transaction-failed' });

    releaseWriter?.();
    await heldTransaction;
    await first.dispose();
    await second.dispose();
  });

  it('reopens committed WAL data after a writer process exits without dispose', async () => {
    const homedir = await createTemporaryHome();
    const fixture = new URL('./fixtures/node-sqlite-crash-writer.ts', import.meta.url);
    await execFileAsync(process.execPath, ['--import', 'tsx', fileURLToPath(fixture)], {
      env: { ...process.env, NEKO_SQLITE_TEST_HOME: homedir },
    });

    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await expect(store.repositories.conversations.get('crash-conversation')).resolves.toMatchObject(
      {
        journalId: 'crash-journal',
        title: 'Committed before process exit',
      },
    );
    await expect(store.integrityCheck()).resolves.toMatchObject({ ok: true });
    await store.dispose();
  }, 30_000);

  it('fails visibly instead of initializing a corrupt database as empty', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    await mkdir(join(homedir, '.neko'), { recursive: true });
    await writeFile(layout.database, 'not a sqlite database', 'utf8');
    const store = createNodeSqliteLocalMetadataStore({ homedir });

    await expect(
      store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 }),
    ).rejects.toMatchObject({
      code: 'metadata-integrity-failed',
      operation: 'open-node-sqlite',
    });
  });

  it('rolls back a failed migration and allows a corrected migration', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    const failedMigration: LocalMetadataMigration = {
      namespace: 'core',
      version: 2,
      name: 'invalid-migration',
      checksum: 'sha256:invalid-migration',
      ownership: 'system',
      destructive: false,
      statements: ['CREATE TABL invalid_syntax'],
    };

    await expect(
      store.migrateNamespace([...M1_LOCAL_METADATA_MIGRATIONS, failedMigration]),
    ).rejects.toMatchObject({ code: 'metadata-migration-failed' });
    await expect(
      store.migrateNamespace([
        ...M1_LOCAL_METADATA_MIGRATIONS,
        {
          ...failedMigration,
          name: 'corrected-migration',
          checksum: 'sha256:corrected-migration',
          statements: ['CREATE INDEX conversations_title_idx ON conversations(title)'],
        },
      ]),
    ).resolves.toMatchObject({ previousVersion: 1, currentVersion: 2, appliedVersions: [2] });
    await store.dispose();
  });

  it('blocks a destructive migration when its required backup cannot be created', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.repositories.conversations.upsert({
      conversationId: 'preserved-conversation',
      workspaceId: null,
      journalId: 'preserved-journal',
      title: 'Preserved by migration backup guard',
      source: 'tui',
      model: null,
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
    });
    const blockedParent = join(homedir, 'blocked-backup-parent');
    await writeFile(blockedParent, 'not a directory', 'utf8');
    const destructiveMigration: LocalMetadataMigration = {
      namespace: 'core',
      version: 2,
      name: 'drop-conversations',
      checksum: 'sha256:drop-conversations',
      ownership: 'cache',
      destructive: true,
      statements: ['DROP TABLE conversations'],
    };

    await expect(
      store.migrateNamespace([...M1_LOCAL_METADATA_MIGRATIONS, destructiveMigration], {
        destructiveBackup: {
          destinationPath: join(blockedParent, 'neko.db'),
          reason: 'migration',
        },
      }),
    ).rejects.toMatchObject({ code: 'metadata-backup-failed' });
    await expect(
      store.repositories.conversations.get('preserved-conversation'),
    ).resolves.toMatchObject({ journalId: 'preserved-journal' });

    await store.dispose();
  });

  it('requires explicit rebind for an orphaned workspace locator', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/old-workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    await store.repositories.workspaces.markOrphaned(WORKSPACE_ID, '2026-08-13T00:00:00.000Z');
    await expect(store.repositories.workspaces.listOrphans()).resolves.toHaveLength(1);
    await expect(
      store.repositories.workspaces.findByCurrentLocator({
        kind: 'variable',
        value: '${HOME}/old-workspace',
      }),
    ).resolves.toEqual([]);
    await expect(
      store.repositories.workspaces.bind({
        identity: { version: 1, workspaceId: WORKSPACE_ID },
        locator: { kind: 'variable', value: '${HOME}/new-workspace' },
        seenAt: '2026-08-14T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ code: 'duplicate-workspace-identity' });
    await expect(
      store.repositories.workspaces.rebind({
        workspaceId: WORKSPACE_ID,
        locator: { kind: 'variable', value: '${HOME}/new-workspace' },
        reboundAt: '2026-08-14T00:00:00.000Z',
      }),
    ).resolves.toMatchObject({
      currentLocator: { value: '${HOME}/new-workspace' },
      locatorHistory: [{ value: '${HOME}/old-workspace' }, { value: '${HOME}/new-workspace' }],
      orphanedAt: null,
    });
    await store.dispose();
  });

  it('garbage collects only expired orphan cache partitions and preserves workspace state', async () => {
    const homedir = await createTemporaryHome();
    const layout = resolveGlobalStorageLayout(homedir);
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath: layout.database, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    for (const [workspaceId, locator] of [
      [WORKSPACE_ID, '${HOME}/expired-orphan'],
      [RECENT_ORPHAN_WORKSPACE_ID, '${HOME}/recent-orphan'],
    ] as const) {
      await store.repositories.workspaces.bind({
        identity: { version: 1, workspaceId },
        locator: { kind: 'variable', value: locator },
        seenAt: '2026-01-01T00:00:00.000Z',
      });
      await store.repositories.conversations.upsert({
        conversationId: `${workspaceId}-conversation`,
        workspaceId,
        journalId: `${workspaceId}-journal`,
        title: locator,
        source: 'vscode',
        model: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    }
    await store.repositories.workspaces.markOrphaned(WORKSPACE_ID, '2026-05-01T00:00:00.000Z');
    await store.repositories.workspaces.markOrphaned(
      RECENT_ORPHAN_WORKSPACE_ID,
      '2026-07-12T00:00:00.000Z',
    );
    await store.repositories.conversations.upsert({
      conversationId: 'global-orphan-gc-control',
      workspaceId: null,
      journalId: 'global-orphan-gc-control-journal',
      title: 'Global control',
      source: 'tui',
      model: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    await expect(
      store.repositories.cacheMaintenance.collectOrphanedPartitions({
        table: 'conversations',
        orphanRetentionMs: 30 * 24 * 60 * 60 * 1_000,
        collectedAt: '2026-07-13T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      scannedOrphans: 2,
      clearedWorkspaceIds: [WORKSPACE_ID],
      deletedRows: 1,
    });
    await expect(
      store.repositories.conversations.get(`${WORKSPACE_ID}-conversation`),
    ).resolves.toBeNull();
    await expect(
      store.repositories.conversations.get(`${RECENT_ORPHAN_WORKSPACE_ID}-conversation`),
    ).resolves.toMatchObject({ workspaceId: RECENT_ORPHAN_WORKSPACE_ID });
    await expect(
      store.repositories.conversations.get('global-orphan-gc-control'),
    ).resolves.toMatchObject({ workspaceId: null });
    await expect(store.repositories.workspaces.get(WORKSPACE_ID)).resolves.toMatchObject({
      orphanedAt: '2026-05-01T00:00:00.000Z',
    });

    await store.dispose();
  });
});

function createGlobalResourceCacheEntry(resourceId: string, relativePath: string) {
  return {
    resource: {
      id: resourceId,
      scope: 'global' as const,
      provider: 'roundtrip-provider',
      kind: 'media' as const,
      source: { kind: 'remote-url' as const, uri: `https://example.com/${resourceId}` },
      fingerprint: { strategy: 'provider' as const, value: resourceId },
    },
    status: 'ready' as const,
    createdAt: '2026-07-13T01:00:00.000Z',
    updatedAt: '2026-07-13T01:00:00.000Z',
    variants: [
      {
        key: 'thumbnail:roundtrip',
        role: 'thumbnail' as const,
        status: 'ready' as const,
        relativePath,
        sizeBytes: 64,
        createdAt: '2026-07-13T01:00:00.000Z',
        updatedAt: '2026-07-13T01:00:00.000Z',
        rebuildable: true,
      },
    ],
  };
}
