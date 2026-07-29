import { describe, expect, it, vi } from 'vitest';
import { createDesktopNativeThemeController } from './desktop-native-theme';

describe('createDesktopNativeThemeController', () => {
  it('uses the native appearance for startup and synchronizes existing windows', () => {
    const listeners = new Set<() => void>();
    const nativeTheme = {
      shouldUseDarkColors: false,
      on: vi.fn((_event: 'updated', listener: () => void) => {
        listeners.add(listener);
      }),
      removeListener: vi.fn((_event: 'updated', listener: () => void) => {
        listeners.delete(listener);
      }),
    };
    const first = {
      isDestroyed: () => false,
      setBackgroundColor: vi.fn(),
    };
    const destroyed = {
      isDestroyed: () => true,
      setBackgroundColor: vi.fn(),
    };
    const controller = createDesktopNativeThemeController({
      nativeTheme,
      listWindows: () => [first, destroyed],
    });

    expect(controller.backgroundColor).toBe('#ecefeb');
    nativeTheme.shouldUseDarkColors = true;
    for (const listener of listeners) listener();

    expect(controller.backgroundColor).toBe('#171918');
    expect(first.setBackgroundColor).toHaveBeenCalledWith('#171918');
    expect(destroyed.setBackgroundColor).not.toHaveBeenCalled();

    controller.dispose();
    expect(nativeTheme.removeListener).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });
});
