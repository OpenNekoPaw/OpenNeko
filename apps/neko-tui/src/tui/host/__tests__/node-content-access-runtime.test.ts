import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZipModule from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDocumentResourceRef,
  createGeneratedAssetResourceRef,
} from '@neko/shared/content-access';
import {
  createNodeContentAccessRuntime,
  loadTuiDocumentReaderModule,
  type NodeContentAccessRuntime,
} from '../node-content-access-runtime';
import { createNodeWorkspaceContentHostAdapter } from '../node-workspace-content-host';

const runtimeSourcePath = path.resolve(__dirname, '..', 'node-content-access-runtime.ts');
const packageJsonPath = path.resolve(__dirname, '..', '..', '..', '..', 'package.json');
const createdPaths: string[] = [];
const runtimes: NodeContentAccessRuntime[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
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
  it('loads bytes from a workspace-linked media library through the ordinary workspace path', async () => {
    const workDir = createTempDir();
    const mediaRoot = createTempDir();
    fs.mkdirSync(path.join(workDir, 'neko', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(mediaRoot, 'epub'), { recursive: true });
    fs.symlinkSync(mediaRoot, path.join(workDir, 'neko', 'assets', 'Assets'), directoryLinkType());
    fs.writeFileSync(path.join(mediaRoot, 'epub', 'sample.txt'), 'from-media-library', 'utf8');

    const runtime = createTestContentAccessRuntime(workDir);

    const result = await runtime.loadProviderAsset({
      caller: 'read-image',
      source: { kind: 'file', path: 'neko/assets/Assets/epub/sample.txt' },
    });

    expect(result).toMatchObject({
      status: 'ready',
      sizeBytes: 'from-media-library'.length,
    });
    expect(Buffer.from(result.bytes ?? []).toString('utf8')).toBe('from-media-library');
  });

  it('reads document entry bytes directly for Agent context without materializing cache', async () => {
    const workDir = createTempDir();
    const archivePath = path.join(workDir, 'book.epub');
    const imageBytes = Buffer.from('direct-document-image');
    const archive = new (AdmZipModule as unknown as AdmZipConstructor)();
    archive.addFile('OPS/images/page-1.png', imageBytes);
    archive.writeZip(archivePath);

    const runtime = createTestContentAccessRuntime(workDir);
    const resourceRef = createDocumentResourceRef({
      source: { filePath: 'book.epub', format: 'epub' },
      entryPath: 'OPS/images/page-1.png',
      scope: 'project',
    });

    const result = await runtime.loadProviderAsset({
      caller: 'read-image',
      source: resourceRef,
      variant: { role: 'document-entry', mimeType: 'image/png' },
    });

    expect(result.status).toBe('ready');
    expect(Buffer.from(result.bytes ?? []).toString('utf8')).toBe('direct-document-image');

    const attachmentResult = await runtime.loadProviderAsset({
      caller: 'perception-asset-loader',
      source: resourceRef,
    });

    expect(attachmentResult.status).toBe('ready');
    expect(Buffer.from(attachmentResult.bytes ?? []).toString('utf8')).toBe(
      'direct-document-image',
    );
  });

  it('loads generated asset source bytes without materializing resource cache', async () => {
    const workDir = createTempDir();
    const generatedPath = path.join(workDir, 'neko/generated/image/asset-1.png');
    const imageBytes = Buffer.from('generated-image-bytes');
    fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
    fs.writeFileSync(generatedPath, imageBytes);
    const runtime = createTestContentAccessRuntime(workDir);
    const baseResourceRef = createGeneratedAssetResourceRef({
      assetId: 'asset-1',
      path: '${WORKSPACE}/neko/generated/image/asset-1.png',
      mimeType: 'image/png',
    });
    const resourceRef = {
      ...baseResourceRef,
      source: {
        ...baseResourceRef.source,
        metadata: {
          ...baseResourceRef.source.metadata,
          revision: 'revision-1',
          contentDigest: sha256(imageBytes),
        },
      },
    };

    const result = await runtime.loadProviderAsset({
      caller: 'read-image',
      source: resourceRef,
    });

    expect(result.status).toBe('ready');
    expect(result.mimeType).toBe('image/png');
    expect(Buffer.from(result.bytes ?? []).toString('utf8')).toBe('generated-image-bytes');
  });

  it('loads pathless generated ResourceRefs through the owning asset resolver', async () => {
    const workDir = createTempDir();
    const generatedPath = path.join(workDir, 'neko/generated/image/asset-2.png');
    const imageBytes = Buffer.from('indexed-generated-image-bytes');
    fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
    fs.writeFileSync(generatedPath, imageBytes);
    const runtime = createNodeContentAccessRuntime({
      host: createNodeWorkspaceContentHostAdapter({ workDir }),
      derivedStorageHomedir: workDir,
      resolveGeneratedAsset: async (ref) =>
        ref.source.kind === 'generated-asset' && ref.source.generatedAssetId === 'asset-2'
          ? { path: generatedPath, mimeType: 'image/png' }
          : undefined,
    });
    runtimes.push(runtime);
    const resourceRef = {
      id: 'generated-output:asset-2',
      scope: 'project' as const,
      provider: 'generated-output',
      kind: 'generated' as const,
      source: {
        kind: 'generated-asset' as const,
        generatedAssetId: 'asset-2',
        metadata: {
          mimeType: 'image/png',
          revision: 'revision-1',
          contentDigest: sha256(imageBytes),
        },
      },
      locator: { kind: 'generated-asset' as const, assetId: 'asset-2' },
      fingerprint: { strategy: 'provider' as const, value: 'asset-2:test' },
    };

    const result = await runtime.loadProviderAsset({
      caller: 'perception-asset-loader',
      source: resourceRef,
    });

    expect(result.status).toBe('ready');
    expect(result.mimeType).toBe('image/png');
    expect(Buffer.from(result.bytes ?? []).toString('utf8')).toBe('indexed-generated-image-bytes');
  });
});

function directoryLinkType(): 'dir' | 'junction' {
  return process.platform === 'win32' ? 'junction' : 'dir';
}

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-content-access-'));
  createdPaths.push(dir);
  return dir;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function createTestContentAccessRuntime(workDir: string) {
  const runtime = createNodeContentAccessRuntime({
    host: createNodeWorkspaceContentHostAdapter({ workDir }),
    derivedStorageHomedir: workDir,
  });
  runtimes.push(runtime);
  return runtime;
}

interface AdmZipConstructor {
  new (): {
    addFile(entryPath: string, bytes: Buffer): void;
    writeZip(filePath: string): void;
  };
}
