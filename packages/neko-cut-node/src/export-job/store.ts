import type { LocalMetadataSqlRow, LocalMetadataStore } from '@neko/shared';

// Storage remains injected so the owning Host selects its metadata backend.
import {
  assertInitialJobSnapshot,
  assertJobRef,
  assertJobTransition,
  createInMemoryVersionedJobStore,
  createVersionedJobObservationHub,
  formatJobRef,
  isTerminalJobPhase,
  JobLifecycleError,
} from '@neko/shared/job-lifecycle';
import { decodeExportJobSnapshot, encodeExportJobSnapshot } from './codec';
import {
  EXPORT_JOB_KIND,
  ExportJobError,
  type ExportJobRef,
  type ExportJobSnapshot,
  type ExportJobStore,
} from './contracts';

export { EXPORT_JOB_MIGRATIONS } from './migrations';

export function createInMemoryExportJobStore(): ExportJobStore {
  const store = createInMemoryVersionedJobStore<ExportJobSnapshot>();
  const refs: ExportJobRef[] = [];
  return Object.freeze({
    ...store,
    create: async (initial: ExportJobSnapshot) => {
      const created = await store.create(initial);
      refs.push(created.ref);
      return created;
    },
    listRecoverable: async () => {
      const snapshots = await Promise.all(refs.map((ref) => store.get(ref)));
      return snapshots.filter((snapshot) => !isTerminalJobPhase(snapshot.phase));
    },
  });
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
  const observations = createVersionedJobObservationHub<ExportJobSnapshot>();

  const store: ExportJobStore = {
    create: async (initial) => {
      assertInitialJobSnapshot(initial);
      assertExportRef(initial.ref);
      const stored = cloneForStorage(initial);
      await options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'create-cut-export-job',
        },
        async ({ sql }) => {
          const existing = await sql.all(
            `SELECT job_id FROM cut_export_jobs
              WHERE workspace_id = ? AND job_id = ?`,
            [options.workspaceId, stored.ref.jobId],
          );
          if (existing.length > 0) {
            throw new JobLifecycleError(
              'job-already-exists',
              `Job ${formatJobRef(stored.ref)} already exists.`,
            );
          }
          await sql.run(
            `INSERT INTO cut_export_jobs (
              workspace_id, job_id, phase, revision, snapshot_version,
              snapshot_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
            [
              options.workspaceId,
              stored.ref.jobId,
              stored.phase,
              stored.revision,
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
        {
          mode: 'read',
          ownership: 'state',
          operation: 'get-cut-export-job',
        },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT job_id, phase, revision, snapshot_version, snapshot_json,
                    created_at, updated_at
              FROM cut_export_jobs
              WHERE workspace_id = ? AND job_id = ?`,
            [options.workspaceId, ref.jobId],
          );
          return decodeRequiredRow(rows, ref);
        },
      );
    },

    commit: async (input) => {
      assertExportRef(input.ref);
      const stored = await options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'commit-cut-export-job',
        },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT job_id, phase, revision, snapshot_version, snapshot_json,
                    created_at, updated_at
              FROM cut_export_jobs
              WHERE workspace_id = ? AND job_id = ?`,
            [options.workspaceId, input.ref.jobId],
          );
          const current = decodeRequiredRow(rows, input.ref);
          assertJobTransition(current, input.next, input.expectedRevision);
          const next = cloneForStorage(input.next);
          const result = await sql.run(
            `UPDATE cut_export_jobs
              SET phase = ?, revision = ?, snapshot_version = 1,
                  snapshot_json = ?, created_at = ?, updated_at = ?
              WHERE workspace_id = ? AND job_id = ? AND revision = ?`,
            [
              next.phase,
              next.revision,
              encodeExportJobSnapshot(next),
              next.createdAt,
              next.updatedAt,
              options.workspaceId,
              next.ref.jobId,
              input.expectedRevision,
            ],
          );
          if (result.changes !== 1) {
            throw new JobLifecycleError(
              'stale-revision',
              `Job ${formatJobRef(input.ref)} changed before revision ${input.expectedRevision} could commit.`,
            );
          }
          return next;
        },
      );
      observations.publish(stored);
      return stored;
    },

    observe: (ref, afterRevision) => observations.observe(ref, afterRevision, () => store.get(ref)),

    listRecoverable: () =>
      options.metadataStore.transaction(
        {
          mode: 'read',
          ownership: 'state',
          operation: 'list-recoverable-cut-export-jobs',
        },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT job_id, phase, revision, snapshot_version, snapshot_json,
                    created_at, updated_at
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

function decodeRequiredRow(
  rows: readonly LocalMetadataSqlRow[],
  ref: ExportJobRef,
): ExportJobSnapshot {
  const row = rows[0];
  if (!row) {
    throw new JobLifecycleError('job-not-found', `Job ${formatJobRef(ref)} does not exist.`);
  }
  if (rows.length !== 1) {
    throw invalidPersistence(`Export Job ${formatJobRef(ref)} has duplicate persisted rows.`);
  }
  return decodeRow(row, ref);
}

function decodeRow(row: LocalMetadataSqlRow, expectedRef: ExportJobRef): ExportJobSnapshot {
  const snapshotVersion = readNumber(row, 'snapshot_version');
  if (snapshotVersion !== 1) {
    throw invalidPersistence(
      `Export Job ${formatJobRef(expectedRef)} uses unknown snapshot version ${snapshotVersion}.`,
    );
  }
  const snapshot = decodeExportJobSnapshot(readString(row, 'snapshot_json'));
  if (
    snapshot.ref.kind !== expectedRef.kind ||
    snapshot.ref.jobId !== expectedRef.jobId ||
    snapshot.ref.jobId !== readString(row, 'job_id') ||
    snapshot.phase !== readString(row, 'phase') ||
    snapshot.revision !== readNumber(row, 'revision') ||
    snapshot.createdAt !== readNumber(row, 'created_at') ||
    snapshot.updatedAt !== readNumber(row, 'updated_at')
  ) {
    throw invalidPersistence(
      `Export Job ${formatJobRef(expectedRef)} row columns do not match its snapshot.`,
    );
  }
  return snapshot;
}

function cloneForStorage(snapshot: ExportJobSnapshot): ExportJobSnapshot {
  return decodeExportJobSnapshot(encodeExportJobSnapshot(snapshot));
}

function assertExportRef(ref: ExportJobRef): void {
  assertJobRef(ref);
  if (ref.kind !== EXPORT_JOB_KIND) {
    throw new JobLifecycleError(
      'identity-mismatch',
      `Export Job store cannot access ${formatJobRef(ref)}.`,
    );
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
