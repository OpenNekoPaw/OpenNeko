import { resolveGlobalStorageLayout } from '@neko/shared';
import { createBunSqliteLocalMetadataStore } from '../../../apps/neko-tui/src/tui/host/bun-sqlite-local-metadata-store';

const homedir = process.env['NEKO_SQLITE_TEST_HOME'];
if (!homedir) throw new Error('NEKO_SQLITE_TEST_HOME is required');

const store = createBunSqliteLocalMetadataStore({ homedir });
await store.open({
  databasePath: resolveGlobalStorageLayout(homedir).database,
  busyTimeoutMs: 2_000,
});

const nodeConversation = await store.repositories.conversations.get('node-conversation');
if (nodeConversation?.journalId !== 'node-journal') {
  throw new Error('Bun could not read the Node conversation through ConversationCatalog');
}
const resourceCachePartition = {
  scope: 'global' as const,
  workspaceId: null,
  domain: 'resource-cache',
};
const nodeResources = await store.repositories.resourceCache.list(resourceCachePartition);
if (nodeResources[0]?.resource.id !== 'node-resource') {
  throw new Error('Bun could not read Node ResourceCache metadata');
}

await store.repositories.conversations.upsert({
  conversationId: 'bun-conversation',
  workspaceId: null,
  journalId: 'bun-journal',
  title: 'Written by Bun',
  source: 'tui',
  model: null,
  createdAt: '2026-07-13T02:00:00.000Z',
  updatedAt: '2026-07-13T02:00:00.000Z',
});
await store.repositories.resourceCache.replacePartition({
  partition: resourceCachePartition,
  updatedAt: '2026-07-13T02:00:00.000Z',
  entries: [
    {
      resource: {
        id: 'bun-resource',
        scope: 'global',
        provider: 'roundtrip-provider',
        kind: 'media',
        source: { kind: 'remote-url', uri: 'https://example.com/bun-resource' },
        fingerprint: { strategy: 'provider', value: 'bun-resource' },
      },
      status: 'ready',
      createdAt: '2026-07-13T02:00:00.000Z',
      updatedAt: '2026-07-13T02:00:00.000Z',
      variants: [
        {
          key: 'thumbnail:roundtrip',
          role: 'thumbnail',
          status: 'ready',
          relativePath: 'bun/thumbnail.jpg',
          sizeBytes: 64,
          createdAt: '2026-07-13T02:00:00.000Z',
          updatedAt: '2026-07-13T02:00:00.000Z',
          rebuildable: true,
        },
      ],
    },
  ],
});

const integrity = await store.integrityCheck();
if (!integrity.ok) throw new Error(`Bun integrity check failed: ${integrity.messages.join(', ')}`);
await store.dispose();
