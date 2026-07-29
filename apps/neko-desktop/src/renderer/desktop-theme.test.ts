// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { nekoDesignTokens } from '@neko/shared/theme';
import {
  applyResolvedDesktopTheme,
  desktopNativeThemeTokens,
  startDesktopSystemTheme,
} from './desktop-theme';

describe('Desktop system theme', () => {
  it.each(['light', 'dark'] as const)(
    'projects the shared, Desktop and compatibility contract for %s',
    (theme) => {
      applyResolvedDesktopTheme(document, theme);

      const vscodeThemeKind = theme === 'dark' ? 'vscode-dark' : 'vscode-light';
      expect(document.documentElement.dataset.nekoTheme).toBe(theme);
      expect(document.documentElement.dataset.nekoHost).toBe('desktop');
      expect(document.documentElement.dataset.vscodeThemeKind).toBe(vscodeThemeKind);
      expect(document.body.dataset.vscodeThemeKind).toBe(vscodeThemeKind);
      expect(document.body.classList.contains(vscodeThemeKind)).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe(theme);
      expect(document.documentElement.style.getPropertyValue('--neko-surface')).toBe(
        nekoDesignTokens[theme]['--neko-surface'],
      );
      expect(document.documentElement.style.getPropertyValue('--neko-desktop-window')).toBe(
        desktopNativeThemeTokens[theme]['--neko-desktop-window'],
      );
      expect(document.documentElement.style.getPropertyValue('--vscode-editor-background')).toBe(
        'var(--neko-desktop-main)',
      );
      expect(document.documentElement.style.getPropertyValue('--vscode-panel-background')).toBe(
        'var(--neko-desktop-surface)',
      );
      expect(document.documentElement.style.getPropertyValue('--vscode-menu-background')).toBe(
        'var(--neko-desktop-overlay)',
      );
    },
  );

  it('follows operating-system appearance changes and releases the listener', () => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mediaQuery = {
      matches: false,
      addEventListener: vi.fn(
        (_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
          listeners.add(listener);
        },
      ),
      removeEventListener: vi.fn(
        (_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
          listeners.delete(listener);
        },
      ),
    };

    const dispose = startDesktopSystemTheme(document, mediaQuery);
    expect(document.documentElement.dataset.nekoTheme).toBe('light');

    mediaQuery.matches = true;
    for (const listener of listeners) {
      listener({ matches: true } as MediaQueryListEvent);
    }
    expect(document.documentElement.dataset.nekoTheme).toBe('dark');

    dispose();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  });
});
