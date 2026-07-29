import { describe, expect, it, vi } from 'vitest';

import { PiToolConfirmationRegistry } from './piToolConfirmationRegistry';

describe('PiToolConfirmationRegistry', () => {
  it('resolves the exact pending ToolCall decision', async () => {
    const registry = new PiToolConfirmationRegistry(1_000);
    const decision = registry.request('tool-1', () => registry.resolve('tool-1', true));

    await expect(decision).resolves.toBe(true);
    expect(() => registry.resolve('tool-1', true)).toThrow(
      'Pi tool confirmation tool-1 is not pending.',
    );
  });

  it('fails visibly when the Webview never returns a decision', async () => {
    vi.useFakeTimers();
    try {
      const registry = new PiToolConfirmationRegistry(100);
      const decision = registry.request('tool-stuck', () => undefined);
      const rejection = expect(decision).rejects.toThrow(
        'Pi tool confirmation tool-stuck timed out after 100ms without a user decision.',
      );

      await vi.advanceTimersByTimeAsync(100);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it('registers the decision before publishing the confirmation UI', async () => {
    const registry = new PiToolConfirmationRegistry(1_000);

    await expect(
      registry.request('tool-immediate', () => registry.resolve('tool-immediate', true)),
    ).resolves.toBe(true);
  });

  it('cancels the exact pending decision when UI publication fails', async () => {
    const registry = new PiToolConfirmationRegistry(1_000);
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
    const registry = new PiToolConfirmationRegistry(1_000);
    const first = registry.request('tool-first', () => undefined);
    const second = registry.request('tool-second', () => undefined);

    registry.cancelAll();

    await expect(Promise.all([first, second])).resolves.toEqual([false, false]);
  });
});
