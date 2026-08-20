import type { LocalMetadataStore } from '../contracts';
import { initializeCoreLocalMetadataTables } from '../sqlite/core-tables';
import { initializeMediaMetadataTables } from '../sqlite/media-metadata-schema';
import { initializeResourceCacheTables } from '../sqlite/resource-cache-schema';
import { resolveGlobalStorageLayout } from '../storage';

const CONTRACT_WORKSPACE_ID = '4be0e209-c70b-48b8-a513-cd230d915b93';
const CONTRACT_TRANSACTION_WORKSPACE_ID = 'f8f01c47-13c5-42c3-b9a9-ec337d66bf2a';
const ROLLED_BACK_WORKSPACE_ID = '6125ba71-f819-41f0-8e42-7bf15489495a';

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
  const source = options.createStore(options.sourceHome);
  await source.open({ databasePath: sourceLayout.database, busyTimeoutMs: 1_000 });

  await initializeCoreLocalMetadataTables(source);
  await initializeResourceCacheTables(source);
  await initializeMediaMetadataTables(source);

  await source.repositories.workspaces.bind({
    identity: { workspaceId: CONTRACT_WORKSPACE_ID },
    locator: { kind: 'variable', value: '${HOME}/contract-workspace' },
    seenAt: '2026-07-13T00:00:00.000Z',
  });

  await source.transaction(
    { mode: 'state-write', ownership: 'system', operation: 'adapter-contract-commit' },
    async ({ repositories }) => {
      await repositories.workspaces.bind({
        identity: { workspaceId: CONTRACT_TRANSACTION_WORKSPACE_ID },
        locator: { kind: 'relative', value: 'transaction-workspace' },
        seenAt: '2026-07-13T01:00:00.000Z',
      });
    },
  );

  let rollbackObserved = false;
  try {
    await source.transaction(
      { mode: 'state-write', ownership: 'system', operation: 'adapter-contract-rollback' },
      async ({ repositories }) => {
        await repositories.workspaces.bind({
          identity: { workspaceId: ROLLED_BACK_WORKSPACE_ID },
          locator: { kind: 'relative', value: 'rolled-back-workspace' },
          seenAt: '2026-07-13T01:00:00.000Z',
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
    (await source.repositories.workspaces.get(ROLLED_BACK_WORKSPACE_ID)) === null,
    'failed transaction must not persist its workspace',
  );
  assert(
    (await source.repositories.workspaces.get(CONTRACT_TRANSACTION_WORKSPACE_ID))?.currentLocator
      .value === 'transaction-workspace',
    'committed workspace must be queryable',
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
  assert((await source.integrityCheck()).ok, 'integrity_check must return ok');
  await initializeCoreLocalMetadataTables(source);
  await source.repositories.workspaces.markSeen(
    CONTRACT_TRANSACTION_WORKSPACE_ID,
    '2026-07-13T02:00:00.000Z',
  );

  await source.backup({ destinationPath: backupSourcePath, reason: 'manual' });
  await source.dispose();

  const restored = options.createStore(options.backupHome);
  await restored.restore({ sourcePath: backupSourcePath });
  await restored.open({ databasePath: backupLayout.database, busyTimeoutMs: 1_000 });
  assert(
    (await restored.repositories.workspaces.get(CONTRACT_WORKSPACE_ID))?.currentLocator.value ===
      '${HOME}/contract-workspace',
    'backup must preserve workspace state',
  );
  assert(
    (await restored.repositories.workspaces.get(CONTRACT_TRANSACTION_WORKSPACE_ID))?.lastSeenAt ===
      '2026-07-13T02:00:00.000Z',
    'manual backup must preserve the current workspace state',
  );
  assert(
    (
      await restored.repositories.resourceCache.list({
        scope: 'workspace',
        workspaceId: CONTRACT_WORKSPACE_ID,
        domain: 'resource-cache',
      })
    )[0]?.descriptor.id === 'contract-resource',
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
    descriptor: {
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
