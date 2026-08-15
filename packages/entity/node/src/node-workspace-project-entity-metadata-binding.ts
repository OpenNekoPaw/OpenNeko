import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import type { LocalMetadataPartition } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from '@neko/local-metadata/node-workspace-identity';
import type { ProjectEntityProjectionRepository } from '@neko/entity-domain';
import {
  initializeProjectEntityProjectionTables,
  initializeCoreLocalMetadataTables,
} from '@neko/local-metadata/sqlite';

export interface NodeWorkspaceProjectEntityMetadataBinding {
  readonly workspaceId: string;
  readonly partition: LocalMetadataPartition;
  readonly repository: ProjectEntityProjectionRepository;
  dispose(): Promise<void>;
}

export async function createNodeWorkspaceProjectEntityMetadataBinding(options: {
  readonly homedir: string;
  readonly workDir: string;
  readonly createWorkspaceId?: () => string;
  readonly now?: () => string;
}): Promise<NodeWorkspaceProjectEntityMetadataBinding> {
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
  try {
    const databasePath = resolveGlobalStorageLayout(options.homedir).database;
    await metadataStore.open({
      databasePath,
      busyTimeoutMs: 2_000,
    });
    await initializeCoreLocalMetadataTables(metadataStore);
    await initializeProjectEntityProjectionTables(metadataStore);
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
      domain: 'project-entity-projection',
    };
    return {
      workspaceId: identity.workspaceId,
      partition,
      repository: metadataStore.repositories.projectEntityProjections,
      dispose: () => metadataStore.dispose(),
    };
  } catch (error) {
    await metadataStore.dispose();
    throw error;
  }
}
