import { describe, expect, it, vi } from 'vitest';

import type { ContentRepresentationGenerator, ResourceCacheManifestStore } from '../../../types';
import {
  HostContentRepresentationService,
  type ContentRepresentationFileOps,
} from '../content-representation-service';
import { VSCodeResourceCacheService, type ResourceCacheFsOps } from '../resource-cache-service';

describe('HostContentRepresentationService', () => {
  it('wraps a storage-neutral generator and reuses the Host-private cache result', async () => {
    const files = new Map<string, Uint8Array>();
    const generate = vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      metadata: { mimeType: 'image/webp', width: 320, height: 180 },
    }));
    const generator: ContentRepresentationGenerator = {
      id: 'thumbnail-generator',
      revision: 'v1',
      kinds: ['thumbnail'],
      generate,
    };
    const service = createService([generator], files);

    const request = {
      source: { kind: 'workspace-file' as const, path: 'media/hero.png' },
      spec: { kind: 'thumbnail' as const, maxWidth: 320, maxHeight: 180, format: 'webp' as const },
      expectedSourceFingerprint: 'sha256:hero-v1',
    };
    const first = await service.getRepresentation(request);
    const second = await service.getRepresentation(request);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: 'ready',
      locator: {
        kind: 'content-representation',
        representationKind: 'thumbnail',
        sourceFingerprint: 'sha256:hero-v1',
        revision: 'v1',
      },
      metadata: { mimeType: 'image/webp', byteLength: 3, width: 320, height: 180 },
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(files.size).toBe(1);
    const serialized = JSON.stringify(first);
    expect(serialized).not.toContain('/cache');
    expect(serialized).not.toContain('provider');
    expect(serialized).not.toContain('manifest');
  });

  it('reads ready locators with bounded ranges without exposing Host paths', async () => {
    const files = new Map<string, Uint8Array>();
    const service = createService(
      [
        {
          id: 'thumbnail-generator',
          revision: 'v1',
          kinds: ['thumbnail'],
          generate: async () => ({
            bytes: new Uint8Array([1, 2, 3, 4]),
            metadata: { mimeType: 'image/png', width: 2, height: 2 },
          }),
        },
      ],
      files,
    );
    const representation = await service.getRepresentation({
      source: { kind: 'workspace-file', path: 'media/hero.png' },
      spec: { kind: 'thumbnail', maxWidth: 2, maxHeight: 2 },
    });
    if (representation.status !== 'ready') {
      throw new Error(`Expected ready representation: ${representation.diagnostic.code}`);
    }

    const result = await service.readRepresentation(representation.locator, {
      range: { offset: 1, length: 2 },
      maxBytes: 2,
    });

    expect(result).toMatchObject({
      status: 'ready',
      locator: representation.locator,
      offset: 1,
      totalByteLength: 4,
      metadata: { mimeType: 'image/png', width: 2, height: 2 },
    });
    expect(result.status === 'ready' ? Array.from(result.bytes) : []).toEqual([2, 3]);
    expect(JSON.stringify(result)).not.toContain('/cache');
    await expect(
      service.readRepresentation(representation.locator, { maxBytes: 3 }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'representation-too-large' },
    });
  });

  it('fails visibly when a locator is stale or its derived bytes were evicted', async () => {
    const files = new Map<string, Uint8Array>();
    const service = createService(
      [
        {
          id: 'thumbnail-generator',
          revision: 'v1',
          kinds: ['thumbnail'],
          generate: async () => ({
            bytes: new Uint8Array([1, 2, 3]),
            metadata: { mimeType: 'image/png' },
          }),
        },
      ],
      files,
    );
    const representation = await service.getRepresentation({
      source: { kind: 'workspace-file', path: 'media/hero.png' },
      spec: { kind: 'thumbnail' },
    });
    if (representation.status !== 'ready') {
      throw new Error(`Expected ready representation: ${representation.diagnostic.code}`);
    }

    await expect(
      service.readRepresentation({
        ...representation.locator,
        source: { kind: 'workspace-file', path: 'media/tampered.png' },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'representation-source-changed' },
    });

    files.clear();
    await expect(service.readRepresentation(representation.locator)).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'representation-missing' },
    });
  });

  it('changes representation identity when source or generator freshness changes', async () => {
    const files = new Map<string, Uint8Array>();
    const manifestStore = createMemoryManifestStore();
    const generateV1 = vi.fn(async () => ({
      bytes: new Uint8Array([1]),
      metadata: { mimeType: 'image/png' },
    }));
    const request = {
      source: { kind: 'workspace-file' as const, path: 'media/hero.png' },
      spec: { kind: 'thumbnail' as const, maxWidth: 320 },
      expectedSourceFingerprint: 'sha256:hero-v1',
    };
    const serviceV1 = createService(
      [
        {
          id: 'thumbnail-generator',
          revision: 'v1',
          kinds: ['thumbnail'],
          generate: generateV1,
        },
      ],
      files,
      manifestStore,
    );

    const sourceV1 = await serviceV1.getRepresentation(request);
    const sourceV2 = await serviceV1.getRepresentation({
      ...request,
      expectedSourceFingerprint: 'sha256:hero-v2',
    });

    expect(sourceV1.status).toBe('ready');
    expect(sourceV2.status).toBe('ready');
    expect(generateV1).toHaveBeenCalledTimes(2);
    expect(readReadyLocatorId(sourceV2)).not.toBe(readReadyLocatorId(sourceV1));

    const generateV2 = vi.fn(async () => ({
      bytes: new Uint8Array([2]),
      metadata: { mimeType: 'image/png' },
    }));
    const serviceV2 = createService(
      [
        {
          id: 'thumbnail-generator',
          revision: 'v2',
          kinds: ['thumbnail'],
          generate: generateV2,
        },
      ],
      files,
      manifestStore,
    );
    const generatorV2 = await serviceV2.getRepresentation(request);

    expect(generatorV2).toMatchObject({
      status: 'ready',
      locator: { revision: 'v2' },
    });
    expect(generateV2).toHaveBeenCalledOnce();
    expect(readReadyLocatorId(generatorV2)).not.toBe(readReadyLocatorId(sourceV1));
  });

  it('fails visibly when no semantic generator is registered', async () => {
    const service = createService([], new Map());

    await expect(
      service.getRepresentation({
        source: { kind: 'workspace-file', path: 'media/hero.png' },
        spec: { kind: 'proxy', profile: 'editing-720p' },
      }),
    ).resolves.toEqual({
      status: 'unavailable',
      diagnostic: {
        code: 'representation-unsupported',
        severity: 'error',
        message: 'Content representation kind is not registered: proxy.',
      },
    });
  });

  it('rejects absolute or cache-backed source locators before invoking a generator', async () => {
    const generate = vi.fn(async () => ({
      bytes: new Uint8Array([1]),
      metadata: { mimeType: 'image/png' },
    }));
    const service = createService(
      [{ id: 'thumbnail-generator', revision: 'v1', kinds: ['thumbnail'], generate }],
      new Map(),
    );

    await expect(
      service.getRepresentation({
        source: { kind: 'workspace-file', path: '/workspace/.neko/.cache/secret.png' },
        spec: { kind: 'thumbnail' },
      }),
    ).resolves.toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'representation-unsupported' },
    });
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not expose generator errors or physical paths in public diagnostics', async () => {
    const generator: ContentRepresentationGenerator = {
      id: 'thumbnail-generator',
      revision: 'v1',
      kinds: ['thumbnail'],
      generate: async () => {
        throw new Error('decoder failed at /Users/private/source.png');
      },
    };
    const service = createService([generator], new Map());

    const result = await service.getRepresentation({
      source: { kind: 'workspace-file', path: 'media/hero.png' },
      spec: { kind: 'thumbnail' },
    });

    expect(result).toEqual({
      status: 'unavailable',
      diagnostic: {
        code: 'representation-failed',
        severity: 'error',
        message: 'Content representation generation failed.',
      },
    });
    expect(JSON.stringify(result)).not.toContain('/Users/private');
  });

  it('honors cancellation before touching derived storage', async () => {
    const generate = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const service = createService(
      [
        {
          id: 'thumbnail-generator',
          revision: 'v1',
          kinds: ['thumbnail'],
          generate,
        },
      ],
      new Map(),
    );

    const result = await service.getRepresentation({
      source: { kind: 'workspace-file', path: 'media/hero.png' },
      spec: { kind: 'thumbnail' },
      signal: controller.signal,
    });

    expect(result).toMatchObject({
      status: 'unavailable',
      diagnostic: { code: 'representation-cancelled' },
    });
    expect(generate).not.toHaveBeenCalled();
  });
});

function createService(
  generators: readonly ContentRepresentationGenerator[],
  files: Map<string, Uint8Array>,
  manifestStore: ResourceCacheManifestStore = createMemoryManifestStore(),
): HostContentRepresentationService {
  const resourceCache = new VSCodeResourceCacheService({
    cacheRoot: '/cache',
    manifestStore,
    fsOps: createCacheFsOps(files),
  });
  return new HostContentRepresentationService({
    resourceCache,
    generators,
    fileOps: createRepresentationFileOps(files),
  });
}

function readReadyLocatorId(
  result: Awaited<ReturnType<HostContentRepresentationService['getRepresentation']>>,
): string {
  if (result.status !== 'ready') {
    throw new Error(`Expected a ready representation, received ${result.diagnostic.code}.`);
  }
  return result.locator.id;
}

function createMemoryManifestStore(): ResourceCacheManifestStore {
  let manifest = {
    version: 1 as const,
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
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

function createCacheFsOps(files: Map<string, Uint8Array>): ResourceCacheFsOps {
  return {
    readFile: async () => JSON.stringify({ version: 1, entries: {} }),
    writeFile: async () => undefined,
    rename: async () => undefined,
    mkdir: async () => undefined,
    stat: async (filePath) => {
      const content = files.get(filePath);
      if (!content) throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      return { size: content.byteLength };
    },
    rm: async (filePath) => {
      files.delete(filePath);
    },
  };
}

function createRepresentationFileOps(files: Map<string, Uint8Array>): ContentRepresentationFileOps {
  return {
    copyFile: async (source, target) => {
      const content = files.get(source);
      if (!content) throw new Error(`Missing test source: ${source}`);
      files.set(target, content);
    },
    writeFile: async (filePath, content) => {
      files.set(filePath, content);
    },
    mkdir: async () => undefined,
    stat: async (filePath) => ({ size: files.get(filePath)?.byteLength ?? 0 }),
    readFile: async (filePath, range) => {
      const content = files.get(filePath);
      if (!content) throw Object.assign(new Error(`ENOENT: ${filePath}`), { code: 'ENOENT' });
      return content.slice(range.offset, range.offset + range.length);
    },
  };
}
