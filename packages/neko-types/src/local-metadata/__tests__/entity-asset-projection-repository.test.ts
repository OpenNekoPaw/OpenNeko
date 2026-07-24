import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '../../types/storage';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import { migrateLegacyAssetGraph } from '../node-entity-asset-projection-migration';
import { ENTITY_ASSET_PROJECTION_MIGRATIONS, M1_LOCAL_METADATA_MIGRATIONS } from '../sqlite';

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
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS);
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

  it('round-trips typed projections and supports entity and asset reverse lookup', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-entity-asset-projection-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS);
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
            id: 'candidate:rin-alt',
            kind: 'character',
            name: 'Rin alt',
            status: 'open',
            identityBasis: 'user-named',
            provenance: [{ providerId: 'story', sourceKind: 'story' }],
            sourceRefs: [],
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
            status: 'confirmed',
            availability: 'active',
            isDefault: true,
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
    ).resolves.toEqual([expect.objectContaining({ kind: 'asset-graph-edge' })]);
    await expect(
      store.repositories.entityAssetProjections.list({ partition, entityId: 'char_rin' }),
    ).resolves.toHaveLength(5);
    await expect(
      store.repositories.entityAssetProjections.list({
        partition,
        kinds: ['entity-candidate'],
      }),
    ).resolves.toEqual([
      expect.objectContaining({ candidateId: 'candidate:rin-alt', kind: 'entity-candidate' }),
    ]);
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
    await expect(
      store.repositories.entityAssetProjections.list({ partition }),
    ).resolves.toHaveLength(6);
    await expect(
      store.repositories.cacheMaintenance.clearPartition({
        table: 'entity_asset_projections',
        partition,
        reason: 'rebuild',
        updatedAt: '2026-07-13T07:30:00.000Z',
      }),
    ).resolves.toEqual({ deletedRows: 6 });
    await expect(store.repositories.entityAssetProjections.list({ partition })).resolves.toEqual(
      [],
    );
    await expect(store.readPartitionRevision(partition)).resolves.toMatchObject({
      freshness: 'stale',
      diagnostic: 'cache-cleared:rebuild',
    });

    await store.dispose();
  });

  it('backs up and archives a legacy asset graph without overwriting current projections', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-asset-graph-migration-'));
    temporaryDirectories.push(homedir);
    const assetGraphPath = join(homedir, 'workspace', '.neko', '.cache', 'asset-graph.json');
    await mkdir(join(homedir, 'workspace', '.neko', '.cache'), { recursive: true });
    await writeFile(
      assetGraphPath,
      JSON.stringify({
        version: 1,
        nodes: [
          { id: 'node:char-rin', kind: 'entity', refId: 'char_rin', label: 'Legacy Rin' },
          {
            id: 'asset:rin-portrait',
            kind: 'asset',
            refId: 'project://assets/rin.png',
            label: 'Rin portrait',
          },
        ],
        edges: [
          {
            from: 'node:char-rin',
            to: 'asset:rin-portrait',
            type: 'bound-to-representation',
            strength: 'confirmed',
          },
        ],
      }),
      'utf8',
    );
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS);
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
          value: {
            id: 'node:char-rin',
            kind: 'entity',
            refId: 'char_rin',
            label: 'Current Rin',
          },
          updatedAt: '2026-07-13T07:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T07:00:00.000Z',
    });

    const report = await migrateLegacyAssetGraph({
      assetGraphPath,
      partition,
      repository: store.repositories.entityAssetProjections,
      now: () => 1_752_364_800_000,
    });

    expect(report).toMatchObject({
      sourceStatus: 'migrated',
      discoveredCount: 3,
      importedCount: 2,
      preservedExistingCount: 1,
      verifiedCount: 3,
    });
    await expect(access(report.backupPath ?? '')).resolves.toBeUndefined();
    await expect(access(report.archivedPath ?? '')).resolves.toBeUndefined();
    await expect(access(assetGraphPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      store.repositories.entityAssetProjections.list({
        partition,
        kinds: ['asset-graph-node'],
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        projectionId: 'asset:rin-portrait',
        assetRef: 'project://assets/rin.png',
      }),
      expect.objectContaining({
        projectionId: 'node:char-rin',
        sourceId: 'entity-runtime',
        value: expect.objectContaining({ label: 'Current Rin' }),
      }),
    ]);

    await store.dispose();
  });

  it('backs up and quarantines a malformed legacy asset graph without initializing empty success', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-asset-graph-quarantine-'));
    temporaryDirectories.push(homedir);
    const assetGraphPath = join(homedir, 'workspace', '.neko', '.cache', 'asset-graph.json');
    await mkdir(join(homedir, 'workspace', '.neko', '.cache'), { recursive: true });
    await writeFile(assetGraphPath, '', 'utf8');
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(ENTITY_ASSET_PROJECTION_MIGRATIONS);
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

    const report = await migrateLegacyAssetGraph({
      assetGraphPath,
      partition,
      repository: store.repositories.entityAssetProjections,
      now: () => 1_752_364_800_000,
    });

    expect(report).toMatchObject({
      sourceStatus: 'quarantined',
      importedCount: 0,
      verifiedCount: 0,
      sourceDiagnostic: expect.stringContaining('Unexpected end of JSON input'),
    });
    await expect(access(report.backupPath ?? '')).resolves.toBeUndefined();
    await expect(access(report.quarantinePath ?? '')).resolves.toBeUndefined();
    await expect(access(assetGraphPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(store.repositories.entityAssetProjections.list({ partition })).resolves.toEqual(
      [],
    );

    await store.dispose();
  });
});
