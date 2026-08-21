import { describe, expect, it, vi } from 'vitest';
import { createDesktopDevelopmentMainRestartPlugin } from '../../vite.main.config';

describe('Desktop development Main lifecycle', () => {
  it('watches every DSH runtime input and refreshes the closure before restarting Main', async () => {
    const requestRestart = vi.fn();
    const prepare = vi.fn();
    const plugin = createDesktopDevelopmentMainRestartPlugin('serve', requestRestart, {
      inputFiles: [
        '/repo/packages/dsh-bridge/src/index.ts',
        '/repo/packages/agent/contracts/src/dsh-acp.ts',
      ],
      prepare,
    });
    const addWatchFile = vi.fn();

    plugin.buildStart.call({ addWatchFile } as never);
    plugin.watchChange('/repo/packages/agent/contracts/src/dsh-acp.ts');
    plugin.writeBundle();

    expect(addWatchFile).toHaveBeenCalledWith('/repo/packages/dsh-bridge/src/index.ts');
    expect(addWatchFile).toHaveBeenCalledWith('/repo/packages/agent/contracts/src/dsh-acp.ts');
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(requestRestart).toHaveBeenCalledTimes(1);
    expect(prepare.mock.invocationCallOrder[0]).toBeLessThan(
      requestRestart.mock.invocationCallOrder[0] ?? Number.NaN,
    );
  });

  it('does not restart from closeBundle because Rollup also calls it after failed builds', () => {
    const plugin = createDesktopDevelopmentMainRestartPlugin('serve', vi.fn());

    expect(plugin.closeBundle).toBeUndefined();
  });

  it('restarts Main without rebuilding DSH when only ordinary Main input changed', () => {
    const requestRestart = vi.fn();
    const prepare = vi.fn();
    const plugin = createDesktopDevelopmentMainRestartPlugin('serve', requestRestart, {
      inputFiles: ['/repo/packages/dsh-bridge/src/index.ts'],
      prepare,
    });

    plugin.watchChange('/repo/apps/neko-desktop/src/main/index.ts');
    plugin.writeBundle();

    expect(prepare).not.toHaveBeenCalled();
    expect(requestRestart).toHaveBeenCalledTimes(1);
  });

  it('does not request an Electron restart for a production build', async () => {
    const requestRestart = vi.fn();
    const prepare = vi.fn();
    const plugin = createDesktopDevelopmentMainRestartPlugin('build', requestRestart, {
      inputFiles: ['/repo/packages/dsh-bridge/src/index.ts'],
      prepare,
    });
    const addWatchFile = vi.fn();

    plugin.buildStart.call({ addWatchFile } as never);
    plugin.writeBundle();

    expect(addWatchFile).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(requestRestart).not.toHaveBeenCalled();
  });

  it('does not restart Main when the refreshed DSH runtime cannot be prepared', () => {
    const requestRestart = vi.fn();
    const plugin = createDesktopDevelopmentMainRestartPlugin('serve', requestRestart, {
      inputFiles: ['/repo/packages/dsh-bridge/src/index.ts'],
      prepare: () => {
        throw new Error('DSH runtime qualification failed.');
      },
    });

    plugin.watchChange('/repo/packages/dsh-bridge/src/index.ts');
    expect(() => plugin.writeBundle()).toThrow('DSH runtime qualification failed.');
    expect(requestRestart).not.toHaveBeenCalled();
  });
});
