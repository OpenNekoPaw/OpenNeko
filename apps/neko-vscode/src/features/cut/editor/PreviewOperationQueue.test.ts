import { describe, expect, it, vi } from 'vitest';
import { PreviewOperationQueue } from './PreviewOperationQueue';

describe('PreviewOperationQueue', () => {
  it('serializes lifecycle operations for one panel', async () => {
    const queue = new PreviewOperationQueue<object>();
    const panel = {};
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const first = queue.run(
      panel,
      () =>
        new Promise<void>((resolve) => {
          events.push('first-start');
          releaseFirst = () => {
            events.push('first-end');
            resolve();
          };
        }),
    );
    const second = queue.run(panel, async () => {
      events.push('second');
    });

    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(events).toEqual(['first-start']);
    releaseFirst?.();
    await Promise.all([first, second]);

    expect(events).toEqual(['first-start', 'first-end', 'second']);
  });

  it('continues after a failed operation without executing either operation twice', async () => {
    const queue = new PreviewOperationQueue<object>();
    const panel = {};
    const failure = queue.run(panel, async () => {
      throw new Error('retired generation failed');
    });
    const replacement = vi.fn(async () => undefined);
    const success = queue.run(panel, replacement);

    await expect(failure).rejects.toThrowError('retired generation failed');
    await expect(success).resolves.toBeUndefined();
    expect(replacement).toHaveBeenCalledOnce();
  });

  it('does not serialize independent panels', async () => {
    const queue = new PreviewOperationQueue<object>();
    let releaseFirst: (() => void) | undefined;
    const first = queue.run(
      {},
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    const other = vi.fn(async () => undefined);

    await expect(queue.run({}, other)).resolves.toBeUndefined();
    expect(other).toHaveBeenCalledOnce();
    releaseFirst?.();
    await first;
  });
});
