import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { LocalMetadataRepositories, LocalMetadataStore } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import { resolveNodeWorkspaceIdentity } from '@neko/local-metadata/node-workspace-identity';
import {
  AGENT_STATE_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
  MEDIA_METADATA_MIGRATIONS,
} from '@neko/local-metadata/sqlite';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import { PathResolver } from '@neko/shared/path';

export interface DesktopWorkspaceRegistry {
  readonly metadataRepositories?: LocalMetadataRepositories;
  resolve(workspacePath: string): Promise<AssetWorkspaceResolution>;
  restore?(workspaceId: string): Promise<AssetWorkspaceResolution>;
  dispose(): Promise<void>;
}

export async function createDesktopWorkspaceRegistry(options: {
  readonly homedir: string;
  readonly metadataStore?: LocalMetadataStore;
}): Promise<DesktopWorkspaceRegistry> {
  const homedir = path.resolve(options.homedir);
  const metadataStore = options.metadataStore ?? createNodeSqliteLocalMetadataStore({ homedir });
  await metadataStore.open({
    databasePath: resolveGlobalStorageLayout(homedir).database,
    busyTimeoutMs: 2_000,
  });
  await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
  await metadataStore.migrateNamespace(AGENT_STATE_MIGRATIONS);
  await metadataStore.migrateNamespace(MEDIA_METADATA_MIGRATIONS);
  return new NodeDesktopWorkspaceRegistry(homedir, metadataStore);
}

class NodeDesktopWorkspaceRegistry implements DesktopWorkspaceRegistry {
  private disposed = false;

  constructor(
    private readonly homedir: string,
    private readonly metadataStore: LocalMetadataStore,
  ) {}

  get metadataRepositories(): LocalMetadataRepositories {
    return this.metadataStore.repositories;
  }

  async resolve(workspacePath: string): Promise<AssetWorkspaceResolution> {
    this.requireActive();
    const absolutePath = path.resolve(workspacePath);
    const workspaceStat = await stat(absolutePath);
    if (!workspaceStat.isDirectory()) {
      throw new Error(`Desktop Content workspace is not a directory: '${absolutePath}'.`);
    }
    const resolution = await resolveNodeWorkspaceIdentity({
      workspaceRoot: absolutePath,
      homedir: this.homedir,
      metadataStore: this.metadataStore,
    });
    return {
      workspaceId: resolution.identity.workspaceId,
      workspacePath: absolutePath,
      displayName: path.basename(absolutePath),
      locator: resolution.locator,
    };
  }

  async restore(workspaceId: string): Promise<AssetWorkspaceResolution> {
    this.requireActive();
    const record = await this.metadataStore.repositories.workspaces.get(workspaceId);
    if (!record) {
      throw new Error(`Persisted Workspace '${workspaceId}' is not registered.`);
    }
    const locator = record.currentLocator;
    const workspacePath =
      locator.kind === 'variable'
        ? new PathResolver(new Map([['HOME', this.homedir]])).resolve(locator.value)
        : path.resolve(this.homedir, locator.value);
    if (!path.isAbsolute(workspacePath) || workspacePath.includes('${')) {
      throw new Error(`Persisted Workspace '${workspaceId}' locator cannot be resolved.`);
    }
    const resolution = await this.resolve(workspacePath);
    if (resolution.workspaceId !== workspaceId) {
      throw new Error(`Persisted Workspace '${workspaceId}' resolved to another identity.`);
    }
    return resolution;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    await this.metadataStore.dispose();
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop workspace registry is disposed.');
  }
}
