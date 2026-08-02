import type { JobRef, JobSnapshotBase, VersionedJobStore } from '@neko/shared/job-lifecycle';

// Host-neutral Export Job contracts composed by Desktop Main.

export const EXPORT_JOB_KIND = 'export' as const;

export type ExportJobRef = JobRef<typeof EXPORT_JOB_KIND>;

export interface ExportConfig {
  readonly outputPath: string;
  readonly format: 'mp4' | 'webm' | 'mov' | 'mkv' | 'avi' | 'ts';
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly quality: 'low' | 'medium' | 'high';
  readonly audioBitrate: number;
  readonly videoBitrate: number;
  readonly includeAudio: boolean;
  readonly audioSampleRate: 44_100 | 48_000;
  readonly videoCodec?: string;
  readonly audioCodec?: string;
  readonly qualityMode?: 'source' | 'draft-proxy';
}

export interface ExportJobRequest {
  readonly documentUri: string;
  readonly config: ExportConfig;
  readonly executionConfig: Readonly<Record<string, unknown>>;
}

export type ExportJobStage =
  'queued' | 'enqueuing' | 'waiting-executor' | 'committing-output' | 'completed';

export interface ExportJobProgress {
  readonly stage: ExportJobStage;
  readonly percent: number;
  readonly currentFrame: number;
  readonly totalFrames: number;
  readonly elapsedMs: number;
  readonly estimatedRemainingMs: number;
  readonly currentFps: number;
}

export interface ExportJobResult {
  readonly outputPath: string;
  readonly totalFrames: number;
  readonly elapsedMs: number;
}

export interface ExportJobSnapshot extends JobSnapshotBase<typeof EXPORT_JOB_KIND> {
  readonly request: ExportJobRequest;
  readonly progress: ExportJobProgress;
  readonly executionId?: string;
  readonly result?: ExportJobResult;
}

export interface ExportJobStore extends VersionedJobStore<ExportJobSnapshot> {
  listRecoverable(): Promise<readonly ExportJobSnapshot[]>;
}

export interface SubmitExportJobInput extends ExportJobRequest {
  readonly retryOf?: ExportJobRef;
}

export interface ExportJobCommandInput {
  readonly ref: ExportJobRef;
  readonly expectedRevision: number;
}

export interface ExportExecutionProgress {
  readonly executionId: string;
  readonly state: 'pending' | 'queued' | 'running' | 'completed' | 'cancelled' | 'error';
  readonly progress: number;
  readonly currentFrame: number;
  readonly totalFrames: number;
  readonly elapsedMs: number;
  readonly estimatedRemainingMs: number;
  readonly error?: string;
  readonly stats?: {
    readonly avgFps: number;
  };
}

export interface ExportExecutorPort {
  enqueueExport(input: {
    readonly ref: ExportJobRef;
    readonly request: ExportJobRequest;
  }): Promise<{ readonly executionId: string }>;
  describeExport(input: {
    readonly ref: ExportJobRef;
    readonly request: ExportJobRequest;
    readonly executionId: string;
  }): Promise<ExportExecutionProgress>;
  cancelExport(input: {
    readonly ref: ExportJobRef;
    readonly request: ExportJobRequest;
    readonly executionId: string;
  }): Promise<void>;
}

export interface ExportJobResultCommitter {
  commitExport(input: {
    readonly ref: ExportJobRef;
    readonly request: ExportJobRequest;
    readonly progress: ExportExecutionProgress;
  }): Promise<ExportJobResult>;
}

export interface ExportJobPort {
  submitExport(input: SubmitExportJobInput): Promise<ExportJobSnapshot>;
  describeExport(ref: ExportJobRef): Promise<ExportJobSnapshot>;
  observeExport(ref: ExportJobRef, afterRevision: number): AsyncIterable<ExportJobSnapshot>;
  cancelExport(input: ExportJobCommandInput): Promise<ExportJobSnapshot>;
  retryExport(input: ExportJobCommandInput): Promise<ExportJobSnapshot>;
  reconcileExport(input: ExportJobCommandInput): Promise<ExportJobSnapshot>;
}

export type ExportJobErrorCode =
  | 'export-job-cancel-unavailable'
  | 'export-job-reconcile-unavailable'
  | 'export-job-retry-unavailable'
  | 'export-job-executor-identity-mismatch'
  | 'export-job-invalid-progress'
  | 'export-job-result-invalid'
  | 'export-job-persistence-invalid';

export class ExportJobError extends Error {
  constructor(
    readonly code: ExportJobErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ExportJobError';
  }
}
