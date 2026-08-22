import { describe, expect, it } from 'vitest';
import { createInMemoryJobStore, JobLifecycleError, type JobSnapshotBase } from '../index';

interface GenerationJobSnapshot extends JobSnapshotBase<'generation'> {
  readonly stage: 'submitted' | 'generating' | 'materializing' | 'complete';
  readonly progress: number;
}

function snapshot(overrides: Partial<GenerationJobSnapshot> = {}): GenerationJobSnapshot {
  return {
    ref: { kind: 'generation', jobId: 'job-1' },
    phase: 'pending',
    createdAt: 100,
    updatedAt: 100,
    stage: 'submitted',
    progress: 0,
    ...overrides,
  };
}

describe('Domain Job lifecycle kernel', () => {
  it('creates and returns an immutable typed snapshot', async () => {
    const store = createInMemoryJobStore<GenerationJobSnapshot>();
    const created = await store.create(snapshot());

    expect(created).toEqual(snapshot());
    expect(Object.isFrozen(created)).toBe(true);
    expect(Object.isFrozen(created.ref)).toBe(true);
    await expect(store.get(created.ref)).resolves.toBe(created);
  });

  it('observes the current snapshot and later owner saves in order', async () => {
    const store = createInMemoryJobStore<GenerationJobSnapshot>();
    await store.create(snapshot());
    const iterator = store.observe({ kind: 'generation', jobId: 'job-1' })[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({ done: false, value: snapshot() });

    const running = snapshot({
      phase: 'running',
      updatedAt: 110,
      stage: 'generating',
      progress: 40,
    });
    await store.save(running);
    await expect(iterator.next()).resolves.toEqual({ done: false, value: running });

    const terminal = snapshot({
      phase: 'succeeded',
      updatedAt: 120,
      stage: 'complete',
      progress: 100,
    });
    await store.save(terminal);
    await expect(iterator.next()).resolves.toEqual({ done: false, value: terminal });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
  });

  it('releases a pending observer when its caller is cancelled', async () => {
    const store = createInMemoryJobStore<GenerationJobSnapshot>();
    await store.create(snapshot());
    const controller = new AbortController();
    const iterator = store.observe(snapshot().ref, controller.signal)[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({ done: false, value: snapshot() });
    const pending = iterator.next();
    controller.abort();

    await expect(pending).resolves.toEqual({ done: true, value: undefined });
  });

  it('rejects invalid timestamps and identity fallback before mutation', async () => {
    const store = createInMemoryJobStore<GenerationJobSnapshot>();
    await store.create(snapshot());

    await expect(store.save(snapshot({ phase: 'running', updatedAt: 90 }))).rejects.toMatchObject<
      Partial<JobLifecycleError>
    >({ code: 'invalid-snapshot' });
    await expect(
      store.save(snapshot({ ref: { kind: 'generation', jobId: 'another-job' } })),
    ).rejects.toMatchObject<Partial<JobLifecycleError>>({ code: 'job-not-found' });
    await expect(store.get({ kind: 'generation', jobId: 'job-1' })).resolves.toMatchObject({
      phase: 'pending',
    });
  });

  it('keeps terminal snapshots immutable', async () => {
    const store = createInMemoryJobStore<GenerationJobSnapshot>();
    await store.create(snapshot());
    const failed = snapshot({
      phase: 'failed',
      updatedAt: 110,
      failure: {
        code: 'provider-failed',
        message: 'Provider rejected the request.',
        retryable: true,
      },
    });
    await store.save(failed);

    await expect(store.save(snapshot({ phase: 'running', updatedAt: 120 }))).rejects.toMatchObject<
      Partial<JobLifecycleError>
    >({ code: 'terminal-mutation' });
  });

  it('allows owning-domain reconciliation from outcome-unknown', async () => {
    const store = createInMemoryJobStore<GenerationJobSnapshot>();
    await store.create(snapshot());
    await store.save(
      snapshot({
        phase: 'outcome-unknown',
        updatedAt: 110,
        failure: {
          code: 'submission-outcome-unknown',
          message: 'The provider may have accepted the request.',
          retryable: false,
        },
      }),
    );

    await expect(
      store.save(
        snapshot({
          phase: 'running',
          updatedAt: 120,
          stage: 'generating',
          progress: 30,
        }),
      ),
    ).resolves.toMatchObject({ phase: 'running', stage: 'generating' });
  });

  it('preserves retry provenance and rejects changes to it', async () => {
    const store = createInMemoryJobStore<GenerationJobSnapshot>();
    await store.create(
      snapshot({
        ref: { kind: 'generation', jobId: 'job-2' },
        retryOf: { kind: 'generation', jobId: 'job-1' },
      }),
    );

    await expect(store.get({ kind: 'generation', jobId: 'missing' })).rejects.toMatchObject<
      Partial<JobLifecycleError>
    >({ code: 'job-not-found' });
    await expect(
      store.save(
        snapshot({
          ref: { kind: 'generation', jobId: 'job-2' },
          phase: 'running',
          updatedAt: 110,
          retryOf: { kind: 'generation', jobId: 'another-job' },
        }),
      ),
    ).rejects.toMatchObject<Partial<JobLifecycleError>>({ code: 'invalid-snapshot' });
  });

  it('rejects invalid initial and failed snapshots', async () => {
    const store = createInMemoryJobStore<GenerationJobSnapshot>();

    await expect(store.create(snapshot({ updatedAt: 101 }))).rejects.toMatchObject<
      Partial<JobLifecycleError>
    >({ code: 'invalid-snapshot' });
    await expect(store.create(snapshot({ phase: 'failed' }))).rejects.toMatchObject<
      Partial<JobLifecycleError>
    >({ code: 'invalid-snapshot' });
  });
});
