import { describe, expect, it, vi } from 'vitest';
import { sleepWithAbort, withTimeout } from '../async';

describe('async helpers', () => {
  it('should resolve before timeout', async () => {
    await expect(withTimeout(Promise.resolve('done'), 100)).resolves.toBe('done');
  });

  it('should reject after timeout and clear the timer once settled', async () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const pending = withTimeout(new Promise(() => {}), 50, { message: 'custom timeout' });
    const assertion = expect(pending).rejects.toThrow('custom timeout');

    await vi.advanceTimersByTimeAsync(50);

    await assertion;
    expect(clearTimeoutSpy).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('should sleep until aborted', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = sleepWithAbort(1000, controller.signal);

    controller.abort();

    await expect(pending).rejects.toThrow('Task aborted');
    vi.useRealTimers();
  });
});
