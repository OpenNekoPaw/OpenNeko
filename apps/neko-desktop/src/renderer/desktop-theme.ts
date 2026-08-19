import { nekoDesignTokens } from '@neko/ui/theme';
import {
  DESKTOP_BACKGROUND_COLORS,
  type DesktopResolvedTheme,
} from '../shared/desktop-presentation-contract';
import type { DesktopThemePreference } from '@neko/host/application-settings';

const DESKTOP_DARK_THEME_QUERY = '(prefers-color-scheme: dark)';

export interface DesktopThemeMediaQuery {
  readonly matches: boolean;
  addEventListener(type: 'change', listener: (event: { readonly matches: boolean }) => void): void;
  removeEventListener(
    type: 'change',
    listener: (event: { readonly matches: boolean }) => void,
  ): void;
}

export interface DesktopThemeController {
  update(preference: DesktopThemePreference): void;
  dispose(): void;
}

const desktopThemeGeometryTokens = {
  '--neko-desktop-radius-frame': '18px',
  '--neko-desktop-radius-panel': '14px',
  '--neko-desktop-radius-control': '10px',
  '--neko-desktop-accent-foreground': '#ffffff',
  '--neko-desktop-brand-start': '#183b31',
  '--neko-desktop-brand-end': '#2f7e64',
} as const;

export const desktopNativeThemeTokens = {
  light: {
    ...desktopThemeGeometryTokens,
    '--neko-desktop-window': DESKTOP_BACKGROUND_COLORS.light,
    '--neko-desktop-window-top': '#ffffff',
    '--neko-desktop-chrome': 'rgba(255, 255, 255, 0.96)',
    '--neko-desktop-main': '#ffffff',
    '--neko-desktop-surface': '#ffffff',
    '--neko-desktop-surface-raised': '#ffffff',
    '--neko-desktop-surface-muted': '#f7f7f6',
    '--neko-desktop-overlay': 'rgba(255, 255, 255, 0.97)',
    '--neko-desktop-control': 'rgba(31, 31, 30, 0.04)',
    '--neko-desktop-control-hover': 'rgba(31, 31, 30, 0.065)',
    '--neko-desktop-control-pressed': 'rgba(31, 31, 30, 0.10)',
    '--neko-desktop-border': 'rgba(0, 0, 0, 0.075)',
    '--neko-desktop-border-strong': 'rgba(0, 0, 0, 0.13)',
    '--neko-desktop-text-strong': '#20201f',
    '--neko-desktop-text': '#5f5f5c',
    '--neko-desktop-text-muted': '#858582',
    '--neko-desktop-text-subtle': '#9b9b98',
    '--neko-desktop-accent': '#5f6361',
    '--neko-desktop-accent-hover': '#4c504e',
    '--neko-desktop-accent-border': '#c7c9c8',
    '--neko-desktop-danger-foreground': '#7f3440',
    '--neko-desktop-danger-surface': '#fff0f1',
    '--neko-desktop-warning': '#c36b31',
    '--neko-desktop-status-neutral': '#a0a09d',
    '--neko-desktop-focus-ring': '0 0 0 3px rgba(80, 84, 82, 0.20)',
    '--neko-desktop-shadow-surface':
      '0 1px 2px rgba(0, 0, 0, 0.04), 0 12px 32px rgba(0, 0, 0, 0.07)',
    '--neko-desktop-shadow-overlay':
      '0 2px 8px rgba(0, 0, 0, 0.08), 0 22px 56px rgba(0, 0, 0, 0.15)',
  },
  dark: {
    ...desktopThemeGeometryTokens,
    '--neko-desktop-window': DESKTOP_BACKGROUND_COLORS.dark,
    '--neko-desktop-window-top': '#1d201f',
    '--neko-desktop-chrome': 'rgba(29, 32, 31, 0.90)',
    '--neko-desktop-main': '#1b1d1c',
    '--neko-desktop-surface': '#202321',
    '--neko-desktop-surface-raised': '#282b29',
    '--neko-desktop-surface-muted': '#242725',
    '--neko-desktop-overlay': 'rgba(40, 43, 41, 0.96)',
    '--neko-desktop-control': 'rgba(255, 255, 255, 0.055)',
    '--neko-desktop-control-hover': 'rgba(255, 255, 255, 0.09)',
    '--neko-desktop-control-pressed': 'rgba(255, 255, 255, 0.14)',
    '--neko-desktop-border': 'rgba(255, 255, 255, 0.085)',
    '--neko-desktop-border-strong': 'rgba(255, 255, 255, 0.16)',
    '--neko-desktop-text-strong': '#f2f4f2',
    '--neko-desktop-text': '#d5d9d6',
    '--neko-desktop-text-muted': '#a4aba6',
    '--neko-desktop-text-subtle': '#7f8782',
    '--neko-desktop-accent': '#65b89b',
    '--neko-desktop-accent-hover': '#78c8ac',
    '--neko-desktop-accent-border': '#3b6657',
    '--neko-desktop-danger-foreground': '#ffb3ba',
    '--neko-desktop-danger-surface': '#3a2327',
    '--neko-desktop-warning': '#e29a62',
    '--neko-desktop-status-neutral': '#6f7772',
    '--neko-desktop-focus-ring': '0 0 0 3px rgba(101, 184, 155, 0.28)',
    '--neko-desktop-shadow-surface':
      '0 1px 2px rgba(0, 0, 0, 0.28), 0 14px 34px rgba(0, 0, 0, 0.24)',
    '--neko-desktop-shadow-overlay':
      '0 2px 8px rgba(0, 0, 0, 0.34), 0 22px 58px rgba(0, 0, 0, 0.46)',
  },
} as const satisfies Readonly<Record<DesktopResolvedTheme, Readonly<Record<string, string>>>>;

const desktopWebviewThemeTokens = {
  light: {
    '--neko-foreground': '#20201f',
    '--neko-descriptionForeground': '#777774',
    '--neko-editor-foreground': '#20201f',
    '--neko-sideBar-foreground': '#555552',
    '--neko-input-foreground': '#20201f',
    '--neko-input-placeholderForeground': '#969693',
    '--neko-button-background': '#343735',
    '--neko-button-foreground': '#ffffff',
    '--neko-button-hoverBackground': '#242725',
    '--neko-button-secondaryForeground': '#4f5250',
    '--neko-focusBorder': '#6d716f',
    '--neko-list-activeSelectionBackground': '#f3f3f2',
    '--neko-list-activeSelectionForeground': '#20201f',
    '--neko-menu-foreground': '#20201f',
    '--neko-dropdown-foreground': '#20201f',
    '--neko-icon-foreground': '#6c6f6d',
    '--neko-scrollbarSlider-background': 'rgba(0, 0, 0, 0.12)',
    '--neko-scrollbarSlider-hoverBackground': 'rgba(0, 0, 0, 0.21)',
    '--neko-scrollbarSlider-activeBackground': 'rgba(0, 0, 0, 0.30)',
    '--neko-inputValidation-errorBackground': '#fff0f1',
  },
  dark: {
    '--neko-foreground': '#e7eae8',
    '--neko-descriptionForeground': '#a4aba6',
    '--neko-editor-foreground': '#e7eae8',
    '--neko-sideBar-foreground': '#d1d6d2',
    '--neko-input-foreground': '#e7eae8',
    '--neko-input-placeholderForeground': '#7f8782',
    '--neko-button-background': '#397f68',
    '--neko-button-foreground': '#ffffff',
    '--neko-button-hoverBackground': '#478f76',
    '--neko-button-secondaryForeground': '#d5d9d6',
    '--neko-focusBorder': '#65b89b',
    '--neko-list-activeSelectionBackground': '#29473c',
    '--neko-list-activeSelectionForeground': '#effaf5',
    '--neko-menu-foreground': '#e7eae8',
    '--neko-dropdown-foreground': '#e7eae8',
    '--neko-icon-foreground': '#a4aba6',
    '--neko-scrollbarSlider-background': 'rgba(214, 224, 218, 0.14)',
    '--neko-scrollbarSlider-hoverBackground': 'rgba(214, 224, 218, 0.24)',
    '--neko-scrollbarSlider-activeBackground': 'rgba(214, 224, 218, 0.34)',
    '--neko-inputValidation-errorBackground': '#3a2327',
  },
} as const satisfies Readonly<Record<DesktopResolvedTheme, Readonly<Record<string, string>>>>;

const desktopWebviewSharedThemeTokens = {
  '--neko-editor-background': 'var(--neko-desktop-main)',
  '--neko-sideBar-background': 'var(--neko-desktop-surface-muted)',
  '--neko-sideBar-border': 'var(--neko-desktop-border)',
  '--neko-editorWidget-background': 'var(--neko-desktop-surface-raised)',
  '--neko-editorWidget-border': 'var(--neko-desktop-border)',
  '--neko-panel-background': 'var(--neko-desktop-surface)',
  '--neko-panel-border': 'var(--neko-desktop-border)',
  '--neko-input-background': 'var(--neko-desktop-surface-raised)',
  '--neko-input-border': 'var(--neko-desktop-border-strong)',
  '--neko-button-secondaryBackground': 'var(--neko-desktop-control)',
  '--neko-button-secondaryHoverBackground': 'var(--neko-desktop-control-hover)',
  '--neko-list-hoverBackground': 'var(--neko-desktop-control-hover)',
  '--neko-list-inactiveSelectionBackground': 'var(--neko-desktop-control)',
  '--neko-menu-background': 'var(--neko-desktop-overlay)',
  '--neko-dropdown-background': 'var(--neko-desktop-surface-raised)',
  '--neko-dropdown-border': 'var(--neko-desktop-border)',
  '--neko-widget-border': 'var(--neko-desktop-border)',
  '--neko-toolbar-hoverBackground': 'var(--neko-desktop-control-hover)',
  '--neko-toolbar-activeBackground': 'var(--neko-desktop-control-pressed)',
  '--neko-font-family': '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
  '--neko-font-size': '13px',
} as const;

export function applyResolvedDesktopTheme(target: Document, theme: DesktopResolvedTheme): void {
  const root = target.documentElement;
  const nekoThemeKind = theme === 'dark' ? 'neko-dark' : 'neko-light';
  root.dataset.nekoTheme = theme;
  root.dataset.nekoHost = 'desktop';
  root.dataset.nekoThemeKind = nekoThemeKind;
  target.body.dataset.nekoThemeKind = nekoThemeKind;
  target.body.classList.remove('neko-light', 'neko-dark');
  target.body.classList.add(nekoThemeKind);
  root.style.colorScheme = theme;

  applyTokens(root, nekoDesignTokens[theme]);
  applyTokens(root, desktopNativeThemeTokens[theme]);
  applyTokens(root, desktopWebviewSharedThemeTokens);
  applyTokens(root, desktopWebviewThemeTokens[theme]);
}

export function startDesktopSystemTheme(
  target: Document,
  providedMediaQuery?: DesktopThemeMediaQuery,
): () => void {
  return startDesktopTheme(target, 'system', providedMediaQuery).dispose;
}

export function startDesktopTheme(
  target: Document,
  initialPreference: DesktopThemePreference,
  providedMediaQuery?: DesktopThemeMediaQuery,
): DesktopThemeController {
  const mediaQuery = providedMediaQuery ?? target.defaultView?.matchMedia(DESKTOP_DARK_THEME_QUERY);
  if (!mediaQuery) {
    throw new Error('Desktop system theme requires matchMedia support.');
  }
  let preference = initialPreference;
  const applyPreference = (matches: boolean): void => {
    applyResolvedDesktopTheme(
      target,
      preference === 'system' ? (matches ? 'dark' : 'light') : preference,
    );
  };
  const applySystemTheme = (event: { readonly matches: boolean }): void => {
    if (preference === 'system') applyPreference(event.matches);
  };
  applyPreference(mediaQuery.matches);
  mediaQuery.addEventListener('change', applySystemTheme);
  let disposed = false;
  return {
    update(nextPreference) {
      if (disposed) throw new Error('Desktop theme controller is disposed.');
      preference = nextPreference;
      applyPreference(mediaQuery.matches);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mediaQuery.removeEventListener('change', applySystemTheme);
    },
  };
}

function applyTokens(root: HTMLElement, tokens: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
}
