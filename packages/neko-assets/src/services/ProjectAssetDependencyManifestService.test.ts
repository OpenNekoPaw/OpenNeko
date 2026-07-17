import { describe, expect, it, vi } from 'vitest';
import { ProjectAssetDependencyManifestService } from './ProjectAssetDependencyManifestService';

describe('ProjectAssetDependencyManifestService', () => {
  it('writes and reads sorted import, market, and workspace dependency records', async () => {
    const fs = createFs();
    const service = new ProjectAssetDependencyManifestService({
      projectRoot: '/repo',
      fs,
      now: () => new Date('2026-05-20T00:00:00.000Z'),
    });

    await service.upsert(
      service.createMarketDependency({
        id: 'z-market',
        packageId: '@studio/sakura-motion',
        version: '1.0.0',
        mediaKind: 'puppet-motion',
        dimensions: ['motion'],
      }),
    );
    await service.upsert(
      service.createImportDependency({
        id: 'a-import',
        originalFile: '/repo/downloads/sakura.zip',
        mediaKind: 'puppet-model',
        dimensions: ['model'],
        storageMode: 'bundle-memory',
        contentHash: 'sha256:source',
      }),
    );
    await service.upsert(
      service.createWorkspaceDependency({
        id: 'm-workspace',
        workspacePath: '/repo/assets/studio.hdr',
        mediaKind: 'model-config',
        dimensions: ['config'],
      }),
    );

    const manifest = await service.read();

    expect(service.manifestPath).toBe('/repo/neko/assets/manifest.json');
    expect(manifest.dependencies.map((dependency) => dependency.id)).toEqual([
      'a-import',
      'm-workspace',
      'z-market',
    ]);
    expect(fs.files.get('/repo/neko/assets/manifest.json')).toContain('"sourceKind": "import"');
  });

  it('validates recoverable bundle-memory imports without requiring extraction output', async () => {
    const fs = createFs({
      '/repo/downloads/sakura.zip': new Uint8Array([1, 2, 3]),
    });
    const service = new ProjectAssetDependencyManifestService({
      projectRoot: '/repo',
      fs,
      now: () => new Date('2026-05-20T00:00:00.000Z'),
    });
    await service.upsert(
      service.createImportDependency({
        id: 'sakura',
        originalFile: '/repo/downloads/sakura.zip',
        mediaKind: 'puppet-model',
        dimensions: ['model'],
        storageMode: 'bundle-memory',
        contentHash: 'sha256:039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      }),
    );

    await expect(service.validate()).resolves.toMatchObject({
      issues: [],
    });
  });

  it('reports missing disk destinations, missing market packages, and hash mismatches', async () => {
    const fs = createFs({
      '/repo/downloads/hero.zip': new Uint8Array([9]),
      '/repo/assets/studio.hdr': new Uint8Array([7]),
    });
    const service = new ProjectAssetDependencyManifestService({
      projectRoot: '/repo',
      fs,
      market: { isInstalled: vi.fn(() => false) },
      now: () => new Date('2026-05-20T00:00:00.000Z'),
    });
    await service.upsert(
      service.createImportDependency({
        id: 'hero',
        originalFile: '/repo/downloads/hero.zip',
        mediaKind: 'model-3d',
        dimensions: ['model'],
        storageMode: 'disk',
        contentHash: 'sha256:stale',
        importDestination: '/repo/.neko/imports/models/hero',
      }),
    );
    await service.upsert(
      service.createMarketDependency({
        id: 'motion-pack',
        packageId: '@studio/motion-pack',
        mediaKind: 'model-motion',
        dimensions: ['motion'],
      }),
    );
    await service.upsert(
      service.createWorkspaceDependency({
        id: 'workspace-hdr',
        workspacePath: '/repo/assets/studio.hdr',
        mediaKind: 'model-config',
        dimensions: ['config'],
        contentHash: 'sha256:stale',
      }),
    );

    const result = await service.validate();

    expect(result.issues.map((issue) => issue.code).sort()).toEqual([
      'missing-import-destination',
      'missing-market-package',
      'source-hash-mismatch',
      'source-hash-mismatch',
    ]);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dependencyId: 'hero',
          code: 'missing-import-destination',
        }),
        expect.objectContaining({
          dependencyId: 'motion-pack',
          code: 'missing-market-package',
          packageId: '@studio/motion-pack',
        }),
      ]),
    );
  });
});

function createFs(initialFiles: Record<string, Uint8Array> = {}) {
  const files = new Map<string, string | Uint8Array>(Object.entries(initialFiles));
  return {
    files,
    readFile: vi.fn(async (filePath: string) => {
      const file = files.get(filePath);
      if (file === undefined) throw new Error(`Missing file: ${filePath}`);
      return typeof file === 'string' ? Buffer.from(file, 'utf-8') : file;
    }),
    writeFile: vi.fn(async (filePath: string, data: Uint8Array) => {
      files.set(filePath, Buffer.from(data).toString('utf-8'));
    }),
    createDirectory: vi.fn(async () => undefined),
    exists: vi.fn(async (filePath: string) => files.has(filePath)),
  };
}
