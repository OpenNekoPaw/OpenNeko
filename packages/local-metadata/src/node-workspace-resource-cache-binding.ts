import { resolveGlobalStorageLayout } from './storage';
import { createNodeSqliteLocalMetadataStore } from './node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from './node-workspace-identity';
import { LocalMetadataResourceCacheManifestStore } from './resource-cache-manifest-store';
import { initializeCoreLocalMetadataTables, initializeResourceCacheTables } from './sqlite';
import type { ResourceCacheManifestStore } from '@neko/local-metadata/resource-cache';
import type { LocalMetadataStore } from './contracts';

export interface NodeWorkspaceResourceCacheMetadataBinding {
  readonly workspaceId: string;
  readonly metadataStore: LocalMetadataStore;
  readonly manifestStore: ResourceCacheManifestStore;
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
    const databasePath = resolveGlobalStorageLayout(options.homedir).database;
    await metadataStore.open({
      databasePath,
      busyTimeoutMs: 2_000,
    });
    await initializeCoreLocalMetadataTables(metadataStore);
    await initializeResourceCacheTables(metadataStore);
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
    const databasePath = resolveGlobalStorageLayout(options.homedir).database;
    await metadataStore.open({
      databasePath,
      busyTimeoutMs: 2_000,
    });
    await initializeCoreLocalMetadataTables(metadataStore);
    await initializeResourceCacheTables(metadataStore);
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
    return {
      workspaceId: identity.workspaceId,
      metadataStore,
      manifestStore,
      dispose: () => metadataStore.dispose(),
    };
  } catch (error) {
    await metadataStore.dispose();
    throw error;
  }
}
