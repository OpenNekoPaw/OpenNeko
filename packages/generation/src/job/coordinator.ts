import { randomUUID } from 'node:crypto';
import { validateContentLocator } from '@neko/content';
import {
  isTerminalJobPhase,
  JobLifecycleError,
  type JobFailureSummary,
} from '@neko/shared/job-lifecycle';
import type {
  GenerationExecutionPort,
  GenerationExecutionResult,
  MediaGenerationExecutionOptions,
} from '../execution';
import type { MediaAdapterResult } from '../contracts';
import type {
  GenerationJobCommandInput,
  GenerationJobPort,
  GenerationJobRecoveryRecords,
  GenerationJobRef,
  GenerationJobResultCommitter,
  GenerationJobSnapshot,
  GenerationJobStore,
  SubmitGenerationJobInput,
} from './contracts';
import { GENERATION_JOB_KIND, GenerationJobError } from './contracts';

interface ActiveGeneration {
  readonly controller: AbortController;
  readonly lifecycleMode: GenerationJobSnapshot['lifecycleMode'];
  completion: Promise<void>;
}

export interface GenerationJobCoordinatorOptions {
  readonly store: GenerationJobStore;
  readonly execution: GenerationExecutionPort;
  readonly resultCommitter: GenerationJobResultCommitter;
  readonly now?: () => number;
  readonly createJobId?: () => string;
  readonly recoveryPollIntervalMs?: number;
  readonly waitForRecoveryPoll?: (intervalMs: number, signal: AbortSignal) => Promise<void>;
}

export class GenerationJobCoordinator implements GenerationJobPort {
  private readonly active = new Map<string, ActiveGeneration>();
  private readonly mutationTails = new Map<string, Promise<void>>();
  private readonly submissionTails = new Map<string, Promise<void>>();
  private readonly now: () => number;
  private readonly createJobId: () => string;
  private readonly recoveryPollIntervalMs: number;
  private readonly waitForRecoveryPoll: (intervalMs: number, signal: AbortSignal) => Promise<void>;
  private readonly shutdownJobs = new Set<string>();
  private disposed = false;

  constructor(private readonly options: GenerationJobCoordinatorOptions) {
    this.now = options.now ?? Date.now;
    this.createJobId = options.createJobId ?? randomUUID;
    this.recoveryPollIntervalMs = options.recoveryPollIntervalMs ?? 2_000;
    this.waitForRecoveryPoll = options.waitForRecoveryPoll ?? abortableDelay;
    if (!Number.isSafeInteger(this.recoveryPollIntervalMs) || this.recoveryPollIntervalMs <= 0) {
      throw new RangeError('Generation recovery poll interval must be a positive integer.');
    }
  }

  async submitGeneration(input: SubmitGenerationJobInput): Promise<GenerationJobSnapshot> {
    this.assertNotDisposed();
    if (input.submissionId !== undefined) {
      if (!input.submissionId.trim()) {
        throw new GenerationJobError(
          'generation-job-submission-conflict',
          'Generation submission identity must be non-empty.',
        );
      }
      return this.enqueueSubmission(input.submissionId, async () => {
        const existing = await this.options.store.findBySubmissionId(input.submissionId!);
        if (existing) {
          if (!submissionMatches(existing, input)) {
            throw new GenerationJobError(
              'generation-job-submission-conflict',
              `Generation submission '${input.submissionId}' conflicts with its existing Job.`,
            );
          }
          return existing;
        }
        return this.createGeneration(input);
      });
    }
    return this.createGeneration(input);
  }

  private async createGeneration(input: SubmitGenerationJobInput): Promise<GenerationJobSnapshot> {
    if (input.retryOf !== undefined && input.regenerateOf !== undefined) {
      throw new GenerationJobError(
        'generation-job-binding-mismatch',
        'Generation Job cannot be both a retry and a regeneration.',
      );
    }
    const timestamp = this.now();
    const ref: GenerationJobRef = {
      kind: GENERATION_JOB_KIND,
      jobId: this.createJobId(),
    };
    const initial = await this.options.store.create({
      ref,
      phase: 'pending',
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.submissionId === undefined ? {} : { submissionId: input.submissionId }),
      lifecycleMode: input.lifecycleMode,
      ...(input.retryOf === undefined ? {} : { retryOf: input.retryOf }),
      ...(input.regenerateOf === undefined ? {} : { regenerateOf: input.regenerateOf }),
      request: freezeRequest(input),
      progress: { stage: 'queued', percent: 0 },
    });
    const controller = new AbortController();
    const active: ActiveGeneration = {
      controller,
      lifecycleMode: initial.lifecycleMode,
      completion: Promise.resolve(),
    };
    this.active.set(ref.jobId, active);
    active.completion = this.run(initial, controller);
    void active.completion;
    return initial;
  }

  describeGeneration(ref: GenerationJobRef): Promise<GenerationJobSnapshot> {
    return this.options.store.get(ref);
  }

  observeGeneration(ref: GenerationJobRef): AsyncIterable<GenerationJobSnapshot> {
    return this.options.store.observe(ref);
  }

  cancelGeneration(input: GenerationJobCommandInput): Promise<GenerationJobSnapshot> {
    return this.enqueue(input.ref, async () => {
      const current = await this.options.store.get(input.ref);
      if (isTerminalJobPhase(current.phase)) {
        throw new JobLifecycleError(
          'terminal-mutation',
          `Terminal Generation Job ${current.ref.jobId} cannot be cancelled.`,
        );
      }

      const active = this.active.get(input.ref.jobId);
      if (current.providerTask) {
        await this.options.execution.cancelExternalTask(current.providerTask);
      } else if (!active) {
        throw new GenerationJobError(
          'generation-job-cancel-unsupported',
          `Generation Job ${current.ref.jobId} has no active execution or provider task that can be cancelled safely.`,
        );
      }
      active?.controller.abort(new Error('Generation Job cancelled'));
      return this.commit(current, {
        phase: 'cancelled',
        progress: current.progress,
        failure: {
          code: 'generation-job-cancelled',
          message: 'Generation was cancelled by an explicit command.',
          retryable: true,
        },
      });
    });
  }

  retryGeneration(input: GenerationJobCommandInput): Promise<GenerationJobSnapshot> {
    return this.enqueue(input.ref, async () => {
      const current = await this.options.store.get(input.ref);
      if (
        current.phase !== 'failed' &&
        current.phase !== 'cancelled' &&
        current.phase !== 'outcome-unknown'
      ) {
        throw new GenerationJobError(
          'generation-job-retry-unavailable',
          `Generation Job ${current.ref.jobId} in phase ${current.phase} cannot be retried.`,
        );
      }
      return this.submitGeneration({
        ...current.request,
        lifecycleMode: current.lifecycleMode,
        retryOf: current.ref,
      });
    });
  }

  regenerateGeneration(input: GenerationJobCommandInput): Promise<GenerationJobSnapshot> {
    return this.enqueue(input.ref, async () => {
      const current = await this.options.store.get(input.ref);
      if (current.phase !== 'succeeded') {
        throw new GenerationJobError(
          'generation-job-regenerate-unavailable',
          `Generation Job ${current.ref.jobId} in phase ${current.phase} cannot be regenerated.`,
        );
      }
      return this.submitGeneration({
        ...current.request,
        lifecycleMode: current.lifecycleMode,
        regenerateOf: current.ref,
      });
    });
  }

  reconcileGeneration(input: GenerationJobCommandInput): Promise<GenerationJobSnapshot> {
    return this.enqueue(input.ref, async () => {
      const current = await this.options.store.get(input.ref);
      if (isTerminalJobPhase(current.phase)) return current;
      if (!current.providerTask) {
        throw new GenerationJobError(
          'generation-job-reconcile-unavailable',
          `Generation Job ${current.ref.jobId} has no provider task identity to reconcile.`,
        );
      }
      const result = await this.options.execution.describeExternalTask(current.providerTask);
      return this.applyProviderResult(current, result);
    });
  }

  async recoverPersistedGenerationJobs(): Promise<GenerationJobRecoveryRecords> {
    this.assertNotDisposed();
    const recoverable = await this.options.store.listRecoverable();
    const installed: GenerationJobSnapshot[] = [];
    for (const snapshot of recoverable.snapshots) {
      const supervised = this.active.get(snapshot.ref.jobId);
      if (supervised) {
        installed.push(await this.options.store.get(snapshot.ref));
        continue;
      }
      if (snapshot.phase === 'pending') {
        const controller = new AbortController();
        const active: ActiveGeneration = {
          controller,
          lifecycleMode: snapshot.lifecycleMode,
          completion: Promise.resolve(),
        };
        this.active.set(snapshot.ref.jobId, active);
        active.completion = this.run(snapshot, controller);
        void active.completion;
        installed.push(snapshot);
        continue;
      }
      if (snapshot.providerTask) {
        const controller = new AbortController();
        const active: ActiveGeneration = {
          controller,
          lifecycleMode: snapshot.lifecycleMode,
          completion: Promise.resolve(),
        };
        this.active.set(snapshot.ref.jobId, active);
        active.completion = this.recoverProviderTask(snapshot, snapshot.providerTask, controller);
        void active.completion;
        installed.push(snapshot);
        continue;
      }
      if (snapshot.phase === 'running') {
        const unknown = await this.enqueue(snapshot.ref, async () => {
          const current = await this.options.store.get(snapshot.ref);
          if (current.phase !== 'running' || current.providerTask) return current;
          return this.commit(current, {
            phase: 'outcome-unknown',
            progress: current.progress,
            failure: {
              code: 'generation-outcome-unknown-after-restart',
              message:
                'Generation was running when the Host stopped, but no provider task identity was persisted. The request was not resubmitted.',
              retryable: false,
            },
          });
        });
        installed.push(unknown);
        continue;
      }
      installed.push(snapshot);
    }
    return { snapshots: installed, diagnostics: recoverable.diagnostics };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    const active = [...this.active.entries()];
    for (const [jobId, generation] of active) {
      if (generation.lifecycleMode === 'detached') this.shutdownJobs.add(jobId);
      generation.controller.abort(new Error('Generation Job coordinator disposed.'));
    }
    await Promise.allSettled(active.map(([, generation]) => generation.completion));
  }

  private async run(initial: GenerationJobSnapshot, controller: AbortController): Promise<void> {
    try {
      await this.enqueue(initial.ref, async () => {
        const current = await this.options.store.get(initial.ref);
        return this.commit(current, {
          phase: 'running',
          progress: { stage: 'submitting', percent: 0 },
        });
      });
      const result = await this.executeGeneration(initial, {
        signal: controller.signal,
        onProgress: (percent) => {
          void this.enqueue(initial.ref, async () => {
            const current = await this.options.store.get(initial.ref);
            if (isTerminalJobPhase(current.phase)) return current;
            return this.commit(current, {
              phase: 'running',
              progress: {
                stage: current.providerTask ? 'waiting-provider' : 'submitting',
                percent: normalizeProgress(percent),
              },
            });
          });
        },
        onExternalTask: async (providerTask) => {
          if (providerTask.providerId !== initial.request.providerId) {
            throw new GenerationJobError(
              'generation-job-binding-mismatch',
              `Generation provider task ${providerTask.providerId}/${providerTask.externalTaskId} does not match Job provider ${initial.request.providerId}.`,
            );
          }
          await this.enqueue(initial.ref, async () => {
            const current = await this.options.store.get(initial.ref);
            return this.commit(current, {
              phase: 'running',
              providerTask,
              progress: {
                stage: 'waiting-provider',
                percent: current.progress.percent,
              },
            });
          });
        },
      });
      assertGenerationResultBinding(initial, result);
      await this.drain(initial.ref);
      const committing = await this.enqueue(initial.ref, async () => {
        const current = await this.options.store.get(initial.ref);
        if (isTerminalJobPhase(current.phase)) return current;
        return this.commit(current, {
          phase: 'running',
          progress: { stage: 'committing-result', percent: 100 },
        });
      });
      if (isTerminalJobPhase(committing.phase)) return;

      const resultLocators = await this.options.resultCommitter.commit({
        ref: initial.ref,
        generation: result,
      });
      assertResultLocators(resultLocators);
      await this.enqueue(initial.ref, async () => {
        const current = await this.options.store.get(initial.ref);
        if (isTerminalJobPhase(current.phase)) return current;
        return this.commit(current, {
          phase: 'succeeded',
          progress: { stage: 'completed', percent: 100 },
          resultLocators: Object.freeze([...resultLocators]),
        });
      });
    } catch (error) {
      await this.enqueue(initial.ref, async () => {
        const current = await this.options.store.get(initial.ref);
        if (isTerminalJobPhase(current.phase)) return current;
        if (this.shutdownJobs.has(initial.ref.jobId)) return current;
        if (controller.signal.aborted) {
          return this.commit(current, {
            phase: 'cancelled',
            progress: current.progress,
            failure: {
              code: 'generation-job-cancelled',
              message: 'Generation was cancelled.',
              retryable: true,
            },
          });
        }
        const providerOutcomeUnknown =
          Boolean(current.providerTask) && current.progress.stage !== 'committing-result';
        return this.commit(current, {
          phase: providerOutcomeUnknown ? 'outcome-unknown' : 'failed',
          progress: current.progress,
          failure: failureSummary(error, providerOutcomeUnknown),
        });
      });
    } finally {
      this.active.delete(initial.ref.jobId);
      this.shutdownJobs.delete(initial.ref.jobId);
    }
  }

  private async recoverProviderTask(
    initial: GenerationJobSnapshot,
    providerTask: NonNullable<GenerationJobSnapshot['providerTask']>,
    controller: AbortController,
  ): Promise<void> {
    try {
      while (!controller.signal.aborted) {
        const result = await this.options.execution.describeExternalTask(providerTask);
        const current = await this.enqueue(initial.ref, async () => {
          const latest = await this.options.store.get(initial.ref);
          if (isTerminalJobPhase(latest.phase)) return latest;
          return this.applyProviderResult(latest, result);
        });
        if (isTerminalJobPhase(current.phase)) return;
        await this.waitForRecoveryPoll(this.recoveryPollIntervalMs, controller.signal);
      }
    } catch (error) {
      await this.enqueue(initial.ref, async () => {
        const current = await this.options.store.get(initial.ref);
        if (
          isTerminalJobPhase(current.phase) ||
          controller.signal.aborted ||
          this.shutdownJobs.has(initial.ref.jobId)
        ) {
          return current;
        }
        return this.commit(current, {
          phase: 'outcome-unknown',
          progress: current.progress,
          providerTask: current.providerTask,
          failure: failureSummary(error, true),
        });
      });
    } finally {
      this.active.delete(initial.ref.jobId);
      this.shutdownJobs.delete(initial.ref.jobId);
    }
  }

  private executeGeneration(
    snapshot: GenerationJobSnapshot,
    options: MediaGenerationExecutionOptions,
  ): Promise<GenerationExecutionResult> {
    switch (snapshot.request.generationType) {
      case 'prompt':
        return this.options.execution.generatePrompt(
          {
            ...snapshot.request.request,
            providerId: snapshot.request.providerId,
            modelId: snapshot.request.modelId,
          },
          { signal: options.signal },
        );
      case 'text-to-image':
      case 'image-to-image':
      case 'image-edit':
        return this.options.execution.generateImage(snapshot.request.request, options);
      case 'text-to-video':
      case 'image-to-video':
      case 'video-to-video':
      case 'video-edit':
        return this.options.execution.generateVideo(snapshot.request.request, options);
      case 'text-to-audio':
      case 'text-to-music':
        return this.options.execution.generateAudio(snapshot.request.request, options);
    }
  }

  private async applyProviderResult(
    current: GenerationJobSnapshot,
    result: MediaAdapterResult,
  ): Promise<GenerationJobSnapshot> {
    const progress = normalizeProgress(result.progress ?? current.progress.percent);
    switch (result.status) {
      case 'pending':
      case 'processing':
        return this.commit(current, {
          phase: 'running',
          progress: { stage: 'waiting-provider', percent: progress },
        });
      case 'cancelled':
        return this.commit(current, {
          phase: 'cancelled',
          progress: { stage: 'waiting-provider', percent: progress },
          failure: {
            code: 'generation-provider-cancelled',
            message: 'The provider reports that generation was cancelled.',
            retryable: true,
          },
        });
      case 'failed':
        return this.commit(current, {
          phase: 'failed',
          progress: { stage: 'waiting-provider', percent: progress },
          failure: {
            code: result.error?.code ?? 'generation-provider-failed',
            message: result.error?.message ?? 'The provider reports that generation failed.',
            retryable: result.error?.retryable ?? false,
          },
        });
      case 'completed':
        if (current.request.generationType === 'prompt') {
          throw new GenerationJobError(
            'generation-job-binding-mismatch',
            `Prompt Generation Job ${current.ref.jobId} cannot complete through a media provider task.`,
          );
        }
        if (!result.outputs || result.outputs.length === 0) {
          throw new GenerationJobError(
            'generation-job-result-unavailable',
            `Provider completed Generation Job ${current.ref.jobId} without outputs.`,
          );
        }
        {
          const committing = await this.commit(current, {
            phase: 'running',
            progress: { stage: 'committing-result', percent: 100 },
          });
          const resultLocators = await this.options.resultCommitter.commit({
            ref: current.ref,
            generation: {
              type: current.request.generationType,
              providerId: current.request.providerId,
              modelId: current.request.modelId,
              outputs: result.outputs,
              ...(result.metadata === undefined ? {} : { metadata: result.metadata }),
              request: current.request.request,
            },
          });
          assertResultLocators(resultLocators);
          return this.commit(committing, {
            phase: 'succeeded',
            progress: { stage: 'completed', percent: 100 },
            resultLocators: Object.freeze([...resultLocators]),
          });
        }
    }
  }

  private commit(
    current: GenerationJobSnapshot,
    changes: Pick<GenerationJobSnapshot, 'phase' | 'progress'> &
      Partial<Pick<GenerationJobSnapshot, 'providerTask' | 'resultLocators' | 'failure'>>,
  ): Promise<GenerationJobSnapshot> {
    const next: GenerationJobSnapshot = {
      ...current,
      ...changes,
      updatedAt: this.now(),
      ...(changes.failure === undefined ? { failure: undefined } : {}),
    };
    return this.options.store.save(next);
  }

  private enqueue<T>(ref: GenerationJobRef, operation: () => Promise<T>): Promise<T> {
    const previous = this.mutationTails.get(ref.jobId) ?? Promise.resolve();
    const result = previous.then(operation, operation);
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

  private enqueueSubmission<T>(identity: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.submissionTails.get(identity) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.submissionTails.set(identity, tail);
    void tail.finally(() => {
      if (this.submissionTails.get(identity) === tail) this.submissionTails.delete(identity);
    });
    return result;
  }

  private async drain(ref: GenerationJobRef): Promise<void> {
    await (this.mutationTails.get(ref.jobId) ?? Promise.resolve());
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('Generation Job coordinator is disposed.');
    }
  }
}

function freezeRequest(input: SubmitGenerationJobInput): GenerationJobSnapshot['request'] {
  assertRequestBinding(input);
  switch (input.generationType) {
    case 'prompt':
      return Object.freeze({
        generationType: input.generationType,
        providerId: input.providerId,
        modelId: input.modelId,
        request: Object.freeze({ ...input.request }),
      });
    case 'text-to-image':
    case 'image-to-image':
    case 'image-edit':
      return Object.freeze({
        generationType: input.generationType,
        providerId: input.providerId,
        modelId: input.modelId,
        request: Object.freeze({
          ...input.request,
          providerId: input.providerId,
          modelId: input.modelId,
        }),
      });
    case 'text-to-video':
    case 'image-to-video':
    case 'video-to-video':
    case 'video-edit':
      return Object.freeze({
        generationType: input.generationType,
        providerId: input.providerId,
        modelId: input.modelId,
        request: Object.freeze({
          ...input.request,
          providerId: input.providerId,
          modelId: input.modelId,
        }),
      });
    case 'text-to-audio':
    case 'text-to-music':
      return Object.freeze({
        generationType: input.generationType,
        providerId: input.providerId,
        modelId: input.modelId,
        request: Object.freeze({
          ...input.request,
          providerId: input.providerId,
          modelId: input.modelId,
        }),
      });
  }
}

function assertRequestBinding(input: SubmitGenerationJobInput): void {
  if (input.generationType === 'prompt') return;
  const requestProviderId = input.request.providerId;
  const requestModelId = input.request.modelId;
  if (
    (requestProviderId !== undefined && requestProviderId !== input.providerId) ||
    (requestModelId !== undefined && requestModelId !== input.modelId)
  ) {
    throw new GenerationJobError(
      'generation-job-binding-mismatch',
      `Generation Job binding ${input.providerId}/${input.modelId} conflicts with request binding ${requestProviderId ?? '<unset>'}/${requestModelId ?? '<unset>'}.`,
    );
  }
}

function assertGenerationResultBinding(
  snapshot: GenerationJobSnapshot,
  result: GenerationExecutionResult,
): void {
  if (
    result.providerId !== snapshot.request.providerId ||
    result.modelId !== snapshot.request.modelId ||
    result.type !== snapshot.request.generationType
  ) {
    throw new GenerationJobError(
      'generation-job-binding-mismatch',
      `Generation result binding ${result.providerId}/${result.modelId}/${result.type} does not match Job binding ${snapshot.request.providerId}/${snapshot.request.modelId}/${snapshot.request.generationType}.`,
    );
  }
}

function submissionMatches(
  snapshot: GenerationJobSnapshot,
  input: SubmitGenerationJobInput,
): boolean {
  const retryOf = input.retryOf;
  const regenerateOf = input.regenerateOf;
  return (
    snapshot.submissionId === input.submissionId &&
    snapshot.lifecycleMode === input.lifecycleMode &&
    snapshot.retryOf?.jobId === retryOf?.jobId &&
    snapshot.regenerateOf?.jobId === regenerateOf?.jobId &&
    JSON.stringify(snapshot.request) === JSON.stringify(freezeRequest(input))
  );
}

function normalizeProgress(progress: number): number {
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
    throw new GenerationJobError(
      'generation-job-invalid-progress',
      `Generation progress must be between 0 and 100, received ${progress}.`,
    );
  }
  return progress;
}

function assertResultLocators(
  resultLocators: readonly import('@neko/content').GeneratedOutputContentLocator[],
): void {
  if (
    resultLocators.length === 0 ||
    resultLocators.some((locator) => {
      const result = validateContentLocator(locator);
      return !result.ok || result.locator.kind !== 'generated-output';
    })
  ) {
    throw new GenerationJobError(
      'generation-job-result-unavailable',
      'Generation completed without valid generated-output ContentLocator results.',
    );
  }
}

function failureSummary(error: unknown, outcomeUnknown: boolean): JobFailureSummary {
  return {
    code: outcomeUnknown ? 'generation-outcome-unknown' : 'generation-execution-failed',
    message: error instanceof Error ? error.message : String(error),
    retryable: !outcomeUnknown,
  };
}

function abortableDelay(intervalMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    return Promise.reject(signal.reason ?? new Error('Generation recovery polling aborted.'));
  }
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason ?? new Error('Generation recovery polling aborted.'));
    };
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, intervalMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
