export type CutExportTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface CutExportTaskSnapshot {
  readonly jobId: string;
  readonly documentUri: string;
  readonly sessionId: string;
  readonly sourceRevision: number;
  readonly outputWorkspaceRelativePath: string;
  readonly status: CutExportTaskStatus;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly error?: string;
}
