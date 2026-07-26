import { randomUUID } from 'node:crypto';
import type { CutExportSettings, CutExportTaskSnapshot, CutUserDiagnostic } from '@neko-cut/domain';
import { isTerminalJobPhase } from '@neko/shared/job-lifecycle';
import {
  ExportJobCoordinator,
  type ExportEnginePort,
  type ExportEngineProgress,
  type ExportJobCommandInput,
  type ExportJobResultCommitter,
  type ExportJobSnapshot,
  type ExportJobStore,
} from '../services/export-job';

export interface StartCutExportTask {
  readonly documentUri: string;
  readonly sessionId: string;
  readonly sourceRevision: number;
  readonly settings: CutExportSettings;
  readonly outputWorkspaceRelativePath: string;
  readonly run: (signal: AbortSignal) => Promise<void>;
}

interface PendingExecution {
  readonly run: (signal: AbortSignal) => Promise<void>;
  readonly outputWorkspaceRelativePath: string;
}

interface ActiveExecution {
  readonly controller: AbortController;
  readonly startedAt: number;
  readonly outputWorkspaceRelativePath: string;
  state: ExportEngineProgress['state'];
  error?: string;
}

export interface CutExportTaskRegistryOptions {
  readonly store: ExportJobStore;
  readonly onUpdate: (task: CutExportTaskSnapshot) => void;
  readonly createJobId?: () => string;
  readonly pollIntervalMs?: number;
}

export class CutExportTaskRegistry {
  private readonly coordinator: ExportJobCoordinator;
  private readonly snapshots = new Map<string, ExportJobSnapshot>();
  private readonly tasks = new Map<string, CutExportTaskSnapshot>();
  private readonly observers = new Map<string, AsyncIterator<ExportJobSnapshot>>();
  private readonly engine = new DirectCutExportEngine();

  constructor(private readonly options: CutExportTaskRegistryOptions) {
    const resultCommitter: ExportJobResultCommitter = {
      commitExport: async ({ request, progress }) => ({
        outputPath: request.config.outputPath,
        totalFrames: progress.totalFrames,
        elapsedMs: progress.elapsedMs,
      }),
    };
    this.coordinator = new ExportJobCoordinator({
      store: options.store,
      engine: this.engine,
      resultCommitter,
      ...(options.createJobId ? { createJobId: options.createJobId } : {}),
      ...(options.pollIntervalMs ? { pollIntervalMs: options.pollIntervalMs } : {}),
    });
  }

  async start(input: StartCutExportTask): Promise<CutExportTaskSnapshot> {
    const executionKey = randomUUID();
    this.engine.register(executionKey, {
      run: input.run,
      outputWorkspaceRelativePath: input.outputWorkspaceRelativePath,
    });
    const snapshot = await this.coordinator.submitExport({
      documentUri: input.documentUri,
      config: {
        outputPath: input.outputWorkspaceRelativePath,
        format: input.settings.container,
        width: input.settings.width,
        height: input.settings.height,
        fps: input.settings.framesPerSecond,
        quality: 'medium',
        audioBitrate: input.settings.audioBitrate,
        videoBitrate: input.settings.videoBitrate,
        includeAudio: input.settings.includeAudio,
        audioSampleRate: input.settings.audioSampleRate,
      },
      engineConfig: {
        executionKey,
        sessionId: input.sessionId,
        sourceRevision: input.sourceRevision,
      },
    });
    this.install(snapshot);
    return this.requireTask(snapshot.ref.jobId);
  }

  async cancel(documentUri: string, jobId: string): Promise<CutExportTaskSnapshot> {
    const known = this.requireSnapshot(jobId);
    const current = await this.coordinator.describeExport(known.ref);
    this.install(current);
    if (current.request.documentUri !== documentUri) {
      throw new Error(`Cut export job ${jobId} does not belong to ${documentUri}.`);
    }
    const snapshot = await this.coordinator.cancelExport(commandFor(current));
    this.install(snapshot);
    return this.requireTask(jobId);
  }

  get(jobId: string): CutExportTaskSnapshot | undefined {
    return this.tasks.get(jobId);
  }

  list(documentUri: string): readonly CutExportTaskSnapshot[] {
    return [...this.tasks.values()]
      .filter((snapshot) => snapshot.documentUri === documentUri)
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  async recover(): Promise<void> {
    const recovered = await this.coordinator.recoverPersistedExportJobs();
    for (const snapshot of recovered) this.install(snapshot);
  }

  async dispose(): Promise<void> {
    const observers = [...this.observers.values()];
    this.observers.clear();
    await Promise.allSettled(observers.map(async (observer) => observer.return?.()));
    await this.coordinator.dispose();
  }

  private install(snapshot: ExportJobSnapshot): void {
    const current = this.snapshots.get(snapshot.ref.jobId);
    if (current && snapshot.revision < current.revision) return;
    this.snapshots.set(snapshot.ref.jobId, snapshot);
    const task = projectTask(snapshot);
    this.tasks.set(snapshot.ref.jobId, task);
    this.options.onUpdate(task);
    if (isTerminalJobPhase(snapshot.phase) || this.observers.has(snapshot.ref.jobId)) return;

    const observation = this.coordinator.observeExport(snapshot.ref, snapshot.revision);
    const iterator = observation[Symbol.asyncIterator]();
    this.observers.set(snapshot.ref.jobId, iterator);
    void this.consume(snapshot.ref.jobId, iterator);
  }

  private async consume(jobId: string, iterator: AsyncIterator<ExportJobSnapshot>): Promise<void> {
    try {
      while (true) {
        const next = await iterator.next();
        if (next.done) return;
        this.install(next.value);
      }
    } finally {
      if (this.observers.get(jobId) === iterator) this.observers.delete(jobId);
    }
  }

  private requireSnapshot(jobId: string): ExportJobSnapshot {
    const snapshot = this.snapshots.get(jobId);
    if (!snapshot) throw new Error(`Unknown Cut export job: ${jobId}`);
    return snapshot;
  }

  private requireTask(jobId: string): CutExportTaskSnapshot {
    const task = this.tasks.get(jobId);
    if (!task) throw new Error(`Cut export job ${jobId} has no UI projection.`);
    return task;
  }
}

class DirectCutExportEngine implements ExportEnginePort {
  private readonly pending = new Map<string, PendingExecution>();
  private readonly active = new Map<string, ActiveExecution>();

  register(executionKey: string, execution: PendingExecution): void {
    if (this.pending.has(executionKey)) {
      throw new Error(`Duplicate Cut export execution key: ${executionKey}`);
    }
    this.pending.set(executionKey, execution);
  }

  async enqueueExport(input: {
    readonly ref: { readonly kind: 'export'; readonly jobId: string };
    readonly request: ExportJobSnapshot['request'];
  }): Promise<{ readonly engineJobId: string }> {
    const executionKey = readExecutionKey(input.request.engineConfig);
    const execution = this.pending.get(executionKey);
    if (!execution) {
      throw new Error(
        `Cut export execution ${executionKey} is unavailable after Host restart; reconciliation is required.`,
      );
    }
    this.pending.delete(executionKey);
    const controller = new AbortController();
    const active: ActiveExecution = {
      controller,
      startedAt: Date.now(),
      outputWorkspaceRelativePath: execution.outputWorkspaceRelativePath,
      state: 'running',
    };
    this.active.set(input.ref.jobId, active);
    void execution.run(controller.signal).then(
      () => {
        active.state = 'completed';
      },
      (error: unknown) => {
        if (controller.signal.aborted) {
          active.state = 'cancelled';
          return;
        }
        active.state = 'error';
        active.error = error instanceof Error ? error.message : String(error);
      },
    );
    return { engineJobId: input.ref.jobId };
  }

  async describeExport(input: { readonly engineJobId: string }): Promise<ExportEngineProgress> {
    const active = this.active.get(input.engineJobId);
    if (!active) {
      throw new Error(`Cut Engine export ${input.engineJobId} is unavailable for reconciliation.`);
    }
    const elapsedMs = Math.max(0, Date.now() - active.startedAt);
    return {
      engineJobId: input.engineJobId,
      state: active.state,
      progress: active.state === 'completed' ? 100 : 0,
      currentFrame: 0,
      totalFrames: 0,
      elapsedMs,
      estimatedRemainingMs: 0,
      ...(active.error ? { error: active.error } : {}),
    };
  }

  async cancelExport(input: { readonly engineJobId: string }): Promise<void> {
    const active = this.active.get(input.engineJobId);
    if (!active) {
      throw new Error(`Cut Engine export ${input.engineJobId} is unavailable for cancellation.`);
    }
    active.controller.abort(new Error('Cut export cancelled.'));
    active.state = 'cancelled';
  }
}

function projectTask(snapshot: ExportJobSnapshot): CutExportTaskSnapshot {
  const sessionId = readString(snapshot.request.engineConfig, 'sessionId');
  const sourceRevision = readPositiveInteger(snapshot.request.engineConfig, 'sourceRevision');
  const config = snapshot.request.config;
  return {
    jobId: snapshot.ref.jobId,
    documentUri: snapshot.request.documentUri,
    sessionId,
    sourceRevision,
    settings: {
      outputName: outputName(config.outputPath),
      container: config.format === 'mov' ? 'mov' : 'mp4',
      width: config.width,
      height: config.height,
      framesPerSecond: config.fps,
      videoBitrate: config.videoBitrate,
      includeAudio: config.includeAudio,
      audioBitrate: config.audioBitrate,
      audioSampleRate: config.audioSampleRate,
    },
    outputWorkspaceRelativePath: config.outputPath,
    status: projectStatus(snapshot),
    startedAt: snapshot.createdAt,
    ...(isTerminalJobPhase(snapshot.phase) ? { finishedAt: snapshot.updatedAt } : {}),
    ...(snapshot.failure ? { diagnostic: exportFailureDiagnostic } : {}),
  };
}

function projectStatus(snapshot: ExportJobSnapshot): CutExportTaskSnapshot['status'] {
  switch (snapshot.phase) {
    case 'pending':
    case 'running':
      return 'running';
    case 'succeeded':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
    case 'outcome-unknown':
      return 'failed';
  }
}

const exportFailureDiagnostic: CutUserDiagnostic = Object.freeze({ code: 'export-failed' });

function commandFor(snapshot: ExportJobSnapshot): ExportJobCommandInput {
  return { ref: snapshot.ref, expectedRevision: snapshot.revision };
}

function readExecutionKey(value: Readonly<Record<string, unknown>>): string {
  return readString(value, 'executionKey');
}

function readString(value: Readonly<Record<string, unknown>>, key: string): string {
  const candidate = value[key];
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error(`Cut Export Job is missing ${key}.`);
  }
  return candidate;
}

function readPositiveInteger(value: Readonly<Record<string, unknown>>, key: string): number {
  const candidate = value[key];
  if (typeof candidate !== 'number' || !Number.isSafeInteger(candidate) || candidate < 0) {
    throw new Error(`Cut Export Job has invalid ${key}.`);
  }
  return candidate;
}

function outputName(outputPath: string): string {
  const lastSegment = outputPath.split('/').at(-1) ?? outputPath;
  return lastSegment.replace(/\.(?:mp4|mov)$/i, '');
}
