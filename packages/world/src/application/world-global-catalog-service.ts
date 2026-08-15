import {
  parseGlobalWorld,
  parseGlobalWorldCatalog,
  parseGlobalWorldVersion,
  parseWorldProject,
  parseWorldWorkspaceGlobalLink,
  type GlobalWorld,
  type GlobalWorldCatalog,
  type GlobalWorldVersion,
  type WorldDefinition,
  type WorldProject,
  type WorldWorkspaceGlobalLink,
} from '@neko/world/contracts';

export interface WorldGlobalCatalogRepository {
  readCatalog(signal?: AbortSignal): Promise<GlobalWorldCatalog>;
  commitCatalog(
    input: {
      readonly expectedCurrentWorldVersionId?: string;
      readonly world: GlobalWorld;
      readonly version: GlobalWorldVersion;
      readonly link: WorldWorkspaceGlobalLink;
    },
    signal?: AbortSignal,
  ): Promise<void>;
  commitGlobalCatalog(
    input: {
      readonly expectedCurrentWorldVersionId?: string;
      readonly world: GlobalWorld;
      readonly version: GlobalWorldVersion;
    },
    signal?: AbortSignal,
  ): Promise<void>;
}

export interface WorldWorkspaceProjectReader {
  readProject(worldProjectId: string, signal?: AbortSignal): Promise<WorldProject | undefined>;
}

export type SynchronizeWorldConflictChoice = 'base-on-current' | 'save-as-new';

export interface SynchronizeWorldInput {
  readonly worldProjectId: string;
  readonly globalWorldId: string;
  readonly worldVersionId: string;
  readonly label: string;
  readonly lastSyncedWorldVersionId?: string;
  readonly conflictChoice?: SynchronizeWorldConflictChoice;
}

export interface WorldSynchronizationReceipt {
  readonly globalWorld: GlobalWorld;
  readonly worldVersion: GlobalWorldVersion;
  readonly link: WorldWorkspaceGlobalLink;
}

export interface CreateGlobalWorldInput {
  readonly globalWorldId: string;
  readonly worldVersionId: string;
  readonly title: string;
  readonly label: string;
  readonly definition: WorldDefinition;
  readonly acceptedSourceRefIds?: readonly string[];
}

export interface PrepareWorldWorkspaceCopyInput {
  readonly globalWorldId: string;
  readonly worldVersionId: string;
  readonly worldProjectId: string;
}

export type ImportWorldGlobalVersionInput =
  | {
      readonly target: { readonly kind: 'new'; readonly globalWorldId: string };
      readonly title: string;
      readonly worldVersion: GlobalWorldVersion;
    }
  | {
      readonly target: {
        readonly kind: 'existing';
        readonly globalWorldId: string;
        readonly expectedCurrentWorldVersionId: string;
      };
      readonly title: string;
      readonly worldVersion: GlobalWorldVersion;
    };

export interface WorldGlobalImportReceipt {
  readonly globalWorld: GlobalWorld;
  readonly worldVersion: GlobalWorldVersion;
}

export class WorldGlobalCatalogError extends Error {
  constructor(
    readonly code:
      | 'world-workspace-object-unavailable'
      | 'global-world-already-exists'
      | 'global-world-unavailable'
      | 'global-world-stale-base'
      | 'global-world-version-conflict'
      | 'global-world-conflict-choice-invalid'
      | 'global-world-import-target-mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'WorldGlobalCatalogError';
  }
}

export class WorldGlobalCatalogService {
  private readonly now: () => string;

  constructor(
    private readonly ports: {
      readonly workspace?: WorldWorkspaceProjectReader;
      readonly repository: WorldGlobalCatalogRepository;
      readonly now?: () => string;
    },
  ) {
    this.now = ports.now ?? (() => new Date().toISOString());
  }

  async readCatalog(signal?: AbortSignal): Promise<GlobalWorldCatalog> {
    signal?.throwIfAborted();
    return parseGlobalWorldCatalog(await this.ports.repository.readCatalog(signal));
  }

  async synchronize(
    input: SynchronizeWorldInput,
    signal?: AbortSignal,
  ): Promise<WorldSynchronizationReceipt> {
    signal?.throwIfAborted();
    if (!this.ports.workspace) {
      throw new WorldGlobalCatalogError(
        'world-workspace-object-unavailable',
        'World synchronization requires an exact Project Workspace authority.',
      );
    }
    const project = await this.ports.workspace.readProject(input.worldProjectId, signal);
    if (!project) {
      throw new WorldGlobalCatalogError(
        'world-workspace-object-unavailable',
        `WorldProject '${input.worldProjectId}' is unavailable.`,
      );
    }
    const canonicalProject = parseWorldProject(project);
    const catalog = await this.readCatalog(signal);
    const existing = catalog.worlds.find((world) => world.globalWorldId === input.globalWorldId);
    const timestamp = this.now();
    const world = this.nextWorld(input, canonicalProject, existing, timestamp);
    if (catalog.versions.some((version) => version.worldVersionId === input.worldVersionId)) {
      throw new WorldGlobalCatalogError(
        'global-world-version-conflict',
        `WorldVersion '${input.worldVersionId}' already exists.`,
      );
    }
    const version = parseGlobalWorldVersion({
      worldVersionId: input.worldVersionId,
      globalWorldId: world.globalWorldId,
      label: input.label,
      definition: canonicalProject.draft,
      acceptedSourceRefIds: canonicalProject.sourceRefs.map((source) => source.sourceRefId),
      publishedAt: timestamp,
    });
    const link = parseWorldWorkspaceGlobalLink({
      worldProjectId: canonicalProject.worldProjectId,
      globalWorldId: world.globalWorldId,
      lastSyncedWorldVersionId: version.worldVersionId,
    });
    await this.ports.repository.commitCatalog(
      {
        ...(existing === undefined
          ? {}
          : { expectedCurrentWorldVersionId: existing.currentWorldVersionId }),
        world,
        version,
        link,
      },
      signal,
    );
    return structuredClone({ globalWorld: world, worldVersion: version, link });
  }

  async createGlobal(
    input: CreateGlobalWorldInput,
    signal?: AbortSignal,
  ): Promise<WorldGlobalImportReceipt> {
    signal?.throwIfAborted();
    const catalog = await this.readCatalog(signal);
    if (catalog.worlds.some((world) => world.globalWorldId === input.globalWorldId)) {
      throw new WorldGlobalCatalogError(
        'global-world-already-exists',
        `GlobalWorld '${input.globalWorldId}' already exists.`,
      );
    }
    if (catalog.versions.some((version) => version.worldVersionId === input.worldVersionId)) {
      throw new WorldGlobalCatalogError(
        'global-world-version-conflict',
        `WorldVersion '${input.worldVersionId}' already exists.`,
      );
    }
    const timestamp = this.now();
    const world = parseGlobalWorld({
      globalWorldId: input.globalWorldId,
      title: input.title,
      currentWorldVersionId: input.worldVersionId,
      worldVersionIds: [input.worldVersionId],
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const version = parseGlobalWorldVersion({
      worldVersionId: input.worldVersionId,
      globalWorldId: input.globalWorldId,
      label: input.label,
      definition: input.definition,
      acceptedSourceRefIds: input.acceptedSourceRefIds ?? [],
      publishedAt: timestamp,
    });
    await this.ports.repository.commitGlobalCatalog({ world, version }, signal);
    return structuredClone({ globalWorld: world, worldVersion: version });
  }

  async prepareWorkspaceCopy(
    input: PrepareWorldWorkspaceCopyInput,
    signal?: AbortSignal,
  ): Promise<WorldProject> {
    signal?.throwIfAborted();
    const catalog = await this.readCatalog(signal);
    const world = catalog.worlds.find(
      (candidate) => candidate.globalWorldId === input.globalWorldId,
    );
    const version = catalog.versions.find(
      (candidate) => candidate.worldVersionId === input.worldVersionId,
    );
    if (
      !world?.worldVersionIds.includes(input.worldVersionId) ||
      version?.globalWorldId !== input.globalWorldId
    ) {
      throw new WorldGlobalCatalogError(
        'global-world-unavailable',
        `WorldVersion '${input.worldVersionId}' does not belong to exact GlobalWorld '${input.globalWorldId}'.`,
      );
    }
    const timestamp = this.now();
    return parseWorldProject({
      worldProjectId: input.worldProjectId,
      title: world.title,
      draft: version.definition,
      sourceRefs: [],
      reviewStatus: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  async importVersion(
    input: ImportWorldGlobalVersionInput,
    signal?: AbortSignal,
  ): Promise<WorldGlobalImportReceipt> {
    signal?.throwIfAborted();
    const version = parseGlobalWorldVersion(input.worldVersion);
    const catalog = await this.readCatalog(signal);
    if (catalog.versions.some((candidate) => candidate.worldVersionId === version.worldVersionId)) {
      throw new WorldGlobalCatalogError(
        'global-world-version-conflict',
        `WorldVersion '${version.worldVersionId}' already exists.`,
      );
    }
    const timestamp = this.now();
    const existing = catalog.worlds.find(
      (world) => world.globalWorldId === input.target.globalWorldId,
    );
    let world: GlobalWorld;
    if (input.target.kind === 'new') {
      if (existing) {
        throw new WorldGlobalCatalogError(
          'global-world-already-exists',
          `GlobalWorld '${input.target.globalWorldId}' already exists.`,
        );
      }
      world = parseGlobalWorld({
        globalWorldId: input.target.globalWorldId,
        title: input.title,
        currentWorldVersionId: version.worldVersionId,
        worldVersionIds: [version.worldVersionId],
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } else {
      if (
        !existing ||
        existing.currentWorldVersionId !== input.target.expectedCurrentWorldVersionId
      ) {
        throw new WorldGlobalCatalogError(
          'global-world-import-target-mismatch',
          `GlobalWorld '${input.target.globalWorldId}' does not match the confirmed current version.`,
        );
      }
      world = parseGlobalWorld({
        ...existing,
        title: input.title,
        currentWorldVersionId: version.worldVersionId,
        worldVersionIds: [...existing.worldVersionIds, version.worldVersionId],
        updatedAt: timestamp,
      });
    }
    await this.ports.repository.commitGlobalCatalog(
      {
        ...(input.target.kind === 'existing'
          ? { expectedCurrentWorldVersionId: input.target.expectedCurrentWorldVersionId }
          : {}),
        world,
        version,
      },
      signal,
    );
    return structuredClone({ globalWorld: world, worldVersion: version });
  }

  private nextWorld(
    input: SynchronizeWorldInput,
    project: WorldProject,
    existing: GlobalWorld | undefined,
    timestamp: string,
  ): GlobalWorld {
    if (!existing) {
      if (input.lastSyncedWorldVersionId !== undefined) {
        throw new WorldGlobalCatalogError(
          'global-world-unavailable',
          `GlobalWorld '${input.globalWorldId}' is unavailable.`,
        );
      }
      return parseGlobalWorld({
        globalWorldId: input.globalWorldId,
        title: project.title,
        currentWorldVersionId: input.worldVersionId,
        worldVersionIds: [input.worldVersionId],
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    if (input.lastSyncedWorldVersionId === undefined) {
      throw new WorldGlobalCatalogError(
        'global-world-already-exists',
        `GlobalWorld '${existing.globalWorldId}' already exists.`,
      );
    }
    const stale = input.lastSyncedWorldVersionId !== existing.currentWorldVersionId;
    if (stale && input.conflictChoice === undefined) {
      throw new WorldGlobalCatalogError(
        'global-world-stale-base',
        `GlobalWorld '${existing.globalWorldId}' changed since WorldVersion '${input.lastSyncedWorldVersionId}'.`,
      );
    }
    if (stale && input.conflictChoice === 'save-as-new') {
      throw new WorldGlobalCatalogError(
        'global-world-conflict-choice-invalid',
        'Save as new requires a fresh GlobalWorld identity and no last-synchronized version.',
      );
    }
    return parseGlobalWorld({
      ...existing,
      title: project.title,
      currentWorldVersionId: input.worldVersionId,
      worldVersionIds: [...existing.worldVersionIds, input.worldVersionId],
      updatedAt: timestamp,
    });
  }
}
