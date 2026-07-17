import * as path from 'node:path';
import { PathResolver, type PathVariableMap } from '../path';
import { resolveGlobalStorageLayout, resolveStorageLayout } from '../types/storage';
import type { LocalMetadataPartition, LocalMetadataPartitionRevision } from './model';
import {
  migrateLegacyMediaSearchIndex,
  migrateLegacySemanticIndexSidecars,
  type MediaSearchIndexMigrationReport,
  type SemanticIndexSidecarMigrationReport,
} from './node-search-projection-migration';
import { createNodeSqliteLocalMetadataStore } from './node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from './node-workspace-identity';
import type { SearchDocumentRepository, SemanticProjectionRepository } from './repositories';
import { M1_LOCAL_METADATA_MIGRATIONS, SEARCH_PROJECTION_MIGRATIONS } from './sqlite';

export interface NodeWorkspaceSearchMetadataBinding {
  readonly workspaceId: string;
  readonly searchPartition: LocalMetadataPartition;
  readonly semanticPartition: LocalMetadataPartition;
  readonly searchDocuments: SearchDocumentRepository;
  readonly semanticProjections: SemanticProjectionRepository;
  readonly mediaSearchMigrationReport: MediaSearchIndexMigrationReport;
  readonly semanticMigrationReport: SemanticIndexSidecarMigrationReport;
  readSearchRevision(): Promise<LocalMetadataPartitionRevision | null>;
  dispose(): Promise<void>;
}

export async function createNodeWorkspaceSearchMetadataBinding(options: {
  readonly homedir: string;
  readonly workDir: string;
  readonly pathVariables?: PathVariableMap;
  readonly createWorkspaceId?: () => string;
  readonly now?: () => string;
}): Promise<NodeWorkspaceSearchMetadataBinding> {
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
  try {
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(options.homedir).database,
      busyTimeoutMs: 2_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    const identityResolution = await resolveNodeWorkspaceIdentity({
      workspaceRoot: options.workDir,
      homedir: options.homedir,
      metadataStore,
      ...(options.createWorkspaceId ? { createWorkspaceId: options.createWorkspaceId } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
    const identity = identityResolution.identity;
    const searchPartition: LocalMetadataPartition = {
      scope: 'workspace',
      workspaceId: identity.workspaceId,
      domain: 'project-search',
    };
    const semanticPartition: LocalMetadataPartition = {
      scope: 'workspace',
      workspaceId: identity.workspaceId,
      domain: 'semantic-projection',
    };
    const pathVariables = new Map(options.pathVariables ?? []);
    pathVariables.set('HOME', normalizePath(options.homedir));
    pathVariables.set('WORKSPACE', normalizePath(options.workDir));
    const layout = resolveStorageLayout(options.workDir, options.homedir);
    const mediaSearchMigrationReport = await migrateLegacyMediaSearchIndex({
      indexPath: layout.project.local.cache.searchIndex,
      partition: searchPartition,
      repository: metadataStore.repositories.searchDocuments,
      pathResolver: new PathResolver(pathVariables),
    });
    const semanticMigrationReport = await migrateLegacySemanticIndexSidecars({
      semanticIndexRoot: path.join(options.workDir, '.neko', 'semantic-index'),
      partition: semanticPartition,
      repository: metadataStore.repositories.semanticProjections,
    });
    return {
      workspaceId: identity.workspaceId,
      searchPartition,
      semanticPartition,
      searchDocuments: metadataStore.repositories.searchDocuments,
      semanticProjections: metadataStore.repositories.semanticProjections,
      mediaSearchMigrationReport,
      semanticMigrationReport,
      readSearchRevision: () => metadataStore.readPartitionRevision(searchPartition),
      dispose: () => metadataStore.dispose(),
    };
  } catch (error) {
    await metadataStore.dispose();
    throw error;
  }
}

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/gu, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/u, '') : normalized;
}
