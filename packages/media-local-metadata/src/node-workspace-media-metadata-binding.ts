import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from '@neko/local-metadata/node-workspace-identity';
import type { LocalMetadataPartition } from '@neko/local-metadata';
import type { MediaMetadataRepository } from '@neko/local-metadata';
import {
  initializeCoreLocalMetadataTables,
  initializeMediaMetadataTables,
} from '@neko/local-metadata/sqlite';

export interface NodeWorkspaceMediaMetadataBinding {
  readonly workspaceId: string;
  readonly repository: MediaMetadataRepository;
  readonly partition: LocalMetadataPartition;
  dispose(): Promise<void>;
}

export async function createNodeWorkspaceMediaMetadataBinding(options: {
  readonly homedir: string;
  readonly workDir: string;
  readonly createWorkspaceId?: () => string;
  readonly now?: () => string;
}): Promise<NodeWorkspaceMediaMetadataBinding> {
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
  try {
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(options.homedir).database,
      busyTimeoutMs: 2_000,
    });
    await initializeCoreLocalMetadataTables(metadataStore);
    await initializeMediaMetadataTables(metadataStore);
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
      domain: 'media-metadata',
    };
    return {
      workspaceId: identity.workspaceId,
      repository: metadataStore.repositories.mediaMetadata,
      partition,
      dispose: () => metadataStore.dispose(),
    };
  } catch (error) {
    await metadataStore.dispose();
    throw error;
  }
}
