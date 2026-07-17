import { describe, expect, it, vi } from 'vitest';
import { createResourceFingerprint, createResourceRef, type ResourceRef } from '@neko/shared';
import type {
  ResourceCacheOperationResult,
  ResourceCacheService,
  ResourceVariantRequest,
} from '@neko/shared/vscode/extension';
import { createProcessorResourcePort } from '../processorResourcePort';

describe('ProcessorResourcePort extension binding', () => {
  it('routes retention and pin intents through ResourceCacheService lifecycle updates', async () => {
    const ref = createProcessorRef();
    const cache = createResourceCache(ref);
    const port = createProcessorResourcePort({ resourceCache: cache });
    const run = { processorRunId: 'run-1', stageId: 'stage-1', attempt: 1 };

    await port.setRetention({ resourceRef: ref, run, retentionHint: 'debug' });
    await port.pin({ resourceRef: ref, reason: 'approval', ownerId: 'agent' });
    await port.unpin({ resourceRef: ref, reason: 'approval-finished', ownerId: 'agent' });

    expect(cache.updateLifecycle).toHaveBeenNthCalledWith(1, {
      ref,
      variant: { role: 'preview' },
      retentionHint: 'debug',
      processorRunId: 'run-1',
      stageId: 'stage-1',
      attempt: 1,
    });
    expect(cache.updateLifecycle).toHaveBeenNthCalledWith(2, {
      ref,
      variant: { role: 'preview' },
      retentionHint: 'pinned',
      pinned: true,
      sessionActive: true,
      reason: 'approval',
      ownerId: 'agent',
    });
    expect(cache.updateLifecycle).toHaveBeenNthCalledWith(3, {
      ref,
      variant: { role: 'preview' },
      pinned: false,
      sessionActive: false,
      reason: 'approval-finished',
      ownerId: 'agent',
    });
  });

  it('does not report promotion when the owning writer returns no project fact ref', async () => {
    const ref = createProcessorRef();
    const cache = createResourceCache(ref);
    const createAsset = vi.fn(async () => undefined);
    const port = createProcessorResourcePort({ resourceCache: cache, createAsset });
    const run = { processorRunId: 'run-1', stageId: 'stage-1', attempt: 1 };

    const status = await port.markPromoted({ resourceRef: ref, run, target: 'asset' });

    expect(createAsset).toHaveBeenCalledWith({ resourceRef: ref, run, target: 'asset' });
    expect(cache.updateLifecycle).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      resourceRef: ref,
      retentionHint: 'intermediate',
      status: 'failed',
      diagnostics: [
        expect.objectContaining({
          code: 'execution-failed',
          message: expect.stringContaining('owning project fact'),
        }),
      ],
    });
  });

  it('requires an owning project fact writer before promotion', async () => {
    const ref = createProcessorRef();
    const cache = createResourceCache(ref);
    const port = createProcessorResourcePort({ resourceCache: cache });
    const run = { processorRunId: 'run-1', stageId: 'stage-1', attempt: 1 };

    const status = await port.markPromoted({ resourceRef: ref, run, target: 'project' });

    expect(cache.updateLifecycle).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      retentionHint: 'intermediate',
      status: 'failed',
      diagnostics: [
        expect.objectContaining({ message: expect.stringContaining('project fact writer') }),
      ],
    });
  });

  it('returns durable media-library source refs only from explicit promote hook', async () => {
    const ref = createProcessorRef();
    const events: string[] = [];
    const cache = createResourceCache(ref, {
      onLifecycleUpdate: () => events.push('cache-projected'),
    });
    const createAsset = vi.fn(async () => {
      events.push('fact-written');
      return {
        kind: 'mediaLibrary' as const,
        mediaLibraryId: 'team',
        path: '${TEAM_MEDIA}/processed/result.png',
      };
    });
    const port = createProcessorResourcePort({ resourceCache: cache, createAsset });
    const run = { processorRunId: 'run-1', stageId: 'stage-1', attempt: 1 };

    const status = await port.markPromoted({ resourceRef: ref, run, target: 'mediaLibrary' });

    expect(createAsset).toHaveBeenCalledWith({ resourceRef: ref, run, target: 'mediaLibrary' });
    expect(status.promotedSourceRef).toEqual({
      kind: 'mediaLibrary',
      mediaLibraryId: 'team',
      path: '${TEAM_MEDIA}/processed/result.png',
    });
    expect(cache.updateLifecycle).toHaveBeenCalledWith(
      expect.objectContaining({
        promoted: true,
        promotedTarget: 'mediaLibrary',
      }),
    );
    expect(events).toEqual(['fact-written', 'cache-projected']);
  });

  it('rejects an owning fact ref that does not match the requested promotion target', async () => {
    const ref = createProcessorRef();
    const cache = createResourceCache(ref);
    const createAsset = vi.fn(async () => ({
      kind: 'project' as const,
      path: 'neko/generated/image/result.png',
    }));
    const port = createProcessorResourcePort({ resourceCache: cache, createAsset });
    const run = { processorRunId: 'run-1', stageId: 'stage-1', attempt: 1 };

    const status = await port.markPromoted({ resourceRef: ref, run, target: 'asset' });

    expect(cache.updateLifecycle).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      retentionHint: 'intermediate',
      status: 'failed',
      diagnostics: [
        expect.objectContaining({
          message: expect.stringContaining('does not match target asset'),
        }),
      ],
    });
  });

  it('rejects cache paths returned as owning project fact refs', async () => {
    const ref = createProcessorRef();
    const cache = createResourceCache(ref);
    const createAsset = vi.fn(async () => ({
      kind: 'project' as const,
      path: '.neko/.cache/resources/promoted/result.png',
    }));
    const port = createProcessorResourcePort({ resourceCache: cache, createAsset });
    const run = { processorRunId: 'run-1', stageId: 'stage-1', attempt: 1 };

    const status = await port.markPromoted({ resourceRef: ref, run, target: 'project' });

    expect(cache.updateLifecycle).not.toHaveBeenCalled();
    expect(status).toMatchObject({
      retentionHint: 'intermediate',
      status: 'failed',
      diagnostics: [
        expect.objectContaining({ message: expect.stringContaining('stable project fact ref') }),
      ],
    });
  });

  it('preserves the owning fact ref when the later cache projection update fails', async () => {
    const ref = createProcessorRef();
    const events: string[] = [];
    const cache = createResourceCache(ref, {
      resolveStatus: 'failed',
      error: 'SQLite projection unavailable.',
      onLifecycleUpdate: () => events.push('cache-failed'),
    });
    const createAsset = vi.fn(async () => {
      events.push('fact-written');
      return {
        kind: 'project' as const,
        path: 'neko/generated/image/result.png',
      };
    });
    const port = createProcessorResourcePort({ resourceCache: cache, createAsset });
    const run = { processorRunId: 'run-1', stageId: 'stage-1', attempt: 1 };

    const status = await port.markPromoted({ resourceRef: ref, run, target: 'project' });

    expect(events).toEqual(['fact-written', 'cache-failed']);
    expect(status).toMatchObject({
      retentionHint: 'promoted',
      status: 'failed',
      promotedSourceRef: {
        kind: 'project',
        path: 'neko/generated/image/result.png',
      },
      diagnostics: [expect.objectContaining({ message: 'SQLite projection unavailable.' })],
    });
  });

  it('reports missing resources without touching cache files directly', async () => {
    const ref = createProcessorRef();
    const cache = createResourceCache(ref, {
      resolveStatus: 'missing',
      error: 'Cache variant was evicted.',
    });
    const port = createProcessorResourcePort({ resourceCache: cache });

    await expect(port.getStatus(ref)).resolves.toMatchObject({
      resourceRef: ref,
      status: 'missing',
      diagnostics: [expect.objectContaining({ message: 'Cache variant was evicted.' })],
    });
    expect(cache.resolve).toHaveBeenCalledWith(ref, { role: 'preview' });
  });
});

function createProcessorRef(): ResourceRef {
  return createResourceRef({
    scope: 'project',
    provider: 'external-processor',
    kind: 'generated',
    source: {
      kind: 'file',
      projectRelativePath: 'external-processors/upscale/run-1/stage-1/attempt-1/result.png',
    },
    fingerprint: createResourceFingerprint({
      strategy: 'provider',
      providerId: 'external-processor',
      value: 'run-1:stage-1:image',
    }),
  });
}

function createResourceCache(
  ref: ResourceRef,
  options: {
    readonly resolveStatus?: ResourceCacheOperationResult['status'];
    readonly error?: string;
    readonly onLifecycleUpdate?: () => void;
  } = {},
): ResourceCacheService {
  const variant: ResourceVariantRequest = { role: 'preview' };
  const operationResult: ResourceCacheOperationResult = {
    status: options.resolveStatus ?? 'ready',
    ref,
    variant: { resource: ref, ...variant },
    ...(options.error ? { error: options.error } : {}),
  };
  return {
    registerProvider: vi.fn(),
    findByLocalPath: vi.fn(),
    ensure: vi.fn(),
    resolve: vi.fn(async () => operationResult),
    record: vi.fn(),
    updateLifecycle: vi.fn(async () => {
      options.onLifecycleUpdate?.();
      return operationResult;
    }),
    project: vi.fn(),
    invalidate: vi.fn(),
    invalidateManifestCache: vi.fn(),
    stats: vi.fn(),
    gc: vi.fn(),
  } as unknown as ResourceCacheService;
}
