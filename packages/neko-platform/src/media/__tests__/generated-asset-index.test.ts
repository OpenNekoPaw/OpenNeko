import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createGeneratedAssetRevisionRef, PathResolver, type GeneratedAsset } from '@neko/shared';
import {
  LocalMetadataGeneratedOutputProjectionStore,
  type GeneratedOutputProjectionRejection,
  type ResourceCacheManifest,
  type ResourceCacheManifestStore,
} from '@neko/shared/local-metadata/node';
import {
  GeneratedAssetIndex,
  generateAssetId,
  migrateLegacyGeneratedAssetIndex,
} from '../generated-asset-index';

const tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

function imageAsset(overrides: Partial<GeneratedAsset> = {}): GeneratedAsset {
  return {
    id: 'asset-1',
    type: 'generated-image',
    path: '/tmp/a.png',
    mimeType: 'image/png',
    generatedAt: '2026-01-01T00:00:00.000Z',
    width: 1024,
    height: 1024,
    ratio: '1:1',
    ...overrides,
  } as GeneratedAsset;
}

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'neko-generated-index-'));
  tempDirs.push(dir);
  return dir;
}

describe('GeneratedAssetIndex', () => {
  it('persists generated output projection metadata without absolute Host paths', async () => {
    const workspaceRoot = await createTempDir();
    const manifest = createManifestStore();
    const store = new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: manifest.store,
      workspaceRoot,
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
    });
    const index = new GeneratedAssetIndex(store);
    const asset = imageAsset({
      path: path.join(workspaceRoot, 'neko', 'generated', 'image', 'a.png'),
    });

    await index.load();
    await index.add(asset);

    expect(JSON.stringify(manifest.current())).not.toContain(workspaceRoot);
    expect(Object.values(manifest.current().entries)).toEqual([
      expect.objectContaining({
        descriptor: expect.objectContaining({
          id: 'generated-output:asset-1',
          provider: 'generated-output-index',
        }),
        variants: [],
      }),
    ]);
    const restored = new GeneratedAssetIndex(store);
    await restored.load();
    expect(restored.get(asset.id)).toEqual(asset);
  });

  it('rejects legacy generated lifecycle fields before updating the index store', async () => {
    const workspaceRoot = await createTempDir();
    const manifest = createManifestStore();
    const index = new GeneratedAssetIndex(
      new LocalMetadataGeneratedOutputProjectionStore({
        manifestStore: manifest.store,
        workspaceRoot,
        pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
      }),
    );
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId: 'asset-1',
      contentDigest: 'sha256:asset-1',
      contentPath: 'neko/generated/image/a.png',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { operationId: 'operation-1' },
    });
    const legacyAsset = imageAsset({
      path: path.join(workspaceRoot, 'neko', 'generated', 'image', 'a.png'),
      lifecycle: {
        ...lifecycle,
        // @ts-expect-error Runtime poison fixture for the removed lifecycle field.
        resourceRef: { id: 'legacy-resource' },
      },
    });

    await expect(index.add(legacyAsset)).rejects.toThrow(
      'generated-asset-index-migration-required',
    );
    expect(manifest.current().entries).toEqual({});
  });

  it('fails visibly when persisted projection lifecycle contains a legacy field', async () => {
    const workspaceRoot = await createTempDir();
    const manifest = createManifestStore();
    const store = new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: manifest.store,
      workspaceRoot,
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
    });
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId: 'asset-1',
      contentDigest: 'sha256:asset-1',
      contentPath: 'neko/generated/image/a.png',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { operationId: 'operation-1' },
    });
    await store.update(() => [
      imageAsset({
        path: path.join(workspaceRoot, 'neko', 'generated', 'image', 'a.png'),
        lifecycle,
      }),
    ]);
    const entry = Object.values(manifest.current().entries)[0];
    const projection = entry?.providerMetadata?.['generatedOutputProjection'];
    const projectedAsset =
      typeof projection === 'object' && projection !== null
        ? Reflect.get(projection, 'asset')
        : undefined;
    const persistedLifecycle =
      typeof projectedAsset === 'object' && projectedAsset !== null
        ? Reflect.get(projectedAsset, 'lifecycle')
        : undefined;
    if (typeof persistedLifecycle !== 'object' || persistedLifecycle === null) {
      throw new Error('Expected persisted generated asset lifecycle fixture.');
    }
    Reflect.set(persistedLifecycle, 'resourceRef', { id: 'legacy-resource' });

    await expect(store.load()).rejects.toThrow('generated-output-projection-migration-required');
  });

  it('preserves and reports rejected projections when the Host explicitly isolates them', async () => {
    const workspaceRoot = await createTempDir();
    const manifest = createManifestStore();
    const canonicalStore = new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: manifest.store,
      workspaceRoot,
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
    });
    const first = imageAsset({
      id: 'asset-1',
      path: path.join(workspaceRoot, 'neko', 'generated', 'image', 'a.png'),
      lifecycle: createGeneratedAssetRevisionRef({
        assetId: 'asset-1',
        contentDigest: 'sha256:asset-1',
        contentPath: 'neko/generated/image/a.png',
        mediaKind: 'image',
        mimeType: 'image/png',
        generation: { operationId: 'operation-1' },
      }),
    });
    const second = imageAsset({
      id: 'asset-2',
      path: path.join(workspaceRoot, 'neko', 'generated', 'image', 'b.png'),
    });
    await canonicalStore.update(() => [first, second]);
    const rejectedEntry = manifest.current().entries['generated-output:asset-1'];
    const projection = rejectedEntry?.providerMetadata?.['generatedOutputProjection'];
    const projectedAsset =
      typeof projection === 'object' && projection !== null
        ? Reflect.get(projection, 'asset')
        : undefined;
    const persistedLifecycle =
      typeof projectedAsset === 'object' && projectedAsset !== null
        ? Reflect.get(projectedAsset, 'lifecycle')
        : undefined;
    if (!rejectedEntry || typeof persistedLifecycle !== 'object' || persistedLifecycle === null) {
      throw new Error('Expected persisted generated output projection fixture.');
    }
    Reflect.set(persistedLifecycle, 'resourceRef', { id: 'legacy-resource' });
    const rejectedSnapshot = structuredClone(rejectedEntry);
    Reflect.deleteProperty(manifest.current().entries, 'generated-output:asset-1');
    Reflect.set(manifest.current().entries, 'projection-storage-key', rejectedEntry);
    const rejections: GeneratedOutputProjectionRejection[] = [];
    const isolatedStore = new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: manifest.store,
      workspaceRoot,
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
      rejectedProjectionPolicy: {
        mode: 'preserve-and-report',
        report: (rejection) => rejections.push(rejection),
      },
    });

    await expect(isolatedStore.load()).resolves.toEqual([second]);
    expect(rejections).toEqual([
      {
        code: 'generated-output-projection-migration-required',
        resourceId: 'generated-output:asset-1',
        message: expect.stringContaining('invalid or legacy projection'),
      },
    ]);

    await isolatedStore.update((assets) => assets);
    expect(manifest.current().entries['projection-storage-key']).toEqual(rejectedSnapshot);
    expect(manifest.current().entries['generated-output:asset-2']).toBeDefined();
  });

  it('allows a canonical projection to deliberately replace a rejected row with the same id', async () => {
    const workspaceRoot = await createTempDir();
    const manifest = createManifestStore();
    const canonicalStore = new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: manifest.store,
      workspaceRoot,
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
    });
    const asset = imageAsset({
      path: path.join(workspaceRoot, 'neko', 'generated', 'image', 'a.png'),
    });
    await canonicalStore.update(() => [asset]);
    const rejectedEntry = manifest.current().entries['generated-output:asset-1'];
    const projection = rejectedEntry?.providerMetadata?.['generatedOutputProjection'];
    if (!rejectedEntry || typeof projection !== 'object' || projection === null) {
      throw new Error('Expected persisted generated output projection fixture.');
    }
    Reflect.set(projection, 'version', 0);
    const rejections: GeneratedOutputProjectionRejection[] = [];
    const isolatedStore = new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: manifest.store,
      workspaceRoot,
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
      rejectedProjectionPolicy: {
        mode: 'preserve-and-report',
        report: (rejection) => rejections.push(rejection),
      },
    });

    await isolatedStore.update(() => [asset]);

    await expect(canonicalStore.load()).resolves.toEqual([asset]);
    expect(rejections).toHaveLength(1);
  });

  it('rejects a lifecycle locator that points at a different workspace file', async () => {
    const workspaceRoot = await createTempDir();
    const manifest = createManifestStore();
    const store = new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: manifest.store,
      workspaceRoot,
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
    });
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId: 'asset-1',
      contentDigest: 'sha256:asset-1',
      contentPath: 'neko/generated/image/other.png',
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { operationId: 'operation-1' },
    });

    await expect(
      store.update(() => [
        imageAsset({
          path: path.join(workspaceRoot, 'neko', 'generated', 'image', 'a.png'),
          lifecycle,
        }),
      ]),
    ).rejects.toThrow('lifecycle locator does not match its workspace projection path');
    expect(manifest.current().entries).toEqual({});
  });

  it('fails visibly instead of loading the removed generated-draft projection path', async () => {
    const workspaceRoot = await createTempDir();
    const asset = imageAsset({
      path: path.join(workspaceRoot, 'neko', 'generated', 'image', 'legacy.png'),
    });
    const manifest = createManifestStore({
      version: 2,
      createdAt: '2026-07-13T00:00:00.000Z',
      updatedAt: '2026-07-13T00:00:00.000Z',
      entries: {
        'generated-draft:asset-1': {
          descriptor: {
            id: 'generated-draft:asset-1',
            scope: 'project',
            provider: 'generated-draft-index',
            kind: 'generated',
            source: {
              kind: 'generated-asset',
              generatedAssetId: 'asset-1',
              projectRelativePath: 'neko/generated/image/legacy.png',
            },
            fingerprint: { strategy: 'provider', value: 'asset-1:legacy' },
          },
          variants: [],
          createdAt: asset.generatedAt,
          updatedAt: asset.generatedAt,
          status: 'ready',
          providerMetadata: {
            generatedDraftProjection: {
              version: 1,
              asset: {
                id: asset.id,
                type: asset.type,
                mimeType: asset.mimeType,
                generatedAt: asset.generatedAt,
                width: 1024,
                height: 1024,
                ratio: '1:1',
              },
              pathKey: '${WORKSPACE}/neko/generated/image/legacy.png',
            },
          },
        },
      },
    });

    await expect(
      new LocalMetadataGeneratedOutputProjectionStore({
        manifestStore: manifest.store,
        workspaceRoot,
        pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
      }).load(),
    ).rejects.toThrow('retired-generated-draft-projection');
  });

  it('backs up, imports, verifies, and archives the legacy generated asset index', async () => {
    const workspaceRoot = await createTempDir();
    const generatedDir = path.join(workspaceRoot, 'neko', 'generated');
    const indexPath = path.join(generatedDir, 'index.json');
    const asset = imageAsset({ path: path.join(generatedDir, 'image', 'a.png') });
    await mkdir(generatedDir, { recursive: true });
    await writeFile(indexPath, JSON.stringify({ version: 1, assets: [asset] }), 'utf8');
    const manifest = createManifestStore();
    const store = new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: manifest.store,
      workspaceRoot,
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
    });

    const report = await migrateLegacyGeneratedAssetIndex({
      indexPath,
      store,
      now: () => '2026-07-13T04:00:00.000Z',
    });

    expect(report).toMatchObject({
      sourceStatus: 'migrated',
      importedEntryCount: 1,
      verifiedEntryCount: 1,
    });
    await expect(access(report.backupPath!)).resolves.toBeUndefined();
    await expect(access(report.archivedPath!)).resolves.toBeUndefined();
    await expect(access(indexPath)).rejects.toThrow();
    await expect(store.load()).resolves.toEqual([asset]);
  });

  it('backs up and quarantines a malformed legacy generated asset index', async () => {
    const workspaceRoot = await createTempDir();
    const generatedDir = path.join(workspaceRoot, 'neko', 'generated');
    const indexPath = path.join(generatedDir, 'index.json');
    await mkdir(generatedDir, { recursive: true });
    await writeFile(indexPath, '{bad json', 'utf8');
    const manifest = createManifestStore();
    const store = new LocalMetadataGeneratedOutputProjectionStore({
      manifestStore: manifest.store,
      workspaceRoot,
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
    });

    const report = await migrateLegacyGeneratedAssetIndex({
      indexPath,
      store,
      now: () => '2026-07-13T04:30:00.000Z',
    });

    expect(report).toMatchObject({
      sourceStatus: 'quarantined',
      importedEntryCount: 0,
      verifiedEntryCount: 0,
      sourceDiagnostic: expect.stringContaining('JSON'),
    });
    await expect(access(report.backupPath!)).resolves.toBeUndefined();
    await expect(access(report.quarantinePath!)).resolves.toBeUndefined();
    await expect(store.load()).resolves.toEqual([]);
  });

  it('rejects the retired JSON index constructor path', async () => {
    const dir = await createTempDir();

    expect(() => new GeneratedAssetIndex(dir as never)).toThrow(
      'Legacy generated asset JSON indexes are migration-only.',
    );
  });

  it('adds, filters, sorts and removes generated assets in memory', async () => {
    const workspaceRoot = await createTempDir();
    const manifest = createManifestStore();
    const index = new GeneratedAssetIndex(
      new LocalMetadataGeneratedOutputProjectionStore({
        manifestStore: manifest.store,
        workspaceRoot,
        pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
      }),
    );
    const first = imageAsset({
      id: 'asset-1',
      path: path.join(workspaceRoot, 'neko', 'generated', 'image', 'a.png'),
      model: 'model-a',
      generatedAt: '2026-01-01T00:00:00.000Z',
    });
    const second = imageAsset({
      id: 'asset-2',
      type: 'generated-video',
      path: path.join(workspaceRoot, 'neko', 'generated', 'video', 'b.mp4'),
      mimeType: 'video/mp4',
      model: 'model-b',
      generatedAt: '2026-01-02T00:00:00.000Z',
      duration: 3,
      fps: 24,
    });

    await index.add(first);
    await index.add(second);

    expect(index.size).toBe(2);
    expect(index.get('asset-1')).toEqual(first);
    expect(index.list().map((asset) => asset.id)).toEqual(['asset-2', 'asset-1']);
    expect(index.list({ model: 'model-a' })).toEqual([first]);
    expect(index.list({ type: 'generated-video' })).toEqual([second]);
    await expect(index.remove('asset-1')).resolves.toBe(true);
    expect(index.size).toBe(1);
  });

  it('generates unique asset ids', () => {
    expect(generateAssetId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});

function createManifestStore(initial?: ResourceCacheManifest): {
  readonly store: ResourceCacheManifestStore;
  readonly current: () => ResourceCacheManifest;
} {
  let manifest: ResourceCacheManifest = initial ?? {
    version: 2,
    createdAt: '2026-07-13T00:00:00.000Z',
    updatedAt: '2026-07-13T00:00:00.000Z',
    entries: {},
  };
  return {
    current: () => manifest,
    store: {
      load: async () => manifest,
      save: async (next) => {
        manifest = next;
      },
      update: async (operation) => {
        manifest = await operation(manifest);
        return manifest;
      },
      invalidateCache() {},
    },
  };
}
