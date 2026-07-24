import { describe, expect, it, vi } from 'vitest';
import { PreviewStopCoordinator } from './PreviewStopCoordinator';

describe('PreviewStopCoordinator', () => {
  it('coalesces concurrent stop requests for the same preview owner', async () => {
    const coordinator = new PreviewStopCoordinator<object>();
    const owner = {};
    let finish: (() => void) | undefined;
    const stop = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );

    const first = coordinator.run(owner, stop);
    const second = coordinator.run(owner, stop);

    expect(stop).toHaveBeenCalledTimes(1);
    finish?.();
    await Promise.all([first, second]);

    await coordinator.run(owner, stop.mockResolvedValueOnce());
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('allows a later retry after a failed stop', async () => {
    const coordinator = new PreviewStopCoordinator<object>();
    const owner = {};
    const stop = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('stop failed'))
      .mockResolvedValueOnce();

    await expect(coordinator.run(owner, stop)).rejects.toThrow('stop failed');
    await expect(coordinator.run(owner, stop)).resolves.toBeUndefined();
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
