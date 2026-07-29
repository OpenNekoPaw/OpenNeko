import { describe, expect, it, vi } from 'vitest';
import type {
  ExportExecutorPort,
  ExportExecutionProgress,
  ExportJobResultCommitter,
  ExportJobSnapshot,
} from '@neko-cut/node';
import { ExportJobCoordinator, createInMemoryExportJobStore } from '@neko-cut/node';

describe('ExportJobCoordinator', () => {
  it('commits monotonic executor progress and the output before terminal success', async () => {
    const executor = createExecutor();
    executor.describeExport
      .mockResolvedValueOnce(progress({ progress: 35, currentFrame: 35, elapsedMs: 1_000 }))
      .mockResolvedValueOnce(
        progress({
          state: 'completed',
          progress: 100,
          currentFrame: 100,
          elapsedMs: 2_000,
        }),
      );
    const resultCommitter = createCommitter();
    const coordinator = createCoordinator(executor, resultCommitter);

    const initial = await coordinator.submitExport(createInput());
    const terminal = await waitForPhase(coordinator, initial.ref, 'succeeded');

    expect(executor.enqueueExport).toHaveBeenCalledWith({
      ref: initial.ref,
      request: initial.request,
    });
    expect(resultCommitter.commitExport).toHaveBeenCalledWith({
      ref: initial.ref,
      request: initial.request,
      progress: expect.objectContaining({ state: 'completed', progress: 100 }),
    });
    expect(terminal).toMatchObject({
      phase: 'succeeded',
      progress: {
        stage: 'completed',
        percent: 100,
        currentFrame: 100,
        elapsedMs: 2_000,
      },
      result: {
        outputPath: '/workspace/output/final.mp4',
        totalFrames: 100,
        elapsedMs: 2_000,
      },
    });
    expect(terminal.revision).toBeGreaterThan(4);
  });

  it('fails visibly when final output commit fails after executor completion', async () => {
    const executor = createExecutor();
    executor.describeExport.mockResolvedValueOnce(
      progress({
        state: 'completed',
        progress: 100,
        currentFrame: 100,
        elapsedMs: 2_000,
      }),
    );
    const resultCommitter = createCommitter();
    resultCommitter.commitExport.mockRejectedValueOnce(
      new Error('Committed export output is unavailable.'),
    );
    const coordinator = createCoordinator(executor, resultCommitter);

    const initial = await coordinator.submitExport(createInput());
    const terminal = await waitForPhase(coordinator, initial.ref, 'failed');

    expect(terminal).toMatchObject({
      phase: 'failed',
      progress: { stage: 'committing-output', percent: 100 },
      failure: {
        code: 'export-result-commit-failed',
        message: 'Committed export output is unavailable.',
        retryable: true,
      },
    });
    expect(terminal.result).toBeUndefined();
  });

  it('rejects a committed result that does not match the frozen Export request', async () => {
    const executor = createExecutor();
    executor.describeExport.mockResolvedValueOnce(
      progress({
        state: 'completed',
        progress: 100,
        currentFrame: 100,
        elapsedMs: 2_000,
      }),
    );
    const resultCommitter = createCommitter();
    resultCommitter.commitExport.mockResolvedValueOnce({
      outputPath: '/workspace/output/wrong.mp4',
      totalFrames: 100,
      elapsedMs: 2_000,
    });
    const coordinator = createCoordinator(executor, resultCommitter);

    const initial = await coordinator.submitExport(createInput());
    const terminal = await waitForPhase(coordinator, initial.ref, 'failed');

    expect(terminal.failure).toMatchObject({
      code: 'export-result-commit-failed',
      retryable: true,
    });
    expect(terminal.failure?.message).toContain('does not match Export Job');
    expect(terminal.result).toBeUndefined();
  });

  it('rejects an executor response for a different identity', async () => {
    const executor = createExecutor();
    executor.describeExport.mockResolvedValue(
      progress({ executionId: 'different-execution', progress: 25 }),
    );
    const coordinator = createCoordinator(executor, createCommitter());

    const initial = await coordinator.submitExport(createInput());
    const terminal = await waitForPhase(coordinator, initial.ref, 'outcome-unknown');

    expect(terminal.failure).toMatchObject({
      code: 'export-outcome-unknown',
      retryable: false,
    });
  });

  it('rejects regressing executor progress without replacing the last committed values', async () => {
    const executor = createExecutor();
    executor.describeExport
      .mockResolvedValueOnce(progress({ progress: 60, currentFrame: 60, elapsedMs: 1_000 }))
      .mockResolvedValueOnce(progress({ progress: 40, currentFrame: 40, elapsedMs: 900 }));
    const coordinator = createCoordinator(executor, createCommitter());

    const initial = await coordinator.submitExport(createInput());
    const terminal = await waitForPhase(coordinator, initial.ref, 'outcome-unknown');

    expect(terminal.progress).toMatchObject({
      percent: 60,
      currentFrame: 60,
      elapsedMs: 1_000,
    });
    expect(terminal.failure?.message).toContain('regressed');
  });

  it('rejects stale cancellation before calling the executor and cancels exact identity', async () => {
    const executor = createExecutor();
    executor.describeExport.mockImplementation(() => new Promise(() => undefined));
    const coordinator = createCoordinator(executor, createCommitter());
    const initial = await coordinator.submitExport(createInput());
    const running = await waitForRevision(coordinator, initial.ref, 3);

    await expect(
      coordinator.cancelExport({ ref: initial.ref, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'stale-revision' });
    expect(executor.cancelExport).not.toHaveBeenCalled();

    const cancelled = await coordinator.cancelExport({
      ref: initial.ref,
      expectedRevision: running.revision,
    });

    expect(executor.cancelExport).toHaveBeenCalledWith({
      ref: initial.ref,
      request: initial.request,
      executionId: 'execution-1',
    });
    expect(cancelled).toMatchObject({ ref: initial.ref, phase: 'cancelled' });
  });

  it('does not report cancellation when the executor cancellation fails', async () => {
    const executor = createExecutor();
    executor.describeExport.mockImplementation(() => new Promise(() => undefined));
    executor.cancelExport.mockRejectedValueOnce(new Error('executor cancellation unavailable'));
    const coordinator = createCoordinator(executor, createCommitter());
    const initial = await coordinator.submitExport(createInput());
    const running = await waitForRevision(coordinator, initial.ref, 3);

    await expect(
      coordinator.cancelExport({
        ref: initial.ref,
        expectedRevision: running.revision,
      }),
    ).rejects.toThrow('executor cancellation unavailable');

    expect((await coordinator.describeExport(initial.ref)).phase).toBe('running');
  });

  it('retries with a new identity and immutable retry provenance', async () => {
    const executor = createExecutor();
    executor.enqueueExport.mockRejectedValueOnce(new Error('executor rejected export'));
    executor.describeExport.mockImplementation(() => new Promise(() => undefined));
    const coordinator = createCoordinator(executor, createCommitter());
    const original = await coordinator.submitExport(createInput());
    const failed = await waitForPhase(coordinator, original.ref, 'failed');

    const retry = await coordinator.retryExport({
      ref: original.ref,
      expectedRevision: failed.revision,
    });

    expect(retry.ref.jobId).not.toBe(original.ref.jobId);
    expect(retry.retryOf).toEqual(original.ref);
    expect(await coordinator.describeExport(original.ref)).toEqual(failed);
  });

  it('marks an executor query failure outcome-unknown without resubmitting', async () => {
    const executor = createExecutor();
    executor.describeExport.mockRejectedValueOnce(new Error('executor connection lost'));
    const coordinator = createCoordinator(executor, createCommitter());

    const initial = await coordinator.submitExport(createInput());
    const unknown = await waitForPhase(coordinator, initial.ref, 'outcome-unknown');

    expect(unknown.failure).toMatchObject({
      code: 'export-outcome-unknown',
      message: 'executor connection lost',
      retryable: false,
    });
    expect(executor.enqueueExport).toHaveBeenCalledTimes(1);
  });

  it('recovers a persisted executor identity without enqueueing a second export', async () => {
    const store = createInMemoryExportJobStore();
    const initial = await store.create(snapshot());
    const running = await store.commit({
      ref: initial.ref,
      expectedRevision: 1,
      next: {
        ...initial,
        phase: 'running',
        revision: 2,
        updatedAt: 102,
        executionId: 'execution-recovered',
        progress: {
          ...initial.progress,
          stage: 'waiting-executor',
          percent: 50,
          currentFrame: 50,
          elapsedMs: 1_000,
        },
      },
    });
    const executor = createExecutor();
    executor.describeExport.mockResolvedValueOnce(
      progress({
        executionId: 'execution-recovered',
        state: 'completed',
        progress: 100,
        currentFrame: 100,
        elapsedMs: 2_000,
      }),
    );
    const coordinator = new ExportJobCoordinator({
      store,
      executor,
      resultCommitter: createCommitter(),
      now: incrementingClock(102),
      waitForPoll: async () => undefined,
    });

    await coordinator.recoverPersistedExportJobs();
    await coordinator.recoverPersistedExportJobs();
    const terminal = await waitForPhase(coordinator, running.ref, 'succeeded');

    expect(terminal.result?.outputPath).toBe('/workspace/output/final.mp4');
    expect(executor.describeExport).toHaveBeenCalledTimes(1);
    expect(executor.enqueueExport).not.toHaveBeenCalled();
  });
});

function createCoordinator(
  executor: ReturnType<typeof createExecutor>,
  resultCommitter: ExportJobResultCommitter,
) {
  let id = 0;
  let now = 100;
  return new ExportJobCoordinator({
    store: createInMemoryExportJobStore(),
    executor,
    resultCommitter,
    createJobId: () => `export-${++id}`,
    now: () => ++now,
    waitForPoll: async () => undefined,
  });
}

function createExecutor() {
  return {
    enqueueExport: vi.fn(async () => ({ executionId: 'execution-1' })),
    describeExport: vi.fn<ExportExecutorPort['describeExport']>(),
    cancelExport: vi.fn(async () => undefined),
  };
}

function createCommitter(): ExportJobResultCommitter & {
  commitExport: ReturnType<typeof vi.fn<ExportJobResultCommitter['commitExport']>>;
} {
  return {
    commitExport: vi.fn(async ({ request, progress: engineProgress }) => ({
      outputPath: request.config.outputPath,
      totalFrames: engineProgress.totalFrames,
      elapsedMs: engineProgress.elapsedMs,
    })),
  };
}

function createInput() {
  return {
    documentUri: 'file:///workspace/project.otio',
    config: {
      outputPath: '/workspace/output/final.mp4',
      format: 'mp4' as const,
      width: 1920,
      height: 1080,
      fps: 24,
      quality: 'high' as const,
      audioBitrate: 192_000,
      videoBitrate: 8_000_000,
      includeAudio: true,
      audioSampleRate: 48_000 as const,
    },
    executionConfig: {
      timeline: { version: 1, tracks: [] },
      output: { path: '/workspace/output/final.mp4' },
    },
  };
}

function snapshot(): ExportJobSnapshot {
  return {
    ref: { kind: 'export', jobId: 'export-recovered' },
    phase: 'pending',
    revision: 1,
    createdAt: 101,
    updatedAt: 101,
    request: createInput(),
    progress: {
      stage: 'queued',
      percent: 0,
      currentFrame: 0,
      totalFrames: 0,
      elapsedMs: 0,
      estimatedRemainingMs: 0,
      currentFps: 0,
    },
  };
}

function progress(overrides: Partial<ExportExecutionProgress> = {}): ExportExecutionProgress {
  return {
    executionId: 'execution-1',
    state: 'running',
    progress: 0,
    currentFrame: 0,
    totalFrames: 100,
    elapsedMs: 0,
    estimatedRemainingMs: 2_000,
    stats: { avgFps: 24 },
    ...overrides,
  };
}

function incrementingClock(initial: number): () => number {
  let now = initial;
  return () => ++now;
}

async function waitForRevision(
  coordinator: ExportJobCoordinator,
  ref: ExportJobSnapshot['ref'],
  revision: number,
) {
  for await (const current of coordinator.observeExport(ref, 1)) {
    if (current.revision >= revision) return current;
  }
  throw new Error(`Export Job did not reach revision ${revision}.`);
}

async function waitForPhase(
  coordinator: ExportJobCoordinator,
  ref: ExportJobSnapshot['ref'],
  phase: ExportJobSnapshot['phase'],
) {
  for await (const current of coordinator.observeExport(ref, 1)) {
    if (current.phase === phase) return current;
  }
  throw new Error(`Export Job did not reach phase ${phase}.`);
}
