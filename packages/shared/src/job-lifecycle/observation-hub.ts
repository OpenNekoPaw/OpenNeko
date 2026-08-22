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
  constructor(private readonly onClose: () => void) {}

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
    if (this.closed) return;
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

export interface JobObservationHub<S extends JobSnapshotBase> {
  observe(ref: S['ref'], loadCurrent: () => Promise<S>, signal?: AbortSignal): AsyncIterable<S>;
  publish(snapshot: S): void;
}

export function createJobObservationHub<S extends JobSnapshotBase>(): JobObservationHub<S> {
  const observations = new Map<string, Set<JobObservation<S>>>();

  return Object.freeze({
    observe: (
      ref: S['ref'],
      loadCurrent: () => Promise<S>,
      signal?: AbortSignal,
    ): AsyncIterable<S> => {
      assertJobRef(ref);
      return observe(ref, loadCurrent, observations, signal);
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
  loadCurrent: () => Promise<S>,
  observations: Map<string, Set<JobObservation<S>>>,
  signal?: AbortSignal,
): AsyncIterable<S> {
  const key = formatJobRef(ref);
  const observation = new JobObservation<S>(() => {
    const current = observations.get(key);
    current?.delete(observation);
    if (current?.size === 0) observations.delete(key);
  });
  const currentObservers = observations.get(key) ?? new Set<JobObservation<S>>();
  currentObservers.add(observation);
  observations.set(key, currentObservers);
  const onAbort = (): void => observation.close();
  if (signal?.aborted) observation.close();
  else signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (signal?.aborted) return;
    const current = await loadCurrent();
    if (signal?.aborted) return;
    observation.push(current);
    if (isTerminalJobPhase(current.phase)) {
      yield current;
      return;
    }
    for await (const snapshot of observation) yield snapshot;
  } finally {
    signal?.removeEventListener('abort', onAbort);
    observation.close();
  }
}
