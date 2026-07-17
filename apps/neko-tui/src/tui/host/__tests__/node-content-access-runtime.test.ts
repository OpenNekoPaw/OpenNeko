import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZipModule from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDocumentResourceRef,
  createGeneratedAssetResourceRef,
  type ResourceCacheManifestStore,
} from '@neko/shared/content-access';
import {
  createNodeContentAccessRuntime,
  loadTuiDocumentReaderModule,
} from '../node-content-access-runtime';
import { createNodeProjectResourceCacheStartupGcTarget } from '../node-resource-cache-startup-gc';
import { createNodeWorkspaceContentHostAdapter } from '../node-workspace-content-host';

const runtimeSourcePath = path.resolve(__dirname, '..', 'node-content-access-runtime.ts');
const packageJsonPath = path.resolve(__dirname, '..', '..', '..', '..', 'package.json');
const createdPaths: string[] = [];

afterEach(() => {
  for (const target of createdPaths.splice(0).reverse()) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('node content access runtime packaging', () => {
  it('declares EPUB and archive readers as TUI runtime dependencies', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      readonly dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies).toMatchObject({
      'adm-zip': expect.any(String),
      epub2: expect.any(String),
    });
  });

  it('uses packager-visible imports for optional document readers', () => {
    const source = fs.readFileSync(runtimeSourcePath, 'utf8');

    expect(source).toContain("from 'epub2'");
    expect(source).toContain("from 'adm-zip'");
    expect(source).not.toContain('import(packageName)');
  });

  it('fails visibly when a document reader dependency is not bundled for TUI', async () => {
    await expect(loadTuiDocumentReaderModule('pdf-parse')).rejects.toThrow(
      'Agent document reader module "pdf-parse" is unavailable on tui.',
    );
  });
});

describe('node content access runtime path variables', () => {
  it('loads bytes from configured media library variables exposed by the TUI host', async () => {
    const workDir = createTempDir();
    const mediaRoot = createTempDir();
    fs.mkdirSync(path.join(workDir, 'neko'), { recursive: true });
    fs.mkdirSync(path.join(mediaRoot, 'epub'), { recursive: true });
    fs.writeFileSync(
      path.join(workDir, 'neko', 'settings.json'),
      JSON.stringify({
        mediaLibraries: [{ name: 'Assets', path: mediaRoot, variable: 'A' }],
      }),
      'utf8',
    );
    fs.writeFileSync(path.join(mediaRoot, 'epub', 'sample.txt'), 'from-media-library', 'utf8');

    const runtime = createTestContentAccessRuntime(workDir);

    const result = await runtime.loadProviderAsset({
      caller: 'read-image',
      source: { kind: 'file', path: '${A}/epub/sample.txt' },
      preferredTarget: 'bytes',
    });

    expect(result).toMatchObject({
      status: 'ready',
      sizeBytes: 'from-media-library'.length,
    });
    expect(Buffer.from(result.bytes ?? []).toString('utf8')).toBe('from-media-library');
  });

  it('materializes document resource refs through the shared resource cache', async () => {
    const workDir = createTempDir();
    const cacheTarget = createNodeProjectResourceCacheStartupGcTarget({ workDir });
    const manifestStore = createMemoryManifestStore();
    const archivePath = path.join(workDir, 'book.epub');
    const imageBytes = Buffer.from('cached-document-image');
    const archive = new (AdmZipModule as unknown as AdmZipConstructor)();
    archive.addFile('OPS/images/page-1.png', imageBytes);
    archive.writeZip(archivePath);

    const runtime = createTestContentAccessRuntime(workDir, manifestStore);
    const resourceRef = createDocumentResourceRef({
      source: { filePath: archivePath, format: 'epub' },
      entryPath: 'OPS/images/page-1.png',
      scope: 'project',
    });

    const result = await runtime.projectResource({
      caller: 'message-resource-projection',
      source: resourceRef,
      target: 'local-path',
      variant: { role: 'page-image', mimeType: 'image/png' },
    });

    expect(result.status).toBe('ready');
    expect(result.uri).toContain(cacheTarget.cacheRoot);
    expect(Object.keys((await manifestStore.load()).entries)).toHaveLength(1);
    expect(fs.existsSync(cacheTarget.manifestPath)).toBe(false);
    expect(Buffer.from(fs.readFileSync(result.uri ?? '')).toString('utf8')).toBe(
      'cached-document-image',
    );
  });

  it('loads generated asset source bytes without materializing resource cache', async () => {
    const workDir = createTempDir();
    const generatedPath = path.join(workDir, 'neko/generated/image/asset-1.png');
    const imageBytes = Buffer.from('generated-image-bytes');
    fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
    fs.writeFileSync(generatedPath, imageBytes);
    const manifestStore = createMemoryManifestStore();
    const runtime = createTestContentAccessRuntime(workDir, manifestStore);
    const resourceRef = createGeneratedAssetResourceRef({
      assetId: 'asset-1',
      path: '${WORKSPACE}/neko/generated/image/asset-1.png',
      mimeType: 'image/png',
    });

    const result = await runtime.loadProviderAsset({
      caller: 'read-image',
      source: resourceRef,
      preferredTarget: 'bytes',
    });

    expect(result.status).toBe('ready');
    expect(result.mimeType).toBe('image/png');
    expect(Buffer.from(result.bytes ?? []).toString('utf8')).toBe('generated-image-bytes');
    expect(Object.keys((await manifestStore.load()).entries)).toHaveLength(0);
  });

  it('loads pathless generated ResourceRefs through the owning asset resolver', async () => {
    const workDir = createTempDir();
    const generatedPath = path.join(workDir, 'neko/generated/image/asset-2.png');
    const imageBytes = Buffer.from('indexed-generated-image-bytes');
    fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
    fs.writeFileSync(generatedPath, imageBytes);
    const manifestStore = createMemoryManifestStore();
    const runtime = createNodeContentAccessRuntime({
      host: createNodeWorkspaceContentHostAdapter({ workDir }),
      resourceCacheManifestStore: manifestStore,
      resolveGeneratedAsset: async (ref) =>
        ref.source.kind === 'generated-asset' && ref.source.generatedAssetId === 'asset-2'
          ? { path: generatedPath, mimeType: 'image/png' }
          : undefined,
    });
    const resourceRef = createGeneratedAssetResourceRef({
      assetId: 'asset-2',
      mimeType: 'image/png',
    });

    const result = await runtime.loadProviderAsset({
      caller: 'perception-asset-loader',
      source: resourceRef,
      preferredTarget: 'bytes',
    });

    expect(result.status).toBe('ready');
    expect(result.mimeType).toBe('image/png');
    expect(Buffer.from(result.bytes ?? []).toString('utf8')).toBe('indexed-generated-image-bytes');
    expect(Object.keys((await manifestStore.load()).entries)).toHaveLength(0);
  });
});

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-content-access-'));
  createdPaths.push(dir);
  return dir;
}

function createTestContentAccessRuntime(
  workDir: string,
  resourceCacheManifestStore: ResourceCacheManifestStore = createMemoryManifestStore(),
) {
  return createNodeContentAccessRuntime({
    host: createNodeWorkspaceContentHostAdapter({ workDir }),
    resourceCacheManifestStore,
  });
}

function createMemoryManifestStore(): ResourceCacheManifestStore {
  let manifest = {
    version: 1 as const,
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
    invalidateCache: () => undefined,
  };
}

interface AdmZipConstructor {
  new (): {
    addFile(entryPath: string, bytes: Buffer): void;
    writeZip(filePath: string): void;
  };
}
