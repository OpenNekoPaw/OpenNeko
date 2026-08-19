import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import {
  initializeProjectEntityProjectionTables,
  initializeCoreLocalMetadataTables,
} from '@neko/local-metadata/sqlite';

const temporaryDirectories: string[] = [];
const WORKSPACE_ID = '36967dfd-e6db-4bce-bf37-4db2ebd5371d';

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Project Entity projection repository', () => {
  it('creates one typed semantic projection table without legacy Entity Asset storage', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-project-entity-schema-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(store);
    await initializeProjectEntityProjectionTables(store);
    await store.dispose();

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const tables = database
      .prepare(
        `SELECT name FROM sqlite_schema
          WHERE type = 'table'
            AND (name LIKE '%entity%' OR name LIKE '%asset%')
          ORDER BY name`,
      )
      .all();
    const columns = database.prepare('PRAGMA table_info(project_entity_projections)').all();
    const schema = database
      .prepare(`SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?`)
      .get('project_entity_projections');
    database.close();

    expect(tables.map((row) => row['name'])).toContain('project_entity_projections');
    expect(tables.map((row) => row['name'])).not.toContain('entity_asset_projections');
    expect(columns.map((row) => row['name'])).not.toContain('asset_ref');
    expect(schema?.['sql']).not.toContain('asset-graph-node');
    expect(schema?.['sql']).not.toContain('asset-graph-edge');
  });

  it('reinitializes stable tables and isolates an invalid projection row', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-entity-stable-projections-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(store);
    await initializeProjectEntityProjectionTables(store);
    await store.repositories.workspaces.bind({
      identity: { workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'project-entity-projection',
    };
    const updatedAt = '2026-07-13T07:00:00.000Z';
    await store.repositories.projectEntityProjections.replaceSource({
      partition,
      sourceId: 'entity-runtime',
      records: [
        {
          projectionId: 'occurrence:story:12',
          kind: 'entity-occurrence',
          sourceId: 'entity-runtime',
          entityId: 'char_rin',
          freshness: 'fresh',
          value: {
            entityRef: { entityId: 'char_rin', entityKind: 'character' },
            label: 'Rin',
            source: { sourceId: 'story-main', sourceKind: 'story' },
            role: 'reference',
            location: 'story/main.fountain:12',
          },
          updatedAt,
        },
      ],
      updatedAt,
    });
    await store.transaction(
      { mode: 'cache-write', ownership: 'cache', operation: 'seed-invalid-projection-row' },
      async ({ sql }) => {
        const rows = await sql.all(
          `SELECT partition_key, partition_scope, workspace_id
             FROM project_entity_projections
            WHERE projection_id = ?`,
          ['occurrence:story:12'],
        );
        const row = rows[0]!;
        const invalidValue = {
          projectionId: 'projection:invalid',
          kind: 'entity-occurrence',
          sourceId: 'invalid-source',
          freshness: 'fresh',
          value: { unexpectedField: true },
          updatedAt,
        };
        await sql.run(
          `INSERT INTO project_entity_projections (
             partition_key, partition_scope, workspace_id, projection_kind, projection_id,
             source_id, entity_id, related_entity_id, candidate_id, freshness,
             projection_json, updated_at
           ) VALUES (?, ?, ?, 'entity-occurrence', ?, ?, NULL, NULL, NULL, 'fresh', ?, ?)`,
          [
            String(row['partition_key']),
            String(row['partition_scope']),
            String(row['workspace_id']),
            invalidValue.projectionId,
            invalidValue.sourceId,
            JSON.stringify(invalidValue),
            updatedAt,
          ],
        );
      },
    );

    await initializeProjectEntityProjectionTables(store);

    await expect(store.repositories.projectEntityProjections.list({ partition })).resolves.toEqual({
      records: [
        expect.objectContaining({
          projectionId: 'occurrence:story:12',
          kind: 'entity-occurrence',
        }),
      ],
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: 'invalid-project-entity-projection',
          projectionId: 'projection:invalid',
        }),
      ]),
    });
    await store.dispose();
  });

  it('round-trips the four typed semantic projections and supports Entity lookup', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-project-entity-projection-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(store);
    await initializeProjectEntityProjectionTables(store);
    await store.repositories.workspaces.bind({
      identity: { workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'project-entity-projection',
    };
    const updatedAt = '2026-07-13T07:00:00.000Z';

    await store.repositories.projectEntityProjections.replaceSource({
      partition,
      sourceId: 'entity-runtime',
      records: [
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
            representation: {
              file: { authority: 'workspace', path: 'neko/assets/Characters/rin.png' },
            },
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

    const entityResult = await store.repositories.projectEntityProjections.list({
      partition,
      entityId: 'char_rin',
    });
    expect(entityResult.records).toHaveLength(3);
    expect(entityResult.diagnostics).toEqual([]);
    await expect(
      store.repositories.projectEntityProjections.list({
        partition,
        kinds: ['entity-candidate'],
      }),
    ).resolves.toEqual({
      records: [
        expect.objectContaining({ candidateId: 'candidate:rin-alt', kind: 'entity-candidate' }),
      ],
      diagnostics: [],
    });
    await expect(
      store.repositories.projectEntityProjections.replaceSource({
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
    const all = await store.repositories.projectEntityProjections.list({ partition });
    expect(all.records).toHaveLength(4);
    expect(all.diagnostics).toEqual([]);
    await expect(
      store.repositories.cacheMaintenance.clearPartition({
        table: 'project_entity_projections',
        partition,
        reason: 'rebuild',
        updatedAt: '2026-07-13T07:30:00.000Z',
      }),
    ).resolves.toEqual({ deletedRows: 4 });
    await expect(store.repositories.projectEntityProjections.list({ partition })).resolves.toEqual({
      records: [],
      diagnostics: [],
    });
    await store.dispose();
  });
});
