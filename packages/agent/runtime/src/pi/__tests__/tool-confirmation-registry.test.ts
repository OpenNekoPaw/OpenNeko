import { describe, expect, it, vi } from 'vitest';

import { PiToolConfirmationRegistry } from '../tool-confirmation-registry';

describe('PiToolConfirmationRegistry', () => {
  it('resolves the exact pending ToolCall decision', async () => {
    const registry = new PiToolConfirmationRegistry();
    const decision = registry.request('tool-1', () => registry.resolve('tool-1', true));

    await expect(decision).resolves.toBe(true);
    expect(() => registry.resolve('tool-1', true)).toThrow(
      'Pi tool confirmation tool-1 is not pending.',
    );
  });

  it('keeps the exact ToolCall pending beyond five minutes until the user decides', async () => {
    vi.useFakeTimers();
    try {
      const registry = new PiToolConfirmationRegistry();
      const decision = registry.request('tool-late-approval', () => undefined);
      let settled = false;
      void decision.finally(() => {
        settled = true;
      });

      await vi.advanceTimersByTimeAsync(10 * 60 * 1_000);
      expect(settled).toBe(false);

      registry.resolve('tool-late-approval', true);
      await expect(decision).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('registers the decision before publishing the confirmation UI', async () => {
    const registry = new PiToolConfirmationRegistry();

    await expect(
      registry.request('tool-immediate', () => registry.resolve('tool-immediate', true)),
    ).resolves.toBe(true);
  });

  it('cancels the exact pending decision when UI publication fails', async () => {
    const registry = new PiToolConfirmationRegistry();
    const failure = new Error('projection failed');

    await expect(
      registry.request('tool-unpublished', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(() => registry.resolve('tool-unpublished', true)).toThrow(
      'Pi tool confirmation tool-unpublished is not pending.',
    );
  });

  it('cancels every pending decision when its conversation owner stops', async () => {
    const registry = new PiToolConfirmationRegistry();
    const first = registry.request('tool-first', () => undefined);
    const second = registry.request('tool-second', () => undefined);

    registry.cancelAll();

    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
  });

  it('cancels the exact pending decision when the owning turn aborts', async () => {
    const registry = new PiToolConfirmationRegistry();
    const controller = new AbortController();
    const decision = registry.request('tool-aborted', () => undefined, controller.signal);

    controller.abort();

    await expect(decision).resolves.toBe(false);
    expect(() => registry.resolve('tool-aborted', true)).toThrow(
      'Pi tool confirmation tool-aborted is not pending.',
    );
  });
});
