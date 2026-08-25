import { describe, expect, it } from 'vitest';

import { PromptAdmission } from './prompt-admission';

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

describe('DSH ACP Prompt admission', () => {
  it('runs at most two Sessions and admits queued Prompts in cross-Session FIFO order', async () => {
    const admission = new PromptAdmission<string>();
    const pending = new Map<string, Deferred<string>>();
    const started: string[] = [];
    const run = (sessionId: string) =>
      admission.run(sessionId, () => {
        started.push(sessionId);
        const completion = deferred<string>();
        pending.set(sessionId, completion);
        return completion.promise;
      });

    const first = run('session-a');
    const second = run('session-b');
    const third = run('session-c');
    const fourth = run('session-d');
    expect(started).toEqual(['session-a', 'session-b']);

    pending.get('session-b')?.resolve('b');
    await second;
    expect(started).toEqual(['session-a', 'session-b', 'session-c']);
    pending.get('session-a')?.resolve('a');
    await first;
    expect(started).toEqual(['session-a', 'session-b', 'session-c', 'session-d']);

    pending.get('session-c')?.resolve('c');
    pending.get('session-d')?.resolve('d');
    await expect(Promise.all([third, fourth])).resolves.toEqual(['c', 'd']);
  });

  it('cancels an exact queued Prompt without invoking its operation', async () => {
    const admission = new PromptAdmission<string>();
    const activeA = deferred<string>();
    const activeB = deferred<string>();
    const started: string[] = [];
    const first = admission.run('session-a', () => activeA.promise);
    const second = admission.run('session-b', () => activeB.promise);
    const queued = admission.run('session-c', async () => {
      started.push('session-c');
      return 'c';
    });

    expect(admission.cancel('session-c')).toBe('queued');
    await expect(queued).rejects.toThrow(/cancelled before execution/u);
    expect(started).toEqual([]);
    expect(admission.cancel('session-missing')).toBe('missing');

    activeA.resolve('a');
    activeB.resolve('b');
    await Promise.all([first, second]);
  });

  it('rejects duplicate Session ownership and only the overflowing request', async () => {
    const admission = new PromptAdmission<string>();
    const activeA = deferred<string>();
    const activeB = deferred<string>();
    const first = admission.run('session-a', () => activeA.promise);
    const second = admission.run('session-b', () => activeB.promise);

    expect(() => admission.run('session-a', async () => 'duplicate')).toThrow(
      /already active or queued/u,
    );
    const queued = Array.from({ length: 32 }, (_, index) =>
      admission.run(`session-${index + 10}`, async () => `queued-${index}`),
    );
    expect(() => admission.run('session-overflow', async () => 'overflow')).toThrow(
      /queue limit exceeded/u,
    );

    admission.close();
    const settled = await Promise.allSettled(queued);
    expect(settled.every((result) => result.status === 'rejected')).toBe(true);
    activeA.resolve('a');
    activeB.resolve('b');
    await Promise.all([first, second]);
  });

  it('rejects all queued Prompts on disconnect and never starts them later', async () => {
    const admission = new PromptAdmission<string>();
    const activeA = deferred<string>();
    const activeB = deferred<string>();
    const started: string[] = [];
    const first = admission.run('session-a', () => activeA.promise);
    const second = admission.run('session-b', () => activeB.promise);
    const queued = admission.run('session-c', async () => {
      started.push('session-c');
      return 'c';
    });

    admission.close();
    await expect(queued).rejects.toThrow(/cancelled before execution/u);
    expect(() => admission.run('session-d', async () => 'd')).toThrow(/admission is closed/u);
    activeA.resolve('a');
    activeB.resolve('b');
    await Promise.all([first, second]);
    expect(started).toEqual([]);
  });
});

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
