import type { LocalMetadataSqlRow, LocalMetadataStore } from '@neko/local-metadata';
import {
  assertInitialJobSnapshot,
  assertJobRef,
  assertJobTransition,
  createInMemoryJobStore,
  createJobObservationHub,
  formatJobRef,
  isTerminalJobPhase,
  JobLifecycleError,
} from '@neko/shared/job-lifecycle';
import {
  GENERATION_JOB_KIND,
  GenerationJobError,
  type GenerationJobReadDiagnostic,
  type GenerationJobRef,
  type GenerationJobSnapshot,
  type GenerationJobStore,
} from './contracts';
import { decodeGenerationJobSnapshot, encodeGenerationJobSnapshot } from './codec';

export { initializeGenerationJobTables } from './tables';

export function createInMemoryGenerationJobStore(): GenerationJobStore {
  const store = createInMemoryJobStore<GenerationJobSnapshot>();
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
      return {
        snapshots: snapshots.filter((snapshot) => !isTerminalJobPhase(snapshot.phase)),
        diagnostics: [],
      };
    },
    findBySubmissionId: async (submissionId: string) => {
      const snapshots = await Promise.all(refs.map((ref) => store.get(ref)));
      const matches = snapshots.filter((snapshot) => snapshot.submissionId === submissionId);
      if (matches.length > 1) {
        throw invalidPersistence(
          `Generation submission '${submissionId}' is bound to multiple Jobs.`,
        );
      }
      return matches[0];
    },
  });
}

export interface PersistentGenerationJobStoreOptions {
  readonly metadataStore: LocalMetadataStore;
  readonly workspaceId: string;
}

export interface PersistentAssistantGenerationJobStoreOptions {
  readonly metadataStore: LocalMetadataStore;
  readonly assistantSpaceId: string;
}

export function createPersistentGenerationJobStore(
  options: PersistentGenerationJobStoreOptions,
): GenerationJobStore {
  return createPartitionedPersistentGenerationJobStore({
    metadataStore: options.metadataStore,
    ownerId: options.workspaceId,
    ownerLabel: 'Workspace',
    table: 'generation_jobs',
    ownerColumn: 'workspace_id',
  });
}

export function createPersistentAssistantGenerationJobStore(
  options: PersistentAssistantGenerationJobStoreOptions,
): GenerationJobStore {
  return createPartitionedPersistentGenerationJobStore({
    metadataStore: options.metadataStore,
    ownerId: options.assistantSpaceId,
    ownerLabel: 'Assistant Space',
    table: 'assistant_generation_jobs',
    ownerColumn: 'assistant_space_id',
  });
}

interface PersistentGenerationJobPartition {
  readonly metadataStore: LocalMetadataStore;
  readonly ownerId: string;
  readonly ownerLabel: 'Workspace' | 'Assistant Space';
  readonly table: 'generation_jobs' | 'assistant_generation_jobs';
  readonly ownerColumn: 'workspace_id' | 'assistant_space_id';
}

function createPartitionedPersistentGenerationJobStore(
  options: PersistentGenerationJobPartition,
): GenerationJobStore {
  if (!options.ownerId.trim()) {
    const article = options.ownerLabel === 'Workspace' ? 'a' : 'an';
    throw new GenerationJobError(
      'generation-job-persistence-invalid',
      `Persistent Generation Job store requires ${article} ${options.ownerLabel} identity.`,
    );
  }
  const observations = createJobObservationHub<GenerationJobSnapshot>();

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
            `SELECT job_id FROM ${options.table}
              WHERE ${options.ownerColumn} = ? AND job_id = ?`,
            [options.ownerId, stored.ref.jobId],
          );
          if (existing.length > 0) {
            throw new JobLifecycleError(
              'job-already-exists',
              `Job ${formatJobRef(stored.ref)} already exists.`,
            );
          }
          await sql.run(
            `INSERT INTO ${options.table} (
              ${options.ownerColumn}, job_id, phase, snapshot_json, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [
              options.ownerId,
              stored.ref.jobId,
              stored.phase,
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
            `SELECT job_id, phase, snapshot_json, created_at, updated_at
              FROM ${options.table}
              WHERE ${options.ownerColumn} = ? AND job_id = ?`,
            [options.ownerId, ref.jobId],
          );
          return decodeRequiredRow(rows, ref);
        },
      );
    },

    save: async (snapshot) => {
      assertGenerationRef(snapshot.ref);
      const stored = await options.metadataStore.transaction(
        {
          mode: 'state-write',
          ownership: 'state',
          operation: 'commit-generation-job',
        },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT job_id, phase, snapshot_json, created_at, updated_at
              FROM ${options.table}
              WHERE ${options.ownerColumn} = ? AND job_id = ?`,
            [options.ownerId, snapshot.ref.jobId],
          );
          const current = decodeRequiredRow(rows, snapshot.ref);
          assertJobTransition(current, snapshot);
          const next = cloneForStorage(snapshot);
          const result = await sql.run(
            `UPDATE ${options.table}
              SET phase = ?, snapshot_json = ?, created_at = ?, updated_at = ?
              WHERE ${options.ownerColumn} = ? AND job_id = ?`,
            [
              next.phase,
              encodeGenerationJobSnapshot(next),
              next.createdAt,
              next.updatedAt,
              options.ownerId,
              next.ref.jobId,
            ],
          );
          if (result.changes !== 1) {
            throw new JobLifecycleError(
              'job-not-found',
              `Job ${formatJobRef(snapshot.ref)} does not exist.`,
            );
          }
          return next;
        },
      );
      observations.publish(stored);
      return stored;
    },

    observe: (ref, signal) => {
      return observations.observe(ref, () => store.get(ref), signal);
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
            `SELECT job_id, phase, snapshot_json, created_at, updated_at
              FROM ${options.table}
              WHERE ${options.ownerColumn} = ?
                AND phase IN ('pending', 'running', 'outcome-unknown')
              ORDER BY updated_at ASC, job_id ASC`,
            [options.ownerId],
          );
          const snapshots: GenerationJobSnapshot[] = [];
          const diagnostics: GenerationJobReadDiagnostic[] = [];
          for (const row of rows) {
            const ref = readGenerationRef(row);
            try {
              snapshots.push(decodeRow(row, ref));
            } catch (error) {
              diagnostics.push({
                code: 'generation-job-persistence-invalid' as const,
                ref,
                message: error instanceof Error ? error.message : String(error),
              });
            }
          }
          return { snapshots, diagnostics };
        },
      );
    },

    findBySubmissionId: (submissionId) => {
      if (!submissionId.trim()) {
        throw invalidPersistence('Generation submission identity must be non-empty.');
      }
      return options.metadataStore.transaction(
        {
          mode: 'read',
          ownership: 'state',
          operation: 'find-generation-job-by-submission',
        },
        async ({ sql }) => {
          const rows = await sql.all(
            `SELECT job_id, phase, snapshot_json, created_at, updated_at
              FROM ${options.table}
              WHERE ${options.ownerColumn} = ?
              ORDER BY created_at ASC, job_id ASC`,
            [options.ownerId],
          );
          const matches: GenerationJobSnapshot[] = [];
          for (const row of rows) {
            const ref = readGenerationRef(row);
            const snapshot = decodeRow(row, ref);
            if (snapshot.submissionId === submissionId) matches.push(snapshot);
          }
          if (matches.length > 1) {
            throw invalidPersistence(
              `Generation submission '${submissionId}' is bound to multiple Jobs.`,
            );
          }
          return matches[0];
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
  const snapshot = decodeGenerationJobSnapshot(readString(row, 'snapshot_json'));
  if (
    snapshot.ref.kind !== expectedRef.kind ||
    snapshot.ref.jobId !== expectedRef.jobId ||
    snapshot.ref.jobId !== readString(row, 'job_id') ||
    snapshot.phase !== readString(row, 'phase') ||
    snapshot.createdAt !== readNumber(row, 'created_at') ||
    snapshot.updatedAt !== readNumber(row, 'updated_at')
  ) {
    throw invalidPersistence(
      `Generation Job ${formatJobRef(expectedRef)} row columns do not match its snapshot.`,
    );
  }
  return snapshot;
}

function readGenerationRef(row: LocalMetadataSqlRow): GenerationJobRef {
  const jobId = readString(row, 'job_id');
  return { kind: GENERATION_JOB_KIND, jobId };
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
