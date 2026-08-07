import { describe, expect, it, vi } from 'vitest';
import { createDesktopDevelopmentMainRestartPlugin } from '../../vite.main.config';

describe('Desktop development Main lifecycle', () => {
  it('requests one Electron restart after a development Main bundle is written', async () => {
    const requestRestart = vi.fn();
    const plugin = createDesktopDevelopmentMainRestartPlugin('serve', requestRestart);

    plugin.writeBundle();

    expect(requestRestart).toHaveBeenCalledTimes(1);
  });

  it('does not restart from closeBundle because Rollup also calls it after failed builds', () => {
    const plugin = createDesktopDevelopmentMainRestartPlugin('serve', vi.fn());

    expect(plugin.closeBundle).toBeUndefined();
  });

  it('does not request an Electron restart for a production build', async () => {
    const requestRestart = vi.fn();
    const plugin = createDesktopDevelopmentMainRestartPlugin('build', requestRestart);

    plugin.writeBundle();

    expect(requestRestart).not.toHaveBeenCalled();
  });
});
