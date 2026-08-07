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

  it('uses exact renderer session identities and live lifecycle sequences', () => {
    const registry = new DesktopWindowRegistry();
    registry.register({
      windowId: 'window-1',
      webContentsId: 10,
      allowedOrigin: DESKTOP_APP_ORIGIN,
    });

    const firstLoading = registry.rendererLoading('window-1', 'app-1');
    expect(firstLoading).toMatchObject({
      sequence: 1,
      type: 'renderer-loading',
    });
    expect(firstLoading.rendererSessionId).not.toHaveLength(0);
    expect(registry.rendererReady('window-1', 'app-1')).toMatchObject({
      rendererSessionId: firstLoading.rendererSessionId,
      sequence: 2,
      type: 'renderer-ready',
    });
    const secondLoading = registry.rendererLoading('window-1', 'app-1');
    expect(secondLoading).toMatchObject({
      sequence: 3,
      type: 'renderer-loading',
    });
    expect(secondLoading.rendererSessionId).not.toBe(firstLoading.rendererSessionId);
  });

  it('rejects renderer-ready before the window starts loading', () => {
    const registry = new DesktopWindowRegistry();
    registry.register({
      windowId: 'window-1',
      webContentsId: 10,
      allowedOrigin: DESKTOP_APP_ORIGIN,
    });

    expect(() => registry.rendererReady('window-1', 'app-1')).toThrow(
      "Desktop window 'window-1' became ready before renderer loading.",
    );
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
