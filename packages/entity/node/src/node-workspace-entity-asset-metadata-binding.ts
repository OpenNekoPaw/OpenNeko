import { resolveGlobalStorageLayout, resolveStorageLayout } from '@neko/local-metadata';
import type { LocalMetadataPartition, LocalMetadataPartitionRevision } from '@neko/local-metadata';
import {
  migrateLegacyAssetGraph,
  type LegacyAssetGraphMigrationReport,
} from './node-entity-asset-projection-migration';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from '@neko/local-metadata/node-workspace-identity';
import type { EntityAssetProjectionRepository } from '@neko/entity-domain';
import {
  ENTITY_ASSET_PROJECTION_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
} from '@neko/local-metadata/sqlite';

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
    const databasePath = resolveGlobalStorageLayout(options.homedir).database;
    await metadataStore.open({
      databasePath,
      busyTimeoutMs: 2_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS, {
      destructiveBackup: {
        destinationPath: `${databasePath}.pre-project-entity-candidate-v2.bak`,
        reason: 'migration',
      },
    });
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
