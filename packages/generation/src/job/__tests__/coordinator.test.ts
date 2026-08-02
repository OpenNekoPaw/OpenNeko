import { describe, expect, it, vi } from 'vitest';
import type { MediaGenerationResult } from '../../execution';
import { GenerationJobCoordinator } from '../coordinator';
import { createInMemoryGenerationJobStore } from '../store';

describe('GenerationJobCoordinator', () => {
  it('rejects conflicting provider/model bindings before persistence or execution', async () => {
    const execution = createExecution();
    const store = createInMemoryGenerationJobStore();
    const coordinator = new GenerationJobCoordinator({
      store,
      execution,
      resultCommitter: { commit: vi.fn(async () => [createResultLocator('generated-1')]) },
    });

    await expect(
      coordinator.submitGeneration({
        ...createInput(),
        request: {
          ...createInput().request,
          providerId: 'different-provider',
        },
      }),
    ).rejects.toMatchObject({ code: 'generation-job-binding-mismatch' });
    expect(execution.generateImage).not.toHaveBeenCalled();
  });

  it('fails a Job when execution returns a different binding without committing outputs', async () => {
    const execution = createExecution();
    execution.generateImage.mockResolvedValue({
      ...generationResult(),
      modelId: 'different-model',
    });
    const resultCommitter = {
      commit: vi.fn(async () => [createResultLocator('generated-1')]),
    };
    const coordinator = createCoordinator(execution, resultCommitter);

    const initial = await coordinator.submitGeneration(createInput());
    const terminal = await waitForTerminal(coordinator, initial.ref);

    expect(terminal).toMatchObject({
      phase: 'failed',
      failure: {
        code: 'generation-execution-failed',
        message: expect.stringContaining('does not match Job binding'),
      },
    });
    expect(resultCommitter.commit).not.toHaveBeenCalled();
  });

  it('commits monotonic progress and durable ResourceRefs before terminal success', async () => {
    const execution = createExecution();
    let release: ((result: MediaGenerationResult) => void) | undefined;
    execution.generateImage.mockImplementation(
      (_request, options) =>
        new Promise((resolve) => {
          release = resolve;
          void options?.onExternalTask?.({
            providerId: 'provider-1',
            externalTaskId: 'external-1',
          });
          options?.onProgress?.(35);
        }),
    );
    const resultLocator = createResultLocator('generated-1');
    const committer = { commit: vi.fn(async () => [resultLocator]) };
    const coordinator = createCoordinator(execution, committer);

    const initial = await coordinator.submitGeneration(createInput());
    const running = await waitForRevision(coordinator, initial.ref, 4);

    expect(running).toMatchObject({
      phase: 'running',
      revision: 4,
      providerTask: { providerId: 'provider-1', externalTaskId: 'external-1' },
      progress: { stage: 'waiting-provider', percent: 35 },
    });

    release?.(generationResult());
    const terminal = await waitForTerminal(coordinator, initial.ref);

    expect(committer.commit).toHaveBeenCalledWith({
      ref: initial.ref,
      generation: generationResult(),
    });
    expect(terminal).toMatchObject({
      phase: 'succeeded',
      progress: { stage: 'completed', percent: 100 },
      resultLocators: [resultLocator],
    });
  });

  it('rejects stale cancel before calling the provider and uses exact identity', async () => {
    const execution = createExecution();
    execution.generateImage.mockImplementation(() => new Promise(() => undefined));
    const coordinator = createCoordinator(execution, {
      commit: vi.fn(async () => [createResultLocator('generated-1')]),
    });
    const initial = await coordinator.submitGeneration(createInput());
    const running = await waitForRevision(coordinator, initial.ref, 2);

    await expect(
      coordinator.cancelGeneration({ ref: initial.ref, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'stale-revision' });
    expect(execution.cancelExternalTask).not.toHaveBeenCalled();

    await expect(
      coordinator.cancelGeneration({
        ref: initial.ref,
        expectedRevision: running.revision,
      }),
    ).rejects.toMatchObject({ code: 'generation-job-cancel-unsupported' });
  });

  it('reconciles only a stored provider task and preserves outcome-unknown without resubmission', async () => {
    const execution = createExecution();
    let rejectGeneration: ((error: Error) => void) | undefined;
    execution.generateImage.mockImplementation(
      (_request, options) =>
        new Promise((_resolve, reject) => {
          rejectGeneration = reject;
          void options?.onExternalTask?.({
            providerId: 'provider-1',
            externalTaskId: 'external-1',
          });
        }),
    );
    const coordinator = createCoordinator(execution, {
      commit: vi.fn(async () => [createResultLocator('generated-1')]),
    });
    const initial = await coordinator.submitGeneration(createInput());
    await waitForRevision(coordinator, initial.ref, 3);
    rejectGeneration?.(new Error('connection lost after submit'));
    const unknown = await waitForPhase(coordinator, initial.ref, 'outcome-unknown');

    execution.describeExternalTask.mockResolvedValueOnce({ status: 'processing', progress: 61 });
    const reconciled = await coordinator.reconcileGeneration({
      ref: initial.ref,
      expectedRevision: unknown.revision,
    });

    expect(reconciled).toMatchObject({
      phase: 'running',
      progress: { stage: 'waiting-provider', percent: 61 },
    });
    expect(execution.generateImage).toHaveBeenCalledTimes(1);
  });

  it('retries with a new identity and immutable retryOf provenance', async () => {
    const execution = createExecution();
    execution.generateImage.mockRejectedValue(new Error('provider rejected request'));
    const coordinator = createCoordinator(execution, {
      commit: vi.fn(async () => [createResultLocator('generated-1')]),
    });
    const original = await coordinator.submitGeneration({
      ...createInput(),
      lifecycleMode: 'detached',
    });
    const failed = await waitForPhase(coordinator, original.ref, 'failed');

    const retry = await coordinator.retryGeneration({
      ref: original.ref,
      expectedRevision: failed.revision,
    });

    expect(retry.ref.jobId).not.toBe(original.ref.jobId);
    expect(retry.lifecycleMode).toBe('detached');
    expect(retry.retryOf).toEqual(original.ref);
    expect(await coordinator.describeGeneration(original.ref)).toEqual(failed);
  });

  it('regenerates a succeeded result as a distinct Job without retry provenance', async () => {
    const execution = createExecution();
    execution.generateImage.mockResolvedValue(generationResult());
    const coordinator = createCoordinator(execution, {
      commit: vi.fn(async ({ ref }) => [createResultLocator(`output-${ref.jobId}`)]),
    });
    const original = await coordinator.submitGeneration({
      ...createInput(),
      lifecycleMode: 'detached',
    });
    const succeeded = await waitForPhase(coordinator, original.ref, 'succeeded');

    const regenerated = await coordinator.regenerateGeneration({
      ref: original.ref,
      expectedRevision: succeeded.revision,
    });

    expect(regenerated.ref.jobId).not.toBe(original.ref.jobId);
    expect(regenerated.regenerateOf).toEqual(original.ref);
    expect(regenerated.retryOf).toBeUndefined();
    expect(regenerated.request).toEqual(succeeded.request);
  });

  it('rejects regeneration when the source Job is not succeeded', async () => {
    const execution = createExecution();
    execution.generateImage.mockRejectedValue(new Error('provider rejected request'));
    const coordinator = createCoordinator(execution, {
      commit: vi.fn(async () => [createResultLocator('unused')]),
    });
    const original = await coordinator.submitGeneration(createInput());
    const failed = await waitForPhase(coordinator, original.ref, 'failed');

    await expect(
      coordinator.regenerateGeneration({
        ref: original.ref,
        expectedRevision: failed.revision,
      }),
    ).rejects.toMatchObject({ code: 'generation-job-regenerate-unavailable' });
  });

  it('cancels linked work on shutdown and preserves detached work for recovery', async () => {
    const linkedExecution = createExecution();
    linkedExecution.generateImage.mockImplementation((_request, options) =>
      rejectOnAbort(options?.signal),
    );
    const linked = createCoordinator(linkedExecution, {
      commit: vi.fn(async () => [createResultLocator('generated-linked')]),
    });
    const linkedInitial = await linked.submitGeneration(createInput());
    await waitForRevision(linked, linkedInitial.ref, 2);

    await linked.dispose();

    expect(await linked.describeGeneration(linkedInitial.ref)).toMatchObject({
      lifecycleMode: 'linked',
      phase: 'cancelled',
    });

    const detachedExecution = createExecution();
    detachedExecution.generateImage.mockImplementation((_request, options) =>
      rejectOnAbort(options?.signal),
    );
    const detached = createCoordinator(detachedExecution, {
      commit: vi.fn(async () => [createResultLocator('generated-detached')]),
    });
    const detachedInitial = await detached.submitGeneration({
      ...createInput(),
      lifecycleMode: 'detached',
    });
    const detachedRunning = await waitForRevision(detached, detachedInitial.ref, 2);

    await detached.dispose();

    expect(await detached.describeGeneration(detachedInitial.ref)).toEqual(detachedRunning);
  });

  it('does not report local cancellation when provider cancellation is unsupported', async () => {
    const execution = createExecution();
    execution.generateImage.mockImplementation(
      (_request, options) =>
        new Promise(() => {
          void options?.onExternalTask?.({
            providerId: 'provider-1',
            externalTaskId: 'external-1',
          });
        }),
    );
    execution.cancelExternalTask.mockRejectedValueOnce(
      Object.assign(new Error('Cancellation unsupported'), {
        code: 'media-task-cancel-unsupported',
      }),
    );
    const coordinator = createCoordinator(execution, {
      commit: vi.fn(async () => [createResultLocator('generated-1')]),
    });
    const initial = await coordinator.submitGeneration(createInput());
    const running = await waitForRevision(coordinator, initial.ref, 3);

    await expect(
      coordinator.cancelGeneration({
        ref: initial.ref,
        expectedRevision: running.revision,
      }),
    ).rejects.toMatchObject({ code: 'media-task-cancel-unsupported' });
    expect((await coordinator.describeGeneration(initial.ref)).phase).toBe('running');
  });

  it('reconciles a recovered provider task without submitting generation again', async () => {
    const execution = createExecution();
    execution.describeExternalTask
      .mockResolvedValueOnce({ status: 'processing', progress: 70 })
      .mockResolvedValueOnce({
        status: 'completed',
        progress: 100,
        outputs: generationResult().outputs,
      });
    const store = createInMemoryGenerationJobStore();
    const initial = await store.create(snapshot());
    const running = await store.commit({
      ref: initial.ref,
      expectedRevision: 1,
      next: {
        ...initial,
        phase: 'running',
        revision: 2,
        updatedAt: 102,
        providerTask: { providerId: 'provider-1', externalTaskId: 'external-1' },
        progress: { stage: 'waiting-provider', percent: 35 },
      },
    });
    const coordinator = new GenerationJobCoordinator({
      store,
      execution,
      resultCommitter: { commit: vi.fn(async () => [createResultLocator('generated-1')]) },
      now: incrementingClock(102),
      waitForRecoveryPoll: async () => undefined,
    });

    await coordinator.recoverPersistedGenerationJobs();
    const terminal = await waitForTerminal(coordinator, running.ref);

    expect(terminal.phase).toBe('succeeded');
    expect(execution.describeExternalTask).toHaveBeenCalledTimes(2);
    expect(execution.generateImage).not.toHaveBeenCalled();
  });

  it('marks an ambiguous recovered submission outcome-unknown without resubmitting', async () => {
    const execution = createExecution();
    const store = createInMemoryGenerationJobStore();
    const initial = await store.create(snapshot());
    const running = await store.commit({
      ref: initial.ref,
      expectedRevision: 1,
      next: {
        ...initial,
        phase: 'running',
        revision: 2,
        updatedAt: 102,
        progress: { stage: 'submitting', percent: 0 },
      },
    });
    const coordinator = new GenerationJobCoordinator({
      store,
      execution,
      resultCommitter: { commit: vi.fn(async () => [createResultLocator('generated-1')]) },
      now: incrementingClock(102),
    });

    const recovered = await coordinator.recoverPersistedGenerationJobs();

    expect(recovered).toEqual([
      expect.objectContaining({
        ref: running.ref,
        phase: 'outcome-unknown',
        failure: expect.objectContaining({ code: 'generation-outcome-unknown-after-restart' }),
      }),
    ]);
    expect(execution.generateImage).not.toHaveBeenCalled();
    expect(execution.describeExternalTask).not.toHaveBeenCalled();
  });

  it('resumes a recovered pending Job exactly once', async () => {
    const execution = createExecution();
    execution.generateImage.mockResolvedValue(generationResult());
    const store = createInMemoryGenerationJobStore();
    const initial = await store.create(snapshot());
    const coordinator = new GenerationJobCoordinator({
      store,
      execution,
      resultCommitter: { commit: vi.fn(async () => [createResultLocator('generated-1')]) },
      now: incrementingClock(101),
    });

    await coordinator.recoverPersistedGenerationJobs();
    await coordinator.recoverPersistedGenerationJobs();
    await waitForTerminal(coordinator, initial.ref);

    expect(execution.generateImage).toHaveBeenCalledTimes(1);
  });
});

function createCoordinator(
  execution: ReturnType<typeof createExecution>,
  resultCommitter: {
    commit: (
      input: unknown,
    ) => Promise<readonly import('@neko/content').GeneratedOutputContentLocator[]>;
  },
) {
  let id = 0;
  let now = 100;
  return new GenerationJobCoordinator({
    store: createInMemoryGenerationJobStore(),
    execution,
    resultCommitter,
    createJobId: () => `generation-${++id}`,
    now: () => ++now,
  });
}

function createExecution() {
  return {
    generateImage: vi.fn(),
    generateVideo: vi.fn(),
    generateAudio: vi.fn(),
    describeExternalTask: vi.fn(),
    cancelExternalTask: vi.fn(async () => undefined),
  };
}

function createInput() {
  return {
    lifecycleMode: 'linked' as const,
    generationType: 'text-to-image' as const,
    providerId: 'provider-1',
    modelId: 'image-model',
    request: {
      prompt: 'cat',
      providerId: 'provider-1',
      modelId: 'image-model',
    },
  };
}

function snapshot(): import('../contracts').GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: 'recovered-generation-1' },
    lifecycleMode: 'detached',
    phase: 'pending',
    revision: 1,
    createdAt: 101,
    updatedAt: 101,
    request: {
      generationType: 'text-to-image',
      providerId: 'provider-1',
      modelId: 'image-model',
      request: {
        prompt: 'cat',
        providerId: 'provider-1',
        modelId: 'image-model',
      },
    },
    progress: { stage: 'queued', percent: 0 },
  };
}

function incrementingClock(initial: number): () => number {
  let now = initial;
  return () => ++now;
}

function generationResult(): MediaGenerationResult {
  return {
    type: 'text-to-image',
    providerId: 'provider-1',
    modelId: 'image-model',
    outputs: [{ type: 'image', url: 'https://provider.test/generated.png' }],
    request: createInput().request,
  };
}

function createResultLocator(id: string) {
  return {
    kind: 'generated-output' as const,
    outputId: id,
    revision: `revision-${id}`,
    digest: `sha256:${id}`,
    path: `neko/generated/image/${id}.png`,
  };
}

function rejectOnAbort(signal: AbortSignal | undefined): Promise<never> {
  if (!signal) throw new Error('Generation execution requires an AbortSignal.');
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

async function waitForRevision(
  coordinator: GenerationJobCoordinator,
  ref: import('../contracts').GenerationJobRef,
  revision: number,
) {
  for await (const snapshot of coordinator.observeGeneration(ref, 1)) {
    if (snapshot.revision >= revision) return snapshot;
  }
  throw new Error(`Generation Job did not reach revision ${revision}.`);
}

async function waitForTerminal(
  coordinator: GenerationJobCoordinator,
  ref: import('../contracts').GenerationJobRef,
) {
  for await (const snapshot of coordinator.observeGeneration(ref, 1)) {
    if (snapshot.phase === 'succeeded' || snapshot.phase === 'failed') return snapshot;
  }
  throw new Error('Generation Job did not reach a terminal phase.');
}

async function waitForPhase(
  coordinator: GenerationJobCoordinator,
  ref: import('../contracts').GenerationJobRef,
  phase: import('@neko/shared/job-lifecycle').JobPhase,
) {
  for await (const snapshot of coordinator.observeGeneration(ref, 1)) {
    if (snapshot.phase === phase) return snapshot;
  }
  throw new Error(`Generation Job did not reach phase ${phase}.`);
}
