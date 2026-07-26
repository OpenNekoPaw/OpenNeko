import { randomUUID } from 'node:crypto';
import {
  isTerminalJobPhase,
  JobLifecycleError,
  type JobFailureSummary,
} from '@neko/shared/job-lifecycle';
import {
  EXPORT_JOB_KIND,
  ExportJobError,
  type ExportEngineProgress,
  type ExportJobCommandInput,
  type ExportJobPort,
  type ExportJobRef,
  type ExportJobResult,
  type ExportJobSnapshot,
  type SubmitExportJobInput,
  type ExportEnginePort,
  type ExportJobResultCommitter,
  type ExportJobStore,
} from './contracts';

interface ActiveExport {
  readonly controller: AbortController;
  completion: Promise<void>;
}

export interface ExportJobCoordinatorOptions {
  readonly store: ExportJobStore;
  readonly engine: ExportEnginePort;
  readonly resultCommitter: ExportJobResultCommitter;
  readonly createJobId?: () => string;
  readonly now?: () => number;
  readonly pollIntervalMs?: number;
  readonly waitForPoll?: (intervalMs: number, signal: AbortSignal) => Promise<void>;
}

export class ExportJobCoordinator implements ExportJobPort {
  private readonly active = new Map<string, ActiveExport>();
  private readonly mutationTails = new Map<string, Promise<void>>();
  private readonly createJobId: () => string;
  private readonly now: () => number;
  private readonly pollIntervalMs: number;
  private readonly waitForPoll: (intervalMs: number, signal: AbortSignal) => Promise<void>;
  private disposed = false;

  constructor(private readonly options: ExportJobCoordinatorOptions) {
    this.createJobId = options.createJobId ?? randomUUID;
    this.now = options.now ?? Date.now;
    this.pollIntervalMs = options.pollIntervalMs ?? 200;
    this.waitForPoll = options.waitForPoll ?? abortableDelay;
    if (!Number.isSafeInteger(this.pollIntervalMs) || this.pollIntervalMs <= 0) {
      throw new RangeError('Export Job poll interval must be a positive integer.');
    }
  }

  async submitExport(input: SubmitExportJobInput): Promise<ExportJobSnapshot> {
    this.assertNotDisposed();
    const timestamp = this.now();
    const ref: ExportJobRef = { kind: EXPORT_JOB_KIND, jobId: this.createJobId() };
    const initial = await this.options.store.create({
      ref,
      phase: 'pending',
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.retryOf ? { retryOf: input.retryOf } : {}),
      request: freezeRequest(input),
      progress: emptyProgress('queued'),
    });
    this.supervise(initial, (snapshot, controller) => this.run(snapshot, controller));
    return initial;
  }

  describeExport(ref: ExportJobRef): Promise<ExportJobSnapshot> {
    return this.options.store.get(ref);
  }

  observeExport(ref: ExportJobRef, afterRevision: number): AsyncIterable<ExportJobSnapshot> {
    return this.options.store.observe(ref, afterRevision);
  }

  cancelExport(input: ExportJobCommandInput): Promise<ExportJobSnapshot> {
    return this.enqueue(input.ref, async () => {
      const current = await this.getAtExpectedRevision(input);
      if (isTerminalJobPhase(current.phase)) {
        throw new JobLifecycleError(
          'terminal-mutation',
          `Terminal Export Job ${current.ref.jobId} cannot be cancelled.`,
        );
      }
      if (!current.engineJobId) {
        throw new ExportJobError(
          'export-job-cancel-unavailable',
          `Export Job ${current.ref.jobId} has no Engine identity to cancel.`,
        );
      }
      await this.options.engine.cancelExport({
        ref: current.ref,
        request: current.request,
        engineJobId: current.engineJobId,
      });
      this.active.get(current.ref.jobId)?.controller.abort(new Error('Export Job cancelled.'));
      return this.commit(current, {
        phase: 'cancelled',
        progress: current.progress,
        failure: {
          code: 'export-job-cancelled',
          message: 'Export was cancelled by an explicit command.',
          retryable: true,
        },
      });
    });
  }

  retryExport(input: ExportJobCommandInput): Promise<ExportJobSnapshot> {
    return this.enqueue(input.ref, async () => {
      const current = await this.getAtExpectedRevision(input);
      if (
        current.phase !== 'failed' &&
        current.phase !== 'cancelled' &&
        current.phase !== 'outcome-unknown'
      ) {
        throw new ExportJobError(
          'export-job-retry-unavailable',
          `Export Job ${current.ref.jobId} in phase ${current.phase} cannot be retried.`,
        );
      }
      return this.submitExport({ ...current.request, retryOf: current.ref });
    });
  }

  reconcileExport(input: ExportJobCommandInput): Promise<ExportJobSnapshot> {
    return this.enqueue(input.ref, async () => {
      const current = await this.getAtExpectedRevision(input);
      if (isTerminalJobPhase(current.phase)) return current;
      if (!current.engineJobId) {
        throw new ExportJobError(
          'export-job-reconcile-unavailable',
          `Export Job ${current.ref.jobId} has no Engine identity to reconcile.`,
        );
      }
      const progress = await this.options.engine.describeExport({
        ref: current.ref,
        request: current.request,
        engineJobId: current.engineJobId,
      });
      return this.applyEngineProgress(current, progress);
    });
  }

  async recoverPersistedExportJobs(options?: {
    readonly canRecover?: (snapshot: ExportJobSnapshot) => boolean;
  }): Promise<readonly ExportJobSnapshot[]> {
    this.assertNotDisposed();
    const snapshots = await this.options.store.listRecoverable();
    const recovered: ExportJobSnapshot[] = [];
    for (const snapshot of snapshots) {
      if (options?.canRecover && !options.canRecover(snapshot)) continue;
      if (this.active.has(snapshot.ref.jobId)) {
        recovered.push(await this.options.store.get(snapshot.ref));
        continue;
      }
      if (snapshot.phase === 'pending') {
        this.supervise(snapshot, (current, controller) => this.run(current, controller));
        recovered.push(snapshot);
        continue;
      }
      if (snapshot.engineJobId) {
        this.supervise(snapshot, (current, controller) => this.poll(current, controller));
        recovered.push(snapshot);
        continue;
      }
      if (snapshot.phase === 'running') {
        recovered.push(
          await this.enqueue(snapshot.ref, async () => {
            const current = await this.options.store.get(snapshot.ref);
            return this.commit(current, {
              phase: 'outcome-unknown',
              progress: current.progress,
              failure: {
                code: 'export-outcome-unknown-after-restart',
                message:
                  'Export was running when the Host stopped, but no Engine identity was persisted.',
                retryable: false,
              },
            });
          }),
        );
        continue;
      }
      recovered.push(snapshot);
    }
    return recovered;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const active = [...this.active.values()];
    for (const item of active) item.controller.abort(new Error('Export coordinator disposed.'));
    await Promise.allSettled(active.map((item) => item.completion));
  }

  private supervise(
    snapshot: ExportJobSnapshot,
    execute: (snapshot: ExportJobSnapshot, controller: AbortController) => Promise<void>,
  ): void {
    const controller = new AbortController();
    const active: ActiveExport = { controller, completion: Promise.resolve() };
    this.active.set(snapshot.ref.jobId, active);
    active.completion = execute(snapshot, controller).finally(() => {
      if (this.active.get(snapshot.ref.jobId) === active) this.active.delete(snapshot.ref.jobId);
    });
    void active.completion;
  }

  private async run(initial: ExportJobSnapshot, controller: AbortController): Promise<void> {
    try {
      const enqueuing = await this.enqueue(initial.ref, async () => {
        const current = await this.options.store.get(initial.ref);
        return this.commit(current, {
          phase: 'running',
          progress: emptyProgress('enqueuing'),
        });
      });
      const accepted = await this.options.engine.enqueueExport({
        ref: initial.ref,
        request: initial.request,
      });
      if (!accepted.engineJobId.trim()) {
        throw new ExportJobError(
          'export-job-engine-identity-mismatch',
          `Engine returned an empty identity for Export Job ${initial.ref.jobId}.`,
        );
      }
      const waiting = await this.enqueue(initial.ref, async () => {
        const current = await this.options.store.get(initial.ref);
        return this.commit(current, {
          phase: 'running',
          engineJobId: accepted.engineJobId,
          progress: { ...enqueuing.progress, stage: 'waiting-engine' },
        });
      });
      await this.poll(waiting, controller);
    } catch (error) {
      if (controller.signal.aborted) return;
      await this.fail(initial.ref, error);
    }
  }

  private async poll(initial: ExportJobSnapshot, controller: AbortController): Promise<void> {
    let current = initial;
    try {
      while (!controller.signal.aborted && !isTerminalJobPhase(current.phase)) {
        if (!current.engineJobId) {
          throw new ExportJobError(
            'export-job-reconcile-unavailable',
            `Export Job ${current.ref.jobId} lost its Engine identity.`,
          );
        }
        const progress = await this.options.engine.describeExport({
          ref: current.ref,
          request: current.request,
          engineJobId: current.engineJobId,
        });
        current = await this.enqueue(current.ref, async () =>
          this.applyEngineProgress(await this.options.store.get(current.ref), progress),
        );
        if (!isTerminalJobPhase(current.phase)) {
          await this.waitForPoll(this.pollIntervalMs, controller.signal);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      await this.fail(initial.ref, error, true);
    }
  }

  private async applyEngineProgress(
    current: ExportJobSnapshot,
    progress: ExportEngineProgress,
  ): Promise<ExportJobSnapshot> {
    if (!current.engineJobId || progress.engineJobId !== current.engineJobId) {
      throw new ExportJobError(
        'export-job-engine-identity-mismatch',
        `Engine progress ${progress.engineJobId} does not match Export Job ${current.ref.jobId}.`,
      );
    }
    const projected = projectProgress(progress);
    assertMonotonicProgress(current.progress, projected);
    if (progress.state === 'completed') {
      const committing = await this.commit(current, {
        phase: 'running',
        progress: { ...projected, stage: 'committing-output', percent: 100 },
      });
      let result: ExportJobResult;
      try {
        result = await this.options.resultCommitter.commitExport({
          ref: committing.ref,
          request: committing.request,
          progress,
        });
        assertValidExportResult(committing, progress, result);
      } catch (error) {
        return this.commit(committing, {
          phase: 'failed',
          progress: committing.progress,
          failure: {
            code: 'export-result-commit-failed',
            message: error instanceof Error ? error.message : String(error),
            retryable: true,
          },
        });
      }
      return this.commit(committing, {
        phase: 'succeeded',
        progress: { ...projected, stage: 'completed', percent: 100 },
        result,
      });
    }
    if (progress.state === 'cancelled') {
      return this.commit(current, {
        phase: 'cancelled',
        progress: projected,
        failure: {
          code: 'export-engine-cancelled',
          message: 'Engine reported the export as cancelled.',
          retryable: true,
        },
      });
    }
    if (progress.state === 'error') {
      return this.commit(current, {
        phase: 'failed',
        progress: projected,
        failure: {
          code: 'export-engine-failed',
          message: progress.error ?? 'Engine export failed.',
          retryable: true,
        },
      });
    }
    return this.commit(current, {
      phase: 'running',
      progress: { ...projected, stage: 'waiting-engine' },
    });
  }

  private async fail(ref: ExportJobRef, error: unknown, uncertain = false): Promise<void> {
    await this.enqueue(ref, async () => {
      const current = await this.options.store.get(ref);
      if (isTerminalJobPhase(current.phase)) return current;
      return this.commit(current, {
        phase: uncertain && current.engineJobId ? 'outcome-unknown' : 'failed',
        progress: current.progress,
        failure: failureFrom(error, uncertain),
      });
    });
  }

  private async getAtExpectedRevision(input: ExportJobCommandInput): Promise<ExportJobSnapshot> {
    const current = await this.options.store.get(input.ref);
    if (current.revision !== input.expectedRevision) {
      throw new JobLifecycleError(
        'stale-revision',
        `Export Job ${input.ref.jobId} is at revision ${current.revision}, not ${input.expectedRevision}.`,
      );
    }
    return current;
  }

  private commit(
    current: ExportJobSnapshot,
    next: Omit<
      ExportJobSnapshot,
      'ref' | 'revision' | 'createdAt' | 'updatedAt' | 'request' | 'retryOf'
    >,
  ): Promise<ExportJobSnapshot> {
    const timestamp = Math.max(this.now(), current.updatedAt);
    return this.options.store.commit({
      ref: current.ref,
      expectedRevision: current.revision,
      next: {
        ...current,
        ...next,
        revision: current.revision + 1,
        updatedAt: timestamp,
      },
    });
  }

  private enqueue<T>(ref: ExportJobRef, mutation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTails.get(ref.jobId) ?? Promise.resolve();
    const result = previous.then(mutation, mutation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.mutationTails.set(ref.jobId, tail);
    void tail.finally(() => {
      if (this.mutationTails.get(ref.jobId) === tail) this.mutationTails.delete(ref.jobId);
    });
    return result;
  }

  private assertNotDisposed(): void {
    if (this.disposed) throw new Error('Export Job coordinator is disposed.');
  }
}

function emptyProgress(
  stage: ExportJobSnapshot['progress']['stage'],
): ExportJobSnapshot['progress'] {
  return {
    stage,
    percent: 0,
    currentFrame: 0,
    totalFrames: 0,
    elapsedMs: 0,
    estimatedRemainingMs: 0,
    currentFps: 0,
  };
}

function projectProgress(progress: ExportEngineProgress): ExportJobSnapshot['progress'] {
  if (!Number.isFinite(progress.progress) || progress.progress < 0 || progress.progress > 100) {
    throw new ExportJobError(
      'export-job-invalid-progress',
      `Engine export progress must be between 0 and 100, got ${progress.progress}.`,
    );
  }
  return {
    stage: progress.state === 'completed' ? 'completed' : 'waiting-engine',
    percent: progress.progress,
    currentFrame: progress.currentFrame,
    totalFrames: progress.totalFrames,
    elapsedMs: progress.elapsedMs,
    estimatedRemainingMs: progress.estimatedRemainingMs,
    currentFps: progress.stats?.avgFps ?? 0,
  };
}

function assertMonotonicProgress(
  current: ExportJobSnapshot['progress'],
  next: ExportJobSnapshot['progress'],
): void {
  const regressions = [
    ['percent', current.percent, next.percent],
    ['currentFrame', current.currentFrame, next.currentFrame],
    ['elapsedMs', current.elapsedMs, next.elapsedMs],
  ] as const;
  const regression = regressions.find(([, previous, candidate]) => candidate < previous);
  if (regression) {
    throw new ExportJobError(
      'export-job-invalid-progress',
      `Engine export ${regression[0]} regressed from ${regression[1]} to ${regression[2]}.`,
    );
  }
}

function assertValidExportResult(
  snapshot: ExportJobSnapshot,
  progress: ExportEngineProgress,
  result: ExportJobResult,
): void {
  if (result.outputPath !== snapshot.request.config.outputPath) {
    throw new ExportJobError(
      'export-job-result-invalid',
      `Committed output path ${result.outputPath} does not match Export Job ${snapshot.ref.jobId}.`,
    );
  }
  if (
    !Number.isSafeInteger(result.totalFrames) ||
    result.totalFrames < 0 ||
    result.totalFrames !== progress.totalFrames
  ) {
    throw new ExportJobError(
      'export-job-result-invalid',
      `Committed totalFrames ${result.totalFrames} does not match Engine totalFrames ${progress.totalFrames}.`,
    );
  }
  if (
    !Number.isFinite(result.elapsedMs) ||
    result.elapsedMs < 0 ||
    result.elapsedMs !== progress.elapsedMs
  ) {
    throw new ExportJobError(
      'export-job-result-invalid',
      `Committed elapsedMs ${result.elapsedMs} does not match Engine elapsedMs ${progress.elapsedMs}.`,
    );
  }
}

function freezeRequest(input: SubmitExportJobInput): ExportJobSnapshot['request'] {
  const request = {
    documentUri: input.documentUri,
    config: { ...input.config },
    engineConfig: structuredClone(input.engineConfig),
  };
  deepFreeze(request, new WeakSet<object>());
  return request;
}

function failureFrom(error: unknown, uncertain: boolean): JobFailureSummary {
  return {
    code: uncertain ? 'export-outcome-unknown' : 'export-execution-failed',
    message: error instanceof Error ? error.message : String(error),
    retryable: !uncertain,
  };
}

function abortableDelay(intervalMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, intervalMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

function deepFreeze(value: unknown, visited: WeakSet<object>): void {
  if (typeof value !== 'object' || value === null || visited.has(value)) return;
  visited.add(value);
  for (const nested of Object.values(value)) deepFreeze(nested, visited);
  Object.freeze(value);
}
