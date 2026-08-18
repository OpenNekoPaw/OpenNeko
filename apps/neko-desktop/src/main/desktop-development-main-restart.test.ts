import { describe, expect, it, vi } from 'vitest';
import { createDesktopDevelopmentRestartPlugin } from '../../vite.development-restart';
import mainConfig from '../../vite.main.config';
import preloadConfig from '../../vite.preload.config';

describe('Desktop development Main lifecycle', () => {
  it('requests one Electron restart after a development Main bundle is written', async () => {
    const requestRestart = vi.fn();
    const plugin = createDesktopDevelopmentRestartPlugin('serve', requestRestart);

    plugin.writeBundle();

    expect(requestRestart).toHaveBeenCalledTimes(1);
  });

  it('does not restart from closeBundle because Rollup also calls it after failed builds', () => {
    const plugin = createDesktopDevelopmentRestartPlugin('serve', vi.fn());

    expect(plugin.closeBundle).toBeUndefined();
  });

  it('does not request an Electron restart for a production build', async () => {
    const requestRestart = vi.fn();
    const plugin = createDesktopDevelopmentRestartPlugin('build', requestRestart);

    plugin.writeBundle();

    expect(requestRestart).not.toHaveBeenCalled();
  });

  it('preserves the shared Main/Preload output directory across both builds', () => {
    const env = {
      command: 'serve' as const,
      mode: 'development',
      isPreview: false,
      isSsrBuild: false,
    };
    const resolvedMain = typeof mainConfig === 'function' ? mainConfig(env) : mainConfig;
    const resolvedPreload =
      typeof preloadConfig === 'function' ? preloadConfig(env) : preloadConfig;

    expect(resolvedMain.build?.emptyOutDir).toBe(false);
    expect(resolvedPreload.build?.emptyOutDir).toBe(false);
    expect(
      resolvedPreload.plugins?.flat().some(
        (plugin) =>
          typeof plugin === 'object' &&
          plugin !== null &&
          'name' in plugin &&
          plugin.name === 'openneko:desktop:restart-main-after-development-build',
      ),
    ).toBe(true);
  });
});
