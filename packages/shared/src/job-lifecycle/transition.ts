import type { JobPhase, JobRef, JobSnapshotBase } from './contracts';

const JOB_PHASES: ReadonlySet<JobPhase> = new Set([
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'outcome-unknown',
]);

const TERMINAL_JOB_PHASES: ReadonlySet<JobPhase> = new Set(['succeeded', 'failed', 'cancelled']);

const ALLOWED_TRANSITIONS: Readonly<Record<JobPhase, ReadonlySet<JobPhase>>> = {
  pending: new Set(['pending', 'running', 'succeeded', 'failed', 'cancelled', 'outcome-unknown']),
  running: new Set(['running', 'succeeded', 'failed', 'cancelled', 'outcome-unknown']),
  'outcome-unknown': new Set(['outcome-unknown', 'running', 'succeeded', 'failed', 'cancelled']),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export type JobLifecycleErrorCode =
  | 'invalid-identity'
  | 'invalid-snapshot'
  | 'job-already-exists'
  | 'job-not-found'
  | 'stale-revision'
  | 'revision-gap'
  | 'identity-mismatch'
  | 'invalid-transition'
  | 'terminal-mutation';

export class JobLifecycleError extends Error {
  constructor(
    readonly code: JobLifecycleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'JobLifecycleError';
  }
}

export function isTerminalJobPhase(phase: JobPhase): boolean {
  return TERMINAL_JOB_PHASES.has(phase);
}

export function formatJobRef(ref: JobRef): string {
  assertJobRef(ref);
  return `${ref.kind}:${ref.jobId}`;
}

export function assertJobRef(ref: JobRef): void {
  assertNonEmpty(ref.kind, 'Job kind');
  assertNonEmpty(ref.jobId, 'Job id');
}

export function assertInitialJobSnapshot(snapshot: JobSnapshotBase): void {
  assertSnapshot(snapshot);
  if (snapshot.revision !== 1) {
    throw new JobLifecycleError(
      'invalid-snapshot',
      `Initial Job snapshot ${formatJobRef(snapshot.ref)} must use revision 1.`,
    );
  }
  if (snapshot.createdAt !== snapshot.updatedAt) {
    throw new JobLifecycleError(
      'invalid-snapshot',
      `Initial Job snapshot ${formatJobRef(snapshot.ref)} must use matching timestamps.`,
    );
  }
}

export function assertJobTransition(
  current: JobSnapshotBase,
  next: JobSnapshotBase,
  expectedRevision: number,
): void {
  assertSnapshot(current);
  assertSnapshot(next);
  assertNonNegativeInteger(expectedRevision, 'Expected revision');
  assertSameRef(current.ref, next.ref);

  if (expectedRevision !== current.revision) {
    throw new JobLifecycleError(
      'stale-revision',
      `Job ${formatJobRef(current.ref)} is at revision ${current.revision}, not ${expectedRevision}.`,
    );
  }
  if (isTerminalJobPhase(current.phase)) {
    throw new JobLifecycleError(
      'terminal-mutation',
      `Terminal Job ${formatJobRef(current.ref)} cannot transition from ${current.phase}.`,
    );
  }
  if (next.revision !== current.revision + 1) {
    throw new JobLifecycleError(
      'revision-gap',
      `Job ${formatJobRef(current.ref)} must advance from revision ${current.revision} to ${current.revision + 1}, received ${next.revision}.`,
    );
  }
  if (next.createdAt !== current.createdAt || next.updatedAt < current.updatedAt) {
    throw new JobLifecycleError(
      'invalid-snapshot',
      `Job ${formatJobRef(current.ref)} timestamps cannot move backwards or replace createdAt.`,
    );
  }
  assertSameOptionalRef(current.retryOf, next.retryOf, current.ref);

  if (!ALLOWED_TRANSITIONS[current.phase].has(next.phase)) {
    throw new JobLifecycleError(
      'invalid-transition',
      `Job ${formatJobRef(current.ref)} cannot transition from ${current.phase} to ${next.phase}.`,
    );
  }
}

function assertSnapshot(snapshot: JobSnapshotBase): void {
  assertJobRef(snapshot.ref);
  if (!JOB_PHASES.has(snapshot.phase)) {
    throw new JobLifecycleError(
      'invalid-snapshot',
      `Job ${formatJobRef(snapshot.ref)} has unknown phase ${snapshot.phase}.`,
    );
  }
  assertPositiveInteger(snapshot.revision, 'Job revision');
  assertTimestamp(snapshot.createdAt, 'createdAt');
  assertTimestamp(snapshot.updatedAt, 'updatedAt');
  if (snapshot.updatedAt < snapshot.createdAt) {
    throw new JobLifecycleError(
      'invalid-snapshot',
      `Job ${formatJobRef(snapshot.ref)} updatedAt cannot precede createdAt.`,
    );
  }
  if (snapshot.retryOf) {
    assertJobRef(snapshot.retryOf);
    if (
      snapshot.retryOf.kind !== snapshot.ref.kind ||
      snapshot.retryOf.jobId === snapshot.ref.jobId
    ) {
      throw new JobLifecycleError(
        'invalid-snapshot',
        `Job ${formatJobRef(snapshot.ref)} retryOf must identify a different Job of the same kind.`,
      );
    }
  }

  if (snapshot.failure) {
    assertNonEmpty(snapshot.failure.code, 'Job failure code');
    assertNonEmpty(snapshot.failure.message, 'Job failure message');
  }
  if ((snapshot.phase === 'failed' || snapshot.phase === 'outcome-unknown') && !snapshot.failure) {
    throw new JobLifecycleError(
      'invalid-snapshot',
      `Job ${formatJobRef(snapshot.ref)} phase ${snapshot.phase} requires a failure summary.`,
    );
  }
  if (
    snapshot.failure &&
    snapshot.phase !== 'failed' &&
    snapshot.phase !== 'cancelled' &&
    snapshot.phase !== 'outcome-unknown'
  ) {
    throw new JobLifecycleError(
      'invalid-snapshot',
      `Job ${formatJobRef(snapshot.ref)} phase ${snapshot.phase} cannot carry a failure summary.`,
    );
  }
}

function assertSameRef(current: JobRef, next: JobRef): void {
  if (current.kind !== next.kind || current.jobId !== next.jobId) {
    throw new JobLifecycleError(
      'identity-mismatch',
      `Job identity mismatch: expected ${formatJobRef(current)}, received ${formatJobRef(next)}.`,
    );
  }
}

function assertSameOptionalRef(
  current: JobRef | undefined,
  next: JobRef | undefined,
  owner: JobRef,
): void {
  if (!current && !next) return;
  if (!current || !next || current.kind !== next.kind || current.jobId !== next.jobId) {
    throw new JobLifecycleError(
      'invalid-snapshot',
      `Job ${formatJobRef(owner)} retry provenance cannot change after creation.`,
    );
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new JobLifecycleError('invalid-identity', `${label} must be non-empty.`);
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new JobLifecycleError(
      'invalid-snapshot',
      `${label} must be a positive integer, received ${value}.`,
    );
  }
}

function assertNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new JobLifecycleError(
      'invalid-snapshot',
      `${label} must be a non-negative integer, received ${value}.`,
    );
  }
}

function assertTimestamp(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new JobLifecycleError(
      'invalid-snapshot',
      `Job ${label} must be a non-negative finite timestamp, received ${value}.`,
    );
  }
}
