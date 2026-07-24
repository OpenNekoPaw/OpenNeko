export type JobPhase =
  'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'outcome-unknown';

export interface JobRef<K extends string = string> {
  readonly kind: K;
  readonly jobId: string;
}

export interface JobFailureSummary {
  readonly code: string;
  readonly message: string;
  readonly retryable?: boolean;
}

export interface JobSnapshotBase<K extends string = string> {
  readonly ref: JobRef<K>;
  readonly phase: JobPhase;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly retryOf?: JobRef<K>;
  readonly failure?: JobFailureSummary;
}

export interface JobStoreCommit<S extends JobSnapshotBase> {
  readonly ref: S['ref'];
  readonly expectedRevision: number;
  readonly next: S;
}

export interface VersionedJobStore<S extends JobSnapshotBase> {
  create(initial: S): Promise<S>;
  get(ref: S['ref']): Promise<S>;
  commit(input: JobStoreCommit<S>): Promise<S>;
  observe(ref: S['ref'], afterRevision: number): AsyncIterable<S>;
}
