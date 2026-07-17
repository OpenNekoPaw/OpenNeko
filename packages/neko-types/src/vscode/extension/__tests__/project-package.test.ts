import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { createProjectSnapshotPackage } from '../project-package';

const mocks = vi.hoisted(() => ({
  reads: new Map<string, Uint8Array>(),
  readFailures: new Set<string>(),
  writes: new Map<string, Uint8Array>(),
  saveUri: undefined as MockUri | undefined,
  resolvedPaths: new Map<string, string>(),
  mediaLibraryRoots: [] as string[],
  pathVariables: [] as Array<readonly [string, string]>,
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
    getExtension: vi.fn(() => ({
      isActive: true,
      exports: {
        getMediaLibraryRoots: vi.fn(async () => [...mocks.mediaLibraryRoots]),
        getPathVariables: vi.fn(async () => [...mocks.pathVariables]),
      },
      activate: vi.fn(),
    })),
  },
}));

describe('createProjectSnapshotPackage', () => {
  const decoder = new TextDecoder();

  beforeEach(() => {
    mocks.reads.clear();
    mocks.readFailures.clear();
    mocks.writes.clear();
    mocks.resolvedPaths.clear();
    mocks.mediaLibraryRoots = [];
    mocks.pathVariables = [];
    mocks.saveUri = fileUri('/workspace/story.zip');
    vi.clearAllMocks();
  });

  it('creates a no-engine project snapshot zip with source file and manifest', async () => {
    mocks.reads.set('/workspace/story.nkc', new Uint8Array([1, 2, 3]));

    const result = await createProjectSnapshotPackage({
      packageId: 'neko-canvas',
      title: 'Package Canvas Project',
      sourceUri: vscode.Uri.file('/workspace/story.nkc'),
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
    mocks.mediaLibraryRoots = ['/media'];
    mocks.pathVariables = [['MEDIA_ROOT', '/media']];
    mocks.readFailures.add('/workspace/assets/missing.wav');

    const result = await createProjectSnapshotPackage({
      packageId: 'neko-canvas',
      title: 'Package Canvas Project',
      sourceUri: vscode.Uri.file('/workspace/story.nkc'),
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

    expect([...zipEntries.keys()].find((name) => name.endsWith('-hero.glb'))).toBeUndefined();
    const variableEntryName = [...zipEntries.keys()].find((name) => name.endsWith('-voice.wav'));
    expect(variableEntryName?.startsWith('assets/external/')).toBe(true);
    expect(zipEntries.get(variableEntryName!)).toEqual(new Uint8Array([14]));
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
    expect(manifest.assets.map((asset) => asset.packagePath)).toEqual([
      'assets/ref.png',
      'configs/hero.gltf',
      variableEntryName,
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
          reason: 'read-failed',
          source: { kind: 'absolute', fileName: 'hero.glb' },
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
      variableEntryName,
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
      sourceBytes: currentSource,
    });

    const zipEntries = readStoredZipEntries(mocks.writes.get('/workspace/story.zip')!);
    expect(zipEntries.get('story.nkc')).toEqual(currentSource);
    expect(zipEntries.get('assets/current.png')).toEqual(new Uint8Array([21]));
    expect(zipEntries.has('assets/stale.png')).toBe(false);
  });
});

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
