import { resolveGlobalStorageLayout, resolveStorageLayout } from '../types/storage';
import type { LocalMetadataPartition, LocalMetadataPartitionRevision } from './model';
import {
  migrateLegacyAssetGraph,
  type LegacyAssetGraphMigrationReport,
} from './node-entity-asset-projection-migration';
import { createNodeSqliteLocalMetadataStore } from './node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from './node-workspace-identity';
import type { EntityAssetProjectionRepository } from './repositories';
import { ENTITY_ASSET_PROJECTION_MIGRATIONS, M1_LOCAL_METADATA_MIGRATIONS } from './sqlite';

export interface NodeWorkspaceEntityAssetMetadataBinding {
  readonly workspaceId: string;
  readonly partition: LocalMetadataPartition;
  readonly repository: EntityAssetProjectionRepository;
  readonly migrationReport: LegacyAssetGraphMigrationReport;
  readRevision(): Promise<LocalMetadataPartitionRevision | null>;
  markStale(diagnostic: string, updatedAt: string): Promise<LocalMetadataPartitionRevision>;
  dispose(): Promise<void>;
}

export async function createNodeWorkspaceEntityAssetMetadataBinding(options: {
  readonly homedir: string;
  readonly workDir: string;
  readonly createWorkspaceId?: () => string;
  readonly now?: () => string;
}): Promise<NodeWorkspaceEntityAssetMetadataBinding> {
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
  try {
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(options.homedir).database,
      busyTimeoutMs: 2_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS);
    const identityResolution = await resolveNodeWorkspaceIdentity({
      workspaceRoot: options.workDir,
      homedir: options.homedir,
      metadataStore,
      ...(options.createWorkspaceId ? { createWorkspaceId: options.createWorkspaceId } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
    const identity = identityResolution.identity;
    const partition: LocalMetadataPartition = {
      scope: 'workspace',
      workspaceId: identity.workspaceId,
      domain: 'entity-asset-projection',
    };
    const migrationReport = await migrateLegacyAssetGraph({
      assetGraphPath: resolveStorageLayout(options.workDir, options.homedir).project.local.cache
        .assetGraph,
      partition,
      repository: metadataStore.repositories.entityAssetProjections,
    });
    return {
      workspaceId: identity.workspaceId,
      partition,
      repository: metadataStore.repositories.entityAssetProjections,
      migrationReport,
      readRevision: () => metadataStore.readPartitionRevision(partition),
      markStale: (diagnostic, updatedAt) =>
        metadataStore.repositories.projectionVersions.markStale({
          partition,
          freshness: 'stale',
          diagnostic,
          updatedAt,
        }),
      dispose: () => metadataStore.dispose(),
    };
  } catch (error) {
    await metadataStore.dispose();
    throw error;
  }
}
