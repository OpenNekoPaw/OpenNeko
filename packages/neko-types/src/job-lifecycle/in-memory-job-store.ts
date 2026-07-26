import type { JobRef, JobSnapshotBase, JobStoreCommit, VersionedJobStore } from './contracts';
import {
  assertInitialJobSnapshot,
  assertJobRef,
  assertJobTransition,
  formatJobRef,
  JobLifecycleError,
} from './transition';
import { createVersionedJobObservationHub } from './observation-hub';

export function createInMemoryVersionedJobStore<S extends JobSnapshotBase>(): VersionedJobStore<S> {
  const snapshots = new Map<string, S>();
  const observations = createVersionedJobObservationHub<S>();

  return Object.freeze({
    create: async (initial: S): Promise<S> => {
      assertInitialJobSnapshot(initial);
      const key = formatJobRef(initial.ref);
      if (snapshots.has(key)) {
        throw new JobLifecycleError('job-already-exists', `Job ${key} already exists.`);
      }
      const stored = freezeSnapshot(initial);
      snapshots.set(key, stored);
      return stored;
    },

    get: async (ref: S['ref']): Promise<S> => {
      assertJobRef(ref);
      return getRequiredSnapshot(snapshots, ref);
    },

    commit: async (input: JobStoreCommit<S>): Promise<S> => {
      assertJobRef(input.ref);
      const current = getRequiredSnapshot(snapshots, input.ref);
      assertExactRef(current.ref, input.ref);
      assertJobTransition(current, input.next, input.expectedRevision);
      const stored = freezeSnapshot(input.next);
      const key = formatJobRef(stored.ref);
      snapshots.set(key, stored);
      observations.publish(stored);
      return stored;
    },

    observe: (ref: S['ref'], afterRevision: number): AsyncIterable<S> => {
      const current = getRequiredSnapshot(snapshots, ref);
      assertExactRef(current.ref, ref);
      if (afterRevision > current.revision) {
        throw new JobLifecycleError(
          'revision-gap',
          `Job ${formatJobRef(ref)} is at revision ${current.revision}, behind observer revision ${afterRevision}.`,
        );
      }
      return observations.observe(ref, afterRevision, async () => current);
    },
  });
}

function getRequiredSnapshot<S extends JobSnapshotBase>(
  snapshots: ReadonlyMap<string, S>,
  ref: JobRef,
): S {
  const key = formatJobRef(ref);
  const snapshot = snapshots.get(key);
  if (!snapshot) {
    throw new JobLifecycleError('job-not-found', `Job ${key} does not exist.`);
  }
  return snapshot;
}

function assertExactRef(expected: JobRef, actual: JobRef): void {
  if (expected.kind !== actual.kind || expected.jobId !== actual.jobId) {
    throw new JobLifecycleError(
      'identity-mismatch',
      `Job identity mismatch: expected ${formatJobRef(expected)}, received ${formatJobRef(actual)}.`,
    );
  }
}

function freezeSnapshot<S extends JobSnapshotBase>(snapshot: S): S {
  deepFreeze(snapshot, new WeakSet<object>());
  return snapshot;
}

function deepFreeze(value: unknown, visited: WeakSet<object>): void {
  if (typeof value !== 'object' || value === null || visited.has(value)) return;
  visited.add(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested, visited);
  }
  Object.freeze(value);
}
