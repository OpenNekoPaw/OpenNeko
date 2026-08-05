import type { LocalMetadataSqlRow, LocalMetadataStore } from '@neko/local-metadata';
import { isTerminalJobPhase } from '@neko/shared/job-lifecycle';
import { decodeExportJobSnapshot, encodeExportJobSnapshot } from './codec';
import {
  EXPORT_JOB_KIND,
  ExportJobError,
  type ExportJobRef,
  type ExportJobSnapshot,
  type ExportJobStore,
} from './contracts';

export { initializeExportJobTables } from './tables';

export function createInMemoryExportJobStore(): ExportJobStore {
  const snapshots = new Map<string, ExportJobSnapshot>();
  const observations = new ExportJobObservationHub();
  const store: ExportJobStore = {
    create: async (initial) => {
      assertExportRef(initial.ref);
      if (snapshots.has(initial.ref.jobId)) {
        throw new Error(`Export Job ${initial.ref.jobId} already exists.`);
      }
      const stored = cloneForStorage(initial);
      snapshots.set(stored.ref.jobId, stored);
      return stored;
    },
    get: async (ref) => {
      assertExportRef(ref);
      const snapshot = snapshots.get(ref.jobId);
      if (!snapshot) throw new Error(`Export Job ${ref.jobId} does not exist.`);
      return snapshot;
    },
    save: async (snapshot) => {
      assertExportRef(snapshot.ref);
      if (!snapshots.has(snapshot.ref.jobId)) {
        throw new Error(`Export Job ${snapshot.ref.jobId} does not exist.`);
      }
      const stored = cloneForStorage(snapshot);
      snapshots.set(stored.ref.jobId, stored);
      observations.publish(stored);
      return stored;
    },
    observe: (ref) => observations.observe(ref),
    listRecoverable: async () =>
      [...snapshots.values()].filter((snapshot) => !isTerminalJobPhase(snapshot.phase)),
  };
  return Object.freeze(store);
}

export interface PersistentExportJobStoreOptions {
  readonly metadataStore: LocalMetadataStore;
  readonly workspaceId: string;
}

export function createPersistentExportJobStore(
  options: PersistentExportJobStoreOptions,
): ExportJobStore {
  if (!options.workspaceId.trim()) {
    throw invalidPersistence('Persistent Export Job store requires a workspace identity.');
  }
  const observations = new ExportJobObservationHub();

  const store: ExportJobStore = {
    create: async (initial) => {
      assertExportRef(initial.ref);
      const stored = cloneForStorage(initial);
      await options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'create-cut-export-job' },
        async ({ sql }) => {
          const existing = await sql.all(
            `SELECT job_id FROM cut_export_jobs
              WHERE workspace_id = ? AND job_id = ?`,
            [options.workspaceId, stored.ref.jobId],
          );
          if (existing.length > 0) {
            throw new Error(`Export Job ${stored.ref.jobId} already exists.`);
          }
          await sql.run(
            `INSERT INTO cut_export_jobs (
              workspace_id, job_id, phase, snapshot_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              options.workspaceId,
              stored.ref.jobId,
              stored.phase,
              encodeExportJobSnapshot(stored),
              stored.createdAt,
              stored.updatedAt,
            ],
          );
        },
      );
      return stored;
    },

    get: async (ref) => {
      assertExportRef(ref);
      return options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'get-cut-export-job' },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT job_id, phase, snapshot_json, created_at, updated_at
              FROM cut_export_jobs
              WHERE workspace_id = ? AND job_id = ?`,
            [options.workspaceId, ref.jobId],
          );
          return decodeRequiredRow(rows, ref);
        },
      );
    },

    save: async (snapshot) => {
      assertExportRef(snapshot.ref);
      const stored = cloneForStorage(snapshot);
      await options.metadataStore.transaction(
        { mode: 'state-write', ownership: 'state', operation: 'save-cut-export-job' },
        async ({ sql }) => {
          const result = await sql.run(
            `UPDATE cut_export_jobs
              SET phase = ?, snapshot_json = ?, created_at = ?, updated_at = ?
              WHERE workspace_id = ? AND job_id = ?`,
            [
              stored.phase,
              encodeExportJobSnapshot(stored),
              stored.createdAt,
              stored.updatedAt,
              options.workspaceId,
              stored.ref.jobId,
            ],
          );
          if (result.changes !== 1) {
            throw new Error(`Export Job ${stored.ref.jobId} does not exist.`);
          }
        },
      );
      observations.publish(stored);
      return stored;
    },

    observe: (ref) => observations.observe(ref),

    listRecoverable: () =>
      options.metadataStore.transaction(
        { mode: 'read', ownership: 'state', operation: 'list-recoverable-cut-export-jobs' },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT job_id, phase, snapshot_json, created_at, updated_at
              FROM cut_export_jobs
              WHERE workspace_id = ?
                AND phase IN ('pending', 'running', 'outcome-unknown')
              ORDER BY updated_at ASC, job_id ASC`,
            [options.workspaceId],
          );
          return rows.map((row) =>
            decodeRow(row, { kind: EXPORT_JOB_KIND, jobId: readString(row, 'job_id') }),
          );
        },
      ),
  };

  return Object.freeze(store);
}

class ExportJobObservationHub {
  private readonly observers = new Map<string, Set<ExportJobObserver>>();

  publish(snapshot: ExportJobSnapshot): void {
    for (const observer of this.observers.get(snapshot.ref.jobId) ?? []) observer.publish(snapshot);
  }

  observe(ref: ExportJobRef): AsyncIterable<ExportJobSnapshot> {
    assertExportRef(ref);
    const current = this.observers.get(ref.jobId) ?? new Set<ExportJobObserver>();
    const observer = new ExportJobObserver(() => {
      current.delete(observer);
      if (current.size === 0) this.observers.delete(ref.jobId);
    });
    current.add(observer);
    this.observers.set(ref.jobId, current);
    return observer;
  }
}

class ExportJobObserver implements AsyncIterableIterator<ExportJobSnapshot> {
  private readonly queue: ExportJobSnapshot[] = [];
  private pendingNext: ((result: IteratorResult<ExportJobSnapshot, undefined>) => void) | undefined;
  private closed = false;

  constructor(private readonly onClose: () => void) {}

  [Symbol.asyncIterator](): AsyncIterableIterator<ExportJobSnapshot> {
    return this;
  }

  next(): Promise<IteratorResult<ExportJobSnapshot, undefined>> {
    const snapshot = this.queue.shift();
    if (snapshot) return Promise.resolve(this.deliver(snapshot));
    if (this.closed) return Promise.resolve({ done: true, value: undefined });
    if (this.pendingNext) {
      throw new Error('Export Job observer does not support concurrent next() calls.');
    }
    return new Promise((resolve) => {
      this.pendingNext = resolve;
    });
  }

  return(): Promise<IteratorResult<ExportJobSnapshot, undefined>> {
    this.close();
    return Promise.resolve({ done: true, value: undefined });
  }

  publish(snapshot: ExportJobSnapshot): void {
    if (this.closed) return;
    const pendingNext = this.pendingNext;
    if (!pendingNext) {
      this.queue.push(snapshot);
      return;
    }
    this.pendingNext = undefined;
    pendingNext(this.deliver(snapshot));
  }

  private deliver(snapshot: ExportJobSnapshot): IteratorResult<ExportJobSnapshot, undefined> {
    if (isTerminalJobPhase(snapshot.phase)) this.close(false);
    return { done: false, value: snapshot };
  }

  private close(resolvePending = true): void {
    if (this.closed) return;
    this.closed = true;
    this.queue.length = 0;
    this.onClose();
    const pendingNext = this.pendingNext;
    this.pendingNext = undefined;
    if (resolvePending) pendingNext?.({ done: true, value: undefined });
  }
}

function decodeRequiredRow(
  rows: readonly LocalMetadataSqlRow[],
  ref: ExportJobRef,
): ExportJobSnapshot {
  const row = rows[0];
  if (!row) throw new Error(`Export Job ${ref.jobId} does not exist.`);
  if (rows.length !== 1) {
    throw invalidPersistence(`Export Job ${ref.jobId} has duplicate persisted rows.`);
  }
  return decodeRow(row, ref);
}

function decodeRow(row: LocalMetadataSqlRow, expectedRef: ExportJobRef): ExportJobSnapshot {
  const snapshot = decodeExportJobSnapshot(readString(row, 'snapshot_json'));
  if (
    snapshot.ref.kind !== expectedRef.kind ||
    snapshot.ref.jobId !== expectedRef.jobId ||
    snapshot.ref.jobId !== readString(row, 'job_id') ||
    snapshot.phase !== readString(row, 'phase') ||
    snapshot.createdAt !== readNumber(row, 'created_at') ||
    snapshot.updatedAt !== readNumber(row, 'updated_at')
  ) {
    throw invalidPersistence(
      `Export Job ${expectedRef.jobId} row columns do not match its snapshot.`,
    );
  }
  return snapshot;
}

function cloneForStorage(snapshot: ExportJobSnapshot): ExportJobSnapshot {
  return decodeExportJobSnapshot(encodeExportJobSnapshot(snapshot));
}

function assertExportRef(ref: ExportJobRef): void {
  if (ref.kind !== EXPORT_JOB_KIND || !ref.jobId.trim()) {
    throw new Error('Export Job identity is invalid.');
  }
}

function readString(row: LocalMetadataSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') {
    throw invalidPersistence(`Export Job column ${column} must be a string.`);
  }
  return value;
}

function readNumber(row: LocalMetadataSqlRow, column: string): number {
  const value = row[column];
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw invalidPersistence(`Export Job column ${column} must be an integer.`);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw invalidPersistence(`Export Job column ${column} is outside the safe integer range.`);
  }
  return result;
}

function invalidPersistence(message: string): ExportJobError {
  return new ExportJobError('export-job-persistence-invalid', message);
}
