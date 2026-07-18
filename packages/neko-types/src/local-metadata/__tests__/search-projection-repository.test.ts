import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '../../types/storage';
import { PathResolver } from '../../path';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import {
  migrateLegacyMediaSearchIndex,
  migrateLegacySemanticIndexSidecars,
} from '../node-search-projection-migration';
import { M1_LOCAL_METADATA_MIGRATIONS, SEARCH_PROJECTION_MIGRATIONS } from '../sqlite';

const WORKSPACE_ID = '1888f0bf-ed92-440b-8cd6-03107358380a';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Search projection repository', () => {
  it('creates only three Search core tables and no coverage, job, history, or status tables', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-search-schema-'));
    temporaryDirectories.push(homedir);
    const databasePath = resolveGlobalStorageLayout(homedir).database;
    const store = createNodeSqliteLocalMetadataStore({ homedir });
    await store.open({ databasePath, busyTimeoutMs: 1_000 });
    await store.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await store.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
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

    expect(names).toEqual(['search_documents', 'semantic_evidence', 'semantic_sources']);
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
    await first.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await first.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await first.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
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
    await second.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await second.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);

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
    await expect(second.readPartitionRevision(partition)).resolves.toMatchObject({
      revision: 1,
      freshness: 'stale',
      diagnostic: 'search-documents-not-fresh',
    });

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
    await expect(second.readPartitionRevision(partition)).resolves.toMatchObject({
      revision: 2,
      freshness: 'stale',
      diagnostic: 'search-documents-not-fresh',
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

  it('round-trips semantic source coverage and evidence without a separate coverage table', async () => {
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
    await first.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await first.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await first.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    await first.repositories.semanticProjections.replacePartition({
      partition,
      sources: [
        {
          sourceId: 'semantic:asset-page-1',
          sourceFingerprint: 'sha256:source-v1',
          provider: {
            providerId: 'ocr.local',
            model: 'ocr-model',
            modelVersion: '1',
            indexVersion: 'semantic-index-v1',
            schemaVersion: '1',
          },
          coverage: ['ocr', 'vision'],
          freshness: 'fresh',
          updatedAt: '2026-07-13T02:00:00.000Z',
          index: {
            version: 1,
            indexId: 'semantic:asset-page-1',
            assetId: 'asset-page-1',
            sourceRef: {
              kind: 'document',
              source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
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
          evidence: [
            {
              evidenceId: 'segment-1',
              unitId: 'page-1',
              kind: 'ocr',
              sourceRef: {
                kind: 'document',
                source: { filePath: 'docs/comic.pdf', format: 'pdf' },
                range: { startLine: 1, endLine: 10 },
              },
              locator: { kind: 'page', pageNumber: 1, pageIndex: 0 },
              range: { startLine: 1, endLine: 10 },
              contentHash: 'sha256:segment-1',
              provenance: { providerId: 'ocr.local', sourceKind: 'comic' },
            },
          ],
        },
      ],
      updatedAt: '2026-07-13T02:00:00.000Z',
    });
    await first.dispose();

    const second = createNodeSqliteLocalMetadataStore({ homedir });
    await second.open({ databasePath, busyTimeoutMs: 1_000 });
    await second.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await second.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);

    await expect(second.repositories.semanticProjections.list(partition)).resolves.toEqual([
      expect.objectContaining({
        sourceId: 'semantic:asset-page-1',
        sourceFingerprint: 'sha256:source-v1',
        provider: expect.objectContaining({ providerId: 'ocr.local', schemaVersion: '1' }),
        coverage: ['ocr', 'vision'],
        freshness: 'fresh',
        index: expect.objectContaining({
          assetId: 'asset-page-1',
          semanticTags: [expect.objectContaining({ tagId: 'tag-rin', label: 'Rin' })],
        }),
        evidence: [expect.objectContaining({ evidenceId: 'segment-1', kind: 'ocr' })],
      }),
    ]);
    await expect(second.readPartitionRevision(partition)).resolves.toMatchObject({
      revision: 1,
      freshness: 'fresh',
    });

    await second.dispose();

    const database = new DatabaseSync(databasePath, { readOnly: true });
    const persistedPayloads = database
      .prepare(
        `SELECT evidence_json AS payload FROM semantic_evidence
         UNION ALL SELECT index_json AS payload FROM semantic_sources
         UNION ALL SELECT document_json AS payload FROM search_documents`,
      )
      .all()
      .flatMap((row) => (typeof row['payload'] === 'string' ? [row['payload']] : []));
    database.close();
    expect(persistedPayloads.join('\n')).not.toContain('Rin: We have to go.');
  });

  it('clears legacy body-bearing semantic source cache without touching workspace facts', async () => {
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
    await first.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await first.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await first.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    await first.dispose();

    const partitionKey = `workspace:${WORKSPACE_ID}:semantic-projection`;
    const sourceRef = { kind: 'file', path: '${WORKSPACE}/story.md' };
    const legacyIndex = {
      version: 1,
      indexId: 'semantic:legacy-body',
      assetId: 'legacy-body',
      sourceRef,
      updatedAt: '2026-07-13T02:00:00.000Z',
    };
    const database = new DatabaseSync(databasePath);
    database
      .prepare(
        `INSERT INTO semantic_sources (
          partition_key, partition_scope, workspace_id, source_id, asset_id,
          source_ref_json, source_fingerprint, provider_json, coverage_json,
          freshness, index_json, updated_at
        ) VALUES (?, 'workspace', ?, ?, ?, ?, ?, ?, ?, 'fresh', ?, ?)`,
      )
      .run(
        partitionKey,
        WORKSPACE_ID,
        'semantic:legacy-body',
        'legacy-body',
        JSON.stringify(sourceRef),
        'sha256:legacy',
        JSON.stringify({
          providerId: 'legacy.text',
          indexVersion: 'text-v1',
          schemaVersion: '1',
        }),
        JSON.stringify(['entity-mention']),
        JSON.stringify(legacyIndex),
        '2026-07-13T02:00:00.000Z',
      );
    database
      .prepare(
        `INSERT INTO semantic_evidence (
          partition_key, partition_scope, workspace_id, source_id,
          evidence_kind, evidence_id, ordinal, evidence_json
        ) VALUES (?, 'workspace', ?, ?, 'text-segment', 'segment-1', 0, ?)`,
      )
      .run(
        partitionKey,
        WORKSPACE_ID,
        'semantic:legacy-body',
        JSON.stringify({
          segmentId: 'segment-1',
          kind: 'manual',
          text: 'Complete legacy source body.',
          sourceRef: {
            kind: 'document',
            source: { filePath: '${WORKSPACE}/story.md', format: 'markdown' },
          },
          provenance: { providerId: 'legacy.text', sourceKind: 'document' },
        }),
      );
    database.close();

    const second = createNodeSqliteLocalMetadataStore({ homedir });
    await second.open({ databasePath, busyTimeoutMs: 1_000 });
    await second.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await second.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await expect(
      second.repositories.semanticProjections.clearBodyBearingSources(
        partition,
        '2026-07-13T03:00:00.000Z',
      ),
    ).resolves.toEqual(['semantic:legacy-body']);
    await expect(
      second.repositories.semanticProjections.get(partition, 'semantic:legacy-body'),
    ).resolves.toBeNull();
    await second.dispose();
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
    await first.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await first.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await first.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const second = createNodeSqliteLocalMetadataStore({ homedir });
    await second.open({ databasePath, busyTimeoutMs: 1_000 });
    await second.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await second.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    const source = {
      sourceId: 'semantic:shared-source',
      sourceFingerprint: 'sha256:shared-source',
      provider: {
        providerId: 'vision.local',
        indexVersion: 'semantic-index-v1',
        schemaVersion: '1',
      },
      coverage: ['vision'] as const,
      freshness: 'fresh' as const,
      index: {
        version: 1 as const,
        indexId: 'semantic:shared-source',
        assetId: 'shared-source',
        sourceRef: {
          kind: 'document' as const,
          source: { kind: 'file' as const, projectRelativePath: 'docs/shared.pdf' },
        },
        semanticTags: [{ tagId: 'shared-tag', label: 'Shared', source: 'document' as const }],
        updatedAt: '2026-07-13T02:00:00.000Z',
      },
      evidence: [],
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
    await expect(first.repositories.semanticProjections.list(partition)).resolves.toHaveLength(1);
    await expect(first.readPartitionRevision(partition)).resolves.toMatchObject({ revision: 1 });

    await Promise.all([first.dispose(), second.dispose()]);
  });

  it('backs up, contracts, verifies, and archives the legacy media search index', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-search-index-migration-'));
    temporaryDirectories.push(homedir);
    const workDir = join(homedir, 'workspace');
    const libraryRoot = join(homedir, 'books');
    const indexPath = join(workDir, '.neko', '.cache', 'search-index.json');
    await mkdir(join(workDir, '.neko', '.cache'), { recursive: true });
    await writeFile(
      indexPath,
      JSON.stringify({
        version: 1,
        updatedAt: '2026-07-13T03:00:00.000Z',
        entries: [
          {
            filePath: join(libraryRoot, 'Cat walk.mp4'),
            fileName: 'Cat walk.mp4',
            libraryName: 'Books',
            mediaType: 'video',
          },
        ],
      }),
      'utf8',
    );
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await metadataStore.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'project-search',
    };

    const report = await migrateLegacyMediaSearchIndex({
      indexPath,
      partition,
      repository: metadataStore.repositories.searchDocuments,
      pathResolver: new PathResolver(new Map([['BOOKS', libraryRoot]])),
      now: () => 1_752_364_800_000,
    });

    expect(report).toMatchObject({
      sourceStatus: 'migrated',
      importedCount: 1,
      verifiedCount: 1,
      unrecoverable: [],
    });
    await expect(access(report.backupPath ?? '')).resolves.toBeUndefined();
    await expect(access(report.archivedPath ?? '')).resolves.toBeUndefined();
    await expect(access(indexPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(metadataStore.repositories.searchDocuments.list(partition)).resolves.toEqual([
      expect.objectContaining({
        label: 'Cat walk.mp4',
        fileKey: '${BOOKS}/Cat walk.mp4',
        source: expect.objectContaining({ filePath: '${BOOKS}/Cat walk.mp4' }),
      }),
    ]);

    await metadataStore.dispose();
  });

  it('preserves a current search document when retiring a legacy index with the same identity', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-search-index-current-'));
    temporaryDirectories.push(homedir);
    const workDir = join(homedir, 'workspace');
    const libraryRoot = join(homedir, 'books');
    const fileKey = '${BOOKS}/Cat walk.mp4';
    const documentId = `media:${createHash('sha256').update(fileKey).digest('hex').slice(0, 24)}`;
    const indexPath = join(workDir, '.neko', '.cache', 'search-index.json');
    await mkdir(join(workDir, '.neko', '.cache'), { recursive: true });
    await writeFile(
      indexPath,
      JSON.stringify({
        version: 1,
        updatedAt: '2026-07-12T00:00:00.000Z',
        entries: [
          {
            filePath: join(libraryRoot, 'Cat walk.mp4'),
            fileName: 'Legacy cat walk.mp4',
            libraryName: 'Legacy Books',
            mediaType: 'video',
          },
        ],
      }),
      'utf8',
    );
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await metadataStore.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'project-search',
    };
    await metadataStore.repositories.searchDocuments.replaceSearchPartition({
      partition,
      searchPartition: 'media-library',
      documents: [
        {
          documentId,
          partition: 'media-library',
          kind: 'media',
          label: 'Current cat walk.mp4',
          description: 'Current Books',
          source: {
            partition: 'media-library',
            sourceId: fileKey,
            filePath: fileKey,
          },
          fileKey,
          searchText: 'Current cat walk Current Books video',
          freshness: 'fresh',
          updatedAt: '2026-07-13T05:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T05:00:00.000Z',
    });

    const report = await migrateLegacyMediaSearchIndex({
      indexPath,
      partition,
      repository: metadataStore.repositories.searchDocuments,
      pathResolver: new PathResolver(new Map([['BOOKS', libraryRoot]])),
      now: () => 1_752_364_800_000,
    });

    expect(report).toMatchObject({
      sourceStatus: 'migrated',
      importedCount: 0,
      preservedExistingCount: 1,
      verifiedCount: 1,
    });
    await expect(access(report.archivedPath ?? '')).resolves.toBeUndefined();
    await expect(metadataStore.repositories.searchDocuments.list(partition)).resolves.toEqual([
      expect.objectContaining({
        documentId,
        label: 'Current cat walk.mp4',
        description: 'Current Books',
      }),
    ]);

    await metadataStore.dispose();
  });

  it('backs up, imports, verifies, and archives legacy semantic sidecars', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-semantic-sidecar-migration-'));
    temporaryDirectories.push(homedir);
    const workDir = join(homedir, 'workspace');
    const semanticRoot = join(workDir, '.neko', 'semantic-index');
    const sidecarPath = join(semanticRoot, 'asset-page-1', 'index.json');
    const corruptSidecarPath = join(semanticRoot, 'asset-page-2', 'index.json');
    await mkdir(join(semanticRoot, 'asset-page-1'), { recursive: true });
    await mkdir(join(semanticRoot, 'asset-page-2'), { recursive: true });
    await writeFile(
      sidecarPath,
      JSON.stringify({
        version: 1,
        indexId: 'semantic:asset-page-1',
        assetId: 'asset-page-1',
        sourceRef: {
          kind: 'document',
          source: { kind: 'file', projectRelativePath: 'docs/comic.pdf' },
        },
        textSegments: [
          {
            segmentId: 'segment-1',
            kind: 'ocr',
            text: 'Rin: We have to go.',
            sourceRef: {
              kind: 'document',
              source: { filePath: 'docs/comic.pdf', format: 'pdf' },
              range: { startLine: 1, endLine: 10 },
            },
            provenance: { providerId: 'ocr.local', sourceKind: 'comic' },
            range: { startLine: 1, endLine: 10 },
          },
        ],
        semanticTags: [{ tagId: 'tag-rin', label: 'Rin', source: 'comic' }],
        updatedAt: '2026-07-13T04:00:00.000Z',
      }),
      'utf8',
    );
    await writeFile(corruptSidecarPath, '', 'utf8');
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await metadataStore.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'semantic-projection',
    };

    const report = await migrateLegacySemanticIndexSidecars({
      semanticIndexRoot: semanticRoot,
      partition,
      repository: metadataStore.repositories.semanticProjections,
      now: () => 1_752_364_800_000,
    });

    expect(report).toMatchObject({
      sourceStatus: 'partial',
      discoveredCount: 2,
      importedSourceCount: 1,
      importedEvidenceCount: 2,
      verifiedSourceCount: 1,
      quarantinedCount: 1,
    });
    await expect(access(report.backupPaths[0] ?? '')).resolves.toBeUndefined();
    await expect(access(report.backupPaths[1] ?? '')).resolves.toBeUndefined();
    await expect(access(report.archivedPaths[0] ?? '')).resolves.toBeUndefined();
    await expect(access(report.quarantinePaths[0] ?? '')).resolves.toBeUndefined();
    await expect(access(sidecarPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(access(corruptSidecarPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(metadataStore.repositories.semanticProjections.list(partition)).resolves.toEqual([
      expect.objectContaining({
        sourceId: 'semantic:asset-page-1',
        coverage: ['ocr', 'vision'],
        index: expect.objectContaining({
          semanticTags: [expect.objectContaining({ tagId: 'tag-rin' })],
        }),
        evidence: [expect.objectContaining({ evidenceId: 'segment-1' })],
      }),
    ]);

    await metadataStore.dispose();
  });

  it('preserves a current semantic projection when retiring a legacy sidecar with the same source identity', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-semantic-sidecar-current-'));
    temporaryDirectories.push(homedir);
    const semanticRoot = join(homedir, 'workspace', '.neko', 'semantic-index');
    const sidecarPath = join(semanticRoot, 'asset-page-1', 'index.json');
    await mkdir(join(semanticRoot, 'asset-page-1'), { recursive: true });
    await writeFile(
      sidecarPath,
      JSON.stringify({
        version: 1,
        indexId: 'semantic:asset-page-1',
        assetId: 'asset-page-1',
        sourceRef: {
          kind: 'document',
          source: { kind: 'file', projectRelativePath: 'docs/legacy.pdf' },
        },
        textSegments: [
          {
            segmentId: 'legacy-segment',
            kind: 'ocr',
            text: 'Legacy evidence',
            sourceRef: {
              kind: 'document',
              source: { filePath: 'docs/legacy.pdf', format: 'pdf' },
              range: { startLine: 1, endLine: 1 },
            },
            provenance: { providerId: 'legacy.ocr', sourceKind: 'document' },
            range: { startLine: 1, endLine: 1 },
          },
        ],
        updatedAt: '2026-07-12T00:00:00.000Z',
      }),
      'utf8',
    );
    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(SEARCH_PROJECTION_MIGRATIONS);
    await metadataStore.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'semantic-projection',
    };
    await metadataStore.repositories.semanticProjections.replacePartition({
      partition,
      sources: [
        {
          sourceId: 'semantic:asset-page-1',
          sourceFingerprint: 'sha256:current-source',
          provider: {
            providerId: 'current.vision',
            indexVersion: 'semantic-index-v2',
            schemaVersion: '2',
          },
          coverage: ['vision'],
          freshness: 'stale',
          index: {
            version: 1,
            indexId: 'semantic:asset-page-1',
            assetId: 'asset-page-1',
            sourceRef: {
              kind: 'document',
              source: { kind: 'file', projectRelativePath: 'docs/current.pdf' },
            },
            semanticTags: [{ tagId: 'current-tag', label: 'Current', source: 'document' }],
            updatedAt: '2026-07-13T05:00:00.000Z',
          },
          evidence: [],
          updatedAt: '2026-07-13T05:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T05:00:00.000Z',
    });

    const report = await migrateLegacySemanticIndexSidecars({
      semanticIndexRoot: semanticRoot,
      partition,
      repository: metadataStore.repositories.semanticProjections,
      now: () => 1_752_364_800_000,
    });

    expect(report).toMatchObject({
      sourceStatus: 'migrated',
      importedSourceCount: 0,
      preservedExistingSourceCount: 1,
      verifiedSourceCount: 1,
    });
    await expect(access(report.archivedPaths[0] ?? '')).resolves.toBeUndefined();
    await expect(metadataStore.repositories.semanticProjections.list(partition)).resolves.toEqual([
      expect.objectContaining({
        sourceFingerprint: 'sha256:current-source',
        provider: expect.objectContaining({ providerId: 'current.vision' }),
        index: expect.objectContaining({
          semanticTags: [expect.objectContaining({ tagId: 'current-tag' })],
        }),
      }),
    ]);
    await metadataStore.repositories.semanticProjections.insertMissing({
      partition,
      sources: [
        {
          sourceId: 'semantic:new-source',
          sourceFingerprint: 'sha256:new-source',
          provider: {
            providerId: 'current.vision',
            indexVersion: 'semantic-index-v2',
            schemaVersion: '2',
          },
          coverage: ['vision'],
          freshness: 'fresh',
          index: {
            version: 1,
            indexId: 'semantic:new-source',
            assetId: 'new-source',
            sourceRef: {
              kind: 'document',
              source: { kind: 'file', projectRelativePath: 'docs/new.pdf' },
            },
            semanticTags: [{ tagId: 'new-tag', label: 'New', source: 'document' }],
            updatedAt: '2026-07-13T06:00:00.000Z',
          },
          evidence: [],
          updatedAt: '2026-07-13T06:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-13T06:00:00.000Z',
    });
    await expect(metadataStore.readPartitionRevision(partition)).resolves.toMatchObject({
      revision: 2,
      freshness: 'stale',
      diagnostic: 'semantic-sources-not-fresh',
    });
    await expect(metadataStore.repositories.semanticProjections.list(partition)).resolves.toEqual([
      expect.objectContaining({ sourceId: 'semantic:asset-page-1' }),
      expect.objectContaining({
        sourceId: 'semantic:new-source',
        index: expect.objectContaining({
          semanticTags: [expect.objectContaining({ tagId: 'new-tag' })],
        }),
      }),
    ]);

    await metadataStore.dispose();
  });
});
