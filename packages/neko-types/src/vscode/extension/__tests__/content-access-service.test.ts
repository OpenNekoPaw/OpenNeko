import { describe, expect, it, vi } from 'vitest';
import {
  createResourceFingerprint,
  createResourceRef,
  type ContentAccessProvider,
  type ContentAccessRequest,
  type ContentIngestProvider,
  type ContentIngestRequest,
  type ResourceRef,
} from '../../../types';
import { HostContentAccessService, HostContentIngestService } from '../content-access-service';

describe('content access service', () => {
  const resource = createResourceRef({
    scope: 'project',
    provider: 'test',
    kind: 'media',
    source: { kind: 'file', filePath: '${MEDIA}/shot.png' },
    fingerprint: createResourceFingerprint({ strategy: 'provider', value: 'shot-v1' }),
  });

  it('selects the first supporting provider deterministically', async () => {
    const first = createAccessProvider('first', resource, false);
    const second = createAccessProvider('second', resource, true);
    const third = createAccessProvider('third', resource, true);
    const service = new HostContentAccessService({ providers: [first, second, third] });

    const result = await service.resolve(createPreviewRequest(resource));

    expect(result).toMatchObject({
      status: 'ready',
      providerId: 'second',
      localPath: '/cache/second.png',
    });
    expect(first.resolve).not.toHaveBeenCalled();
    expect(second.resolve).toHaveBeenCalledOnce();
    expect(third.resolve).not.toHaveBeenCalled();
  });

  it('allows provider replacement by id', async () => {
    const service = new HostContentAccessService({
      providers: [createAccessProvider('preview', resource, true)],
    });
    service.registerProvider(
      createAccessProvider('preview', resource, true, '/cache/replaced.png'),
    );

    const result = await service.resolve(createPreviewRequest(resource));

    expect(result).toMatchObject({
      status: 'ready',
      providerId: 'preview',
      localPath: '/cache/replaced.png',
    });
  });

  it('returns unsupported-source when no provider supports the request', async () => {
    const service = new HostContentAccessService();

    const result = await service.resolve(createPreviewRequest(resource));

    expect(result.status).toBe('unsupported-source');
    expect(result.diagnostics?.[0]?.code).toBe('content-access-provider-missing');
  });

  it('rejects offline requests before provider resolution', async () => {
    const provider = createAccessProvider('preview', resource, true);
    const service = new HostContentAccessService({ providers: [provider] });

    const result = await service.resolve({
      ref: {
        kind: 'runtime',
        runtimeKind: 'cache-path',
        value: '/workspace/.neko/.cache/resources/shot.png',
      },
      intent: 'package',
      target: 'local-path',
    });

    expect(result.status).toBe('unsupported-intent');
    expect(result.diagnostics?.[0]?.code).toBe('offline-runtime-ref');
    expect(provider.resolve).not.toHaveBeenCalled();
  });

  it('rejects expired engine tokens and runtime streams as offline source identity', async () => {
    const service = new HostContentAccessService();

    await expect(
      service.resolve({
        ref: { kind: 'runtime', runtimeKind: 'engine-token', value: 'expired-token' },
        intent: 'package',
        target: 'engine-source',
      }),
    ).resolves.toMatchObject({
      status: 'unsupported-intent',
      diagnostics: [expect.objectContaining({ code: 'offline-runtime-ref' })],
    });

    await expect(
      service.resolve({
        ref: { kind: 'runtime', runtimeKind: 'runtime-stream', value: 'stream-1' },
        intent: 'final-export',
        target: 'runtime-stream',
      }),
    ).resolves.toMatchObject({
      status: 'unsupported-intent',
      diagnostics: [
        expect.objectContaining({ code: 'offline-runtime-ref' }),
        expect.objectContaining({ code: 'offline-runtime-target' }),
      ],
    });
  });

  it('allows offline operations to recover from a runtime token only when a stable source ref exists', async () => {
    const provider: ContentAccessProvider = {
      id: 'source-provider',
      supports: (request) => request.ref.kind === 'runtime',
      resolve: vi.fn(async ({ request }) => ({
        status: 'ready',
        request,
        providerId: 'source-provider',
        source: resource,
        localPath: '/workspace/media/shot.png',
      })),
    };
    const service = new HostContentAccessService({ providers: [provider] });

    const result = await service.resolve({
      ref: { kind: 'runtime', runtimeKind: 'engine-token', value: 'token-1', source: resource },
      intent: 'package',
      target: 'local-path',
    });

    expect(result).toMatchObject({
      status: 'ready',
      localPath: '/workspace/media/shot.png',
    });
    expect(provider.resolve).toHaveBeenCalledOnce();
  });

  it('turns provider failures into structured failed results', async () => {
    const provider: ContentAccessProvider = {
      id: 'broken',
      supports: () => true,
      resolve: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const service = new HostContentAccessService({ providers: [provider] });

    const result = await service.resolve(createPreviewRequest(resource));

    expect(result.status).toBe('failed');
    expect(result.error).toBe('boom');
    expect(result.diagnostics?.[0]?.code).toBe('content-access-provider-failed');
  });
});

describe('content ingest service', () => {
  const ingestRequest: ContentIngestRequest = {
    mode: 'generated-output',
    sourcePath: '/workspace/demo/neko/generated/image/shot.png',
    destination: {
      kind: 'generated-assets',
      projectRoot: '/workspace/demo',
      directory: '/workspace/demo/neko/generated/image',
    },
    mimeType: 'image/png',
  };

  it('selects ingest providers and preserves diagnostics', async () => {
    const provider = createIngestProvider('generated', true, {
      outputPath: '/workspace/demo/neko/generated/image/shot.png',
      contractedPath: 'neko/generated/image/shot.png',
    });
    const service = new HostContentIngestService({ providers: [provider] });

    const result = await service.ingest(ingestRequest);

    expect(result).toMatchObject({
      status: 'ready',
      providerId: 'generated',
      contractedPath: 'neko/generated/image/shot.png',
    });
    expect(provider.ingest).toHaveBeenCalledOnce();
  });

  it('returns unsupported-destination when no ingest provider supports the request', async () => {
    const service = new HostContentIngestService();

    const result = await service.ingest(ingestRequest);

    expect(result.status).toBe('unsupported-destination');
    expect(result.diagnostics?.[0]?.code).toBe('content-ingest-provider-missing');
  });

  it('rejects ingest results that expose cache paths as durable source output', async () => {
    const provider = createIngestProvider('bad-generated', true, {
      outputPath: '/workspace/demo/.neko/.cache/resources/shot.png',
    });
    const service = new HostContentIngestService({
      providers: [provider],
      guardOptions: { projectRoot: '/workspace/demo' },
    });

    const result = await service.ingest(ingestRequest);

    expect(result.status).toBe('unsupported-destination');
    expect(result.diagnostics?.map((diagnostic) => diagnostic.code)).toEqual([
      'ingest-cache-output',
      'ingest-uncontracted-path',
    ]);
  });

  it('rejects cache-backed generated asset destinations before provider execution', async () => {
    const provider = createIngestProvider('generated', true, {
      outputPath: '/workspace/demo/neko/generated/image/shot.png',
      contractedPath: 'neko/generated/image/shot.png',
    });
    const service = new HostContentIngestService({
      providers: [provider],
      guardOptions: { projectRoot: '/workspace/demo' },
    });

    const result = await service.ingest({
      ...ingestRequest,
      destination: {
        kind: 'generated-assets',
        projectRoot: '/workspace/demo',
        directory: '/workspace/demo/.neko/.cache/generated',
      },
    });

    expect(result.status).toBe('unsupported-destination');
    expect(result.diagnostics?.[0]?.code).toBe('generated-assets-destination-cache');
    expect(provider.ingest).not.toHaveBeenCalled();
  });

  it('turns ingest provider failures into structured failed results', async () => {
    const provider: ContentIngestProvider = {
      id: 'broken-ingest',
      supports: () => true,
      ingest: vi.fn(async () => {
        throw new Error('write failed');
      }),
    };
    const service = new HostContentIngestService({ providers: [provider] });

    const result = await service.ingest(ingestRequest);

    expect(result.status).toBe('failed');
    expect(result.error).toBe('write failed');
    expect(result.diagnostics?.[0]?.code).toBe('content-ingest-provider-failed');
  });
});

function createPreviewRequest(resource: ResourceRef): ContentAccessRequest {
  return {
    ref: resource,
    intent: 'interactive-preview',
    target: 'local-path',
    variant: { role: 'thumbnail', width: 256, height: 256 },
  };
}

function createAccessProvider(
  id: string,
  resource: ResourceRef,
  supports: boolean,
  localPath = `/cache/${id}.png`,
): ContentAccessProvider {
  return {
    id,
    supports: () => supports,
    resolve: vi.fn(async ({ request }) => ({
      status: 'ready',
      request,
      providerId: id,
      source: resource,
      localPath,
    })),
  };
}

function createIngestProvider(
  id: string,
  supports: boolean,
  result: { readonly outputPath: string; readonly contractedPath?: string },
): ContentIngestProvider {
  return {
    id,
    supports: () => supports,
    ingest: vi.fn(async ({ request }) => ({
      status: 'ready',
      request,
      providerId: id,
      outputPath: result.outputPath,
      contractedPath: result.contractedPath,
    })),
  };
}
