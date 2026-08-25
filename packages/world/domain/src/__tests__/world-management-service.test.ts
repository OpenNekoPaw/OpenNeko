import { describe, expect, it } from 'vitest';
import type {
  GlobalWorldCatalog,
  GlobalWorldVersion,
  WorldRun,
  WorldSave,
} from '@neko/world-domain/contracts';
import type {
  WorldRuntimeCatalog,
  WorldRuntimeCatalogPort,
} from '../application/world-durable-catalog';
import { WorldManagementService } from '../application/world-management-service';

describe('WorldManagementService', () => {
  it('projects global objects, current versions and bounded runtime summaries', async () => {
    const version = worldVersion('world-version-a');
    const runtimes = [0, 1, 2, 3, 4].map((index) =>
      worldRuntime(version.worldVersionId, `run-${String(index)}`, index),
    );
    const management = createService(globalCatalog(version), { runtimes, diagnostics: [] });

    const catalog = await management.readCatalog({ search: '', sort: 'recently-updated' });
    expect(catalog.items).toEqual([
      expect.objectContaining({
        status: 'available',
        globalWorldId: 'global-world-a',
        currentWorldVersionId: 'world-version-a',
        versionCount: 1,
        runtimeCount: 5,
      }),
    ]);
    const detail = await management.readDetail('global-world-a');
    expect(detail.versions).toEqual([
      {
        worldProjectId: 'global-world-a',
        worldVersionId: 'world-version-a',
        label: 'v1',
        publishedAt: '2026-08-14T01:00:00.000Z',
        runtimeCount: 5,
        current: true,
      },
    ]);
    expect(detail.recentRuntimes).toHaveLength(4);
    expect(detail.recentRuntimes[0]?.worldRunId).toBe('run-4');
  });

  it('does not expose mutable Project or draft actions', () => {
    const management = createService(globalCatalog(worldVersion('world-version-a')), {
      runtimes: [],
      diagnostics: [],
    });
    expect(management).not.toHaveProperty('createHandoff');
    expect(management).not.toHaveProperty('createAuthoringReceipt');
    expect(management).not.toHaveProperty('createRuntimeLaunchReceipt');
  });
});

function createService(global: GlobalWorldCatalog, runtime: WorldRuntimeCatalog) {
  const runtimePort: WorldRuntimeCatalogPort = {
    async readRuntimeCatalog() {
      return structuredClone(runtime);
    },
  };
  return new WorldManagementService({
    globalCatalog: { readCatalog: async () => structuredClone(global) },
    runtime: runtimePort,
  });
}

function globalCatalog(version: GlobalWorldVersion): GlobalWorldCatalog {
  return {
    worlds: [
      {
        globalWorldId: 'global-world-a',
        title: 'Rain Station',
        currentWorldVersionId: version.worldVersionId,
        worldVersionIds: [version.worldVersionId],
        createdAt: '2026-08-12T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
    ],
    versions: [version],
    links: [],
    diagnostics: [],
  };
}

function worldVersion(worldVersionId: string): GlobalWorldVersion {
  return {
    worldVersionId,
    globalWorldId: 'global-world-a',
    label: 'v1',
    definition: {
      background: 'Published background',
      worldBook: [],
      locations: [],
      organizations: [],
      rules: [],
      initialFacts: [],
    },
    acceptedSourceRefIds: [],
    publishedAt: '2026-08-14T01:00:00.000Z',
  };
}

function worldRuntime(
  worldVersionId: string,
  worldRunId: string,
  index: number,
): { readonly run: WorldRun; readonly save: WorldSave } {
  const worldSaveId = `save-${String(index)}`;
  const branchId = `branch-${String(index)}`;
  return {
    run: {
      worldRunId,
      worldVersionId,
      worldSaveId,
      branchId,
      worldStateRevision: 0,
      timepoint: 0,
      createdAt: '2026-08-14T00:00:00.000Z',
    },
    save: {
      worldSaveId,
      worldRunId,
      worldVersionId,
      label: `Save ${String(index)}`,
      activeBranchId: branchId,
      branches: [
        {
          branchId,
          parentBranchId: undefined,
          forkedFromWorldEventId: undefined,
          events: [],
          state: {
            worldVersionId,
            worldRunId,
            worldSaveId,
            branchId,
            worldStateRevision: 0,
            timepoint: 0,
            facts: [],
          },
        },
      ],
      createdAt: '2026-08-14T00:00:00.000Z',
      updatedAt: `2026-08-14T0${String(index)}:00:00.000Z`,
    },
  };
}
