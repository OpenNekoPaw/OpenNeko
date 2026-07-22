import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceCacheManifest, ResourceCacheManifestStore } from '../../../types';

vi.mock('vscode', () => ({
  Uri: {
    file: (filePath: string) => uri(filePath),
    joinPath: (base: { fsPath: string }, ...segments: string[]) =>
      uri(path.join(base.fsPath, ...segments)),
  },
  workspace: { workspaceFolders: [] },
}));

const metadataBindingMocks = vi.hoisted(() => ({
  createGlobal: vi.fn(),
  createWorkspace: vi.fn(),
  disposeGlobal: vi.fn(),
  disposeWorkspace: vi.fn(),
}));

vi.mock('../../../local-metadata/node-workspace-resource-cache-binding', () => ({
  createNodeGlobalResourceCacheMetadataBinding: metadataBindingMocks.createGlobal,
  createNodeWorkspaceResourceCacheMetadataBinding: metadataBindingMocks.createWorkspace,
}));

import { createHostDerivedContentRuntime } from '../host-derived-content-runtime';

const temporaryRoots: string[] = [];

describe('createHostDerivedContentRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })),
    );
  });

  it('owns workspace metadata, startup maintenance, semantic generation, and disposal', async () => {
    const root = await createTemporaryRoot();
    const workspaceRoot = path.join(root, 'workspace');
    const manifestStore = createMemoryManifestStore();
    metadataBindingMocks.createWorkspace.mockResolvedValue({
      workspaceId: 'workspace-1',
      manifestStore,
      dispose: metadataBindingMocks.disposeWorkspace,
    });
    const runtime = await createHostDerivedContentRuntime({
      target: { kind: 'workspace', workspaceRoot, homedir: root },
      representationGenerators: [
        {
          id: 'thumbnail-generator',
          revision: 'v1',
          kinds: ['thumbnail'],
          generate: vi.fn(async () => ({
            bytes: new Uint8Array([1, 2, 3]),
            metadata: { mimeType: 'image/png', byteLength: 3, width: 1, height: 1 },
          })),
        },
      ],
    });

    expect(metadataBindingMocks.createWorkspace).toHaveBeenCalledWith({
      homedir: root,
      workDir: workspaceRoot,
    });
    expect(runtime.startupMaintenance).toMatchObject({
      status: 'completed',
      stats: { entryCount: 0, variantCount: 0 },
      gc: { removedCount: 0 },
    });
    expect('resourceCache' in runtime).toBe(false);
    expect('contentIngest' in runtime).toBe(false);
    expect('manifestStore' in runtime).toBe(false);
    expect('cacheRoot' in runtime).toBe(false);

    const representation = await runtime.contentRepresentation.getRepresentation({
      source: { kind: 'workspace-file', path: 'media/shot.png' },
      spec: { kind: 'thumbnail', maxWidth: 128 },
      expectedSourceFingerprint: 'shot-v1',
    });

    expect(representation).toMatchObject({
      status: 'ready',
      locator: {
        kind: 'content-representation',
        representationKind: 'thumbnail',
        sourceFingerprint: 'shot-v1',
        revision: 'v1',
      },
      metadata: { mimeType: 'image/png', byteLength: 3, width: 1, height: 1 },
    });
    expect(JSON.stringify(representation)).not.toContain(workspaceRoot);

    const manifest = await manifestStore.load();
    expect(Object.values(manifest.entries)[0]?.resource.scope).toBe('project');

    await runtime.dispose();
    expect(metadataBindingMocks.disposeWorkspace).toHaveBeenCalledOnce();
  });

  it('uses global metadata and extension-private identity without exposing storage paths', async () => {
    const root = await createTemporaryRoot();
    const manifestStore = createMemoryManifestStore();
    metadataBindingMocks.createGlobal.mockResolvedValue({
      manifestStore,
      dispose: metadataBindingMocks.disposeGlobal,
    });
    const context = {
      extensionUri: uri(path.join(root, 'extension')),
      globalStorageUri: uri(path.join(root, 'global-storage')),
    } as never;

    const runtime = await createHostDerivedContentRuntime({
      target: { kind: 'extension-private', homedir: root },
      context,
      runStartupMaintenance: false,
      representationGenerators: [
        {
          id: 'semantic-generator',
          revision: 'v2',
          kinds: ['semantic-sidecar'],
          generate: vi.fn(async () => ({
            bytes: new Uint8Array([4]),
            metadata: { mimeType: 'application/json', byteLength: 1 },
          })),
        },
      ],
      localResourceAccess: createLocalResourceAccess(),
    });

    expect(metadataBindingMocks.createGlobal).toHaveBeenCalledWith({ homedir: root });
    expect(metadataBindingMocks.createWorkspace).not.toHaveBeenCalled();
    expect(runtime.startupMaintenance).toEqual({
      status: 'skipped',
      reason: 'startup-maintenance-disabled',
    });

    const result = await runtime.contentRepresentation.getRepresentation({
      source: {
        kind: 'generated-output',
        outputId: 'output-1',
        revision: 'v1',
        digest: 'sha256:generated',
        path: 'neko/generated/image/output-1.png',
      },
      spec: { kind: 'semantic-sidecar', modality: 'vision', profile: 'default' },
    });

    expect(result.status).toBe('ready');
    expect(JSON.stringify(result)).not.toContain(path.join(root, 'global-storage'));
    const manifest = await manifestStore.load();
    expect(Object.values(manifest.entries)[0]?.resource.scope).toBe('extension-private');

    await runtime.dispose();
    expect(metadataBindingMocks.disposeGlobal).toHaveBeenCalledOnce();
  });

  it('reports initialization failure while keeping the representation port fail-visible', async () => {
    metadataBindingMocks.createWorkspace.mockRejectedValue(new Error('sqlite unavailable'));
    const logger = { warn: vi.fn(), error: vi.fn() };
    const runtime = await createHostDerivedContentRuntime({
      target: { kind: 'workspace', workspaceRoot: '/workspace/demo', homedir: '/home/neko' },
      logger,
    });

    expect(runtime.startupMaintenance).toEqual({
      status: 'failed',
      diagnostic: {
        code: 'derived-storage-initialization-failed',
        message: 'Derived content storage could not be initialized.',
      },
    });
    expect(logger.error).toHaveBeenCalledWith('Derived content storage initialization failed.', {
      error: 'sqlite unavailable',
    });

    const representation = await runtime.contentRepresentation.getRepresentation({
      source: { kind: 'workspace-file', path: 'media/shot.png' },
      spec: { kind: 'thumbnail' },
    });

    expect('contentAccess' in runtime).toBe(false);
    expect(representation).toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'representation-unsupported' },
    });
    await expect(runtime.runMaintenance()).resolves.toMatchObject({
      status: 'failed',
      diagnostic: { code: 'derived-storage-unavailable' },
    });
  });

  it('reports startup GC failures while preserving the initialized representation owner', async () => {
    const root = await createTemporaryRoot();
    const manifestStore = createMemoryManifestStore({ loadError: new Error('ledger read failed') });
    metadataBindingMocks.createWorkspace.mockResolvedValue({
      workspaceId: 'workspace-1',
      manifestStore,
      dispose: metadataBindingMocks.disposeWorkspace,
    });
    const logger = { warn: vi.fn(), error: vi.fn() };

    const runtime = await createHostDerivedContentRuntime({
      target: { kind: 'workspace', workspaceRoot: path.join(root, 'workspace'), homedir: root },
      logger,
    });

    expect(runtime.startupMaintenance).toEqual({
      status: 'failed',
      diagnostic: {
        code: 'derived-storage-maintenance-failed',
        message: 'Derived content storage maintenance failed.',
      },
    });
    expect(logger.warn).toHaveBeenCalledWith('Derived content storage maintenance failed.', {
      error: 'ledger read failed',
    });
    await runtime.dispose();
  });
});

async function createTemporaryRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-derived-content-'));
  temporaryRoots.push(root);
  return root;
}

function createMemoryManifestStore(
  options: { readonly loadError?: Error } = {},
): ResourceCacheManifestStore {
  let manifest: ResourceCacheManifest = {
    version: 1,
    createdAt: '2026-07-22T00:00:00.000Z',
    updatedAt: '2026-07-22T00:00:00.000Z',
    entries: {},
  };
  return {
    load: async () => {
      if (options.loadError) throw options.loadError;
      return manifest;
    },
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

function createLocalResourceAccess() {
  return {
    getLocalResourceRoots: async () => [],
    configureWebview: async () => undefined,
    isAuthorizedPath: async () => true,
    toWebviewUri: async () => ({
      ok: false as const,
      reason: 'unavailable' as const,
      source: '',
      message: 'Projection is not used by this test.',
    }),
    createSyncProjector: () => () => undefined,
  };
}

function uri(filePath: string) {
  return {
    scheme: 'file',
    fsPath: filePath,
    path: filePath,
    toString: () => `file://${filePath}`,
  };
}
