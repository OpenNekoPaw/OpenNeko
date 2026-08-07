import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '@neko/local-metadata';
import { createNodeSqliteLocalMetadataStore } from '@neko/local-metadata/node-sqlite-local-metadata-store';
import {
  initializeCoreLocalMetadataTables,
  initializeSearchProjectionTables,
} from '@neko/local-metadata/sqlite';

const WORKSPACE_ID = '1888f0bf-ed92-440b-8cd6-03107358380a';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Search projection repository', () => {
  it('creates Search records without the retired semantic evidence table', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-search-schema-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(store);
    await initializeSearchProjectionTables(store);
    await store.dispose();

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const rows = database
      .prepare(
        `SELECT name FROM sqlite_schema
          WHERE type = 'table'
            AND (name = 'search_documents' OR name LIKE 'semantic_%')
          ORDER BY name`,
      )
      .all();
    const names = rows.flatMap((row) => (typeof row['name'] === 'string' ? [row['name']] : []));
    database.close();

    expect(names).toEqual(['search_documents', 'semantic_sources']);
    expect(names.some((name) => /(?:coverage|job|history|status)/u.test(name))).toBe(false);
  });

  it('round-trips portable search documents and queries them through FTS after reopen', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-search-projection-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'project-search',
    };
    const first = createNodeSqliteLocalMetadataStore({ homedir });
    await first.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(first);
    await initializeSearchProjectionTables(first);
    await first.repositories.workspaces.bind({
      identity: { workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    await first.repositories.searchDocuments.replacePartition({
      partition,
      documents: [
        {
          documentId: 'media:cat-video',
          partition: 'media-library',
          kind: 'media',
          label: 'Cat walk.mp4',
          description: 'Reference Library',
          source: {
            partition: 'media-library',
            sourceId: '${BOOKS}/Cat walk.mp4',
            filePath: '${BOOKS}/Cat walk.mp4',
          },
          fileKey: '${BOOKS}/Cat walk.mp4',
          searchText: 'Cat walk.mp4 Reference Library video',
          freshness: 'stale',
          metadata: { mediaType: 'video', libraryName: 'Reference Library' },
          updatedAt: '2026-07-13T01:00:00.000Z',
        },
        {
          documentId: 'document:lighting-notes',
          partition: 'documents',
          kind: 'document',
          label: 'Lighting notes',
          source: {
            partition: 'documents',
            projectRelativePath: 'docs/lighting.md',
          },
          fileKey: 'docs/lighting.md',
          searchText: 'Lighting notes key light fill light',
          freshness: 'fresh',
          updatedAt: '2026-07-13T01:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T01:00:00.000Z',
    });
    await first.dispose();

    const second = createNodeSqliteLocalMetadataStore({ homedir });
    await second.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(second);
    await initializeSearchProjectionTables(second);

    await expect(
      second.repositories.searchDocuments.query({ partition, text: 'cat walk', limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({
        documentId: 'media:cat-video',
        fileKey: '${BOOKS}/Cat walk.mp4',
        kind: 'media',
        freshness: 'stale',
      }),
    ]);
    await second.repositories.searchDocuments.insertMissingSearchPartition({
      partition,
      searchPartition: 'media-library',
      documents: [
        {
          documentId: 'media:fresh-reference',
          partition: 'media-library',
          kind: 'media',
          label: 'Fresh reference.png',
          source: {
            partition: 'media-library',
            sourceId: '${BOOKS}/Fresh reference.png',
            filePath: '${BOOKS}/Fresh reference.png',
          },
          fileKey: '${BOOKS}/Fresh reference.png',
          searchText: 'Fresh reference image',
          freshness: 'fresh',
          updatedAt: '2026-07-13T01:30:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T01:30:00.000Z',
    });
    await expect(
      second.repositories.searchDocuments.query({
        partition,
        text: 'fresh reference',
        limit: 10,
      }),
    ).resolves.toEqual([expect.objectContaining({ documentId: 'media:fresh-reference' })]);

    await second.dispose();
  });

  it('round-trips semantic source coverage and the complete compact index', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-semantic-projection-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'semantic-projection',
    };
    const first = createNodeSqliteLocalMetadataStore({ homedir });
    await first.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(first);
    await initializeSearchProjectionTables(first);
    await first.repositories.workspaces.bind({
      identity: { workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    await first.repositories.semanticProjections.replacePartition({
      partition,
      sources: [
        {
          sourceId: 'semantic:asset-page-1',
          sourceFingerprint: 'sha256:source-content',
          provider: {
            providerId: 'ocr.local',
            model: 'ocr-model',
          },
          coverage: ['ocr', 'vision'],
          freshness: 'fresh',
          updatedAt: '2026-07-13T02:00:00.000Z',
          index: {
            indexId: 'semantic:asset-page-1',
            assetId: 'asset-page-1',
            sourceRef: {
              kind: 'document',
              source: { filePath: 'docs/comic.pdf', format: 'pdf' },
            },
            semanticTags: [
              {
                tagId: 'tag-rin',
                label: 'Rin',
                confidence: 0.9,
                source: 'comic',
              },
            ],
            updatedAt: '2026-07-13T02:00:00.000Z',
          },
        },
      ],
      updatedAt: '2026-07-13T02:00:00.000Z',
    });
    await first.dispose();

    const second = createNodeSqliteLocalMetadataStore({ homedir });
    await second.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(second);
    await initializeSearchProjectionTables(second);

    await expect(second.repositories.semanticProjections.list(partition)).resolves.toEqual({
      records: [
        expect.objectContaining({
          sourceId: 'semantic:asset-page-1',
          sourceFingerprint: 'sha256:source-content',
          provider: expect.objectContaining({ providerId: 'ocr.local', model: 'ocr-model' }),
          coverage: ['ocr', 'vision'],
          freshness: 'fresh',
          index: expect.objectContaining({
            assetId: 'asset-page-1',
            semanticTags: [expect.objectContaining({ tagId: 'tag-rin', label: 'Rin' })],
          }),
        }),
      ],
      diagnostics: [],
    });
    await second.dispose();

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const persistedPayloads = database
      .prepare(`SELECT index_json AS payload FROM semantic_sources`)
      .all()
      .flatMap((row) => (typeof row['payload'] === 'string' ? [row['payload']] : []));
    database.close();
    expect(persistedPayloads.join('\n')).not.toContain('Rin: We have to go.');
  });

  it('keeps an invalid semantic source unchanged while returning valid siblings', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-semantic-body-cleanup-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'semantic-projection',
    };
    const first = createNodeSqliteLocalMetadataStore({ homedir });
    await first.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(first);
    await initializeSearchProjectionTables(first);
    await first.repositories.workspaces.bind({
      identity: { workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    await first.dispose();

    const partitionKey = `workspace:${WORKSPACE_ID}:semantic-projection`;
    const sourceRef = { kind: 'file', path: '${WORKSPACE}/story.md' };
    const invalidIndex = {
      indexId: 'semantic:rejected-body',
      assetId: 'rejected-body',
      sourceRef: { kind: 'file', path: '${WORKSPACE}/different-story.md' },
      updatedAt: '2026-07-13T02:00:00.000Z',
    };
    const database = new DatabaseSync(databasePath);
    const insertSource = database.prepare(
      `INSERT INTO semantic_sources (
          partition_key, partition_scope, workspace_id, source_id, asset_id,
          source_ref_json, source_fingerprint, provider_json, coverage_json,
          freshness, index_json, updated_at
        ) VALUES (?, 'workspace', ?, ?, ?, ?, ?, ?, ?, 'fresh', ?, ?)`,
    );
    insertSource.run(
      partitionKey,
      WORKSPACE_ID,
      'semantic:rejected-body',
      'rejected-body',
      JSON.stringify(sourceRef),
      'sha256:rejected-source',
      JSON.stringify({ providerId: '' }),
      JSON.stringify(['entity-mention']),
      JSON.stringify(invalidIndex),
      '2026-07-13T02:00:00.000Z',
    );
    insertSource.run(
      partitionKey,
      WORKSPACE_ID,
      'semantic:valid',
      'valid',
      JSON.stringify(sourceRef),
      'sha256:valid',
      JSON.stringify({ providerId: 'canonical.text' }),
      JSON.stringify(['entity-mention']),
      JSON.stringify({
        indexId: 'semantic:valid',
        assetId: 'valid',
        sourceRef,
        updatedAt: '2026-07-13T02:00:00.000Z',
      }),
      '2026-07-13T02:00:00.000Z',
    );
    database.close();

    const second = createNodeSqliteLocalMetadataStore({ homedir });
    await second.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(second);
    await initializeSearchProjectionTables(second);
    await expect(second.repositories.semanticProjections.list(partition)).resolves.toEqual({
      records: [expect.objectContaining({ sourceId: 'semantic:valid' })],
      diagnostics: [
        expect.objectContaining({
          code: 'invalid-semantic-projection-record',
          sourceId: 'semantic:rejected-body',
        }),
      ],
    });
    await second.dispose();

    const preserved = new DatabaseSync(databasePath, { readOnly: true });
    const invalidRow = preserved
      .prepare(
        `SELECT provider_json, index_json FROM semantic_sources
          WHERE partition_key = ? AND source_id = ?`,
      )
      .get(partitionKey, 'semantic:rejected-body');
    preserved.close();
    expect(invalidRow).toMatchObject({
      provider_json: JSON.stringify({ providerId: '' }),
      index_json: JSON.stringify(invalidIndex),
    });
  });

  it('preserves one semantic source across separate Host connections', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-semantic-concurrent-insert-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'semantic-projection',
    };
    const first = createNodeSqliteLocalMetadataStore({ homedir });
    await first.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(first);
    await initializeSearchProjectionTables(first);
    await first.repositories.workspaces.bind({
      identity: { workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const second = createNodeSqliteLocalMetadataStore({ homedir });
    await second.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(second);
    await initializeSearchProjectionTables(second);
    const source = {
      sourceId: 'semantic:shared-source',
      sourceFingerprint: 'sha256:shared-source',
      provider: {
        providerId: 'vision.local',
      },
      coverage: ['vision'] as const,
      freshness: 'fresh' as const,
      index: {
        indexId: 'semantic:shared-source',
        assetId: 'shared-source',
        sourceRef: {
          kind: 'document' as const,
          source: { filePath: 'docs/shared.pdf', format: 'pdf' as const },
        },
        semanticTags: [{ tagId: 'shared-tag', label: 'Shared', source: 'document' as const }],
        updatedAt: '2026-07-13T02:00:00.000Z',
      },
      updatedAt: '2026-07-13T02:00:00.000Z',
    };

    const request = {
      partition,
      sources: [source],
      updatedAt: '2026-07-13T02:00:00.000Z',
    };
    const results = [
      await first.repositories.semanticProjections.insertMissing(request),
      await second.repositories.semanticProjections.insertMissing(request),
    ];

    expect(results.flatMap((result) => result.insertedSourceIds)).toEqual([
      'semantic:shared-source',
    ]);
    expect(results.flatMap((result) => result.preservedSourceIds)).toEqual([
      'semantic:shared-source',
    ]);
    await expect(first.repositories.semanticProjections.list(partition)).resolves.toMatchObject({
      records: [expect.objectContaining({ sourceId: source.sourceId })],
      diagnostics: [],
    });
    await Promise.all([first.dispose(), second.dispose()]);
  });

  it('never reads, writes, repairs, or removes an existing retired evidence table', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-retired-semantic-evidence-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'semantic-projection',
    };
    const first = createNodeSqliteLocalMetadataStore({ homedir });
    await first.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(first);
    await initializeSearchProjectionTables(first);
    await first.repositories.workspaces.bind({
      identity: { workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    await first.dispose();

    const retired = new DatabaseSync(databasePath);
    retired.exec(`
      CREATE TABLE semantic_evidence (marker TEXT NOT NULL) STRICT;
      INSERT INTO semantic_evidence(marker) VALUES ('retired-row');
      CREATE TRIGGER semantic_evidence_reject_insert BEFORE INSERT ON semantic_evidence BEGIN
        SELECT RAISE(ABORT, 'retired evidence insert path used');
      END;
      CREATE TRIGGER semantic_evidence_reject_update BEFORE UPDATE ON semantic_evidence BEGIN
        SELECT RAISE(ABORT, 'retired evidence update path used');
      END;
      CREATE TRIGGER semantic_evidence_reject_delete BEFORE DELETE ON semantic_evidence BEGIN
        SELECT RAISE(ABORT, 'retired evidence delete path used');
      END;
    `);
    retired.close();

    const second = createNodeSqliteLocalMetadataStore({ homedir });
    await second.open({ databasePath, busyTimeoutMs: 1_000 });
    await initializeCoreLocalMetadataTables(second);
    await initializeSearchProjectionTables(second);
    const source = {
      sourceId: 'semantic:current-source',
      sourceFingerprint: 'sha256:current-source',
      provider: { providerId: 'canonical.text' },
      coverage: ['entity-mention'] as const,
      freshness: 'fresh' as const,
      index: {
        indexId: 'semantic:current-source',
        assetId: 'current-source',
        sourceRef: { kind: 'file' as const, path: '${WORKSPACE}/story.md' },
        updatedAt: '2026-07-13T02:00:00.000Z',
      },
      updatedAt: '2026-07-13T02:00:00.000Z',
    };
    await expect(
      second.repositories.semanticProjections.replaceSource({
        partition,
        source,
        updatedAt: source.updatedAt,
      }),
    ).resolves.toBeUndefined();
    await expect(
      second.repositories.semanticProjections.get(partition, source.sourceId),
    ).resolves.toMatchObject({ sourceId: source.sourceId, index: source.index });
    await expect(second.repositories.semanticProjections.list(partition)).resolves.toMatchObject({
      records: [expect.objectContaining({ sourceId: source.sourceId })],
      diagnostics: [],
    });
    await second.dispose();

    const preserved = new DatabaseSync(databasePath, { readOnly: true });
    expect(preserved.prepare('SELECT marker FROM semantic_evidence').all()).toEqual([
      { marker: 'retired-row' },
    ]);
    preserved.close();
  });
});
