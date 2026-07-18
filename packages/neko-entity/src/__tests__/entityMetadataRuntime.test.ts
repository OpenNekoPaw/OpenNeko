import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveGlobalStorageLayout,
  type EntityAssetProjectionReplaceSourceRequest,
} from '@neko/shared';
import { createNodeSqliteLocalMetadataStore } from '@neko/shared/local-metadata/node-sqlite-local-metadata-store';
import {
  ENTITY_ASSET_PROJECTION_MIGRATIONS,
  M1_LOCAL_METADATA_MIGRATIONS,
} from '@neko/shared/local-metadata/sqlite';
import { createVSCodeEntityRuntime } from '../host-vscode';

const temporaryDirectories: string[] = [];
const partition = {
  scope: 'workspace' as const,
  workspaceId: '36967dfd-e6db-4bce-bf37-4db2ebd5371d',
  domain: 'entity-asset-projection',
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('VS Code Entity metadata runtime', () => {
  it('reads confirmed Entity facts from project files after the SQLite projection is cleared', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-entity-file-authority-'));
    temporaryDirectories.push(homedir);
    const projectRoot = join(homedir, 'workspace');
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: partition.workspaceId },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T08:00:00.000Z',
    });
    const runtime = createVSCodeEntityRuntime({
      projectRoot,
      projection: {
        partition,
        repository: store.repositories.entityAssetProjections,
      },
    });

    await runtime.service.createEntity({
      id: 'char-rin',
      kind: 'character',
      canonicalName: 'Rin',
      aliases: ['凛'],
    });
    await runtime.service.upsertBinding({
      id: 'binding-rin-portrait',
      entityId: 'char-rin',
      entityKind: 'character',
      assetRef: 'project://assets/rin-portrait',
      role: 'portrait',
      isDefault: true,
      status: 'confirmed',
      availability: 'active',
      source: 'user',
      updatedAt: '2026-07-13T08:01:00.000Z',
    });
    await runtime.service.upsertRequirement({
      id: 'requirement-rin-live2d',
      entityId: 'char-rin',
      entityKind: 'character',
      source: 'story',
      sourceRef: 'story/main.fountain:12',
      requiredKinds: ['live2d'],
      status: 'missing',
    });
    await runtime.service.upsertVisualDraft({
      id: 'draft-rin-default',
      characterId: 'char-rin',
      source: 'agent',
      prompt: 'Rin character turnaround',
      generatedAssetIds: ['generated-rin-01'],
      status: 'selected',
    });
    await runtime.flushProjection();

    await expect(store.repositories.entityAssetProjections.list({ partition })).resolves.toEqual([
      expect.objectContaining({
        kind: 'binding-availability',
        entityId: 'char-rin',
        assetRef: 'project://assets/rin-portrait',
      }),
    ]);
    await store.repositories.cacheMaintenance.clearPartition({
      table: 'entity_asset_projections',
      partition,
      reason: 'rebuild',
      updatedAt: '2026-07-13T08:02:00.000Z',
    });
    await expect(store.repositories.entityAssetProjections.list({ partition })).resolves.toEqual(
      [],
    );
    runtime.dispose();
    await store.dispose();

    const reopened = createVSCodeEntityRuntime({ projectRoot });
    await expect(reopened.service.get('char-rin')).resolves.toMatchObject({
      id: 'char-rin',
      canonicalName: 'Rin',
      aliases: ['凛'],
      status: 'confirmed',
    });
    await expect(reopened.service.bindings.list()).resolves.toEqual([
      expect.objectContaining({ id: 'binding-rin-portrait', entityId: 'char-rin' }),
    ]);
    await expect(reopened.service.requirements.list()).resolves.toEqual([
      expect.objectContaining({ id: 'requirement-rin-live2d', status: 'missing' }),
    ]);
    await expect(reopened.service.drafts.list()).resolves.toEqual([
      expect.objectContaining({ id: 'draft-rin-default', status: 'selected' }),
    ]);
    reopened.dispose();
  });

  it('refreshes projections after fact changes', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'neko-entity-projection-runtime-'));
    temporaryDirectories.push(projectRoot);
    const requests: EntityAssetProjectionReplaceSourceRequest[] = [];
    const runtime = createVSCodeEntityRuntime({
      projectRoot,
      projection: {
        partition,
        repository: {
          list: async () => [],
          replaceSource: async (request) => {
            requests.push(request);
          },
          insertMissing: async () => ({
            insertedProjectionKeys: [],
            preservedProjectionKeys: [],
          }),
        },
      },
    });
    await runtime.flushProjection();

    await runtime.service.proposeCandidate({
      id: 'candidate:rin',
      kind: 'character',
      name: 'Rin',
      provenance: [{ providerId: 'story', sourceKind: 'story' }],
    });
    await runtime.flushProjection();

    expect(requests.at(-1)?.records).toEqual([
      expect.objectContaining({
        kind: 'entity-candidate',
        candidateId: 'candidate:rin',
      }),
    ]);
    runtime.dispose();
  });

  it('marks the cache projection stale without failing the Entity runtime', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'neko-entity-projection-stale-'));
    temporaryDirectories.push(projectRoot);
    const markStale = vi.fn(async () => undefined);
    const runtime = createVSCodeEntityRuntime({
      projectRoot,
      projection: {
        partition,
        repository: {
          list: async () => [],
          replaceSource: async () => {
            throw new Error('projection unavailable');
          },
          insertMissing: async () => ({
            insertedProjectionKeys: [],
            preservedProjectionKeys: [],
          }),
        },
        markStale,
      },
    });

    await expect(runtime.flushProjection()).resolves.toBeUndefined();
    expect(markStale).toHaveBeenCalledWith(
      'entity-fact-projection-refresh-failed',
      expect.any(String),
    );
    runtime.dispose();
  });
});
