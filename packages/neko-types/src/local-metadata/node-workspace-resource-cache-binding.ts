import { resolveGlobalStorageLayout, resolveStorageLayout } from '../types/storage';
import { createNodeSqliteLocalMetadataStore } from './node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from './node-workspace-identity';
import { migrateLegacyResourceCacheManifest } from './node-resource-cache-manifest-migration';
import { migrateLegacyProxyManifest } from './node-proxy-manifest-migration';
import { LocalMetadataResourceCacheManifestStore } from './resource-cache-manifest-store';
import { M1_LOCAL_METADATA_MIGRATIONS, RESOURCE_CACHE_MIGRATIONS } from './sqlite';
import type { ResourceCacheManifestMigrationReport } from './node-resource-cache-manifest-migration';
import type { ProxyManifestMigrationReport } from './node-proxy-manifest-migration';
import type { ResourceCacheManifestStore } from '../types/resource-cache';

export interface NodeWorkspaceResourceCacheMetadataBinding {
  readonly workspaceId: string;
  readonly manifestStore: ResourceCacheManifestStore;
  readonly migrationReport: ResourceCacheManifestMigrationReport;
  readonly proxyMigrationReport: ProxyManifestMigrationReport;
  dispose(): Promise<void>;
}

export interface NodeGlobalResourceCacheMetadataBinding {
  readonly manifestStore: ResourceCacheManifestStore;
  dispose(): Promise<void>;
}

export async function createNodeGlobalResourceCacheMetadataBinding(options: {
  readonly homedir: string;
}): Promise<NodeGlobalResourceCacheMetadataBinding> {
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
  try {
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(options.homedir).database,
      busyTimeoutMs: 2_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(RESOURCE_CACHE_MIGRATIONS);
    return {
      manifestStore: new LocalMetadataResourceCacheManifestStore({
        metadataStore,
        partition: { scope: 'global', workspaceId: null, domain: 'resource-cache' },
      }),
      dispose: () => metadataStore.dispose(),
    };
  } catch (error) {
    await metadataStore.dispose();
    throw error;
  }
}

export async function createNodeWorkspaceResourceCacheMetadataBinding(options: {
  readonly homedir: string;
  readonly workDir: string;
  readonly createWorkspaceId?: () => string;
  readonly now?: () => string;
}): Promise<NodeWorkspaceResourceCacheMetadataBinding> {
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
  try {
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(options.homedir).database,
      busyTimeoutMs: 2_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(RESOURCE_CACHE_MIGRATIONS);
    const identityResolution = await resolveNodeWorkspaceIdentity({
      workspaceRoot: options.workDir,
      homedir: options.homedir,
      metadataStore,
      ...(options.createWorkspaceId ? { createWorkspaceId: options.createWorkspaceId } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
    const identity = identityResolution.identity;
    const manifestStore = new LocalMetadataResourceCacheManifestStore({
      metadataStore,
      partition: {
        scope: 'workspace',
        workspaceId: identity.workspaceId,
        domain: 'resource-cache',
      },
      projectRoot: options.workDir,
    });
    const layout = resolveStorageLayout(options.workDir, options.homedir);
    const migrationReport = await migrateLegacyResourceCacheManifest({
      manifestPath: layout.project.local.cache.resourceManifest,
      cacheRoot: layout.project.local.cache.resources,
      manifestStore,
    });
    const proxyMigrationReport = await migrateLegacyProxyManifest({
      manifestPath: layout.project.local.cache.proxyManifest,
      workDir: options.workDir,
      legacyProxyRoot: layout.project.local.cache.proxies,
      resourceCacheRoot: layout.project.local.cache.resources,
      manifestStore,
    });
    return {
      workspaceId: identity.workspaceId,
      manifestStore,
      migrationReport,
      proxyMigrationReport,
      dispose: () => metadataStore.dispose(),
    };
  } catch (error) {
    await metadataStore.dispose();
    throw error;
  }
}
