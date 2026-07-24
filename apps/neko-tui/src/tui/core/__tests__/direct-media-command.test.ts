import { describe, expect, it, vi } from 'vitest';
import { createResourceFingerprint, createResourceRef } from '@neko/shared';
import type { GenerationJobSnapshot } from '@neko/generation';
import {
  DirectMediaCommandError,
  executeDirectGenerationJobCommand,
  executeDirectMediaCommand,
  resolveDirectMediaModel,
  type DirectMediaCommandRuntime,
  type DirectMediaKind,
} from '../direct-media-command';
import type { DirectMediaCommandConfig } from '../direct-media-command';

describe('executeDirectMediaCommand', () => {
  it('supports detached consumption without observing the Job', async () => {
    const runtime = createRuntime(createSnapshot('image'));

    await expect(
      executeDirectMediaCommand(
        {
          ...createInput('image'),
          detached: true,
        },
        runtime,
      ),
    ).resolves.toMatchObject({
      status: 'submitted',
      operationId: 'job-image',
      jobRevision: 1,
      assetRefs: [],
    });
    expect(runtime.observeGeneration).not.toHaveBeenCalled();
    expect(runtime.submitGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycleMode: 'detached' }),
    );
  });

  for (const kind of ['image', 'video', 'audio'] as const) {
    it(`executes ${kind} to a terminal result and delivers a stable asset ref`, async () => {
      const terminal = createSnapshot(kind);
      const runtime = createRuntime(terminal);

      const result = await executeDirectMediaCommand(createInput(kind), runtime);

      expect(runtime.submitGeneration).toHaveBeenCalledWith({
        lifecycleMode: 'linked',
        generationType:
          kind === 'image' ? 'text-to-image' : kind === 'video' ? 'text-to-video' : 'text-to-audio',
        providerId: 'media-provider',
        modelId: `${kind}-model`,
        request: {
          prompt: `${kind} prompt`,
          providerId: 'media-provider',
          modelId: `${kind}-model`,
          metadata: { source: 'direct-media-cli' },
        },
      });
      expect(result).toMatchObject({
        kind,
        status: 'completed',
        operationId: terminal.ref.jobId,
        assetRefs: [`resource-${kind}`],
      });
    });
  }

  it('fails visibly when the target media model is missing', async () => {
    const runtime = createRuntime(createSnapshot('image'));

    await expect(
      executeDirectMediaCommand(
        {
          ...createInput('image'),
          config: { ...createConfig(), defaultMediaModels: {} },
        },
        runtime,
      ),
    ).rejects.toMatchObject({ code: 'direct-media-model-unavailable' });
    expect(runtime.submitGeneration).not.toHaveBeenCalled();
  });

  it('rejects an explicit model from another media category', () => {
    expect(() =>
      resolveDirectMediaModel({ ...createInput('image'), model: 'media-provider:video-model' }),
    ).toThrowError(DirectMediaCommandError);
    try {
      resolveDirectMediaModel({ ...createInput('image'), model: 'media-provider:video-model' });
    } catch (error) {
      expect(error).toMatchObject({ code: 'direct-media-model-kind-mismatch' });
    }
  });

  it('does not deliver or return success when generation fails', async () => {
    const runtime = createRuntime(createSnapshot('audio', 'failed'));

    await expect(executeDirectMediaCommand(createInput('audio'), runtime)).rejects.toMatchObject({
      code: 'direct-media-generation-failed',
      operationId: expect.any(String),
    });
  });

  it('rejects terminal generations without stable generated asset refs', async () => {
    const runtime = createRuntime(createSnapshot('image', 'succeeded', false));

    await expect(executeDirectMediaCommand(createInput('image'), runtime)).rejects.toMatchObject({
      code: 'direct-media-result-unavailable',
    });
  });

  it('routes exact Generation Job management without active/latest fallback', async () => {
    const terminal = createSnapshot('image');
    const runtime = createRuntime(terminal);

    await executeDirectGenerationJobCommand(
      { action: 'cancel', jobId: terminal.ref.jobId, expectedRevision: 7 },
      runtime,
    );
    await executeDirectGenerationJobCommand(
      { action: 'retry', jobId: terminal.ref.jobId, expectedRevision: 8 },
      runtime,
    );
    await executeDirectGenerationJobCommand(
      { action: 'reconcile', jobId: terminal.ref.jobId, expectedRevision: 9 },
      runtime,
    );
    await executeDirectGenerationJobCommand(
      { action: 'describe', jobId: terminal.ref.jobId },
      runtime,
    );

    const ref = { kind: 'generation', jobId: terminal.ref.jobId };
    expect(runtime.cancelGeneration).toHaveBeenCalledWith({ ref, expectedRevision: 7 });
    expect(runtime.retryGeneration).toHaveBeenCalledWith({ ref, expectedRevision: 8 });
    expect(runtime.reconcileGeneration).toHaveBeenCalledWith({ ref, expectedRevision: 9 });
    expect(runtime.describeGeneration).toHaveBeenCalledWith(ref);
  });

  it('rejects Generation Job mutations without an exact revision', async () => {
    const runtime = createRuntime(createSnapshot('image'));

    await expect(
      executeDirectGenerationJobCommand(
        { action: 'cancel', jobId: 'job-image' },
        runtime,
      ),
    ).rejects.toThrow('exact expectedRevision');
    expect(runtime.cancelGeneration).not.toHaveBeenCalled();
  });
});

function createInput(kind: DirectMediaKind) {
  return {
    kind,
    prompt: `${kind} prompt`,
    config: createConfig(),
    modelOptions: (['image', 'video', 'audio'] as const).map((category) => ({
      id: `media-provider:${category}-model`,
      label: category,
      providerId: 'media-provider',
      modelId: `${category}-model`,
      category,
    })),
  };
}

function createConfig(): DirectMediaCommandConfig {
  return {
    defaultProviderId: 'chat-provider',
    defaultMediaModels: {
      image: 'media-provider:image-model',
      video: 'media-provider:video-model',
      audio: 'media-provider:audio-model',
    },
  };
}

function createSnapshot(
  kind: DirectMediaKind,
  phase: GenerationJobSnapshot['phase'] = 'succeeded',
  withResult = true,
): GenerationJobSnapshot {
  const generationType =
    kind === 'image' ? 'text-to-image' : kind === 'video' ? 'text-to-video' : 'text-to-audio';
  return {
    ref: { kind: 'generation', jobId: `job-${kind}` },
    lifecycleMode: 'linked',
    phase,
    revision: 2,
    createdAt: 1,
    updatedAt: 2,
    request: {
      generationType,
      providerId: 'media-provider',
      modelId: `${kind}-model`,
      request: { prompt: `${kind} prompt` },
    },
    progress: {
      stage: phase === 'succeeded' ? 'completed' : 'submitting',
      percent: phase === 'succeeded' ? 100 : 25,
    },
    ...(phase === 'failed'
      ? {
          failure: {
            code: 'provider-failed',
            message: 'provider failed',
            retryable: true,
          },
        }
      : {}),
    ...(withResult && phase === 'succeeded' ? { resultRefs: [createResultRef(kind)] } : {}),
  };
}

function createRuntime(terminal: GenerationJobSnapshot): DirectMediaCommandRuntime & {
  submitGeneration: ReturnType<typeof vi.fn>;
  observeGeneration: ReturnType<typeof vi.fn>;
  describeGeneration: ReturnType<typeof vi.fn>;
  cancelGeneration: ReturnType<typeof vi.fn>;
  retryGeneration: ReturnType<typeof vi.fn>;
  reconcileGeneration: ReturnType<typeof vi.fn>;
} {
  const initial = { ...terminal, phase: 'pending' as const, revision: 1 };
  return {
    submitGeneration: vi.fn(async () => initial),
    observeGeneration: vi.fn(() => asyncSnapshots([terminal])),
    describeGeneration: vi.fn(async () => terminal),
    cancelGeneration: vi.fn(async () => terminal),
    retryGeneration: vi.fn(async () => terminal),
    reconcileGeneration: vi.fn(async () => terminal),
  };
}

async function* asyncSnapshots(snapshots: readonly GenerationJobSnapshot[]) {
  yield* snapshots;
}

function createResultRef(kind: DirectMediaKind) {
  return createResourceRef({
    id: `resource-${kind}`,
    scope: 'project',
    provider: 'generated-asset',
    kind: 'generated',
    source: { kind: 'generated-asset', generatedAssetId: `asset-${kind}` },
    fingerprint: createResourceFingerprint({ strategy: 'hash', value: `sha256:${kind}` }),
  });
}
