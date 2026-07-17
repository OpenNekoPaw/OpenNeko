import type { LocalMetadataMigration, LocalMetadataStore } from '../contracts';
import { M1_LOCAL_METADATA_MIGRATIONS } from '../sqlite/m1-schema';
import { MEDIA_METADATA_MIGRATIONS } from '../sqlite/media-metadata-schema';
import { RESOURCE_CACHE_MIGRATIONS } from '../sqlite/resource-cache-schema';
import { resolveGlobalStorageLayout } from '../../types/storage';

const CONTRACT_WORKSPACE_ID = '4be0e209-c70b-48b8-a513-cd230d915b93';

export interface LocalMetadataAdapterContractOptions {
  readonly sourceHome: string;
  readonly backupHome: string;
  readonly createStore: (homedir: string) => LocalMetadataStore;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Local metadata adapter contract failed: ${message}`);
}

export async function runLocalMetadataAdapterContract(
  options: LocalMetadataAdapterContractOptions,
): Promise<void> {
  const sourceLayout = resolveGlobalStorageLayout(options.sourceHome);
  const backupLayout = resolveGlobalStorageLayout(options.backupHome);
  const backupSourcePath = `${backupLayout.database}.source.bak`;
  const destructiveBackupPath = `${backupLayout.database}.pre-destructive.bak`;
  const source = options.createStore(options.sourceHome);
  await source.open({ databasePath: sourceLayout.database, busyTimeoutMs: 1_000 });

  const firstMigration = await source.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
  assert(firstMigration.previousVersion === 0, 'M1 previous version must be zero');
  assert(firstMigration.currentVersion === 1, 'M1 current version must be one');
  assert(firstMigration.appliedVersions.length === 1, 'M1 must apply exactly one migration');
  await source.migrateNamespace(RESOURCE_CACHE_MIGRATIONS);
  await source.migrateNamespace(MEDIA_METADATA_MIGRATIONS);

  await source.repositories.workspaces.bind({
    identity: { version: 1, workspaceId: CONTRACT_WORKSPACE_ID },
    locator: { kind: 'variable', value: '${HOME}/contract-workspace' },
    seenAt: '2026-07-13T00:00:00.000Z',
  });

  const partition = {
    scope: 'workspace' as const,
    workspaceId: CONTRACT_WORKSPACE_ID,
    domain: 'contract',
  };
  await source.transaction(
    { mode: 'cache-write', ownership: 'cache', operation: 'adapter-contract-commit' },
    async ({ repositories }) => {
      await repositories.conversations.upsert({
        conversationId: 'contract-conversation',
        workspaceId: CONTRACT_WORKSPACE_ID,
        journalId: 'contract-journal',
        title: 'Adapter contract conversation',
        source: 'import',
        model: null,
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

  let rollbackObserved = false;
  try {
    await source.transaction(
      { mode: 'cache-write', ownership: 'cache', operation: 'adapter-contract-rollback' },
      async ({ repositories }) => {
        await repositories.conversations.upsert({
          conversationId: 'rolled-back-conversation',
          workspaceId: CONTRACT_WORKSPACE_ID,
          journalId: 'rolled-back-journal',
          title: 'Rolled back',
          source: 'import',
          model: null,
          createdAt: '2026-07-13T00:00:00.000Z',
          updatedAt: '2026-07-13T01:00:00.000Z',
        });
        throw new Error('intentional adapter contract rollback');
      },
    );
  } catch (error) {
    rollbackObserved =
      error instanceof Error && error.message === 'intentional adapter contract rollback';
  }
  assert(rollbackObserved, 'transaction callback failure must be observable');
  assert(
    (await source.repositories.conversations.get('rolled-back-conversation')) === null,
    'failed transaction must not persist its conversation',
  );

  const conversations = await source.repositories.conversations.list({
    workspaceId: CONTRACT_WORKSPACE_ID,
    text: 'contract',
    limit: 10,
    offset: 0,
  });
  assert(conversations.length === 1, 'committed conversation must be queryable');
  assert(
    conversations[0]?.conversationId === 'contract-conversation',
    'conversation query returned the wrong record',
  );
  assert(
    (await source.readPartitionRevision(partition))?.revision === 1,
    'partition revision must commit with the projection',
  );
  const resourceCachePartition = {
    scope: 'workspace' as const,
    workspaceId: CONTRACT_WORKSPACE_ID,
    domain: 'resource-cache',
  };
  await source.repositories.resourceCache.replacePartition({
    partition: resourceCachePartition,
    updatedAt: '2026-07-13T01:30:00.000Z',
    entries: [createContractResourceCacheEntry()],
  });
  assert(
    (await source.repositories.resourceCache.list(resourceCachePartition))[0]?.variants[0]
      ?.relativePath === 'contract/thumbnail.jpg',
    'ResourceCache entry and variant must round-trip through the adapter',
  );
  assert(
    (await source.readPartitionRevision(resourceCachePartition))?.revision === 1,
    'ResourceCache replacement must increment its partition revision',
  );
  const mediaMetadataPartition = {
    scope: 'workspace' as const,
    workspaceId: CONTRACT_WORKSPACE_ID,
    domain: 'media-metadata',
  };
  await source.repositories.mediaMetadata.upsert({
    partition: mediaMetadataPartition,
    record: {
      sourceKey: 'media/contract.mp4',
      sourceMtimeMs: 1_752_364_800_000,
      metadata: {
        fileSize: 8_192,
        mimeType: 'video/mp4',
        width: 1280,
        height: 720,
        duration: 8,
        codec: 'h264',
      },
      updatedAt: '2026-07-13T01:45:00.000Z',
    },
  });
  assert(
    (await source.repositories.mediaMetadata.get(mediaMetadataPartition, 'media/contract.mp4'))
      ?.metadata.codec === 'h264',
    'Media probe metadata must round-trip through the adapter',
  );
  assert(
    (await source.readPartitionRevision(mediaMetadataPartition))?.revision === 1,
    'Media metadata upsert must increment its partition revision',
  );
  assert((await source.integrityCheck()).ok, 'integrity_check must return ok');
  assert(
    (await source.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS)).appliedVersions.length === 0,
    're-running M1 must be idempotent',
  );

  const destructiveMigration: LocalMetadataMigration = {
    namespace: 'core',
    version: 2,
    name: 'rebuild-conversation-order-index',
    checksum: 'sha256:adapter-contract-rebuild-conversation-order-index',
    ownership: 'cache',
    destructive: true,
    statements: [
      'DROP INDEX conversations_workspace_updated_idx',
      `CREATE INDEX conversations_workspace_updated_idx
        ON conversations(workspace_id, updated_at DESC)`,
    ],
  };
  await source.migrateNamespace([...M1_LOCAL_METADATA_MIGRATIONS, destructiveMigration], {
    destructiveBackup: { destinationPath: destructiveBackupPath, reason: 'migration' },
  });
  await source.repositories.conversations.upsert({
    conversationId: 'contract-conversation',
    workspaceId: CONTRACT_WORKSPACE_ID,
    journalId: 'contract-journal',
    title: 'Updated after destructive migration',
    source: 'import',
    model: null,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T02:00:00.000Z',
  });

  await source.backup({ destinationPath: backupSourcePath, reason: 'manual' });
  await source.dispose();

  const preDestructive = options.createStore(options.backupHome);
  await preDestructive.restore({ sourcePath: destructiveBackupPath });
  await preDestructive.open({ databasePath: backupLayout.database, busyTimeoutMs: 1_000 });
  assert(
    (await preDestructive.repositories.conversations.get('contract-conversation'))?.title ===
      'Adapter contract conversation',
    'destructive migration backup must preserve the pre-migration record',
  );
  await preDestructive.dispose();

  const restored = options.createStore(options.backupHome);
  await restored.restore({ sourcePath: backupSourcePath });
  await restored.open({ databasePath: backupLayout.database, busyTimeoutMs: 1_000 });
  assert(
    (await restored.repositories.workspaces.get(CONTRACT_WORKSPACE_ID))?.currentLocator.value ===
      '${HOME}/contract-workspace',
    'backup must preserve workspace state',
  );
  assert(
    (await restored.repositories.conversations.get('contract-conversation'))?.journalId ===
      'contract-journal',
    'backup must preserve conversation projection',
  );
  assert(
    (await restored.repositories.conversations.get('contract-conversation'))?.title ===
      'Updated after destructive migration',
    'manual backup must preserve the post-migration record',
  );
  assert(
    (
      await restored.repositories.resourceCache.list({
        scope: 'workspace',
        workspaceId: CONTRACT_WORKSPACE_ID,
        domain: 'resource-cache',
      })
    )[0]?.resource.id === 'contract-resource',
    'manual backup must preserve ResourceCache metadata',
  );
  assert(
    (
      await restored.repositories.mediaMetadata.get(
        {
          scope: 'workspace',
          workspaceId: CONTRACT_WORKSPACE_ID,
          domain: 'media-metadata',
        },
        'media/contract.mp4',
      )
    )?.metadata.mimeType === 'video/mp4',
    'manual backup must preserve media probe metadata',
  );
  assert((await restored.integrityCheck()).ok, 'restored backup must pass integrity_check');
  await restored.dispose();
}

function createContractResourceCacheEntry() {
  return {
    resource: {
      id: 'contract-resource',
      scope: 'project' as const,
      provider: 'contract-provider',
      kind: 'media' as const,
      source: { kind: 'file' as const, projectRelativePath: 'media/source.png' },
      fingerprint: { strategy: 'hash' as const, value: 'sha256:contract-source' },
    },
    status: 'ready' as const,
    createdAt: '2026-07-13T01:00:00.000Z',
    updatedAt: '2026-07-13T01:30:00.000Z',
    variants: [
      {
        key: 'thumbnail:contract',
        role: 'thumbnail' as const,
        status: 'ready' as const,
        relativePath: 'contract/thumbnail.jpg',
        sizeBytes: 128,
        createdAt: '2026-07-13T01:00:00.000Z',
        updatedAt: '2026-07-13T01:30:00.000Z',
        rebuildable: true,
      },
    ],
  };
}
