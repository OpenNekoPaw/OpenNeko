import type { LocalMetadataSqlRow, LocalMetadataStore } from '@neko/local-metadata';
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
import {
  GENERATION_JOB_KIND,
  GenerationJobError,
  type GenerationJobRef,
  type GenerationJobSnapshot,
  type GenerationJobStore,
} from './contracts';
import { decodeGenerationJobSnapshot, encodeGenerationJobSnapshot } from './codec';

export { GENERATION_JOB_MIGRATIONS } from './migrations';

const GENERATION_JOB_SNAPSHOT_VERSION = 2;

export function createInMemoryGenerationJobStore(): GenerationJobStore {
  const store = createInMemoryVersionedJobStore<GenerationJobSnapshot>();
  const refs: GenerationJobRef[] = [];
  return Object.freeze({
    ...store,
    create: async (initial: GenerationJobSnapshot) => {
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

export interface PersistentGenerationJobStoreOptions {
  readonly metadataStore: LocalMetadataStore;
  readonly workspaceId: string;
}

export function createPersistentGenerationJobStore(
  options: PersistentGenerationJobStoreOptions,
): GenerationJobStore {
  if (!options.workspaceId.trim()) {
    throw new GenerationJobError(
      'generation-job-persistence-invalid',
      'Persistent Generation Job store requires a workspace identity.',
    );
  }
  const observations = createVersionedJobObservationHub<GenerationJobSnapshot>();

  const store: GenerationJobStore = {
    create: async (initial) => {
      assertInitialJobSnapshot(initial);
      assertGenerationRef(initial.ref);
      const stored = cloneForStorage(initial);
      await options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'create-generation-job',
        },
        async ({ sql }) => {
          const existing = await sql.all(
            `SELECT job_id FROM generation_jobs
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
            `INSERT INTO generation_jobs (
              workspace_id, job_id, phase, revision, snapshot_version,
              snapshot_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              options.workspaceId,
              stored.ref.jobId,
              stored.phase,
              stored.revision,
              GENERATION_JOB_SNAPSHOT_VERSION,
              encodeGenerationJobSnapshot(stored),
              stored.createdAt,
              stored.updatedAt,
            ],
          );
        },
      );
      return stored;
    },

    get: async (ref) => {
      assertGenerationRef(ref);
      return options.metadataStore.transaction(
        {
          mode: 'read',
          ownership: 'state',
          operation: 'get-generation-job',
        },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT job_id, phase, revision, snapshot_version, snapshot_json,
                    created_at, updated_at
              FROM generation_jobs
              WHERE workspace_id = ? AND job_id = ?`,
            [options.workspaceId, ref.jobId],
          );
          return decodeRequiredRow(rows, ref);
        },
      );
    },

    commit: async (input) => {
      assertGenerationRef(input.ref);
      const stored = await options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'commit-generation-job',
        },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT job_id, phase, revision, snapshot_version, snapshot_json,
                    created_at, updated_at
              FROM generation_jobs
              WHERE workspace_id = ? AND job_id = ?`,
            [options.workspaceId, input.ref.jobId],
          );
          const current = decodeRequiredRow(rows, input.ref);
          assertJobTransition(current, input.next, input.expectedRevision);
          const next = cloneForStorage(input.next);
          const result = await sql.run(
            `UPDATE generation_jobs
              SET phase = ?, revision = ?, snapshot_version = ?,
                  snapshot_json = ?, created_at = ?, updated_at = ?
              WHERE workspace_id = ? AND job_id = ? AND revision = ?`,
            [
              next.phase,
              next.revision,
              GENERATION_JOB_SNAPSHOT_VERSION,
              encodeGenerationJobSnapshot(next),
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

    observe: (ref, afterRevision) => {
      return observations.observe(ref, afterRevision, () => store.get(ref));
    },

    listRecoverable: () => {
      return options.metadataStore.transaction(
        {
          mode: 'read',
          ownership: 'state',
          operation: 'list-recoverable-generation-jobs',
        },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT job_id, phase, revision, snapshot_version, snapshot_json,
                    created_at, updated_at
              FROM generation_jobs
              WHERE workspace_id = ?
                AND phase IN ('pending', 'running', 'outcome-unknown')
              ORDER BY updated_at ASC, job_id ASC`,
            [options.workspaceId],
          );
          return rows.map((row) =>
            decodeRow(row, { kind: GENERATION_JOB_KIND, jobId: readString(row, 'job_id') }),
          );
        },
      );
    },
  };

  return Object.freeze(store);
}

function decodeRequiredRow(
  rows: readonly LocalMetadataSqlRow[],
  ref: GenerationJobRef,
): GenerationJobSnapshot {
  const row = rows[0];
  if (!row) {
    throw new JobLifecycleError('job-not-found', `Job ${formatJobRef(ref)} does not exist.`);
  }
  if (rows.length !== 1) {
    throw invalidPersistence(`Generation Job ${formatJobRef(ref)} has duplicate persisted rows.`);
  }
  return decodeRow(row, ref);
}

function decodeRow(row: LocalMetadataSqlRow, expectedRef: GenerationJobRef): GenerationJobSnapshot {
  const snapshotVersion = readNumber(row, 'snapshot_version');
  if (snapshotVersion !== GENERATION_JOB_SNAPSHOT_VERSION) {
    throw invalidPersistence(
      `Generation Job ${formatJobRef(expectedRef)} uses unknown snapshot version ${snapshotVersion}.`,
    );
  }
  const snapshot = decodeGenerationJobSnapshot(readString(row, 'snapshot_json'));
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
      `Generation Job ${formatJobRef(expectedRef)} row columns do not match its snapshot.`,
    );
  }
  return snapshot;
}

function cloneForStorage(snapshot: GenerationJobSnapshot): GenerationJobSnapshot {
  return decodeGenerationJobSnapshot(encodeGenerationJobSnapshot(snapshot));
}

function assertGenerationRef(ref: GenerationJobRef): void {
  assertJobRef(ref);
  if (ref.kind !== GENERATION_JOB_KIND) {
    throw new JobLifecycleError(
      'identity-mismatch',
      `Generation Job store cannot access ${formatJobRef(ref)}.`,
    );
  }
}

function readString(row: LocalMetadataSqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== 'string') {
    throw invalidPersistence(`Generation Job column ${column} must be a string.`);
  }
  return value;
}

function readNumber(row: LocalMetadataSqlRow, column: string): number {
  const value = row[column];
  if (typeof value !== 'number' && typeof value !== 'bigint') {
    throw invalidPersistence(`Generation Job column ${column} must be an integer.`);
  }
  const result = Number(value);
  if (!Number.isSafeInteger(result)) {
    throw invalidPersistence(`Generation Job column ${column} is outside the safe integer range.`);
  }
  return result;
}

function invalidPersistence(message: string): GenerationJobError {
  return new GenerationJobError('generation-job-persistence-invalid', message);
}
