import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldAuthoringService, WorldRuntimeService } from '@neko/world-domain/application';
import { createWorldAuthoringFileRepository } from './world-authoring-file-repository';
import {
  createPersistentWorldRuntimeRepositories,
  initializeWorldRuntimePersistenceTables,
} from './world-persistent-repository';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('World runtime repositories', () => {
  it('constructs runtime-only persistence without creating or reading authoring tables', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-world-runtime-'));
    roots.push(root);
    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    await initializeWorldRuntimePersistenceTables(store);
    const repositories = createPersistentWorldRuntimeRepositories({
      metadataStore: store,
      publications: { readPublication: vi.fn(async () => undefined) },
    });

    expect('saveProject' in repositories.runtime).toBe(false);
    await expect(repositories.catalog.readRuntimeCatalog()).resolves.toEqual({
      runtimes: [],
      diagnostics: [],
    });
    const tableNames = await store.transaction(
      { mode: 'read', ownership: 'state', operation: 'inspect-world-runtime-tables' },
      async ({ sql }) =>
        (await sql.all(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)).map(
          (row) => row['name'],
        ),
    );
    expect(tableNames).not.toContain('world_projects');
    expect(tableNames).toContain('world_runtime_aggregates');
    await store.dispose();
  });

  it('retains an exact WorldRun and Save after the authoring root is unloaded', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-world-runtime-unload-'));
    roots.push(root);
    const libraryRoot = join(root, 'library');
    await mkdir(libraryRoot, { recursive: true });
    const store = createNodeSqliteLocalMetadataStore({ homedir: root });
    await store.open({ databasePath: join(root, '.neko', 'neko.db'), busyTimeoutMs: 1_000 });
    await initializeWorldRuntimePersistenceTables(store);
    const authoringRepository = createWorldAuthoringFileRepository({
      workspaceRoot: libraryRoot,
      scope: { kind: 'project', projectId: 'project-runtime' },
    });
    const authoring = new WorldAuthoringService({
      repository: authoringRepository,
      now: () => '2026-08-11T00:00:00.000Z',
    });
    await authoring.createProject({
      worldProjectId: 'world-project-runtime',
      title: 'Archive City',
      draft: worldDefinition(),
    });
    await authoring.setReviewStatus({
      worldProjectId: 'world-project-runtime',
      reviewStatus: 'ready',
    });
    const publication = await authoring.publish({
      worldProjectId: 'world-project-runtime',
      worldVersionId: 'world-version-runtime',
      label: 'Opening',
    });
    const repositories = createPersistentWorldRuntimeRepositories({
      metadataStore: store,
      publications: authoringRepository,
    });
    const runtime = new WorldRuntimeService({
      repository: repositories.runtime,
      actionHandlers: [],
      now: () => '2026-08-11T00:00:00.000Z',
    });
    await runtime.createRun({
      worldVersionId: publication.worldVersionId,
      worldRunId: 'world-run-runtime',
      worldSaveId: 'world-save-runtime',
      branchId: 'branch-main',
      saveLabel: 'Opening',
    });

    await rm(libraryRoot, { recursive: true, force: true });
    await expect(repositories.runtime.readRuntime('world-run-runtime')).resolves.toMatchObject({
      publication: { worldVersionId: publication.worldVersionId },
      run: { worldRunId: 'world-run-runtime', branchId: 'branch-main' },
      save: { worldSaveId: 'world-save-runtime', activeBranchId: 'branch-main' },
    });
    await store.dispose();
  });
});

function worldDefinition() {
  return {
    background: 'An archive city.',
    worldBook: [],
    locations: [],
    organizations: [],
    rules: [],
    initialFacts: [],
  };
}
