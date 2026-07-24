import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import type { ContentReadService } from '../../../types/content-io';
import { createProjectSnapshotPackage } from '../project-package';

vi.mock('../workspace-linked-path-guard', () => ({
  authorizeWorkspaceLinkedPath: vi.fn(
    async (input: { readonly workspaceRoot: string; readonly requestedPath: string }) => ({
      authorized:
        input.requestedPath === input.workspaceRoot ||
        input.requestedPath.startsWith(`${input.workspaceRoot}/`),
    }),
  ),
}));

const mocks = vi.hoisted(() => ({
  reads: new Map<string, Uint8Array>(),
  readFailures: new Set<string>(),
  writes: new Map<string, Uint8Array>(),
  saveUri: undefined as MockUri | undefined,
  resolvedPaths: new Map<string, string>(),
}));

interface MockUri {
  readonly scheme: string;
  readonly fsPath: string;
  readonly path: string;
  toString(): string;
}

function fileUri(filePath: string): MockUri {
  return {
    scheme: 'file',
    fsPath: filePath,
    path: filePath,
    toString: () => `file://${filePath}`,
  };
}

vi.mock('vscode', () => ({
  FileType: {
    File: 1,
    Directory: 2,
  },
  Uri: {
    file: (filePath: string) => fileUri(filePath),
    joinPath: (base: MockUri, ...segments: string[]) =>
      fileUri([base.fsPath, ...segments].join('/')),
  },
  window: {
    showSaveDialog: vi.fn(async () => mocks.saveUri),
    showInformationMessage: vi.fn(),
  },
  workspace: {
    workspaceFolders: [{ uri: fileUri('/workspace') }],
    getWorkspaceFolder: vi.fn((uri: MockUri) =>
      uri.fsPath.startsWith('/workspace') ? { uri: fileUri('/workspace') } : undefined,
    ),
    fs: {
      stat: vi.fn(async (uri: MockUri) => {
        if (!mocks.reads.has(uri.fsPath) || mocks.readFailures.has(uri.fsPath)) {
          throw new Error(`Missing file: ${uri.fsPath}`);
        }
        return { type: 1 };
      }),
      readFile: vi.fn(async (uri: MockUri) => {
        if (mocks.readFailures.has(uri.fsPath)) {
          throw new Error(`Missing file: ${uri.fsPath}`);
        }
        return mocks.reads.get(uri.fsPath) ?? new Uint8Array();
      }),
      writeFile: vi.fn(async (uri: MockUri, bytes: Uint8Array) => {
        mocks.writes.set(uri.fsPath, bytes);
      }),
    },
  },
  commands: {
    executeCommand: vi.fn(async (_command: string, storedPath: string) => {
      return mocks.resolvedPaths.get(storedPath) ?? storedPath;
    }),
  },
  extensions: {
    getExtension: vi.fn(() => undefined),
  },
}));

describe('createProjectSnapshotPackage', () => {
  const decoder = new TextDecoder();

  beforeEach(() => {
    mocks.reads.clear();
    mocks.readFailures.clear();
    mocks.writes.clear();
    mocks.resolvedPaths.clear();
    mocks.saveUri = fileUri('/workspace/story.zip');
    vi.clearAllMocks();
  });

  it('creates a no-engine project snapshot zip with source file and manifest', async () => {
    mocks.reads.set('/workspace/story.nkc', new Uint8Array([1, 2, 3]));

    const result = await createProjectSnapshotPackage({
      packageId: 'neko-canvas',
      title: 'Package Canvas Project',
      sourceUri: vscode.Uri.file('/workspace/story.nkc'),
      contentRead: createMockContentReadService(),
      metadata: { kind: 'canvas' },
    });

    expect(vscode.window.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Package Canvas Project',
        filters: { 'ZIP Archive': ['zip'] },
      }),
    );
    expect(vscode.window.showSaveDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultUri: expect.objectContaining({ fsPath: '/workspace/story.zip' }),
      }),
    );

    const archive = mocks.writes.get('/workspace/story.zip');
    expect(archive).toBeDefined();
    const zipEntries = readStoredZipEntries(archive!);

    expect(zipEntries.get('story.nkc')).toEqual(new Uint8Array([1, 2, 3]));
    const manifestBytes = zipEntries.get('package-manifest.json');
    expect(manifestBytes).toBeDefined();
    const manifest = JSON.parse(decoder.decode(manifestBytes)) as {
      packageId: string;
      source: { fileName: string; originalPath?: string; scheme: string };
      assets: unknown[];
      missingReferences: unknown[];
      metadata: Record<string, unknown>;
    };
    expect(manifest.packageId).toBe('neko-canvas');
    expect(manifest.source).toEqual({ fileName: 'story.nkc', scheme: 'file' });
    expect(manifest.source.originalPath).toBeUndefined();
    expect(manifest.assets).toEqual([]);
    expect(manifest.missingReferences).toEqual([]);
    expect(manifest.metadata).toEqual({ kind: 'canvas' });
    expect(result).toEqual({
      packagePath: '/workspace/story.zip',
      entries: ['package-manifest.json', 'story.nkc'],
    });
  });

  it('includes local project asset references and records missing references', async () => {
    mocks.reads.set(
      '/workspace/story.nkc',
      encodeJson({
        nodes: [
          {
            type: 'media',
            data: {
              assetPath: 'assets/ref.png',
              thumbnailPath: './thumbs/ref-thumb.jpg',
              cachePath: '/workspace/.neko/.cache/resources/ref-cache.jpg',
              runtimeAssetPath: 'https://file+.vscode-resource.vscode-cdn.net/workspace/ref.png',
              ignoredDataUrl: 'data:image/png;base64,AAAA',
              ignoredRemote: 'https://example.test/ref.png',
            },
          },
          {
            type: 'model',
            data: {
              modelPath: '/external/hero.glb',
              configPath: 'configs/hero.gltf',
              missingPath: 'assets/missing.wav',
              variablePath: '${MEDIA_ROOT}/voice.wav',
              unresolvedVariablePath: '${MISSING_ROOT}/lost.wav',
              linkedPath: 'neko/assets/Footage/linked.wav',
            },
          },
        ],
      }),
    );
    mocks.reads.set('/workspace/assets/ref.png', new Uint8Array([10]));
    mocks.reads.set('/workspace/thumbs/ref-thumb.jpg', new Uint8Array([11]));
    mocks.reads.set('/workspace/.neko/.cache/resources/ref-cache.jpg', new Uint8Array([15]));
    mocks.reads.set('/external/hero.glb', new Uint8Array([12]));
    mocks.reads.set(
      '/workspace/configs/hero.gltf',
      encodeJson({
        images: [{ uri: '../textures/hero.png' }],
      }),
    );
    mocks.reads.set('/workspace/textures/hero.png', new Uint8Array([13]));
    mocks.reads.set('/media/voice.wav', new Uint8Array([14]));
    mocks.reads.set('/workspace/neko/assets/Footage/linked.wav', new Uint8Array([16]));
    mocks.readFailures.add('/workspace/assets/missing.wav');

    const result = await createProjectSnapshotPackage({
      packageId: 'neko-canvas',
      title: 'Package Canvas Project',
      sourceUri: vscode.Uri.file('/workspace/story.nkc'),
      contentRead: createMockContentReadService(),
      metadata: { kind: 'canvas' },
    });

    const archive = mocks.writes.get('/workspace/story.zip');
    expect(archive).toBeDefined();
    const zipEntries = readStoredZipEntries(archive!);

    expect(zipEntries.get('assets/ref.png')).toEqual(new Uint8Array([10]));
    expect(zipEntries.has('thumbs/ref-thumb.jpg')).toBe(false);
    expect(zipEntries.has('.neko/.cache/resources/ref-cache.jpg')).toBe(false);
    expect(zipEntries.get('configs/hero.gltf')).toEqual(
      encodeJson({ images: [{ uri: '../textures/hero.png' }] }),
    );
    expect(zipEntries.get('textures/hero.png')).toEqual(new Uint8Array([13]));
    expect(zipEntries.get('neko/assets/Footage/linked.wav')).toEqual(new Uint8Array([16]));

    expect([...zipEntries.keys()].find((name) => name.endsWith('-hero.glb'))).toBeUndefined();
    const variableEntryName = [...zipEntries.keys()].find((name) => name.endsWith('-voice.wav'));
    expect(variableEntryName).toBeUndefined();
    expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
      'neko.assets.resolvePath',
      expect.anything(),
    );

    const manifest = JSON.parse(decoder.decode(zipEntries.get('package-manifest.json'))) as {
      assets: Array<{ packagePath: string; fileName: string }>;
      missingReferences: Array<{
        fileName?: string;
        reason: string;
        source: Record<string, unknown>;
      }>;
    };
    expect(JSON.stringify(manifest)).not.toContain('/media');
    expect(JSON.stringify(manifest)).not.toContain('/external');
    expect(manifest.assets.map((asset) => asset.packagePath)).toEqual([
      'assets/ref.png',
      'configs/hero.gltf',
      'neko/assets/Footage/linked.wav',
      'textures/hero.png',
    ]);
    expect(manifest.missingReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fileName: 'missing.wav',
          reason: 'read-failed',
          source: { kind: 'relative', reference: 'assets/missing.wav' },
        }),
        expect.objectContaining({
          fileName: 'hero.glb',
          reason: 'unsupported-reference',
          source: { kind: 'absolute', fileName: 'hero.glb' },
        }),
        expect.objectContaining({
          fileName: 'voice.wav',
          reason: 'unsupported-reference',
          source: { kind: 'variable', reference: '${MEDIA_ROOT}/voice.wav' },
        }),
        expect.objectContaining({
          fileName: 'lost.wav',
          reason: 'unsupported-reference',
          source: { kind: 'variable', reference: '${MISSING_ROOT}/lost.wav' },
        }),
        expect.objectContaining({
          reason: 'runtime-only',
          source: { kind: 'relative', reference: './thumbs/ref-thumb.jpg' },
        }),
        expect.objectContaining({
          reason: 'runtime-only',
          source: { kind: 'absolute', fileName: 'ref-cache.jpg' },
        }),
      ]),
    );
    expect(result?.entries).toEqual([
      'package-manifest.json',
      'story.nkc',
      'assets/ref.png',
      'configs/hero.gltf',
      'neko/assets/Footage/linked.wav',
      'textures/hero.png',
    ]);
  });

  it('packages caller-provided current source bytes instead of stale disk content', async () => {
    mocks.reads.set(
      '/workspace/story.nkc',
      encodeJson({
        nodes: [{ type: 'media', data: { assetPath: 'assets/stale.png' } }],
      }),
    );
    mocks.reads.set('/workspace/assets/current.png', new Uint8Array([21]));

    const currentSource = encodeJson({
      nodes: [{ type: 'media', data: { assetPath: 'assets/current.png' } }],
    });
    await createProjectSnapshotPackage({
      packageId: 'neko-canvas',
      title: 'Package Canvas Project',
      sourceUri: vscode.Uri.file('/workspace/story.nkc'),
      contentRead: createMockContentReadService(),
      sourceBytes: currentSource,
    });

    const zipEntries = readStoredZipEntries(mocks.writes.get('/workspace/story.zip')!);
    expect(zipEntries.get('story.nkc')).toEqual(currentSource);
    expect(zipEntries.get('assets/current.png')).toEqual(new Uint8Array([21]));
    expect(zipEntries.has('assets/stale.png')).toBe(false);
  });

  it('resolves a canonical linked source from the workspace root for a nested project', async () => {
    mocks.saveUri = fileUri('/workspace/boards/story.zip');
    mocks.reads.set(
      '/workspace/boards/story.nkc',
      encodeJson({
        nodes: [{ type: 'media', data: { assetPath: 'neko/assets/Books/clips/linked.mp4' } }],
      }),
    );
    mocks.reads.set('/workspace/neko/assets/Books/clips/linked.mp4', new Uint8Array([31, 32]));

    const result = await createProjectSnapshotPackage({
      packageId: 'neko-canvas',
      title: 'Package Nested Canvas Project',
      sourceUri: vscode.Uri.file('/workspace/boards/story.nkc'),
      contentRead: createMockContentReadService(),
    });

    const archive = mocks.writes.get('/workspace/boards/story.zip');
    expect(archive).toBeDefined();
    const entries = readStoredZipEntries(archive!);
    expect(entries.get('neko/assets/Books/clips/linked.mp4')).toEqual(new Uint8Array([31, 32]));
    expect(result?.entries).toContain('neko/assets/Books/clips/linked.mp4');
    expect(
      JSON.stringify(JSON.parse(decoder.decode(entries.get('package-manifest.json')))),
    ).not.toContain('/workspace');
  });
});

function createMockContentReadService(): ContentReadService {
  return {
    stat: async (locator) => {
      const filePath = locator.kind === 'workspace-file' ? `/workspace/${locator.path}` : '';
      const bytes = mocks.reads.get(filePath);
      if (!bytes || mocks.readFailures.has(filePath)) {
        return { status: 'unavailable', locator, diagnostic: { code: 'content-missing' } };
      }
      return {
        status: 'ready',
        locator,
        byteLength: bytes.byteLength,
        fingerprint: { strategy: 'mtime-size', value: `0:${bytes.byteLength}` },
      };
    },
    read: async (locator) => {
      const filePath = locator.kind === 'workspace-file' ? `/workspace/${locator.path}` : '';
      const bytes = mocks.reads.get(filePath);
      if (!bytes || mocks.readFailures.has(filePath)) {
        return { status: 'unavailable', locator, diagnostic: { code: 'content-missing' } };
      }
      return {
        status: 'ready',
        locator,
        bytes,
        offset: 0,
        totalByteLength: bytes.byteLength,
        fingerprint: { strategy: 'mtime-size', value: `0:${bytes.byteLength}` },
      };
    },
  };
}

function encodeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, null, 2));
}

function readStoredZipEntries(bytes: Uint8Array): Map<string, Uint8Array> {
  const entries = new Map<string, Uint8Array>();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    if (compressionMethod !== 0) {
      throw new Error(`Unexpected ZIP compression method: ${compressionMethod}`);
    }
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + fileNameLength));
    entries.set(name, bytes.slice(dataStart, dataEnd));
    offset = dataEnd;
  }

  return entries;
}
