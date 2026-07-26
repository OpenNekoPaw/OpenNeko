import type { JobSnapshotBase } from './contracts';
import { assertJobRef, formatJobRef, isTerminalJobPhase, JobLifecycleError } from './transition';

interface PendingObservation<S> {
  readonly resolve: (value: IteratorResult<S>) => void;
}

class JobObservation<S extends JobSnapshotBase> implements AsyncIterableIterator<S> {
  private readonly queue: S[] = [];
  private pending: PendingObservation<S> | undefined;
  private closed = false;
  private closeAfterDrain = false;
  private lastRevision: number;

  constructor(
    afterRevision: number,
    private readonly onClose: () => void,
  ) {
    this.lastRevision = afterRevision;
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<S> {
    return this;
  }

  next(): Promise<IteratorResult<S>> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve({ done: false, value: queued });
    if (this.closed || this.closeAfterDrain) {
      this.close();
      return Promise.resolve({ done: true, value: undefined });
    }
    if (this.pending) {
      throw new JobLifecycleError(
        'invalid-snapshot',
        'A Job observation cannot have multiple concurrent next() calls.',
      );
    }
    return new Promise<IteratorResult<S>>((resolve) => {
      this.pending = { resolve };
    });
  }

  return(): Promise<IteratorResult<S>> {
    this.close();
    return Promise.resolve({ done: true, value: undefined });
  }

  push(snapshot: S): void {
    if (this.closed || snapshot.revision <= this.lastRevision) return;
    this.lastRevision = snapshot.revision;
    if (isTerminalJobPhase(snapshot.phase)) this.closeAfterDrain = true;
    const pending = this.pending;
    if (pending) {
      this.pending = undefined;
      pending.resolve({ done: false, value: snapshot });
      return;
    }
    this.queue.push(snapshot);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.queue.length = 0;
    const pending = this.pending;
    this.pending = undefined;
    pending?.resolve({ done: true, value: undefined });
    this.onClose();
  }
}

export interface VersionedJobObservationHub<S extends JobSnapshotBase> {
  observe(ref: S['ref'], afterRevision: number, loadCurrent: () => Promise<S>): AsyncIterable<S>;
  publish(snapshot: S): void;
}

export function createVersionedJobObservationHub<
  S extends JobSnapshotBase,
>(): VersionedJobObservationHub<S> {
  const observations = new Map<string, Set<JobObservation<S>>>();

  return Object.freeze({
    observe: (
      ref: S['ref'],
      afterRevision: number,
      loadCurrent: () => Promise<S>,
    ): AsyncIterable<S> => {
      assertJobRef(ref);
      if (!Number.isInteger(afterRevision) || afterRevision < 0) {
        throw new JobLifecycleError(
          'invalid-snapshot',
          `Observation revision must be a non-negative integer, received ${afterRevision}.`,
        );
      }
      return observe(ref, afterRevision, loadCurrent, observations);
    },
    publish: (snapshot: S): void => {
      for (const observation of observations.get(formatJobRef(snapshot.ref)) ?? []) {
        observation.push(snapshot);
      }
    },
  });
}

async function* observe<S extends JobSnapshotBase>(
  ref: S['ref'],
  afterRevision: number,
  loadCurrent: () => Promise<S>,
  observations: Map<string, Set<JobObservation<S>>>,
): AsyncIterable<S> {
  const key = formatJobRef(ref);
  const observation = new JobObservation<S>(afterRevision, () => {
    const current = observations.get(key);
    current?.delete(observation);
    if (current?.size === 0) observations.delete(key);
  });
  const currentObservers = observations.get(key) ?? new Set<JobObservation<S>>();
  currentObservers.add(observation);
  observations.set(key, currentObservers);

  try {
    const current = await loadCurrent();
    if (afterRevision > current.revision) {
      throw new JobLifecycleError(
        'revision-gap',
        `Job ${key} is at revision ${current.revision}, behind observer revision ${afterRevision}.`,
      );
    }
    observation.push(current);
    if (isTerminalJobPhase(current.phase) && current.revision <= afterRevision) return;
    for await (const snapshot of observation) yield snapshot;
  } finally {
    observation.close();
  }
}
