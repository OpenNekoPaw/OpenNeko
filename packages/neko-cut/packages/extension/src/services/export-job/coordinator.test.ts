import { describe, expect, it, vi } from 'vitest';
import type {
  ExportEnginePort,
  ExportEngineProgress,
  ExportJobResultCommitter,
  ExportJobSnapshot,
} from './contracts';
import { ExportJobCoordinator } from './coordinator';
import { createInMemoryExportJobStore } from './store';

describe('ExportJobCoordinator', () => {
  it('commits monotonic Engine progress and the output before terminal success', async () => {
    const engine = createEngine();
    engine.describeExport
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
    const coordinator = createCoordinator(engine, resultCommitter);

    const initial = await coordinator.submitExport(createInput());
    const terminal = await waitForPhase(coordinator, initial.ref, 'succeeded');

    expect(engine.enqueueExport).toHaveBeenCalledWith({
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

  it('fails visibly when final output commit fails after Engine completion', async () => {
    const engine = createEngine();
    engine.describeExport.mockResolvedValueOnce(
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
    const coordinator = createCoordinator(engine, resultCommitter);

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
    const engine = createEngine();
    engine.describeExport.mockResolvedValueOnce(
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
    const coordinator = createCoordinator(engine, resultCommitter);

    const initial = await coordinator.submitExport(createInput());
    const terminal = await waitForPhase(coordinator, initial.ref, 'failed');

    expect(terminal.failure).toMatchObject({
      code: 'export-result-commit-failed',
      retryable: true,
    });
    expect(terminal.failure?.message).toContain('does not match Export Job');
    expect(terminal.result).toBeUndefined();
  });

  it('rejects an Engine response for a different identity', async () => {
    const engine = createEngine();
    engine.describeExport.mockResolvedValue(
      progress({ engineJobId: 'different-engine-job', progress: 25 }),
    );
    const coordinator = createCoordinator(engine, createCommitter());

    const initial = await coordinator.submitExport(createInput());
    const terminal = await waitForPhase(coordinator, initial.ref, 'outcome-unknown');

    expect(terminal.failure).toMatchObject({
      code: 'export-outcome-unknown',
      retryable: false,
    });
  });

  it('rejects regressing Engine progress without replacing the last committed values', async () => {
    const engine = createEngine();
    engine.describeExport
      .mockResolvedValueOnce(progress({ progress: 60, currentFrame: 60, elapsedMs: 1_000 }))
      .mockResolvedValueOnce(progress({ progress: 40, currentFrame: 40, elapsedMs: 900 }));
    const coordinator = createCoordinator(engine, createCommitter());

    const initial = await coordinator.submitExport(createInput());
    const terminal = await waitForPhase(coordinator, initial.ref, 'outcome-unknown');

    expect(terminal.progress).toMatchObject({
      percent: 60,
      currentFrame: 60,
      elapsedMs: 1_000,
    });
    expect(terminal.failure?.message).toContain('regressed');
  });

  it('rejects stale cancellation before calling the Engine and cancels exact identity', async () => {
    const engine = createEngine();
    engine.describeExport.mockImplementation(() => new Promise(() => undefined));
    const coordinator = createCoordinator(engine, createCommitter());
    const initial = await coordinator.submitExport(createInput());
    const running = await waitForRevision(coordinator, initial.ref, 3);

    await expect(
      coordinator.cancelExport({ ref: initial.ref, expectedRevision: 1 }),
    ).rejects.toMatchObject({ code: 'stale-revision' });
    expect(engine.cancelExport).not.toHaveBeenCalled();

    const cancelled = await coordinator.cancelExport({
      ref: initial.ref,
      expectedRevision: running.revision,
    });

    expect(engine.cancelExport).toHaveBeenCalledWith({
      ref: initial.ref,
      request: initial.request,
      engineJobId: 'engine-job-1',
    });
    expect(cancelled).toMatchObject({ ref: initial.ref, phase: 'cancelled' });
  });

  it('does not report cancellation when the Engine cancellation fails', async () => {
    const engine = createEngine();
    engine.describeExport.mockImplementation(() => new Promise(() => undefined));
    engine.cancelExport.mockRejectedValueOnce(new Error('Engine cancellation unavailable'));
    const coordinator = createCoordinator(engine, createCommitter());
    const initial = await coordinator.submitExport(createInput());
    const running = await waitForRevision(coordinator, initial.ref, 3);

    await expect(
      coordinator.cancelExport({
        ref: initial.ref,
        expectedRevision: running.revision,
      }),
    ).rejects.toThrow('Engine cancellation unavailable');

    expect((await coordinator.describeExport(initial.ref)).phase).toBe('running');
  });

  it('retries with a new identity and immutable retry provenance', async () => {
    const engine = createEngine();
    engine.enqueueExport.mockRejectedValueOnce(new Error('Engine rejected export'));
    engine.describeExport.mockImplementation(() => new Promise(() => undefined));
    const coordinator = createCoordinator(engine, createCommitter());
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

  it('marks an Engine query failure outcome-unknown without resubmitting', async () => {
    const engine = createEngine();
    engine.describeExport.mockRejectedValueOnce(new Error('Engine connection lost'));
    const coordinator = createCoordinator(engine, createCommitter());

    const initial = await coordinator.submitExport(createInput());
    const unknown = await waitForPhase(coordinator, initial.ref, 'outcome-unknown');

    expect(unknown.failure).toMatchObject({
      code: 'export-outcome-unknown',
      message: 'Engine connection lost',
      retryable: false,
    });
    expect(engine.enqueueExport).toHaveBeenCalledTimes(1);
  });

  it('recovers a persisted Engine identity without enqueueing a second export', async () => {
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
        engineJobId: 'engine-job-recovered',
        progress: {
          ...initial.progress,
          stage: 'waiting-engine',
          percent: 50,
          currentFrame: 50,
          elapsedMs: 1_000,
        },
      },
    });
    const engine = createEngine();
    engine.describeExport.mockResolvedValueOnce(
      progress({
        engineJobId: 'engine-job-recovered',
        state: 'completed',
        progress: 100,
        currentFrame: 100,
        elapsedMs: 2_000,
      }),
    );
    const coordinator = new ExportJobCoordinator({
      store,
      engine,
      resultCommitter: createCommitter(),
      now: incrementingClock(102),
      waitForPoll: async () => undefined,
    });

    await coordinator.recoverPersistedExportJobs();
    await coordinator.recoverPersistedExportJobs();
    const terminal = await waitForPhase(coordinator, running.ref, 'succeeded');

    expect(terminal.result?.outputPath).toBe('/workspace/output/final.mp4');
    expect(engine.describeExport).toHaveBeenCalledTimes(1);
    expect(engine.enqueueExport).not.toHaveBeenCalled();
  });
});

function createCoordinator(
  engine: ReturnType<typeof createEngine>,
  resultCommitter: ExportJobResultCommitter,
) {
  let id = 0;
  let now = 100;
  return new ExportJobCoordinator({
    store: createInMemoryExportJobStore(),
    engine,
    resultCommitter,
    createJobId: () => `export-${++id}`,
    now: () => ++now,
    waitForPoll: async () => undefined,
  });
}

function createEngine() {
  return {
    enqueueExport: vi.fn(async () => ({ engineJobId: 'engine-job-1' })),
    describeExport: vi.fn<ExportEnginePort['describeExport']>(),
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
    engineConfig: {
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

function progress(overrides: Partial<ExportEngineProgress> = {}): ExportEngineProgress {
  return {
    engineJobId: 'engine-job-1',
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
