export type JobPhase =
  'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'outcome-unknown';

export interface JobRef<K extends string = string> {
  readonly kind: K;
  readonly jobId: string;
}

export function isJobRef(value: unknown): value is JobRef {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    typeof record.kind === 'string' &&
    record.kind.trim().length > 0 &&
    typeof record.jobId === 'string' &&
    record.jobId.trim().length > 0
  );
}

export interface JobFailureSummary {
  readonly code: string;
  readonly message: string;
  readonly retryable?: boolean;
}

export interface JobSnapshotBase<K extends string = string> {
  readonly ref: JobRef<K>;
  readonly phase: JobPhase;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly retryOf?: JobRef<K>;
  readonly failure?: JobFailureSummary;
}

export interface JobStore<S extends JobSnapshotBase> {
  create(initial: S): Promise<S>;
  get(ref: S['ref']): Promise<S>;
  save(snapshot: S): Promise<S>;
  observe(ref: S['ref'], signal?: AbortSignal): AsyncIterable<S>;
}
