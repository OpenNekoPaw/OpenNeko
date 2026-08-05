import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import {
  initializeEntityAssetProjectionTables,
  initializeCoreLocalMetadataTables,
} from '@neko/local-metadata/sqlite';

const temporaryDirectories: string[] = [];
const WORKSPACE_ID = '36967dfd-e6db-4bce-bf37-4db2ebd5371d';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Entity/Asset projection repository', () => {
  it('creates one typed projection table without graph, occurrence, or reverse-lookup tables', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-entity-asset-schema-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(store);
    await initializeEntityAssetProjectionTables(store);
    await store.dispose();

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const rows = database
      .prepare(
        `SELECT name FROM sqlite_schema
          WHERE type = 'table'
            AND (name LIKE 'entity_%' OR name LIKE 'asset_%' OR name LIKE '%occurrence%')
          ORDER BY name`,
      )
      .all();
    const names = rows.flatMap((row) => (typeof row['name'] === 'string' ? [row['name']] : []));
    database.close();

    expect(names).toEqual(['entity_asset_projections']);
  });

  it('reinitializes stable tables without deleting candidate or binding projections', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-entity-candidate-v2-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(store);
    await initializeEntityAssetProjectionTables(store);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'entity-asset-projection',
    };
    const updatedAt = '2026-07-13T07:00:00.000Z';
    await store.repositories.entityAssetProjections.replaceSource({
      partition,
      sourceId: 'asset-runtime',
      records: [
        {
          projectionId: 'node:asset-rin',
          kind: 'asset-graph-node',
          sourceId: 'asset-runtime',
          freshness: 'fresh',
          value: { id: 'node:asset-rin', kind: 'asset', refId: 'asset-rin' },
          updatedAt,
        },
      ],
      updatedAt,
    });
    await store.transaction(
      { mode: 'cache-write', ownership: 'cache', operation: 'seed-retired-candidate-row' },
      async ({ sql }) => {
        const rows = await sql.all(
          `SELECT partition_key, partition_scope, workspace_id
             FROM entity_asset_projections
            WHERE projection_id = ?`,
          ['node:asset-rin'],
        );
        const row = rows[0]!;
        const retiredValue = {
          projectionId: 'candidate:retired',
          kind: 'entity-candidate',
          sourceId: 'retired-candidate-runtime',
          candidateId: 'candidate:retired',
          freshness: 'fresh',
          value: {
            id: 'candidate:retired',
            kind: 'character',
            name: 'Retired',
            status: 'open',
            identityBasis: 'user-named',
            provenance: [],
            sourceRefs: [],
          },
          updatedAt,
        };
        await sql.run(
          `INSERT INTO entity_asset_projections (
             partition_key, partition_scope, workspace_id, projection_kind, projection_id,
             source_id, entity_id, related_entity_id, candidate_id, asset_ref, freshness,
             projection_json, updated_at
           ) VALUES (?, ?, ?, 'entity-candidate', ?, ?, NULL, NULL, ?, NULL, 'fresh', ?, ?)`,
          [
            String(row['partition_key']),
            String(row['partition_scope']),
            String(row['workspace_id']),
            retiredValue.projectionId,
            retiredValue.sourceId,
            retiredValue.candidateId,
            JSON.stringify(retiredValue),
            updatedAt,
          ],
        );
        const retiredBinding = {
          projectionId: 'binding:retired',
          kind: 'binding-availability',
          sourceId: 'retired-binding-runtime',
          entityId: 'character-retired',
          freshness: 'fresh',
          value: {
            bindingId: 'binding:retired',
            entityId: 'character-retired',
            entityKind: 'character',
            representation: { kind: 'workspace-file', path: 'retired.png' },
            role: 'portrait',
            status: 'confirmed',
            availability: 'active',
          },
          updatedAt,
        };
        await sql.run(
          `INSERT INTO entity_asset_projections (
             partition_key, partition_scope, workspace_id, projection_kind, projection_id,
             source_id, entity_id, related_entity_id, candidate_id, asset_ref, freshness,
             projection_json, updated_at
           ) VALUES (?, ?, ?, 'binding-availability', ?, ?, ?, NULL, NULL, NULL, 'fresh', ?, ?)`,
          [
            String(row['partition_key']),
            String(row['partition_scope']),
            String(row['workspace_id']),
            retiredBinding.projectionId,
            retiredBinding.sourceId,
            retiredBinding.entityId,
            JSON.stringify(retiredBinding),
            updatedAt,
          ],
        );
      },
    );

    await initializeEntityAssetProjectionTables(store);

    await expect(store.repositories.entityAssetProjections.list({ partition })).resolves.toEqual({
      records: [
        expect.objectContaining({ projectionId: 'node:asset-rin', kind: 'asset-graph-node' }),
      ],
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-entity-asset-projection',
          projectionId: 'candidate:retired',
        }),
        expect.objectContaining({
          code: 'invalid-entity-asset-projection',
          projectionId: 'binding:retired',
        }),
      ]),
    });
    await store.dispose();
  });

  it('round-trips typed projections and supports entity and asset reverse lookup', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-entity-asset-projection-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(store);
    await initializeEntityAssetProjectionTables(store);
    await store.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'entity-asset-projection',
    };
    const updatedAt = '2026-07-13T07:00:00.000Z';

    await store.repositories.entityAssetProjections.replaceSource({
      partition,
      sourceId: 'entity-runtime',
      records: [
        {
          projectionId: 'node:char-rin',
          kind: 'asset-graph-node',
          sourceId: 'entity-runtime',
          entityId: 'char_rin',
          freshness: 'fresh',
          value: { id: 'node:char-rin', kind: 'entity', refId: 'char_rin', label: 'Rin' },
          updatedAt,
        },
        {
          projectionId: 'edge:rin-portrait',
          kind: 'asset-graph-edge',
          sourceId: 'entity-runtime',
          entityId: 'char_rin',
          assetRef: 'project://assets/rin.png',
          freshness: 'fresh',
          value: {
            from: 'node:char-rin',
            to: 'asset:rin-portrait',
            type: 'bound-to-representation',
            strength: 'confirmed',
          },
          updatedAt,
        },
        {
          projectionId: 'occurrence:story:12',
          kind: 'entity-occurrence',
          sourceId: 'entity-runtime',
          entityId: 'char_rin',
          freshness: 'fresh',
          value: {
            entityRef: { entityId: 'char_rin', entityKind: 'character' },
            label: 'Rin',
            source: {
              sourceId: 'story-main',
              sourceKind: 'story',
              sourceRef: 'story/main.fountain:12',
              freshness: 'fresh',
            },
            role: 'reference',
            location: 'story/main.fountain:12',
          },
          updatedAt,
        },
        {
          projectionId: 'relationship:rin-city',
          kind: 'entity-relationship',
          sourceId: 'entity-runtime',
          entityId: 'char_rin',
          relatedEntityId: 'location_city',
          freshness: 'fresh',
          value: {
            from: { entityId: 'char_rin', entityKind: 'character' },
            to: { entityId: 'location_city', entityKind: 'location' },
            type: 'appears-in-scene',
            source: { sourceId: 'story-main', sourceKind: 'story', freshness: 'fresh' },
          },
          updatedAt,
        },
        {
          projectionId: 'candidate:rin-alt',
          kind: 'entity-candidate',
          sourceId: 'entity-runtime',
          candidateId: 'candidate:rin-alt',
          freshness: 'fresh',
          value: {
            candidateId: 'candidate:rin-alt',
            kind: 'character',
            proposedNames: { canonical: 'Rin alt', aliases: [] },
            freshness: 'fresh',
            evidence: [
              {
                evidenceId: 'evidence:rin-alt',
                owner: 'workspace',
                sourceId: 'entity-runtime',
              },
            ],
          },
          updatedAt,
        },
        {
          projectionId: 'binding:rin-portrait',
          kind: 'binding-availability',
          sourceId: 'entity-runtime',
          entityId: 'char_rin',
          freshness: 'fresh',
          value: {
            bindingId: 'binding:rin-portrait',
            entityId: 'char_rin',
            entityKind: 'character',
            representation: { kind: 'workspace-file', path: 'neko/assets/rin.png' },
            role: 'portrait',
            owner: 'workspace-file',
            availability: 'available',
            isDefault: true,
            checkedAt: updatedAt,
          },
          updatedAt,
        },
      ],
      updatedAt,
    });

    await expect(
      store.repositories.entityAssetProjections.list({
        partition,
        assetRef: 'project://assets/rin.png',
      }),
    ).resolves.toEqual({
      records: [expect.objectContaining({ kind: 'asset-graph-edge' })],
      diagnostics: [],
    });
    const entityResult = await store.repositories.entityAssetProjections.list({
      partition,
      entityId: 'char_rin',
    });
    expect(entityResult.records).toHaveLength(5);
    expect(entityResult.diagnostics).toEqual([]);
    await expect(
      store.repositories.entityAssetProjections.list({
        partition,
        kinds: ['entity-candidate'],
      }),
    ).resolves.toEqual({
      records: [
        expect.objectContaining({ candidateId: 'candidate:rin-alt', kind: 'entity-candidate' }),
      ],
      diagnostics: [],
    });
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({
      revision: 1,
      freshness: 'fresh',
    });
    await expect(
      store.repositories.entityAssetProjections.replaceSource({
        partition,
        sourceId: 'invalid-provider',
        records: [
          {
            projectionId: 'occurrence:absolute',
            kind: 'entity-occurrence',
            sourceId: 'invalid-provider',
            entityId: 'char_rin',
            freshness: 'fresh',
            value: {
              entityRef: { entityId: 'char_rin', entityKind: 'character' },
              label: 'Invalid absolute occurrence',
              source: { sourceId: 'invalid', sourceKind: 'story' },
              role: 'reference',
              location: '/tmp/story.fountain:12',
            },
            updatedAt,
          },
        ],
        updatedAt,
      }),
    ).rejects.toMatchObject({ code: 'metadata-transaction-failed' });
    const all = await store.repositories.entityAssetProjections.list({ partition });
    expect(all.records).toHaveLength(6);
    expect(all.diagnostics).toEqual([]);
    await expect(
      store.repositories.cacheMaintenance.clearPartition({
        table: 'entity_asset_projections',
        partition,
        reason: 'rebuild',
        updatedAt: '2026-07-13T07:30:00.000Z',
      }),
    ).resolves.toEqual({ deletedRows: 6 });
    await expect(store.repositories.entityAssetProjections.list({ partition })).resolves.toEqual({
      records: [],
      diagnostics: [],
    });
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({
      freshness: 'stale',
      diagnostic: 'cache-cleared:rebuild',
    });

    await store.dispose();
  });
});
