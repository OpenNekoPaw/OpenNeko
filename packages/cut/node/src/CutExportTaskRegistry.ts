import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import * as nodePath from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  CutExportSettings,
  CutExportTaskSnapshot,
  CutUserDiagnostic,
  TimelineView,
} from '@neko/cut-domain';
import { normalizeWorkspaceContentPath } from '@neko/content';
import { NodeFfmpegCutMediaAdapter } from './NodeFfmpegCutMediaAdapter';
import { isTerminalJobPhase } from '@neko/shared/job-lifecycle';
import {
  ExportJobCoordinator,
  type ExportExecutorPort,
  type ExportExecutionProgress,
  type ExportJobCommandInput,
  type ExportJobResultCommitter,
  type ExportJobSnapshot,
  type ExportJobStore,
} from './export-job';

export interface StartCutExportTask {
  readonly documentUri: string;
  readonly sessionId: string;
  readonly sourceSnapshotId: string;
  readonly timeline: TimelineView;
  readonly settings: CutExportSettings;
  readonly outputWorkspaceRelativePath: string;
}

interface ActiveExecution {
  readonly controller: AbortController;
  readonly startedAt: number;
  state: ExportExecutionProgress['state'];
  error?: string;
}

export interface CutExportTaskRegistryOptions {
  readonly store: ExportJobStore;
  readonly onUpdate: (task: CutExportTaskSnapshot) => void;
  readonly workspacePath: string;
  readonly onFailure?: (task: CutExportTaskSnapshot) => void;
  readonly createMediaAdapter?: (workspacePath: string) => {
    export(
      request: import('@neko/cut-domain').CutExportRequest,
      signal?: AbortSignal,
    ): Promise<{ readonly outputWorkspaceRelativePath: string }>;
    dispose(): Promise<void>;
  };
  readonly createJobId?: () => string;
  readonly pollIntervalMs?: number;
}

export class CutExportTaskRegistry {
  private readonly coordinator: ExportJobCoordinator;
  private readonly snapshots = new Map<string, ExportJobSnapshot>();
  private readonly tasks = new Map<string, CutExportTaskSnapshot>();
  private readonly reportedFailures = new Set<string>();
  private readonly observers = new Map<string, AsyncIterator<ExportJobSnapshot>>();
  private readonly executor: DirectCutExportExecutor;

  constructor(private readonly options: CutExportTaskRegistryOptions) {
    if (!options.workspacePath.trim() || options.workspacePath.includes('\0')) {
      throw new Error('Cut Export Job owner requires a valid Workspace root.');
    }
    this.executor = new DirectCutExportExecutor({
      workspacePath: options.workspacePath,
      createMediaAdapter: options.createMediaAdapter,
    });
    const resultCommitter: ExportJobResultCommitter = {
      commitExport: async ({ request, progress }) => ({
        outputPath: request.config.outputPath,
        totalFrames: progress.totalFrames,
        elapsedMs: progress.elapsedMs,
      }),
    };
    this.coordinator = new ExportJobCoordinator({
      store: options.store,
      executor: this.executor,
      resultCommitter,
      ...(options.createJobId ? { createJobId: options.createJobId } : {}),
      ...(options.pollIntervalMs ? { pollIntervalMs: options.pollIntervalMs } : {}),
    });
  }

  async start(input: StartCutExportTask): Promise<CutExportTaskSnapshot> {
    assertDocumentPath(input.documentUri);
    assertOutputPath(input.outputWorkspaceRelativePath, input.settings.container);
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
      executionConfig: {
        sessionId: input.sessionId,
        sourceSnapshotId: input.sourceSnapshotId,
        timeline: input.timeline,
      },
    });
    this.install(snapshot);
    const current = await this.coordinator.describeExport(snapshot.ref);
    if (current.updatedAt !== snapshot.updatedAt || current.phase !== snapshot.phase) {
      this.install(current);
    }
    return this.requireTask(snapshot.ref.jobId);
  }

  async cancel(documentUri: string, jobId: string): Promise<CutExportTaskSnapshot> {
    const current = await this.readSnapshot(documentUri, jobId);
    const snapshot = await this.coordinator.cancelExport(commandFor(current));
    this.install(snapshot);
    return this.requireTask(jobId);
  }

  async describe(documentUri: string, jobId: string): Promise<CutExportTaskSnapshot> {
    const current = await this.readSnapshot(documentUri, jobId);
    this.install(current);
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
    this.snapshots.set(snapshot.ref.jobId, snapshot);
    const task = projectTask(snapshot);
    this.tasks.set(snapshot.ref.jobId, task);
    if (task.status === 'failed' && !this.reportedFailures.has(task.jobId)) {
      this.reportedFailures.add(task.jobId);
      this.options.onFailure?.(task);
    }
    this.options.onUpdate(task);
    if (isTerminalJobPhase(snapshot.phase) || this.observers.has(snapshot.ref.jobId)) return;

    const observation = this.coordinator.observeExport(snapshot.ref);
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

  private async readSnapshot(documentUri: string, jobId: string): Promise<ExportJobSnapshot> {
    const known = this.snapshots.get(jobId);
    const current = await this.coordinator.describeExport(known?.ref ?? { kind: 'export', jobId });
    if (current.request.documentUri !== documentUri) {
      throw new Error(`Cut export job ${jobId} does not belong to ${documentUri}.`);
    }
    return current;
  }

  private requireTask(jobId: string): CutExportTaskSnapshot {
    const task = this.tasks.get(jobId);
    if (!task) throw new Error(`Cut export job ${jobId} has no UI projection.`);
    return task;
  }
}

class DirectCutExportExecutor implements ExportExecutorPort {
  private readonly active = new Map<string, ActiveExecution>();

  constructor(
    private readonly options: Pick<
      CutExportTaskRegistryOptions,
      'workspacePath' | 'createMediaAdapter'
    >,
  ) {}

  async enqueueExport(input: {
    readonly ref: { readonly kind: 'export'; readonly jobId: string };
    readonly request: ExportJobSnapshot['request'];
  }): Promise<{ readonly executionId: string }> {
    const timeline = readTimeline(input.request.executionConfig);
    const documentPath = await realpath(
      resolveWorkspacePath(this.options.workspacePath, timeline.documentUri),
    );
    const executionId = randomUUID();
    const controller = new AbortController();
    const active: ActiveExecution = {
      controller,
      startedAt: Date.now(),
      state: 'running',
    };
    this.active.set(executionId, active);
    const adapter =
      this.options.createMediaAdapter?.(this.options.workspacePath) ??
      new NodeFfmpegCutMediaAdapter(this.options.workspacePath);
    void adapter
      .export(
        {
          timeline: {
            ...timeline,
            documentUri: pathToFileURL(documentPath).href,
          },
          outputWorkspaceRelativePath: input.request.config.outputPath,
          settings: {
            outputName: outputName(input.request.config.outputPath),
            container: input.request.config.format === 'mov' ? 'mov' : 'mp4',
            width: input.request.config.width,
            height: input.request.config.height,
            framesPerSecond: input.request.config.fps,
            videoBitrate: input.request.config.videoBitrate,
            includeAudio: input.request.config.includeAudio,
            audioBitrate: input.request.config.audioBitrate,
            audioSampleRate: input.request.config.audioSampleRate,
          },
        },
        controller.signal,
      )
      .then(
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
      )
      .finally(() => adapter.dispose())
      .catch((error: unknown) => {
        active.state = 'error';
        active.error = error instanceof Error ? error.message : String(error);
      });
    return { executionId };
  }

  async describeExport(input: { readonly executionId: string }): Promise<ExportExecutionProgress> {
    const active = this.active.get(input.executionId);
    if (!active) {
      throw new Error(
        `Cut export execution ${input.executionId} is unavailable for reconciliation.`,
      );
    }
    const elapsedMs = Math.max(0, Date.now() - active.startedAt);
    return {
      executionId: input.executionId,
      state: active.state,
      progress: active.state === 'completed' ? 100 : 0,
      currentFrame: 0,
      totalFrames: 0,
      elapsedMs,
      estimatedRemainingMs: 0,
      ...(active.error ? { error: active.error } : {}),
    };
  }

  async cancelExport(input: { readonly executionId: string }): Promise<void> {
    const active = this.active.get(input.executionId);
    if (!active) {
      throw new Error(`Cut export execution ${input.executionId} is unavailable for cancellation.`);
    }
    active.controller.abort(new Error('Cut export cancelled.'));
    active.state = 'cancelled';
  }
}

function projectTask(snapshot: ExportJobSnapshot): CutExportTaskSnapshot {
  const sessionId = readString(snapshot.request.executionConfig, 'sessionId');
  const sourceSnapshotId = readString(snapshot.request.executionConfig, 'sourceSnapshotId');
  const config = snapshot.request.config;
  return {
    jobId: snapshot.ref.jobId,
    documentUri: snapshot.request.documentUri,
    sessionId,
    sourceSnapshotId,
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
  return { ref: snapshot.ref };
}

function readString(value: Readonly<Record<string, unknown>>, key: string): string {
  const candidate = value[key];
  if (typeof candidate !== 'string' || !candidate.trim()) {
    throw new Error(`Cut Export Job is missing ${key}.`);
  }
  return candidate;
}

function readTimeline(
  value: Readonly<Record<string, unknown>>,
): import('@neko/cut-domain').TimelineView {
  const timeline = value['timeline'];
  if (
    timeline === null ||
    typeof timeline !== 'object' ||
    Array.isArray(timeline) ||
    typeof (timeline as Record<string, unknown>)['documentUri'] !== 'string' ||
    typeof (timeline as Record<string, unknown>)['sessionId'] !== 'string' ||
    typeof (timeline as Record<string, unknown>)['name'] !== 'string' ||
    !Array.isArray((timeline as Record<string, unknown>)['tracks']) ||
    typeof (timeline as Record<string, unknown>)['durationSeconds'] !== 'number'
  ) {
    throw new Error('Cut Export Job is missing a valid frozen timeline.');
  }
  return timeline as import('@neko/cut-domain').TimelineView;
}

function resolveWorkspacePath(workspacePath: string, relativePath: string): string {
  if (
    !relativePath.trim() ||
    relativePath.includes('\\') ||
    nodePath.posix.isAbsolute(relativePath)
  ) {
    throw new Error('Cut Export Job document path must be Workspace-relative.');
  }
  const root = nodePath.resolve(workspacePath);
  const resolved = nodePath.resolve(root, ...relativePath.split('/'));
  if (resolved !== root && !resolved.startsWith(`${root}${nodePath.sep}`)) {
    throw new Error('Cut Export Job document path escapes the authorized Workspace.');
  }
  return resolved;
}

function outputName(outputPath: string): string {
  const lastSegment = outputPath.split('/').at(-1) ?? outputPath;
  return lastSegment.replace(/\.(?:mp4|mov)$/i, '');
}

function assertDocumentPath(documentPath: string): void {
  const normalized = normalizeWorkspaceContentPath(documentPath);
  if (normalized !== documentPath || !normalized.toLowerCase().endsWith('.otio')) {
    throw new Error('Cut Export Job document must be a normalized Workspace-relative .otio path.');
  }
}

function assertOutputPath(outputPath: string, container: 'mp4' | 'mov'): void {
  const normalized = normalizeWorkspaceContentPath(outputPath);
  const basename = outputPath.split('/').at(-1) ?? outputPath;
  if (
    normalized !== outputPath ||
    !normalized.toLowerCase().endsWith(`.${container}`) ||
    basename === `.${container}`
  ) {
    throw new Error(
      `Cut Export Job output must be a normalized Workspace-relative .${container} path.`,
    );
  }
}
