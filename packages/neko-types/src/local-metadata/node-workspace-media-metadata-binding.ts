import { PathResolver, type PathVariableMap } from '../path';
import { resolveGlobalStorageLayout, resolveStorageLayout } from '../types/storage';
import { createNodeSqliteLocalMetadataStore } from './node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from './node-workspace-identity';
import {
  migrateLegacyMediaMetadata,
  type MediaMetadataMigrationReport,
} from './node-media-metadata-migration';
import type { LocalMetadataPartition } from './model';
import type { MediaMetadataRepository } from './repositories';
import { M1_LOCAL_METADATA_MIGRATIONS, MEDIA_METADATA_MIGRATIONS } from './sqlite';

export interface NodeWorkspaceMediaMetadataBinding {
  readonly workspaceId: string;
  readonly repository: MediaMetadataRepository;
  readonly partition: LocalMetadataPartition;
  readonly migrationReport: MediaMetadataMigrationReport;
  dispose(): Promise<void>;
}

export async function createNodeWorkspaceMediaMetadataBinding(options: {
  readonly homedir: string;
  readonly workDir: string;
  readonly pathVariables?: ReadonlyMap<string, string>;
  readonly createWorkspaceId?: () => string;
  readonly now?: () => string;
}): Promise<NodeWorkspaceMediaMetadataBinding> {
  const metadataStore = createNodeSqliteLocalMetadataStore({ homedir: options.homedir });
  try {
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(options.homedir).database,
      busyTimeoutMs: 2_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(MEDIA_METADATA_MIGRATIONS);
    const identityResolution = await resolveNodeWorkspaceIdentity({
      workspaceRoot: options.workDir,
      homedir: options.homedir,
      metadataStore,
      ...(options.createWorkspaceId ? { createWorkspaceId: options.createWorkspaceId } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
    const identity = identityResolution.identity;
    const pathResolver = new PathResolver(createPathVariables(options));
    const partition: LocalMetadataPartition = {
      scope: 'workspace',
      workspaceId: identity.workspaceId,
      domain: 'media-metadata',
    };
    const layout = resolveStorageLayout(options.workDir, options.homedir);
    const migrationReport = await migrateLegacyMediaMetadata({
      cachePath: layout.project.local.cache.mediaMetadata,
      metadataStore,
      partition,
      pathResolver,
      ...(options.now ? { now: options.now } : {}),
    });
    return {
      workspaceId: identity.workspaceId,
      repository: metadataStore.repositories.mediaMetadata,
      partition,
      migrationReport,
      dispose: () => metadataStore.dispose(),
    };
  } catch (error) {
    await metadataStore.dispose();
    throw error;
  }
}

function createPathVariables(options: {
  readonly homedir: string;
  readonly workDir: string;
  readonly pathVariables?: ReadonlyMap<string, string>;
}): PathVariableMap {
  const variables = new Map(options.pathVariables);
  variables.set('HOME', normalizePath(options.homedir));
  variables.set('WORKSPACE', normalizePath(options.workDir));
  return variables;
}

function normalizePath(value: string): string {
  const normalized = value.replace(/\\/gu, '/');
  return normalized.length > 1 ? normalized.replace(/\/+$/u, '') : normalized;
}
