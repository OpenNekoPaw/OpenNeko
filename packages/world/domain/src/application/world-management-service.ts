import {
  parseWorldManagementCatalogProjection,
  parseWorldManagementDetailProjection,
  type GlobalWorldCatalog,
  type WorldManagementCatalogItem,
  type WorldManagementCatalogProjection,
  type WorldManagementCatalogQuery,
  type WorldManagementDetailProjection,
} from '@neko/world-domain/contracts';
import type { WorldRuntimeCatalogPort } from './world-durable-catalog';

const RECENT_RUNTIME_LIMIT = 4;

export interface WorldManagementGlobalCatalogPort {
  readCatalog(signal?: AbortSignal): Promise<GlobalWorldCatalog>;
}

export class WorldManagementError extends Error {
  constructor(
    readonly code: 'world-management-global-world-not-found',
    message: string,
  ) {
    super(message);
    this.name = 'WorldManagementError';
  }
}

export class WorldManagementService {
  constructor(
    private readonly options: {
      readonly globalCatalog: WorldManagementGlobalCatalogPort;
      readonly runtime: WorldRuntimeCatalogPort;
    },
  ) {}

  async readCatalog(
    query: WorldManagementCatalogQuery = { search: '', sort: 'recently-updated' },
    signal?: AbortSignal,
  ): Promise<WorldManagementCatalogProjection> {
    const { global, runtime } = await this.readSources(signal);
    const versions = new Map(global.versions.map((version) => [version.worldVersionId, version]));
    const normalizedSearch = query.search.trim().toLocaleLowerCase();
    const items: WorldManagementCatalogItem[] = global.worlds.map((world) => {
      const current = versions.get(world.currentWorldVersionId);
      if (!current) {
        return {
          status: 'invalid',
          globalWorldId: world.globalWorldId,
          message: `GlobalWorld '${world.globalWorldId}' current version is unavailable.`,
        };
      }
      const versionIds = new Set(world.worldVersionIds);
      return {
        status: 'available',
        globalWorldId: world.globalWorldId,
        title: world.title,
        summary: current.definition.background,
        currentWorldVersionId: world.currentWorldVersionId,
        updatedAt: world.updatedAt,
        versionCount: world.worldVersionIds.length,
        runtimeCount: runtime.runtimes.filter((item) => versionIds.has(item.run.worldVersionId))
          .length,
        runtimeEligible: true,
        attentionCount: global.diagnostics.filter(
          (diagnostic) =>
            diagnostic.recordId === world.globalWorldId ||
            (diagnostic.recordId !== undefined && versionIds.has(diagnostic.recordId)),
        ).length,
      };
    });
    return parseWorldManagementCatalogProjection({
      scope: { kind: 'global-catalog' },
      query,
      items: items
        .filter((item) =>
          normalizedSearch.length === 0
            ? true
            : item.status === 'available'
              ? `${item.title}\n${item.summary}`.toLocaleLowerCase().includes(normalizedSearch)
              : item.globalWorldId.toLocaleLowerCase().includes(normalizedSearch),
        )
        .sort((left, right) => compareCatalogItems(left, right, query.sort)),
      diagnostics: [
        ...global.diagnostics.map((diagnostic) => ({
          recordKind: diagnostic.recordKind,
          recordId: diagnostic.recordId ?? '<invalid-identity>',
          message: diagnostic.message,
        })),
        ...runtime.diagnostics,
      ],
    });
  }

  async readDetail(
    globalWorldId: string,
    signal?: AbortSignal,
  ): Promise<WorldManagementDetailProjection> {
    const { global, runtime } = await this.readSources(signal);
    const world = global.worlds.find((item) => item.globalWorldId === globalWorldId);
    if (!world) {
      throw new WorldManagementError(
        'world-management-global-world-not-found',
        `GlobalWorld '${globalWorldId}' is unavailable.`,
      );
    }
    const versions = world.worldVersionIds.map((worldVersionId) => {
      const version = global.versions.find((item) => item.worldVersionId === worldVersionId);
      if (!version) throw new Error(`WorldVersion '${worldVersionId}' is unavailable.`);
      return version;
    });
    const versionIds = new Set(world.worldVersionIds);
    const relatedRuntimes = runtime.runtimes
      .filter((item) => versionIds.has(item.run.worldVersionId))
      .sort((left, right) => right.save.updatedAt.localeCompare(left.save.updatedAt));
    const current = versions.find(
      (version) => version.worldVersionId === world.currentWorldVersionId,
    )!;
    return parseWorldManagementDetailProjection({
      globalWorldId: world.globalWorldId,
      title: world.title,
      summary: current.definition.background,
      currentWorldVersionId: world.currentWorldVersionId,
      createdAt: world.createdAt,
      updatedAt: world.updatedAt,
      versions: versions
        .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
        .map((version) => ({
          worldProjectId: version.globalWorldId,
          worldVersionId: version.worldVersionId,
          label: version.label,
          publishedAt: version.publishedAt,
          runtimeCount: relatedRuntimes.filter(
            (item) => item.run.worldVersionId === version.worldVersionId,
          ).length,
          current: version.worldVersionId === world.currentWorldVersionId,
        })),
      recentRuntimes: relatedRuntimes.slice(0, RECENT_RUNTIME_LIMIT).map(({ run, save }) => ({
        worldRunId: run.worldRunId,
        worldSaveId: save.worldSaveId,
        worldVersionId: run.worldVersionId,
        saveLabel: save.label,
        activeBranchId: save.activeBranchId,
        updatedAt: save.updatedAt,
      })),
      diagnostics: [
        ...global.diagnostics
          .filter(
            (diagnostic) =>
              diagnostic.recordId === world.globalWorldId ||
              (diagnostic.recordId !== undefined && versionIds.has(diagnostic.recordId)),
          )
          .map((diagnostic) => ({
            recordKind: diagnostic.recordKind,
            recordId: diagnostic.recordId ?? '<invalid-identity>',
            message: diagnostic.message,
          })),
        ...runtime.diagnostics.filter((diagnostic) =>
          relatedRuntimes.some((item) => item.run.worldRunId === diagnostic.recordId),
        ),
      ],
    });
  }

  private async readSources(signal?: AbortSignal) {
    signal?.throwIfAborted();
    const [global, runtime] = await Promise.all([
      this.options.globalCatalog.readCatalog(signal),
      this.options.runtime.readRuntimeCatalog(signal),
    ]);
    return { global, runtime };
  }
}

function compareCatalogItems(
  left: WorldManagementCatalogItem,
  right: WorldManagementCatalogItem,
  sort: WorldManagementCatalogQuery['sort'],
): number {
  if (left.status !== right.status) return left.status === 'available' ? -1 : 1;
  if (left.status === 'available' && right.status === 'available') {
    return sort === 'title'
      ? left.title.localeCompare(right.title) ||
          left.globalWorldId.localeCompare(right.globalWorldId)
      : right.updatedAt.localeCompare(left.updatedAt) ||
          left.globalWorldId.localeCompare(right.globalWorldId);
  }
  return left.globalWorldId.localeCompare(right.globalWorldId);
}
