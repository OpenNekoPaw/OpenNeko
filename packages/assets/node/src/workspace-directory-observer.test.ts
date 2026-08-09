import { describe, expect, it, vi } from 'vitest';
import {
  WorkspaceDirectoryObserver,
  type WorkspaceDirectoryWatchFactory,
} from './workspace-directory-observer';

describe('WorkspaceDirectoryObserver', () => {
  it('coalesces notifications into one authoritative reconciliation', async () => {
    vi.useFakeTimers();
    const fixture = createWatchFixture();
    const onInvalidated = vi.fn(async () => undefined);
    const observer = new WorkspaceDirectoryObserver({
      root: '/workspace',
      debounceMs: 20,
      watchFactory: fixture.watchFactory,
      onInvalidated,
      onError: vi.fn(),
    });

    fixture.notify();
    fixture.notify();
    fixture.notify();
    await vi.advanceTimersByTimeAsync(20);

    expect(onInvalidated).toHaveBeenCalledOnce();
    observer.dispose();
    expect(fixture.close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('runs one more reconciliation when invalidated during a read', async () => {
    vi.useFakeTimers();
    const fixture = createWatchFixture();
    let release: (() => void) | undefined;
    const onInvalidated = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)))
      .mockResolvedValue(undefined);
    const observer = new WorkspaceDirectoryObserver({
      root: '/workspace',
      debounceMs: 10,
      watchFactory: fixture.watchFactory,
      onInvalidated,
      onError: vi.fn(),
    });

    fixture.notify();
    await vi.advanceTimersByTimeAsync(10);
    fixture.notify();
    release?.();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(10);

    expect(onInvalidated).toHaveBeenCalledTimes(2);
    observer.dispose();
    vi.useRealTimers();
  });

  it('reports watcher and reconciliation failures without a successful empty projection', async () => {
    vi.useFakeTimers();
    const fixture = createWatchFixture();
    const onError = vi.fn();
    const observer = new WorkspaceDirectoryObserver({
      root: '/workspace',
      debounceMs: 5,
      watchFactory: fixture.watchFactory,
      onInvalidated: async () => {
        throw new Error('reconcile failed');
      },
      onError,
    });

    fixture.fail(new Error('watch failed'));
    fixture.notify();
    await vi.advanceTimersByTimeAsync(5);

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'watch failed' }));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'reconcile failed' }));
    observer.dispose();
    vi.useRealTimers();
  });

  it('does not report a pending reconciliation failure after disposal', async () => {
    vi.useFakeTimers();
    const fixture = createWatchFixture();
    let rejectReconciliation: ((error: Error) => void) | undefined;
    const onError = vi.fn();
    const observer = new WorkspaceDirectoryObserver({
      root: '/workspace',
      debounceMs: 5,
      watchFactory: fixture.watchFactory,
      onInvalidated: () =>
        new Promise<void>((_resolve, reject) => {
          rejectReconciliation = reject;
        }),
      onError,
    });

    fixture.notify();
    await vi.advanceTimersByTimeAsync(5);
    observer.dispose();
    rejectReconciliation?.(new Error('late reconcile failure'));
    await Promise.resolve();

    expect(onError).not.toHaveBeenCalled();
    expect(fixture.close).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});

function createWatchFixture(): {
  readonly watchFactory: WorkspaceDirectoryWatchFactory;
  readonly notify: () => void;
  readonly fail: (error: Error) => void;
  readonly close: ReturnType<typeof vi.fn>;
} {
  let listener: (() => void) | undefined;
  let errorListener: ((error: Error) => void) | undefined;
  const close = vi.fn();
  return {
    watchFactory: (_root, nextListener) => {
      listener = nextListener;
      return {
        close,
        on(_event, nextErrorListener) {
          errorListener = nextErrorListener;
          return this;
        },
      };
    },
    notify: () => listener?.(),
    fail: (error) => errorListener?.(error),
    close,
  };
}
