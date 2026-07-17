import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveGlobalStorageLayout } from '../../types/storage';
import type { ResourceCacheManifest, ResourceCacheManifestStore } from '../../types/resource-cache';
import { createNodeSqliteLocalMetadataStore } from '../node-sqlite-local-metadata-store';
import { LocalMetadataResourceCacheManifestStore } from '../resource-cache-manifest-store';
import { migrateLegacyResourceCacheManifest } from '../node-resource-cache-manifest-migration';
import { migrateLegacyProxyManifest } from '../node-proxy-manifest-migration';
import { M1_LOCAL_METADATA_MIGRATIONS, RESOURCE_CACHE_MIGRATIONS } from '../sqlite';

const WORKSPACE_ID = '667baf25-0ee7-4b48-932f-0114121ae7c7';
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('legacy ResourceCache manifest migration', () => {
  it('backs up, normalizes, verifies, and archives a workspace manifest', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-resource-cache-migration-'));
    temporaryDirectories.push(homedir);
    const workDir = join(homedir, 'workspace');
    const cacheRoot = join(workDir, '.neko', '.cache', 'resources');
    const manifestPath = join(cacheRoot, 'manifest.json');
    await mkdir(join(cacheRoot, 'documents'), { recursive: true });
    const artifactPath = join(cacheRoot, 'documents', 'page-1.jpg');
    const legacyManifest = createLegacyManifest(artifactPath);
    await writeFile(manifestPath, `${JSON.stringify(legacyManifest)}\n`, 'utf8');

    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(RESOURCE_CACHE_MIGRATIONS);
    await metadataStore.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const partition = {
      scope: 'workspace' as const,
      workspaceId: WORKSPACE_ID,
      domain: 'resource-cache',
    };
    const manifestStore = new LocalMetadataResourceCacheManifestStore({
      metadataStore,
      partition,
      projectRoot: workDir,
    });

    const report = await migrateLegacyResourceCacheManifest({
      manifestPath,
      cacheRoot,
      manifestStore,
      now: () => 1_752_364_800_000,
    });

    expect(report).toMatchObject({
      sourceStatus: 'migrated',
      importedEntryCount: 1,
      importedVariantCount: 1,
      verifiedEntryCount: 1,
      verifiedVariantCount: 1,
      unrecoverable: [],
    });
    await expect(access(report.backupPath ?? '')).resolves.toBeUndefined();
    await expect(access(report.archivedPath ?? '')).resolves.toBeUndefined();
    expect(JSON.parse(await readFile(report.backupPath ?? '', 'utf8'))).toEqual(legacyManifest);
    const migratedManifest = await manifestStore.load();
    expect(migratedManifest).toMatchObject({
      entries: {
        'resource-1': {
          variants: [
            expect.objectContaining({
              relativePath: 'documents/page-1.jpg',
            }),
          ],
        },
      },
    });
    expect(migratedManifest.entries['resource-1']?.variants[0]).not.toHaveProperty('absolutePath');

    await metadataStore.dispose();
  });

  it('backs up and quarantines malformed metadata without replacing the projection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-resource-cache-quarantine-'));
    temporaryDirectories.push(root);
    const cacheRoot = join(root, 'resources');
    const manifestPath = join(cacheRoot, 'manifest.json');
    await mkdir(cacheRoot, { recursive: true });
    await writeFile(manifestPath, '', 'utf8');
    const manifestStore = createMemoryManifestStore();

    const report = await migrateLegacyResourceCacheManifest({
      manifestPath,
      cacheRoot,
      manifestStore,
      now: () => 1_752_364_800_000,
    });

    expect(report).toMatchObject({
      sourceStatus: 'quarantined',
      importedEntryCount: 0,
      verifiedEntryCount: 0,
    });
    expect(report.sourceDiagnostic).toBeTruthy();
    await expect(access(report.backupPath ?? '')).resolves.toBeUndefined();
    await expect(access(report.quarantinePath ?? '')).resolves.toBeUndefined();
    await expect(manifestStore.load()).resolves.toMatchObject({ entries: {} });
  });

  it('reports an outside-root artifact path without fabricating a fallback variant', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-resource-cache-unrecoverable-'));
    temporaryDirectories.push(root);
    const cacheRoot = join(root, 'resources');
    const manifestPath = join(cacheRoot, 'manifest.json');
    const outsideArtifactPath = join(root, 'outside', 'page-1.jpg');
    await mkdir(cacheRoot, { recursive: true });
    const legacyManifest = createLegacyManifest(outsideArtifactPath);
    await writeFile(manifestPath, JSON.stringify(legacyManifest), 'utf8');
    const manifestStore = createMemoryManifestStore();

    const report = await migrateLegacyResourceCacheManifest({
      manifestPath,
      cacheRoot,
      manifestStore,
      now: () => 1_752_364_800_000,
    });

    expect(report).toMatchObject({
      sourceStatus: 'migrated',
      importedEntryCount: 1,
      importedVariantCount: 0,
      verifiedVariantCount: 0,
      unrecoverable: [
        {
          resourceId: 'resource-1',
          variantKey: 'thumbnail:256x256',
          fields: ['relativePath', 'absolutePath'],
          reason: expect.stringContaining('outside the managed cache root'),
        },
      ],
    });
    expect(JSON.parse(await readFile(report.backupPath ?? '', 'utf8'))).toEqual(legacyManifest);
    await expect(manifestStore.load()).resolves.toMatchObject({
      entries: { 'resource-1': { variants: [] } },
    });
  });
});

describe('legacy proxy manifest migration', () => {
  it('backs up the manifest, copies proxy artifacts, verifies SQLite projection, and archives the source', async () => {
    const homedir = await mkdtemp(join(tmpdir(), 'neko-proxy-migration-'));
    temporaryDirectories.push(homedir);
    const workDir = join(homedir, 'workspace');
    const legacyProxyRoot = join(workDir, '.neko', '.cache', 'proxies');
    const resourceCacheRoot = join(workDir, '.neko', '.cache', 'resources');
    const manifestPath = join(legacyProxyRoot, 'manifest.json');
    const legacyProxyPath = join(legacyProxyRoot, 'resource-1_proxy.mp4');
    await mkdir(legacyProxyRoot, { recursive: true });
    await writeFile(legacyProxyPath, 'proxy artifact', 'utf8');
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        version: 1,
        proxies: {
          'resource-1': {
            source: 'media/source.mov',
            proxy: '.neko/.cache/proxies/resource-1_proxy.mp4',
            sourceSize: 2048,
            sourceModified: 1_752_361_200_000,
            proxyResolution: '960x540',
            status: 'ready',
            createdAt: 1_752_364_800_000,
          },
        },
      })}\n`,
      'utf8',
    );

    const metadataStore = createNodeSqliteLocalMetadataStore({ homedir });
    await metadataStore.open({
      databasePath: resolveGlobalStorageLayout(homedir).database,
      busyTimeoutMs: 1_000,
    });
    await metadataStore.migrateNamespace(M1_LOCAL_METADATA_MIGRATIONS);
    await metadataStore.migrateNamespace(RESOURCE_CACHE_MIGRATIONS);
    await metadataStore.repositories.workspaces.bind({
      identity: { version: 1, workspaceId: WORKSPACE_ID },
      locator: { kind: 'variable', value: '${HOME}/workspace' },
      seenAt: '2026-07-13T00:00:00.000Z',
    });
    const manifestStore = new LocalMetadataResourceCacheManifestStore({
      metadataStore,
      partition: {
        scope: 'workspace',
        workspaceId: WORKSPACE_ID,
        domain: 'resource-cache',
      },
      projectRoot: workDir,
    });

    const report = await migrateLegacyProxyManifest({
      manifestPath,
      workDir,
      legacyProxyRoot,
      resourceCacheRoot,
      manifestStore,
      now: () => 1_752_364_800_000,
    });

    expect(report).toMatchObject({
      sourceStatus: 'migrated',
      importedEntryCount: 1,
      importedVariantCount: 1,
      copiedArtifactCount: 1,
      verifiedEntryCount: 1,
      verifiedVariantCount: 1,
    });
    await expect(access(report.backupPath ?? '')).resolves.toBeUndefined();
    await expect(access(report.archivedPath ?? '')).resolves.toBeUndefined();
    await expect(access(manifestPath)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      readFile(join(resourceCacheRoot, 'proxies', 'resource-1_proxy.mp4'), 'utf8'),
    ).resolves.toBe('proxy artifact');

    const migratedManifest = await manifestStore.load({ refresh: true });
    expect(migratedManifest.entries['resource-1']).toMatchObject({
      resource: {
        id: 'resource-1',
        provider: 'neko-cut-proxy',
        kind: 'media',
        source: {
          kind: 'file',
          projectRelativePath: 'media/source.mov',
          identity: { sizeBytes: 2048, mtimeMs: 1_752_361_200_000 },
        },
      },
      status: 'ready',
      variants: [
        expect.objectContaining({
          key: 'proxy:legacy',
          role: 'proxy',
          status: 'ready',
          relativePath: 'proxies/resource-1_proxy.mp4',
          width: 960,
          height: 540,
          rebuildable: true,
        }),
      ],
    });
    expect(migratedManifest.entries['resource-1']?.variants[0]).not.toHaveProperty('absolutePath');

    await metadataStore.dispose();
  });

  it('backs up and quarantines malformed metadata without creating a projection', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-proxy-quarantine-'));
    temporaryDirectories.push(root);
    const legacyProxyRoot = join(root, '.neko', '.cache', 'proxies');
    const manifestPath = join(legacyProxyRoot, 'manifest.json');
    await mkdir(legacyProxyRoot, { recursive: true });
    await writeFile(manifestPath, '', 'utf8');
    const manifestStore = createMemoryManifestStore();

    const report = await migrateLegacyProxyManifest({
      manifestPath,
      workDir: root,
      legacyProxyRoot,
      resourceCacheRoot: join(root, '.neko', '.cache', 'resources'),
      manifestStore,
      now: () => 1_752_364_800_000,
    });

    expect(report).toMatchObject({
      sourceStatus: 'quarantined',
      importedEntryCount: 0,
      copiedArtifactCount: 0,
      verifiedEntryCount: 0,
    });
    expect(report.sourceDiagnostic).toBeTruthy();
    await expect(access(report.backupPath ?? '')).resolves.toBeUndefined();
    await expect(access(report.quarantinePath ?? '')).resolves.toBeUndefined();
    await expect(manifestStore.load()).resolves.toMatchObject({ entries: {} });
  });

  it('preserves variable-based source paths as portable file paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'neko-proxy-variable-source-'));
    temporaryDirectories.push(root);
    const legacyProxyRoot = join(root, '.neko', '.cache', 'proxies');
    const resourceCacheRoot = join(root, '.neko', '.cache', 'resources');
    const manifestPath = join(legacyProxyRoot, 'manifest.json');
    await mkdir(legacyProxyRoot, { recursive: true });
    await writeFile(join(legacyProxyRoot, 'variable_proxy.mp4'), 'proxy artifact', 'utf8');
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        proxies: {
          variable: {
            source: '${BOOKS}/source.mov',
            proxy: '.neko/.cache/proxies/variable_proxy.mp4',
            sourceSize: 1024,
            sourceModified: 1_752_361_200_000,
            proxyResolution: '960x540',
            status: 'ready',
            createdAt: 1_752_364_800_000,
          },
        },
      }),
      'utf8',
    );
    const manifestStore = createMemoryManifestStore();

    await migrateLegacyProxyManifest({
      manifestPath,
      workDir: root,
      legacyProxyRoot,
      resourceCacheRoot,
      manifestStore,
      now: () => 1_752_364_800_000,
    });

    const manifest = await manifestStore.load();
    expect(manifest.entries['variable']?.resource.source).toEqual({
      kind: 'file',
      filePath: '${BOOKS}/source.mov',
      identity: { sizeBytes: 1024, mtimeMs: 1_752_361_200_000 },
    });
  });

  it.each([
    { name: 'absolute source', source: '/outside/source.mov', proxy: 'managed' },
    { name: 'escaping source', source: '../outside/source.mov', proxy: 'managed' },
    { name: 'escaping variable source', source: '${BOOKS}/../outside.mov', proxy: 'managed' },
    { name: 'absolute proxy', source: 'media/source.mov', proxy: '/outside/proxy.mp4' },
    {
      name: 'escaping proxy',
      source: 'media/source.mov',
      proxy: '.neko/.cache/proxies/../proxy.mp4',
    },
  ])('quarantines $name before copying artifacts or updating projection', async (invalid) => {
    const root = await mkdtemp(join(tmpdir(), 'neko-proxy-path-quarantine-'));
    temporaryDirectories.push(root);
    const legacyProxyRoot = join(root, '.neko', '.cache', 'proxies');
    const resourceCacheRoot = join(root, '.neko', '.cache', 'resources');
    const manifestPath = join(legacyProxyRoot, 'manifest.json');
    await mkdir(legacyProxyRoot, { recursive: true });
    await writeFile(join(legacyProxyRoot, 'valid_proxy.mp4'), 'valid artifact', 'utf8');
    const invalidProxyPath =
      invalid.proxy === 'managed' ? '.neko/.cache/proxies/invalid_proxy.mp4' : invalid.proxy;
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        proxies: {
          valid: {
            source: 'media/valid.mov',
            proxy: '.neko/.cache/proxies/valid_proxy.mp4',
            sourceSize: 10,
            sourceModified: 1_752_361_200_000,
            proxyResolution: '960x540',
            status: 'ready',
            createdAt: 1_752_364_800_000,
          },
          invalid: {
            source: invalid.source,
            proxy: invalidProxyPath,
            sourceSize: 20,
            sourceModified: 1_752_361_200_000,
            proxyResolution: '960x540',
            status: 'ready',
            createdAt: 1_752_364_800_000,
          },
        },
      }),
      'utf8',
    );
    const manifestStore = createMemoryManifestStore();

    const report = await migrateLegacyProxyManifest({
      manifestPath,
      workDir: root,
      legacyProxyRoot,
      resourceCacheRoot,
      manifestStore,
      now: () => 1_752_364_800_000,
    });

    expect(report.sourceStatus).toBe('quarantined');
    expect(report.sourceDiagnostic).toMatch(/path/u);
    expect(report.copiedArtifactCount).toBe(0);
    await expect(access(join(resourceCacheRoot, 'proxies'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
    await expect(manifestStore.load()).resolves.toMatchObject({ entries: {} });
  });
});

function createMemoryManifestStore(): ResourceCacheManifestStore {
  let manifest: ResourceCacheManifest = {
    version: 1,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    entries: {},
  };
  return {
    load: async () => manifest,
    save: async (next) => {
      manifest = next;
    },
    update: async (operation) => {
      manifest = await operation(manifest);
      return manifest;
    },
    invalidateCache() {},
  };
}

function createLegacyManifest(artifactPath: string) {
  return {
    version: 1,
    projectRoot: '/legacy/workspace',
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T01:00:00.000Z',
    entries: {
      'resource-1': {
        resource: {
          id: 'resource-1',
          scope: 'project',
          provider: 'document-archive',
          kind: 'document',
          source: { kind: 'file', projectRelativePath: 'books/comic.epub' },
          fingerprint: { strategy: 'hash', value: 'sha256:source-v1' },
        },
        status: 'ready',
        createdAt: '2026-07-13T00:00:00.000Z',
        updatedAt: '2026-07-13T01:00:00.000Z',
        variants: [
          {
            key: 'thumbnail:256x256',
            role: 'thumbnail',
            status: 'ready',
            absolutePath: artifactPath,
            mimeType: 'image/jpeg',
            width: 256,
            height: 256,
            sizeBytes: 1024,
            createdAt: '2026-07-13T00:00:00.000Z',
            updatedAt: '2026-07-13T01:00:00.000Z',
            rebuildable: true,
          },
        ],
      },
    },
  };
}
