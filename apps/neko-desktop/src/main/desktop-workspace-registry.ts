import { stat } from 'node:fs/promises';
import * as path from 'node:path';
import type { LocalMetadataRepositories, LocalMetadataStore } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import {
  createNodeWorkspaceIdentityFilePort,
  resolveNodeWorkspaceIdentity,
} from '@neko/local-metadata/node-workspace-identity';
import {
  initializeAgentStateTables,
  initializeCoreLocalMetadataTables,
  initializeProjectEntityProjectionTables,
  initializeMediaMetadataTables,
  initializeSearchProjectionTables,
} from '@neko/local-metadata/sqlite';
import {
  parseWorkspaceIdentityJson,
  resolveGlobalStorageLayout,
  WORKSPACE_IDENTITY_RELATIVE_PATH,
} from '@neko/local-metadata';
import type { AssetWorkspaceResolution } from '@neko/assets-domain/contracts';
import type { DesktopProjectCatalogItem } from '@neko/host/desktop-shell-contract';
import { PathResolver } from '@neko/shared/path';

export interface DesktopWorkspaceRegistry {
  readonly metadataRepositories?: LocalMetadataRepositories;
  listProjects(
    excludedWorkspaceIds?: readonly string[],
  ): Promise<readonly DesktopProjectCatalogItem[]>;
  removeProjects(workspaceIds: readonly string[]): Promise<boolean>;
  resolve(workspacePath: string): Promise<AssetWorkspaceResolution>;
  restore?(workspaceId: string): Promise<AssetWorkspaceResolution>;
  dispose(): Promise<void>;
}

export function createRestoringDesktopWorkspaceResolver(
  registry: DesktopWorkspaceRegistry,
  restoreWorkspace: (workspace: AssetWorkspaceResolution) => Promise<void>,
): Pick<DesktopWorkspaceRegistry, 'resolve' | 'restore'> {
  const restoreResolvedWorkspace = async (
    workspace: AssetWorkspaceResolution,
  ): Promise<AssetWorkspaceResolution> => {
    await restoreWorkspace(workspace);
    return workspace;
  };
  return {
    resolve: async (workspacePath) =>
      restoreResolvedWorkspace(await registry.resolve(workspacePath)),
    restore: async (workspaceId) => {
      if (!registry.restore) {
        throw new Error('Desktop Workspace registry does not support persisted restore.');
      }
      return restoreResolvedWorkspace(await registry.restore(workspaceId));
    },
  };
}

export async function createDesktopWorkspaceRegistry(options: {
  readonly homedir: string;
  readonly metadataStore?: LocalMetadataStore;
}): Promise<DesktopWorkspaceRegistry> {
  const homedir = path.resolve(options.homedir);
  const ownsMetadataStore = options.metadataStore === undefined;
  const metadataStore = options.metadataStore ?? createNodeSqliteLocalMetadataStore({ homedir });
  const databasePath = resolveGlobalStorageLayout(homedir).database;
  if (metadataStore.state === 'closed') {
    await metadataStore.open({
      databasePath,
      busyTimeoutMs: 2_000,
    });
  } else if (metadataStore.state !== 'open') {
    throw new Error('Desktop workspace registry requires an open local metadata Store.');
  }
  await initializeCoreLocalMetadataTables(metadataStore);
  await initializeAgentStateTables(metadataStore);
  await initializeMediaMetadataTables(metadataStore);
  await initializeSearchProjectionTables(metadataStore);
  await initializeProjectEntityProjectionTables(metadataStore);
  return new NodeDesktopWorkspaceRegistry(homedir, metadataStore, ownsMetadataStore);
}

class NodeDesktopWorkspaceRegistry implements DesktopWorkspaceRegistry {
  private disposed = false;

  constructor(
    private readonly homedir: string,
    private readonly metadataStore: LocalMetadataStore,
    private readonly ownsMetadataStore: boolean,
  ) {}

  get metadataRepositories(): LocalMetadataRepositories {
    return this.metadataStore.repositories;
  }

  async listProjects(
    excludedWorkspaceIds: readonly string[] = [],
  ): Promise<readonly DesktopProjectCatalogItem[]> {
    this.requireActive();
    const excluded = new Set(excludedWorkspaceIds);
    const records = await this.metadataStore.repositories.workspaces.listAll();
    return Promise.all(
      records
        .flatMap((record) => (excluded.has(record.workspaceId) ? [] : [record]))
        .map(async (record): Promise<DesktopProjectCatalogItem> => {
          let workspacePath: string | undefined;
          const unavailableFieldNames: string[] = [];
          const unavailableMessages: string[] = [];
          try {
            workspacePath = this.resolveWorkspacePath(record.currentLocator);
            const workspaceStat = await stat(workspacePath);
            if (!workspaceStat.isDirectory()) {
              unavailableFieldNames.push('currentLocator');
              unavailableMessages.push('Workspace locator does not resolve to a directory.');
            }
          } catch (error: unknown) {
            unavailableFieldNames.push('currentLocator');
            unavailableMessages.push(error instanceof Error ? error.message : String(error));
          }
          if (workspacePath && unavailableFieldNames.length === 0) {
            try {
              const identitySource = await createNodeWorkspaceIdentityFilePort().readFileIfExists(
                path.join(workspacePath, WORKSPACE_IDENTITY_RELATIVE_PATH),
              );
              if (identitySource === null) {
                throw new Error(`Project identity is missing at ${record.currentLocator.value}.`);
              }
              const identity = parseWorkspaceIdentityJson(identitySource);
              if (identity.workspaceId !== record.workspaceId) {
                throw new Error(
                  `Project identity '${identity.workspaceId}' does not match registered Workspace '${record.workspaceId}'.`,
                );
              }
            } catch (error: unknown) {
              unavailableFieldNames.push('identity');
              unavailableMessages.push(error instanceof Error ? error.message : String(error));
            }
          }
          if (record.orphanedAt !== null) {
            unavailableFieldNames.push('orphanedAt');
            unavailableMessages.push(`Workspace was marked unavailable at ${record.orphanedAt}.`);
          }
          const unavailable =
            unavailableFieldNames.length === 0
              ? undefined
              : {
                  fieldNames: unavailableFieldNames,
                  message: unavailableMessages.join(' '),
                };
          return {
            projectId: `content:${record.workspaceId}`,
            workspaceId: record.workspaceId,
            profile: 'content',
            displayName: workspacePath ? path.basename(workspacePath) : record.workspaceId,
            createdAt: record.lastSeenAt,
            updatedAt: record.lastSeenAt,
            ...(unavailable ? { unavailable } : {}),
          };
        }),
    );
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

  async removeProjects(workspaceIds: readonly string[]): Promise<boolean> {
    this.requireActive();
    return this.metadataStore.transaction(
      {
        mode: 'state-write',
        ownership: 'state',
        operation: 'remove-desktop-workspace-projects',
      },
      async ({ repositories }) => {
        const records = await Promise.all(
          workspaceIds.map((workspaceId) => repositories.workspaces.get(workspaceId)),
        );
        if (records.some((record) => record === null)) return false;
        const removed = await Promise.all(
          workspaceIds.map((workspaceId) => repositories.workspaces.remove(workspaceId)),
        );
        if (!removed.every(Boolean)) {
          throw new Error('Validated Desktop Workspace batch removal did not remove every record.');
        }
        return true;
      },
    );
  }

  async restore(workspaceId: string): Promise<AssetWorkspaceResolution> {
    this.requireActive();
    const record = await this.metadataStore.repositories.workspaces.get(workspaceId);
    if (!record) {
      throw new Error(`Persisted Workspace '${workspaceId}' is not registered.`);
    }
    const workspacePath = this.resolveWorkspacePath(record.currentLocator);
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
    if (this.ownsMetadataStore) await this.metadataStore.dispose();
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Desktop workspace registry is disposed.');
  }

  private resolveWorkspacePath(locator: {
    readonly kind: 'relative' | 'variable';
    readonly value: string;
  }): string {
    return locator.kind === 'variable'
      ? new PathResolver(new Map([['HOME', this.homedir]])).resolve(locator.value)
      : path.resolve(this.homedir, locator.value);
  }
}
