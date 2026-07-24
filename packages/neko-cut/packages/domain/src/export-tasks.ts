import type { CutExportSettings } from './media-ports';
import type { CutUserDiagnostic } from './user-diagnostics';

export type CutExportTaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface CutExportTaskSnapshot {
  readonly jobId: string;
  readonly documentUri: string;
  readonly sessionId: string;
  readonly sourceRevision: number;
  readonly settings: CutExportSettings;
  readonly outputWorkspaceRelativePath: string;
  readonly status: CutExportTaskStatus;
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly diagnostic?: CutUserDiagnostic;
}
