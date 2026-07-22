import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZipModule from 'adm-zip';
import { afterEach, describe, expect, it } from 'vitest';
import type { NekoHostPorts } from '@neko/host';
import {
  createGeneratedAssetRevisionRef,
  type GeneratedImage,
  type PerceptualAssetRef,
  type ResourceRef,
} from '@neko/shared';
import { GeneratedAssetIndex } from '@neko/platform';
import {
  createNodeContentAccessRuntime,
  type NodeContentAccessRuntime,
} from '../node-content-access-runtime';
import { createNodeHostAdapter } from '../node-host-adapter';
import { createNodePerceptionAssetLoader } from '../node-perception-asset-loader';
import { createNodeWorkspaceContentHostAdapter } from '../node-workspace-content-host';

const createdPaths: string[] = [];
const runtimes: NodeContentAccessRuntime[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
  for (const target of createdPaths.splice(0).reverse()) {
    fs.rmSync(target, { recursive: true, force: true });
  }
});

describe('createNodePerceptionAssetLoader', () => {
  it('loads media library image refs as provider-ready data URLs', async () => {
    const workDir = createTempDir();
    const mediaRoot = createTempDir();
    const imageBytes = Buffer.from('image-bytes');
    fs.mkdirSync(path.join(workDir, 'neko', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(mediaRoot, 'images'), { recursive: true });
    fs.symlinkSync(mediaRoot, path.join(workDir, 'neko', 'assets', 'Assets'), directoryLinkType());
    fs.writeFileSync(path.join(mediaRoot, 'images', 'frame.png'), imageBytes);

    const loader = createNodePerceptionAssetLoader(
      createTestContentAccessRuntime(createNodeWorkspaceContentHostAdapter({ workDir }), workDir),
    );

    const result = await loader.load({
      assetId: 'asset-1',
      uri: 'neko/assets/Assets/images/frame.png',
      mimeType: 'image/png',
    });

    expect(result).toEqual({
      kind: 'image',
      url: `data:image/png;base64,${imageBytes.toString('base64')}`,
      mimeType: 'image/png',
    });
  });

  it('loads generated assets by ResourceRef instead of the display URI', async () => {
    const workDir = createTempDir();
    const generatedPath = path.join(workDir, 'neko/generated/image/asset-1.png');
    const imageBytes = Buffer.from('generated-image-bytes');
    fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
    fs.writeFileSync(generatedPath, imageBytes);
    const resourceRef = createGeneratedAssetRevisionRef({
      assetId: 'asset-1',
      contentDigest: `sha256:${createHash('sha256').update(imageBytes).digest('hex')}`,
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { taskId: 'task-1' },
    }).resourceRef;
    const loader = createNodePerceptionAssetLoader(
      createTestContentAccessRuntime(
        createNodeWorkspaceContentHostAdapter({ workDir }),
        workDir,
        async (ref) =>
          ref.source.generatedAssetId === 'asset-1'
            ? { path: generatedPath, mimeType: 'image/png' }
            : undefined,
      ),
    );

    const result = await loader.load({
      assetId: 'asset-1',
      uri: 'generated-assets/non-existent-display-label.png',
      mimeType: 'image/png',
      resourceRef,
    });

    expect(result).toEqual({
      kind: 'image',
      url: `data:image/png;base64,${imageBytes.toString('base64')}`,
      mimeType: 'image/png',
    });
  });

  it('resolves generated asset display refs through the shared asset index', async () => {
    const workDir = createTempDir();
    const generatedDir = path.join(workDir, 'neko/generated');
    const generatedPath = path.join(generatedDir, 'image/asset-1.png');
    const imageBytes = Buffer.from('indexed-generated-image-bytes');
    fs.mkdirSync(path.dirname(generatedPath), { recursive: true });
    fs.writeFileSync(generatedPath, imageBytes);
    const assetIndex = new GeneratedAssetIndex({
      load: async () => [],
      update: async (operation) => operation([]),
    });
    const asset: GeneratedImage = {
      type: 'generated-image',
      id: 'asset-1',
      path: generatedPath,
      assetRef: {
        assetId: 'asset-1',
        uri: 'generated-assets/asset-1.png',
        mimeType: 'image/png',
      },
      lifecycle: createGeneratedAssetRevisionRef({
        assetId: 'asset-1',
        contentDigest: 'sha256:indexed',
        mediaKind: 'image',
        mimeType: 'image/png',
        generation: { taskId: 'task-1', providerId: 'openai', modelId: 'gpt-image-1' },
      }),
      mimeType: 'image/png',
      generatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
      width: 512,
      height: 512,
      ratio: '1:1',
    };
    await assetIndex.add(asset);
    const loader = createNodePerceptionAssetLoader(
      createTestContentAccessRuntime(createNodeWorkspaceContentHostAdapter({ workDir }), workDir),
      { assetIndex },
    );

    const result = await loader.load({
      assetId: 'asset-1',
      uri: 'generated-assets/asset-1.png',
      mimeType: 'image/png',
    });

    expect(result).toEqual({
      kind: 'image',
      url: `data:image/png;base64,${imageBytes.toString('base64')}`,
      mimeType: 'image/png',
    });
  });

  it('preserves audio payload kind for media library audio refs', async () => {
    const workDir = createTempDir();
    const mediaRoot = createTempDir();
    const audioBytes = Buffer.from('audio-bytes');
    fs.mkdirSync(path.join(workDir, 'neko', 'assets'), { recursive: true });
    fs.mkdirSync(path.join(mediaRoot, 'audios'), { recursive: true });
    fs.symlinkSync(mediaRoot, path.join(workDir, 'neko', 'assets', 'Assets'), directoryLinkType());
    fs.writeFileSync(path.join(mediaRoot, 'audios', 'dialogue.wav'), audioBytes);

    const loader = createNodePerceptionAssetLoader(
      createTestContentAccessRuntime(createNodeWorkspaceContentHostAdapter({ workDir }), workDir),
    );

    const result = await loader.load({
      assetId: 'audio-1',
      uri: 'neko/assets/Assets/audios/dialogue.wav',
      mimeType: 'audio/wav',
    });

    expect(result).toEqual({
      kind: 'audio',
      url: `data:audio/wav;base64,${audioBytes.toString('base64')}`,
      mimeType: 'audio/wav',
    });
  });

  it('loads document-entry refs through the TUI content access runtime', async () => {
    const workDir = createTempDir();
    const archivePath = path.join(workDir, 'book.epub');
    const imageBytes = Buffer.from('document-image-bytes');
    const archive = new (AdmZipModule as unknown as AdmZipConstructor)();
    archive.addFile('OPS/images/page-1.jpg', imageBytes);
    archive.writeZip(archivePath);
    const loader = createNodePerceptionAssetLoader(
      createTestContentAccessRuntime(createNodeHostAdapter({ workDir }), workDir),
    );
    const documentAsset: PerceptualAssetRef = {
      assetId: 'doc-image-1',
      uri: 'book.epub#OPS/images/page-1.jpg',
      mimeType: 'image/jpeg',
      documentResourceRef: {
        kind: 'document-entry',
        source: { filePath: archivePath, format: 'epub' },
        entryPath: 'OPS/images/page-1.jpg',
        versionPolicy: 'versioned-export',
      },
    };

    const result = await loader.load(documentAsset);

    expect(result).toEqual({
      kind: 'image',
      url: `data:image/jpeg;base64,${imageBytes.toString('base64')}`,
      mimeType: 'image/jpeg',
    });
  });

  it('loads canonical document-entry locators without provider fallback', async () => {
    const workDir = createTempDir();
    const archivePath = path.join(workDir, 'book.epub');
    const imageBytes = Buffer.from('canonical-document-image-bytes');
    const archive = new (AdmZipModule as unknown as AdmZipConstructor)();
    archive.addFile('OPS/images/page-1.jpg', imageBytes);
    archive.writeZip(archivePath);
    const loader = createNodePerceptionAssetLoader(
      createTestContentAccessRuntime(createNodeHostAdapter({ workDir }), workDir),
    );
    const documentAsset: PerceptualAssetRef = {
      assetId: 'doc-image-content-locator-1',
      uri: 'content:document-entry',
      mimeType: 'image/jpeg',
      contentLocator: {
        kind: 'document-entry',
        source: { kind: 'workspace-file', path: 'book.epub' },
        entryPath: 'OPS/images/page-1.jpg',
      },
    };

    const result = await loader.load(documentAsset);

    expect(result).toEqual({
      kind: 'image',
      url: `data:image/jpeg;base64,${imageBytes.toString('base64')}`,
      mimeType: 'image/jpeg',
    });
  });
});

function directoryLinkType(): 'dir' | 'junction' {
  return process.platform === 'win32' ? 'junction' : 'dir';
}

function createTestContentAccessRuntime(
  host: NekoHostPorts,
  derivedStorageHomedir: string,
  resolveGeneratedAsset?: (
    ref: ResourceRef,
  ) => Promise<{ readonly path: string; readonly mimeType?: string } | undefined>,
) {
  const runtime = createNodeContentAccessRuntime({
    host,
    derivedStorageHomedir,
    ...(resolveGeneratedAsset ? { resolveGeneratedAsset } : {}),
  });
  runtimes.push(runtime);
  return runtime;
}

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neko-node-perception-asset-'));
  createdPaths.push(dir);
  return dir;
}

interface AdmZipConstructor {
  new (): {
    addFile(entryPath: string, bytes: Buffer): void;
    writeZip(filePath: string): void;
  };
}
