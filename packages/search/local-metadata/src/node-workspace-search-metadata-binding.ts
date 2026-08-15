import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import type { LocalMetadataPartition } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from '@neko/local-metadata/node-workspace-identity';
import type {
  ResourceUsageProjectionRepository,
  SearchDocumentRepository,
  SemanticProjectionRepository,
} from '@neko/local-metadata';
import {
  initializeCoreLocalMetadataTables,
  initializeSearchProjectionTables,
} from '@neko/local-metadata/sqlite';

export interface NodeWorkspaceSearchMetadataBinding {
  readonly workspaceId: string;
  readonly searchPartition: LocalMetadataPartition;
  readonly semanticPartition: LocalMetadataPartition;
  readonly resourceUsagePartition: LocalMetadataPartition;
  readonly searchDocuments: SearchDocumentRepository;
  readonly semanticProjections: SemanticProjectionRepository;
  readonly resourceUsageProjections: ResourceUsageProjectionRepository;
  dispose(): Promise<void>;
}

export async function createNodeWorkspaceSearchMetadataBinding(options: {
  readonly homedir: string;
  readonly workDir: string;
  readonly createWorkspaceId?: () => string;
  readonly now?: () => string;
}): Promise<NodeWorkspaceSearchMetadataBinding> {
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
  try {
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(options.homedir).database,
      busyTimeoutMs: 2_000,
    });
    await initializeCoreLocalMetadataTables(metadataStore);
    await initializeSearchProjectionTables(metadataStore);
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
    const resourceUsagePartition = {
      scope: 'workspace' as const,
      workspaceId: identity.workspaceId,
      domain: 'resource-usage-projection' as const,
    };
    return {
      workspaceId: identity.workspaceId,
      searchPartition,
      semanticPartition,
      resourceUsagePartition,
      searchDocuments: metadataStore.repositories.searchDocuments,
      semanticProjections: metadataStore.repositories.semanticProjections,
      resourceUsageProjections: metadataStore.repositories.resourceUsageProjections,
      dispose: () => metadataStore.dispose(),
    };
  } catch (error) {
    await metadataStore.dispose();
    throw error;
  }
}
