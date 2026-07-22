import { MemoryTaskRecoveryStorage, MemoryTaskStorage } from '@neko/agent';
import type {
  CatalogItemRecord,
  CatalogProjectionRepository,
  EntityAssetProjectionRecord,
  EntityAssetProjectionRepository,
  SearchDocumentRecord,
  SearchDocumentRepository,
  SemanticProjectionRecord,
  SemanticProjectionRepository,
} from '@neko/shared';
import { resolveGlobalStorageLayout } from '@neko/shared';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from '@neko/shared/local-metadata/node-workspace-identity';
import {
  AGENT_STATE_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import type { TuiLocalMetadataBinding } from '../../tui-local-metadata-binding';

export async function createMemoryLocalMetadataBinding(
  homedir: string,
  workDir: string,
): Promise<TuiLocalMetadataBinding> {
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
  await metadataStore.open({
    databasePath: resolveGlobalStorageLayout(homedir).database,
    busyTimeoutMs: 2_000,
  });
  await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
  await metadataStore.migrateNamespace(AGENT_STATE_MIGRATIONS);
  const workspaceResolution = await resolveNodeWorkspaceIdentity({
    workspaceRoot: workDir,
    homedir,
    metadataStore,
  });
  const searchDocuments = createMemorySearchDocumentRepository();
  const semanticProjections = createMemorySemanticProjectionRepository();
  const entityAssetProjections = createMemoryEntityAssetProjectionRepository();
  const catalogItems = createMemoryCatalogProjectionRepository();
  const workspaceId = workspaceResolution.identity.workspaceId;
  const searchPartition = {
    scope: 'workspace' as const,
    workspaceId,
    domain: 'project-search',
  };
  const semanticPartition = {
    scope: 'workspace' as const,
    workspaceId,
    domain: 'semantic-projection',
  };
  const entityAssetPartition = {
    scope: 'workspace' as const,
    workspaceId,
    domain: 'entity-asset-projection',
  };
  return {
    persistenceBackend: {
      authority: 'memory',
      catalog: 'memory',
      databaseScope: 'isolated-test',
    },
    workspaceId,
    metadataStore,
    taskStorage: new MemoryTaskStorage(),
    taskRecoveryStorage: new MemoryTaskRecoveryStorage(),
    searchPartition,
    semanticPartition,
    entityAssetPartition,
    searchDocuments,
    semanticProjections,
    entityAssetProjections,
    catalogItems,
    workspaceStorageInspection: {
      workspaceRoot: '<memory>',
      inspectedRoot: '<memory>/.neko',
      totalCacheBytes: 0,
      largeCacheThresholdBytes: 1024 * 1024 * 1024,
      entries: [],
    },
    semanticMigrationReport: {
      sourceStatus: 'absent',
      sourceRoot: '<memory>',
      discoveredCount: 0,
      importedSourceCount: 0,
      importedEvidenceCount: 0,
      preservedExistingSourceCount: 0,
      verifiedSourceCount: 0,
      quarantinedCount: 0,
      backupPaths: [],
      archivedPaths: [],
      quarantinePaths: [],
      diagnostics: [],
    },
    entityAssetMigrationReport: {
      sourceStatus: 'absent',
      sourcePath: '<memory>',
      backupPath: null,
      archivedPath: null,
      quarantinePath: null,
      sourceDiagnostic: null,
      discoveredCount: 0,
      importedCount: 0,
      preservedExistingCount: 0,
      verifiedCount: 0,
      unrecoverable: [],
    },
    readSearchRevision: async () => null,
    readEntityAssetRevision: async () => null,
    pollRevisions: async () => ({ changedDomains: [], revisions: {} }),
    dispose: () => metadataStore.dispose(),
  };
}

function createMemoryCatalogProjectionRepository(): CatalogProjectionRepository {
  let items: readonly CatalogItemRecord[] = [];
  return {
    list: async ({ kinds, sources }) =>
      items.filter(
        (item) =>
          (!kinds || kinds.includes(item.kind)) && (!sources || sources.includes(item.source)),
      ),
    replaceSlice: async (request) => {
      items = [
        ...items.filter((item) => item.kind !== request.kind || item.source !== request.source),
        ...request.items,
      ];
    },
  };
}

function createMemorySearchDocumentRepository(): SearchDocumentRepository {
  let documents: readonly SearchDocumentRecord[] = [];
  return {
    list: async () => documents,
    query: async ({ text, limit }) => {
      const normalized = text.toLocaleLowerCase();
      return documents
        .filter((document) => document.searchText.toLocaleLowerCase().includes(normalized))
        .slice(0, limit);
    },
    replacePartition: async (request) => {
      documents = request.documents;
    },
    replaceSearchPartition: async (request) => {
      documents = [
        ...documents.filter((document) => document.partition !== request.searchPartition),
        ...request.documents,
      ];
    },
    insertMissingSearchPartition: async (request) => {
      const existingIds = new Set(documents.map((document) => document.documentId));
      const inserted = request.documents.filter(
        (document) => !existingIds.has(document.documentId),
      );
      documents = [...documents, ...inserted];
      return {
        insertedDocumentIds: inserted.map((document) => document.documentId),
        preservedDocumentIds: request.documents
          .filter((document) => existingIds.has(document.documentId))
          .map((document) => document.documentId),
      };
    },
  };
}

function createMemorySemanticProjectionRepository(): SemanticProjectionRepository {
  let records: readonly SemanticProjectionRecord[] = [];
  return {
    list: async () => records,
    replacePartition: async (request) => {
      records = request.sources;
    },
    insertMissing: async (request) => {
      const existingIds = new Set(records.map((record) => record.sourceId));
      const inserted = request.sources.filter((record) => !existingIds.has(record.sourceId));
      records = [...records, ...inserted];
      return {
        insertedSourceIds: inserted.map((record) => record.sourceId),
        preservedSourceIds: request.sources
          .filter((record) => existingIds.has(record.sourceId))
          .map((record) => record.sourceId),
      };
    },
  };
}

function createMemoryEntityAssetProjectionRepository(): EntityAssetProjectionRepository {
  let records: readonly EntityAssetProjectionRecord[] = [];
  return {
    list: async (query) =>
      records.filter(
        (record) =>
          (!query.kinds || query.kinds.includes(record.kind)) &&
          (!query.sourceId || query.sourceId === record.sourceId) &&
          (!query.entityId ||
            query.entityId === record.entityId ||
            query.entityId === record.relatedEntityId) &&
          (!query.candidateId || query.candidateId === record.candidateId) &&
          (!query.assetRef || query.assetRef === record.assetRef),
      ),
    replaceSource: async (request) => {
      records = [
        ...records.filter((record) => record.sourceId !== request.sourceId),
        ...request.records,
      ];
    },
    insertMissing: async (request) => {
      const existing = new Set(records.map((record) => `${record.kind}:${record.projectionId}`));
      const inserted = request.records.filter(
        (record) => !existing.has(`${record.kind}:${record.projectionId}`),
      );
      records = [...records, ...inserted];
      return {
        insertedProjectionKeys: inserted.map((record) => `${record.kind}:${record.projectionId}`),
        preservedProjectionKeys: request.records
          .filter((record) => existing.has(`${record.kind}:${record.projectionId}`))
          .map((record) => `${record.kind}:${record.projectionId}`),
      };
    },
  };
}
