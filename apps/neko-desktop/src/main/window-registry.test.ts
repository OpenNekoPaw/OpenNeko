import { describe, expect, it, vi } from 'vitest';
import { DESKTOP_APP_ORIGIN } from './security';
import { DesktopWindowRegistry } from './window-registry';

describe('DesktopWindowRegistry', () => {
  it('resolves identity from the real sender and rejects unknown or foreign frames', () => {
    const registry = new DesktopWindowRegistry();
    const window = registry.register({
      windowId: 'window-1',
      webContentsId: 10,
      allowedOrigin: DESKTOP_APP_ORIGIN,
    });

    expect(
      registry.resolveSender({
        webContentsId: 10,
        frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
      }),
    ).toEqual(window);
    expect(() =>
      registry.resolveSender({
        webContentsId: 11,
        frameUrl: `${DESKTOP_APP_ORIGIN}/index.html`,
      }),
    ).toThrow("Unknown Desktop IPC sender '11'");
    expect(() =>
      registry.resolveSender({
        webContentsId: 10,
        frameUrl: 'https://example.com/',
      }),
    ).toThrow('unauthorized frame URL');
  });

  it('uses monotonic renderer epochs and lifecycle sequences', () => {
    const registry = new DesktopWindowRegistry();
    registry.register({
      windowId: 'window-1',
      webContentsId: 10,
      allowedOrigin: DESKTOP_APP_ORIGIN,
    });

    expect(registry.rendererLoading('window-1', 'app-1')).toMatchObject({
      rendererEpoch: 1,
      sequence: 1,
      type: 'renderer-loading',
    });
    expect(registry.rendererReady('window-1', 'app-1')).toMatchObject({
      rendererEpoch: 1,
      sequence: 2,
      type: 'renderer-ready',
    });
    expect(registry.rendererLoading('window-1', 'app-1')).toMatchObject({
      rendererEpoch: 2,
      sequence: 3,
      type: 'renderer-loading',
    });
  });

  it('disposes only the closed window owner and is idempotent', () => {
    const registry = new DesktopWindowRegistry();
    registry.register({
      windowId: 'window-1',
      webContentsId: 10,
      allowedOrigin: DESKTOP_APP_ORIGIN,
    });
    registry.register({
      windowId: 'window-2',
      webContentsId: 11,
      allowedOrigin: DESKTOP_APP_ORIGIN,
    });
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    registry.addDisposable('window-1', { dispose: firstDispose });
    registry.addDisposable('window-2', { dispose: secondDispose });

    registry.disposeWindow('window-1');
    registry.disposeWindow('window-1');

    expect(firstDispose).toHaveBeenCalledOnce();
    expect(secondDispose).not.toHaveBeenCalled();
    expect(registry.size).toBe(1);
    expect(registry.get('window-2').windowId).toBe('window-2');
  });
});
