import { resolveDesktopBackgroundColor } from '../shared/desktop-presentation-contract';

export interface DesktopNativeThemeSource {
  readonly shouldUseDarkColors: boolean;
  on(event: 'updated', listener: () => void): unknown;
  removeListener(event: 'updated', listener: () => void): unknown;
}

export interface DesktopNativeThemeWindow {
  isDestroyed(): boolean;
  setBackgroundColor(color: string): void;
}

export interface DesktopNativeThemeController {
  readonly backgroundColor: string;
  dispose(): void;
}

export function createDesktopNativeThemeController(input: {
  readonly nativeTheme: DesktopNativeThemeSource;
  readonly listWindows: () => Iterable<DesktopNativeThemeWindow>;
}): DesktopNativeThemeController {
  const synchronizeWindowBackgrounds = (): void => {
    const backgroundColor = resolveDesktopBackgroundColor(input.nativeTheme.shouldUseDarkColors);
    for (const window of input.listWindows()) {
      if (!window.isDestroyed()) window.setBackgroundColor(backgroundColor);
    }
  };
  input.nativeTheme.on('updated', synchronizeWindowBackgrounds);
  let disposed = false;
  return {
    get backgroundColor() {
      return resolveDesktopBackgroundColor(input.nativeTheme.shouldUseDarkColors);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      input.nativeTheme.removeListener('updated', synchronizeWindowBackgrounds);
    },
  };
}
