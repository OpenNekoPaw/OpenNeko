import type { JobRef } from '../job-lifecycle/contracts';
import type { JobSnapshotBase } from '../job-lifecycle/contracts';
import { isTerminalJobPhase } from '../job-lifecycle/transition';
import { formatJobRef } from '../job-lifecycle/transition';
import type {
  DomainActivityItem,
  DomainActivityJobKind,
  DomainActivityPatch,
  DomainActivityPublisher,
  DomainActivitySnapshot,
  DomainActivitySource,
} from './contracts';

interface PendingObservation {
  readonly resolve: (result: IteratorResult<DomainActivityPatch>) => void;
}

class ActivityObservation implements AsyncIterableIterator<DomainActivityPatch> {
  private readonly queue: DomainActivityPatch[] = [];
  private pending: PendingObservation | undefined;
  private closed = false;

  constructor(
    private lastVersion: number,
    private readonly onClose: () => void,
  ) {}

  [Symbol.asyncIterator](): AsyncIterableIterator<DomainActivityPatch> {
    return this;
  }

  next(): Promise<IteratorResult<DomainActivityPatch>> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve({ done: false, value: queued });
    if (this.closed) return Promise.resolve({ done: true, value: undefined });
    if (this.pending) {
      throw new Error('Domain Activity observation cannot have concurrent next() calls.');
    }
    return new Promise((resolve) => {
      this.pending = { resolve };
    });
  }

  return(): Promise<IteratorResult<DomainActivityPatch>> {
    this.close();
    return Promise.resolve({ done: true, value: undefined });
  }

  push(patch: DomainActivityPatch): void {
    if (this.closed || patch.projectionVersion <= this.lastVersion) return;
    if (patch.baseProjectionVersion !== this.lastVersion) {
      this.close();
      throw new Error(
        `Domain Activity patch gap: expected base ${this.lastVersion}, received ${patch.baseProjectionVersion}.`,
      );
    }
    this.lastVersion = patch.projectionVersion;
    const pending = this.pending;
    if (pending) {
      this.pending = undefined;
      pending.resolve({ done: false, value: patch });
      return;
    }
    this.queue.push(patch);
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

export interface DomainActivityProjector extends DomainActivitySource, DomainActivityPublisher {
  dispose(): void;
}

export interface DomainActivityTracker<S extends JobSnapshotBase> {
  install(snapshot: S): void;
  dispose(): Promise<void>;
}

export function createDomainActivityTracker<S extends JobSnapshotBase>(options: {
  readonly observe: (ref: S['ref'], afterRevision: number) => AsyncIterable<S>;
  readonly project: (snapshot: S) => DomainActivityItem;
  readonly publisher: DomainActivityPublisher;
  readonly reportError: (error: Error, ref: S['ref']) => void;
}): DomainActivityTracker<S> {
  const observations = new Map<string, AsyncIterator<S>>();
  let disposed = false;

  return Object.freeze({
    install(snapshot: S): void {
      if (disposed) throw new Error('Domain Activity tracker is disposed.');
      options.publisher.publish(options.project(snapshot));
      if (isTerminalJobPhase(snapshot.phase)) return;
      const key = formatJobRef(snapshot.ref);
      if (observations.has(key)) return;
      const iterator = options.observe(snapshot.ref, snapshot.revision)[Symbol.asyncIterator]();
      observations.set(key, iterator);
      void consumeActivityObservation(snapshot.ref, iterator, options)
        .catch((error: unknown) => options.reportError(toError(error), snapshot.ref))
        .finally(() => {
          if (observations.get(key) === iterator) observations.delete(key);
        });
    },

    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      const active = [...observations.values()];
      observations.clear();
      await Promise.allSettled(active.map(async (iterator) => iterator.return?.()));
    },
  });
}

export function createDomainActivityProjector(): DomainActivityProjector {
  const items = new Map<string, DomainActivityItem>();
  const observations = new Set<ActivityObservation>();
  let projectionVersion = 0;
  let disposed = false;

  const publishPatch = (
    upserts: readonly DomainActivityItem[],
    removed: readonly JobRef<DomainActivityJobKind>[],
  ): void => {
    const patch = freezePatch({
      baseProjectionVersion: projectionVersion,
      projectionVersion: projectionVersion + 1,
      upserts,
      removed,
    });
    projectionVersion = patch.projectionVersion;
    for (const observation of [...observations]) observation.push(patch);
  };

  return Object.freeze({
    getSnapshot(): DomainActivitySnapshot {
      assertAvailable(disposed);
      return Object.freeze({
        projectionVersion,
        items: Object.freeze(
          [...items.values()].sort(
            (left, right) =>
              right.updatedAt - left.updatedAt ||
              activityKey(left).localeCompare(activityKey(right)),
          ),
        ),
      });
    },

    observe(afterProjectionVersion: number): AsyncIterable<DomainActivityPatch> {
      assertAvailable(disposed);
      if (
        !Number.isSafeInteger(afterProjectionVersion) ||
        afterProjectionVersion < 0 ||
        afterProjectionVersion !== projectionVersion
      ) {
        throw new Error(
          `Domain Activity observation version ${afterProjectionVersion} is invalid for projection ${projectionVersion}.`,
        );
      }
      const observation = new ActivityObservation(afterProjectionVersion, () => {
        observations.delete(observation);
      });
      observations.add(observation);
      return observation;
    },

    publish(item: DomainActivityItem): void {
      assertAvailable(disposed);
      assertActivityItem(item);
      const key = activityKey(item);
      const current = items.get(key);
      if (current && item.jobRevision < current.jobRevision) {
        throw new Error(
          `Domain Activity ${key} cannot move from Job revision ${current.jobRevision} to ${item.jobRevision}.`,
        );
      }
      if (current && item.jobRevision === current.jobRevision) {
        if (JSON.stringify(current) !== JSON.stringify(item)) {
          throw new Error(`Domain Activity ${key} conflicts at Job revision ${item.jobRevision}.`);
        }
        return;
      }
      const stored = freezeItem(item);
      items.set(key, stored);
      publishPatch([stored], []);
    },

    remove(ref: JobRef<DomainActivityJobKind>): void {
      assertAvailable(disposed);
      const key = formatJobRef(ref);
      if (!items.delete(key)) {
        throw new Error(`Domain Activity ${key} cannot be removed because it is unknown.`);
      }
      publishPatch([], [Object.freeze({ ...ref })]);
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const observation of [...observations]) observation.close();
      observations.clear();
      items.clear();
    },
  });
}

function activityKey(item: Pick<DomainActivityItem, 'jobKind' | 'jobId'>): string {
  return formatJobRef({ kind: item.jobKind, jobId: item.jobId });
}

function assertActivityItem(item: DomainActivityItem): void {
  if (!item.jobId.trim() || !item.label.trim()) {
    throw new Error('Domain Activity item requires non-empty identity and label.');
  }
  if (!Number.isSafeInteger(item.jobRevision) || item.jobRevision <= 0) {
    throw new Error('Domain Activity item requires a positive Job revision.');
  }
  if (
    !Number.isFinite(item.progress.percent) ||
    item.progress.percent < 0 ||
    item.progress.percent > 100
  ) {
    throw new Error('Domain Activity progress must be between 0 and 100.');
  }
}

function freezeItem(item: DomainActivityItem): DomainActivityItem {
  return deepFreeze(structuredClone(item));
}

function freezePatch(patch: DomainActivityPatch): DomainActivityPatch {
  return deepFreeze(structuredClone(patch));
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function assertAvailable(disposed: boolean): void {
  if (disposed) throw new Error('Domain Activity projector is disposed.');
}

async function consumeActivityObservation<S extends JobSnapshotBase>(
  ref: S['ref'],
  iterator: AsyncIterator<S>,
  options: {
    readonly project: (snapshot: S) => DomainActivityItem;
    readonly publisher: DomainActivityPublisher;
  },
): Promise<void> {
  for (;;) {
    const next = await iterator.next();
    if (next.done) return;
    if (next.value.ref.kind !== ref.kind || next.value.ref.jobId !== ref.jobId) {
      throw new Error(
        `Domain Activity observation identity mismatch: expected ${formatJobRef(ref)}, received ${formatJobRef(next.value.ref)}.`,
      );
    }
    options.publisher.publish(options.project(next.value));
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
