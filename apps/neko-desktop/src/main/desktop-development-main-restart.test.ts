import { describe, expect, it, vi } from 'vitest';
import { createDesktopDevelopmentMainRestartPlugin } from '../../vite.main.config';

describe('Desktop development Main lifecycle', () => {
  it('requests one Electron restart after a development Main rebuild', async () => {
    const requestRestart = vi.fn();
    const plugin = createDesktopDevelopmentMainRestartPlugin('serve', requestRestart);

    plugin.closeBundle();

    expect(requestRestart).toHaveBeenCalledTimes(1);
  });

  it('does not request an Electron restart for a production build', async () => {
    const requestRestart = vi.fn();
    const plugin = createDesktopDevelopmentMainRestartPlugin('build', requestRestart);

    plugin.closeBundle();

    expect(requestRestart).not.toHaveBeenCalled();
  });
});
