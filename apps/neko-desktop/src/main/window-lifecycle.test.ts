import { describe, expect, it, vi } from 'vitest';
import {
  closeDesktopWindows,
  type DesktopClosableWindow,
} from './window-lifecycle';

describe('closeDesktopWindows', () => {
  it('waits for every live Window to close before resolving', async () => {
    const first = createWindow();
    const second = createWindow();

    const closePromise = closeDesktopWindows([first.window, second.window]);

    expect(first.close).toHaveBeenCalledOnce();
    expect(second.close).toHaveBeenCalledOnce();
    expect(first.closed).toHaveBeenCalledOnce();
    expect(second.closed).toHaveBeenCalledOnce();
    await expect(closePromise).resolves.toBeUndefined();
  });

  it('does not close an already destroyed Window', async () => {
    const destroyed = createWindow(true);

    await closeDesktopWindows([destroyed.window]);

    expect(destroyed.close).not.toHaveBeenCalled();
    expect(destroyed.once).not.toHaveBeenCalled();
  });

  it('rejects when closing a Window fails and removes the pending listener', async () => {
    const failure = new Error('close failed');
    const broken = createWindow(false, failure);

    await expect(closeDesktopWindows([broken.window])).rejects.toBe(failure);

    expect(broken.removeListener).toHaveBeenCalledWith('closed', expect.any(Function));
  });
});

function createWindow(
  destroyed = false,
  closeError?: Error,
): {
  readonly window: DesktopClosableWindow;
  readonly close: ReturnType<typeof vi.fn>;
  readonly closed: ReturnType<typeof vi.fn>;
  readonly once: ReturnType<typeof vi.fn>;
  readonly removeListener: ReturnType<typeof vi.fn>;
} {
  let closedListener: (() => void) | undefined;
  const closed = vi.fn();
  const once = vi.fn((_event: 'closed', listener: () => void) => {
    closedListener = () => {
      closed();
      listener();
    };
  });
  const removeListener = vi.fn();
  const close = vi.fn(() => {
    if (closeError) throw closeError;
    closedListener?.();
  });

  return {
    window: {
      isDestroyed: () => destroyed,
      once,
      removeListener,
      close,
    },
    close,
    closed,
    once,
    removeListener,
  };
}
