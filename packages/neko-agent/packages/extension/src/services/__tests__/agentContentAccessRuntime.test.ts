import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import AdmZip from 'adm-zip';
import sharp from 'sharp';
import {
  PathResolver,
  createGeneratedAssetRevisionRef,
  createResourceFingerprint,
  createResourceRef,
} from '@neko/shared';
import { createGeneratedAssetResourceResolver } from '@neko/platform';
import type { HostDerivedContentRuntime } from '@neko/shared/vscode/extension';
import { createExtensionAgentContentAccessRuntime } from '../agentContentAccessRuntime';
import { createLocalPerceptionAssetLoader } from '../perceptionAssetLoader';
import { createReadImageTool } from '../../tools/readImageTool';

vi.mock('vscode', async () => await import('../../__mocks__/vscode'));

const PNG_1X1 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

describe('createExtensionAgentContentAccessRuntime', () => {
  const tempDirs: string[] = [];
  const derivedRuntimes: HostDerivedContentRuntime[] = [];

  afterEach(async () => {
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: '/mock/workspace' } as vscode.Uri, name: 'mock', index: 0 },
    ];
    await Promise.all(derivedRuntimes.splice(0).map((runtime) => runtime.dispose()));
    await Promise.all(
      tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it('loads path-backed provider assets through ContentRead without Engine registration', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-source-read-'));
    tempDirs.push(tempDir);
    const workspaceRoot = path.join(tempDir, 'workspace');
    const sourcePath = path.join(workspaceRoot, 'assets/page.png');
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(sourcePath, PNG_1X1);
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: workspaceRoot } as vscode.Uri, name: 'demo', index: 0 },
    ];
    const { runtime, derivedRuntime } = await createExtensionAgentContentAccessRuntime({
      workspaceRoot,
      derivedStorageHomedir: await createDerivedStorageHomedir(tempDirs),
    });
    derivedRuntimes.push(derivedRuntime);
    const signal = new AbortController().signal;

    const result = await runtime.loadProviderAsset({
      source: { kind: 'file', path: 'assets/page.png' },
      mimeTypeHint: 'image/png',
      signal,
    });

    expect(result.status).toBe('ready');
    expect(Array.from(result.bytes ?? [])).toEqual(Array.from(PNG_1X1));
  });

  it('fails visibly when a path-backed source is missing', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-missing-read-'));
    tempDirs.push(tempDir);
    const workspaceRoot = path.join(tempDir, 'workspace');
    await fs.mkdir(workspaceRoot, { recursive: true });
    const { runtime, derivedRuntime } = await createExtensionAgentContentAccessRuntime({
      workspaceRoot,
      derivedStorageHomedir: await createDerivedStorageHomedir(tempDirs),
    });
    derivedRuntimes.push(derivedRuntime);

    const result = await runtime.loadProviderAsset({
      source: { kind: 'file', path: 'assets/page.png' },
    });

    expect(result.status).toBe('failed');
    expect(result.bytes).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'content-missing',
      }),
    ]);
  });

  it('reads native document entries without invoking derived representation storage', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-content-access-'));
    tempDirs.push(tempDir);
    const workspaceRoot = path.join(tempDir, 'workspace');
    const archivePath = path.join(workspaceRoot, 'book.epub');
    await fs.mkdir(workspaceRoot, { recursive: true });
    const archive = new AdmZip();
    archive.addFile('OPS/images/page-1.png', Buffer.from(PNG_1X1));
    archive.writeZip(archivePath);
    const ref = createResourceRef({
      id: 'res-page-1',
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        filePath: 'book.epub',
        document: { filePath: 'book.epub', format: 'epub' },
      },
      locator: { kind: 'document', entryPath: 'OPS/images/page-1.png' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'book-v1',
        providerId: 'document-archive',
      }),
    });
    const { runtime, contentRepresentation, derivedRuntime } =
      await createExtensionAgentContentAccessRuntime({
        workspaceRoot,
        derivedStorageHomedir: await createDerivedStorageHomedir(tempDirs),
      });
    derivedRuntimes.push(derivedRuntime);

    const result = await runtime.loadProviderAsset({
      source: ref,
      variant: { role: 'document-entry', mimeType: 'image/png' },
    });

    expect(result.status).toBe('ready');
    expect(Array.from(result.bytes ?? [])).toEqual(Array.from(PNG_1X1));
    expect(result.source).toMatchObject({
      provider: 'document-archive',
      source: {
        kind: 'document',
        document: { filePath: 'book.epub', format: 'epub' },
      },
    });
    await expect(
      contentRepresentation.getRepresentation({
        source: { kind: 'workspace-file', path: 'book.epub' },
        spec: { kind: 'raster-page', page: 1 },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'representation-failed' },
    });
  });

  it('loads pathless generated ResourceRefs for ReadImage and perception', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-generated-access-'));
    tempDirs.push(tempDir);
    const workspaceRoot = path.join(tempDir, 'workspace');
    const generatedPath = path.join(workspaceRoot, 'neko/generated/image/asset-1.png');
    await fs.mkdir(path.dirname(generatedPath), { recursive: true });
    await fs.writeFile(generatedPath, PNG_1X1);
    vscode.workspace.workspaceFolders = [
      { uri: { fsPath: workspaceRoot } as vscode.Uri, name: 'workspace', index: 0 },
    ];
    const context = {
      extensionUri: { fsPath: path.join(tempDir, 'extension') },
      globalStorageUri: { fsPath: path.join(tempDir, 'global') },
    } as vscode.ExtensionContext;
    const lifecycle = createGeneratedAssetRevisionRef({
      assetId: 'asset-1',
      contentDigest: sha256(PNG_1X1),
      mediaKind: 'image',
      mimeType: 'image/png',
      generation: { taskId: 'task-1' },
    });
    const getGeneratedAsset = vi.fn(() => ({
      type: 'generated-image' as const,
      id: 'asset-1',
      path: generatedPath,
      lifecycle,
      mimeType: 'image/png',
      generatedAt: '2026-07-14T00:00:00.000Z',
      width: 1,
      height: 1,
      ratio: '1:1',
    }));
    const resolveGeneratedAsset = createGeneratedAssetResourceResolver({
      get: getGeneratedAsset,
    });
    const { runtime, derivedRuntime } = await createExtensionAgentContentAccessRuntime({
      context,
      workspaceRoot,
      derivedStorageHomedir: await createDerivedStorageHomedir(tempDirs),
      pathResolver: new PathResolver(new Map([['WORKSPACE', workspaceRoot]])),
      resolveGeneratedAsset,
    });
    derivedRuntimes.push(derivedRuntime);
    const ref = lifecycle.resourceRef;

    expect(ref.source).not.toHaveProperty('filePath');
    expect(ref.source.metadata).not.toHaveProperty('path');

    const readImageResult = await createReadImageTool({ contentAccessRuntime: runtime }).execute({
      images: [{ resourceRef: ref }],
    });

    expect(readImageResult.success).toBe(true);
    expect(readImageResult.data).toMatchObject({
      images: [{ portableForTransfer: true, resourceRef: ref }],
    });
    const perceptualRef = readImageResult.perceptionCards?.[0]?.perceptual.thumbnailRef;
    if (!perceptualRef) throw new Error('ReadImage did not return a perceptual resource ref.');

    await expect(createLocalPerceptionAssetLoader(runtime).load(perceptualRef)).resolves.toEqual({
      kind: 'image',
      url: `data:image/png;base64,${Buffer.from(PNG_1X1).toString('base64')}`,
      mimeType: 'image/png',
    });
    expect(getGeneratedAsset).toHaveBeenCalledWith('asset-1');
  });

  it('loads document entries through Node host access without Engine archive APIs', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-document-access-'));
    tempDirs.push(tempDir);
    const workspaceRoot = path.join(tempDir, 'workspace');
    const booksRoot = path.join(tempDir, 'books');
    const libraryLink = path.join(workspaceRoot, 'neko/assets/Books');
    const archivePath = path.join(booksRoot, 'comic.epub');
    await fs.mkdir(path.dirname(libraryLink), { recursive: true });
    await fs.mkdir(booksRoot, { recursive: true });
    await fs.symlink(booksRoot, libraryLink, 'dir');
    const archive = new AdmZip();
    archive.addFile('OPS/images/page-1.png', Buffer.from(PNG_1X1));
    archive.writeZip(archivePath);
    const { runtime, derivedRuntime } = await createExtensionAgentContentAccessRuntime({
      workspaceRoot,
      derivedStorageHomedir: await createDerivedStorageHomedir(tempDirs),
    });
    derivedRuntimes.push(derivedRuntime);
    const documentEntryRef = createResourceRef({
      id: 'res-page-1',
      scope: 'project',
      provider: 'document-archive',
      kind: 'document',
      source: {
        kind: 'document',
        filePath: 'neko/assets/Books/comic.epub',
        document: { filePath: 'neko/assets/Books/comic.epub', format: 'epub' },
      },
      locator: { kind: 'document', entryPath: 'OPS/images/page-1.png' },
      fingerprint: createResourceFingerprint({
        strategy: 'provider',
        value: 'comic-v1',
        providerId: 'document-archive',
      }),
    });

    const result = await runtime.loadProviderAsset({
      source: documentEntryRef,
    });

    expect(result.status).toBe('ready');
    expect(Array.from(result.bytes ?? [])).toEqual(Array.from(PNG_1X1));
  });

  it('rejects runtime handles as durable Agent content identity', async () => {
    const { runtime, derivedRuntime } = await createExtensionAgentContentAccessRuntime({
      workspaceRoot: '/workspace/demo',
      derivedStorageHomedir: await createDerivedStorageHomedir(tempDirs),
    });
    derivedRuntimes.push(derivedRuntime);

    const result = await runtime.loadProviderAsset({
      source: {
        kind: 'runtime',
        runtimeKind: 'transient-preview-uri',
        value: 'vscode-resource://preview/page-1.png',
      },
    });

    expect(result.status).toBe('unsupported-source');
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'runtime-handle-rejected',
      }),
    ]);
  });

  it('generates and reads image representations without exposing Host storage paths', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-representation-'));
    tempDirs.push(tempDir);
    const workspaceRoot = path.join(tempDir, 'workspace');
    const sourcePath = path.join(workspaceRoot, 'assets/source.png');
    await fs.mkdir(path.dirname(sourcePath), { recursive: true });
    await fs.writeFile(
      sourcePath,
      await sharp({
        create: { width: 80, height: 40, channels: 4, background: '#ff0000' },
      })
        .png()
        .toBuffer(),
    );
    const { contentRepresentation, derivedRuntime } =
      await createExtensionAgentContentAccessRuntime({
        workspaceRoot,
        derivedStorageHomedir: await createDerivedStorageHomedir(tempDirs),
      });
    derivedRuntimes.push(derivedRuntime);

    const representation = await contentRepresentation.getRepresentation({
      source: { kind: 'workspace-file', path: 'assets/source.png' },
      spec: { kind: 'thumbnail', maxWidth: 20, maxHeight: 20, format: 'webp' },
    });
    expect(representation).toMatchObject({
      status: 'ready',
      metadata: { mimeType: 'image/webp', width: 20, height: 10 },
    });
    expect(JSON.stringify(representation)).not.toMatch(/(?:\.neko|cacheRoot|absolutePath)/i);
    if (representation.status !== 'ready') throw new Error('Representation was not generated.');

    const loaded = await contentRepresentation.readRepresentation(representation.locator, {
      maxBytes: 1024 * 1024,
    });
    expect(loaded).toMatchObject({ status: 'ready', offset: 0 });
    if (loaded.status !== 'ready') throw new Error('Representation was not readable.');
    await expect(sharp(loaded.bytes).metadata()).resolves.toMatchObject({
      format: 'webp',
      width: 20,
      height: 10,
    });
    expect(JSON.stringify(loaded)).not.toMatch(/(?:\.neko|cacheRoot|absolutePath)/i);
  });
});

async function createDerivedStorageHomedir(temporaryDirectories: string[]): Promise<string> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-derived-storage-'));
  temporaryDirectories.push(directory);
  return directory;
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
