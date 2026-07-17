import { resolveGlobalStorageLayout } from '../../../../types/storage';
import { M1_LOCAL_METADATA_MIGRATIONS } from '../../../../local-metadata/sqlite';
import { createNodeSqliteLocalMetadataStore } from '../../node-sqlite-local-metadata-store';

const homedir = process.env['NEKO_SQLITE_TEST_HOME'];
if (!homedir) throw new Error('NEKO_SQLITE_TEST_HOME is required');

const store = createNodeSqliteLocalMetadataStore({ homedir });
await store.open({
  databasePath: resolveGlobalStorageLayout(homedir).database,
  busyTimeoutMs: 1_000,
});
await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
await store.repositories.conversations.upsert({
  conversationId: 'crash-conversation',
  workspaceId: null,
  journalId: 'crash-journal',
  title: 'Committed before process exit',
  source: 'tui',
  model: null,
  createdAt: '2026-07-13T03:00:00.000Z',
  updatedAt: '2026-07-13T03:00:00.000Z',
});
process.exit(0);
