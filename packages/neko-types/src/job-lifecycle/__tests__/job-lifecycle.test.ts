import { describe, expect, it } from 'vitest';
import { createInMemoryVersionedJobStore, JobLifecycleError, type JobSnapshotBase } from '../index';

interface GenerationJobSnapshot extends JobSnapshotBase<'generation'> {
  readonly stage: 'submitted' | 'generating' | 'materializing' | 'complete';
  readonly progress: number;
}

function snapshot(overrides: Partial<GenerationJobSnapshot> = {}): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: 'job-1' },
    phase: 'pending',
    revision: 1,
    createdAt: 100,
    updatedAt: 100,
    stage: 'submitted',
    progress: 0,
    ...overrides,
  };
}

describe('Domain Job lifecycle kernel', () => {
  it('creates and returns an immutable typed snapshot', async () => {
    const store = createInMemoryVersionedJobStore<GenerationJobSnapshot>();
    const created = await store.create(snapshot());

    expect(created).toEqual(snapshot());
    expect(Object.isFrozen(created)).toBe(true);
    expect(Object.isFrozen(created.ref)).toBe(true);
    await expect(store.get(created.ref)).resolves.toBe(created);
  });

  it('observes the current snapshot and later revisions in order', async () => {
    const store = createInMemoryVersionedJobStore<GenerationJobSnapshot>();
    await store.create(snapshot());
    const observation = store.observe({ kind: 'generation', jobId: 'job-1' }, 0);
    const iterator = observation[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: snapshot(),
    });

    const revisionTwo = snapshot({
      phase: 'running',
      revision: 2,
      updatedAt: 110,
      stage: 'generating',
      progress: 40,
    });
    await store.commit({
      ref: revisionTwo.ref,
      expectedRevision: 1,
      next: revisionTwo,
    });
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: revisionTwo,
    });

    const terminal = snapshot({
      phase: 'succeeded',
      revision: 3,
      updatedAt: 120,
      stage: 'complete',
      progress: 100,
    });
    await store.commit({
      ref: terminal.ref,
      expectedRevision: 2,
      next: terminal,
    });
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: terminal,
    });
    await expect(iterator.next()).resolves.toEqual({
      done: true,
      value: undefined,
    });
  });

  it('rejects stale revisions and revision gaps before mutation', async () => {
    const store = createInMemoryVersionedJobStore<GenerationJobSnapshot>();
    await store.create(snapshot());

    await expect(
      store.commit({
        ref: { kind: 'generation', jobId: 'job-1' },
        expectedRevision: 0,
        next: snapshot({ phase: 'running', revision: 2, updatedAt: 110 }),
      }),
    ).rejects.toMatchObject<Partial<JobLifecycleError>>({
      code: 'stale-revision',
    });

    await expect(
      store.commit({
        ref: { kind: 'generation', jobId: 'job-1' },
        expectedRevision: 1,
        next: snapshot({ phase: 'running', revision: 3, updatedAt: 110 }),
      }),
    ).rejects.toMatchObject<Partial<JobLifecycleError>>({
      code: 'revision-gap',
    });
    await expect(store.get({ kind: 'generation', jobId: 'job-1' })).resolves.toMatchObject({
      revision: 1,
      phase: 'pending',
    });
  });

  it('keeps terminal snapshots immutable', async () => {
    const store = createInMemoryVersionedJobStore<GenerationJobSnapshot>();
    await store.create(snapshot());
    const failed = snapshot({
      phase: 'failed',
      revision: 2,
      updatedAt: 110,
      failure: {
        code: 'provider-failed',
        message: 'Provider rejected the request.',
        retryable: true,
      },
    });
    await store.commit({
      ref: failed.ref,
      expectedRevision: 1,
      next: failed,
    });

    await expect(
      store.commit({
        ref: failed.ref,
        expectedRevision: 2,
        next: snapshot({
          phase: 'running',
          revision: 3,
          updatedAt: 120,
        }),
      }),
    ).rejects.toMatchObject<Partial<JobLifecycleError>>({
      code: 'terminal-mutation',
    });
  });

  it('allows owning-domain reconciliation from outcome-unknown', async () => {
    const store = createInMemoryVersionedJobStore<GenerationJobSnapshot>();
    await store.create(snapshot());
    const unknown = snapshot({
      phase: 'outcome-unknown',
      revision: 2,
      updatedAt: 110,
      failure: {
        code: 'submission-outcome-unknown',
        message: 'The provider may have accepted the request.',
        retryable: false,
      },
    });
    await store.commit({
      ref: unknown.ref,
      expectedRevision: 1,
      next: unknown,
    });

    await expect(
      store.commit({
        ref: unknown.ref,
        expectedRevision: 2,
        next: snapshot({
          phase: 'running',
          revision: 3,
          updatedAt: 120,
          stage: 'generating',
          progress: 30,
        }),
      }),
    ).resolves.toMatchObject({
      phase: 'running',
      revision: 3,
    });
  });

  it('preserves retry provenance and rejects identity fallback', async () => {
    const store = createInMemoryVersionedJobStore<GenerationJobSnapshot>();
    await store.create(
      snapshot({
        ref: { kind: 'generation', jobId: 'job-2' },
        retryOf: { kind: 'generation', jobId: 'job-1' },
      }),
    );

    await expect(store.get({ kind: 'generation', jobId: 'missing' })).rejects.toMatchObject<
      Partial<JobLifecycleError>
    >({
      code: 'job-not-found',
    });
    await expect(
      store.commit({
        ref: { kind: 'generation', jobId: 'job-2' },
        expectedRevision: 1,
        next: snapshot({
          ref: { kind: 'generation', jobId: 'job-2' },
          phase: 'running',
          revision: 2,
          updatedAt: 110,
          retryOf: { kind: 'generation', jobId: 'another-job' },
        }),
      }),
    ).rejects.toMatchObject<Partial<JobLifecycleError>>({
      code: 'invalid-snapshot',
    });
  });

  it('rejects invalid initial and failed snapshots', async () => {
    const store = createInMemoryVersionedJobStore<GenerationJobSnapshot>();

    await expect(store.create(snapshot({ revision: 2 }))).rejects.toMatchObject<
      Partial<JobLifecycleError>
    >({
      code: 'invalid-snapshot',
    });
    await expect(store.create(snapshot({ phase: 'failed' }))).rejects.toMatchObject<
      Partial<JobLifecycleError>
    >({
      code: 'invalid-snapshot',
    });
  });

  it('rejects an observer revision ahead of the authority', async () => {
    const store = createInMemoryVersionedJobStore<GenerationJobSnapshot>();
    await store.create(snapshot());

    expect(() => store.observe({ kind: 'generation', jobId: 'job-1' }, 2)).toThrowError(
      expect.objectContaining<Partial<JobLifecycleError>>({
        code: 'revision-gap',
      }),
    );
  });
});
