import type { CutExportTaskSnapshot, CutExportTaskStatus } from '@neko-cut/domain';

export interface StartCutExportTask {
  readonly documentUri: string;
  readonly sessionId: string;
  readonly sourceRevision: number;
  readonly outputWorkspaceRelativePath: string;
  readonly run: (signal: AbortSignal) => Promise<void>;
}

interface CutExportTaskEntry {
  snapshot: CutExportTaskSnapshot;
  readonly controller: AbortController;
}

export class CutExportTaskRegistry {
  private readonly entries = new Map<string, CutExportTaskEntry>();

  constructor(
    private readonly onUpdate: (task: CutExportTaskSnapshot) => void,
    private readonly createJobId: () => string = defaultJobId,
  ) {}

  start(input: StartCutExportTask): CutExportTaskSnapshot {
    const jobId = this.createJobId();
    if (this.entries.has(jobId)) throw new Error(`Duplicate Cut export jobId: ${jobId}`);
    const controller = new AbortController();
    const entry: CutExportTaskEntry = {
      controller,
      snapshot: {
        jobId,
        documentUri: input.documentUri,
        sessionId: input.sessionId,
        sourceRevision: input.sourceRevision,
        outputWorkspaceRelativePath: input.outputWorkspaceRelativePath,
        status: 'running',
        startedAt: Date.now(),
      },
    };
    this.entries.set(jobId, entry);
    this.publish(entry.snapshot);
    let operation: Promise<void>;
    try {
      operation = input.run(controller.signal);
    } catch (error) {
      this.finishFailed(entry, error);
      return entry.snapshot;
    }
    void operation.then(
      () => {
        if (entry.snapshot.status === 'running') this.finish(entry, 'completed');
      },
      (error: unknown) => {
        if (entry.snapshot.status === 'cancelled') return;
        this.finishFailed(entry, error);
      },
    );
    return entry.snapshot;
  }

  cancel(documentUri: string, jobId: string): void {
    const entry = this.entries.get(jobId);
    if (!entry) throw new Error(`Unknown Cut export job: ${jobId}`);
    if (entry.snapshot.documentUri !== documentUri) {
      throw new Error(`Cut export job ${jobId} does not belong to ${documentUri}.`);
    }
    if (entry.snapshot.status !== 'running') {
      throw new Error(`Cut export job ${jobId} is already ${entry.snapshot.status}.`);
    }
    entry.controller.abort();
    this.finish(entry, 'cancelled');
  }

  get(jobId: string): CutExportTaskSnapshot | undefined {
    return this.entries.get(jobId)?.snapshot;
  }

  list(documentUri: string): readonly CutExportTaskSnapshot[] {
    return [...this.entries.values()]
      .map((entry) => entry.snapshot)
      .filter((snapshot) => snapshot.documentUri === documentUri)
      .sort((left, right) => right.startedAt - left.startedAt);
  }

  private finish(
    entry: CutExportTaskEntry,
    status: Exclude<CutExportTaskStatus, 'running' | 'failed'>,
  ): void {
    entry.snapshot = { ...entry.snapshot, status, finishedAt: Date.now() };
    this.publish(entry.snapshot);
  }

  private finishFailed(entry: CutExportTaskEntry, error: unknown): void {
    entry.snapshot = {
      ...entry.snapshot,
      status: 'failed',
      finishedAt: Date.now(),
      error: error instanceof Error ? error.message : String(error),
    };
    this.publish(entry.snapshot);
  }

  private publish(snapshot: CutExportTaskSnapshot): void {
    this.onUpdate({ ...snapshot });
  }
}

function defaultJobId(): string {
  return `cut-export-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
