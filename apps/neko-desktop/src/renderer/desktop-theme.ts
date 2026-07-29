import { nekoDesignTokens } from '@neko/shared/theme';
import {
  DESKTOP_BACKGROUND_COLORS,
  type DesktopResolvedTheme,
} from '../shared/desktop-presentation-contract';

export const DESKTOP_DARK_THEME_QUERY = '(prefers-color-scheme: dark)';

export interface DesktopThemeMediaQuery {
  readonly matches: boolean;
  addEventListener(
    type: 'change',
    listener: (event: { readonly matches: boolean }) => void,
  ): void;
  removeEventListener(
    type: 'change',
    listener: (event: { readonly matches: boolean }) => void,
  ): void;
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
    '--neko-desktop-window-top': '#f4f6f3',
    '--neko-desktop-chrome': 'rgba(244, 246, 243, 0.88)',
    '--neko-desktop-main': '#f8faf7',
    '--neko-desktop-surface': '#fbfcfa',
    '--neko-desktop-surface-raised': '#ffffff',
    '--neko-desktop-surface-muted': '#f1f4f0',
    '--neko-desktop-overlay': 'rgba(255, 255, 255, 0.94)',
    '--neko-desktop-control': 'rgba(35, 48, 41, 0.055)',
    '--neko-desktop-control-hover': 'rgba(35, 48, 41, 0.09)',
    '--neko-desktop-control-pressed': 'rgba(35, 48, 41, 0.14)',
    '--neko-desktop-border': 'rgba(35, 48, 41, 0.10)',
    '--neko-desktop-border-strong': 'rgba(35, 48, 41, 0.17)',
    '--neko-desktop-text-strong': '#1c211f',
    '--neko-desktop-text': '#525a56',
    '--neko-desktop-text-muted': '#89908c',
    '--neko-desktop-text-subtle': '#969d99',
    '--neko-desktop-accent': '#397f68',
    '--neko-desktop-accent-hover': '#2f705b',
    '--neko-desktop-accent-border': '#b8d0c6',
    '--neko-desktop-danger-foreground': '#7f3440',
    '--neko-desktop-danger-surface': '#fff0f1',
    '--neko-desktop-warning': '#c36b31',
    '--neko-desktop-status-neutral': '#9fa6a2',
    '--neko-desktop-focus-ring': '0 0 0 3px rgba(45, 119, 95, 0.24)',
    '--neko-desktop-shadow-surface':
      '0 1px 2px rgba(24, 35, 29, 0.05), 0 12px 32px rgba(24, 35, 29, 0.075)',
    '--neko-desktop-shadow-overlay':
      '0 2px 8px rgba(24, 35, 29, 0.09), 0 22px 56px rgba(24, 35, 29, 0.16)',
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
} as const satisfies Readonly<
  Record<DesktopResolvedTheme, Readonly<Record<string, string>>>
>;

const electronWebviewCompatibilityTokens = {
  light: {
    '--vscode-foreground': '#1f2321',
    '--vscode-descriptionForeground': '#717773',
    '--vscode-editor-foreground': '#1f2321',
    '--vscode-sideBar-foreground': '#3f4843',
    '--vscode-input-foreground': '#1f2321',
    '--vscode-input-placeholderForeground': '#929995',
    '--vscode-button-background': '#2d775f',
    '--vscode-button-foreground': '#ffffff',
    '--vscode-button-hoverBackground': '#24644f',
    '--vscode-button-secondaryForeground': '#34413b',
    '--vscode-focusBorder': '#397f68',
    '--vscode-list-activeSelectionBackground': '#dfeae5',
    '--vscode-list-activeSelectionForeground': '#183e31',
    '--vscode-menu-foreground': '#1f2321',
    '--vscode-dropdown-foreground': '#1f2321',
    '--vscode-icon-foreground': '#66716b',
    '--vscode-scrollbarSlider-background': 'rgba(53, 68, 60, 0.14)',
    '--vscode-scrollbarSlider-hoverBackground': 'rgba(53, 68, 60, 0.24)',
    '--vscode-scrollbarSlider-activeBackground': 'rgba(53, 68, 60, 0.32)',
    '--vscode-inputValidation-errorBackground': '#fff0f1',
  },
  dark: {
    '--vscode-foreground': '#e7eae8',
    '--vscode-descriptionForeground': '#a4aba6',
    '--vscode-editor-foreground': '#e7eae8',
    '--vscode-sideBar-foreground': '#d1d6d2',
    '--vscode-input-foreground': '#e7eae8',
    '--vscode-input-placeholderForeground': '#7f8782',
    '--vscode-button-background': '#397f68',
    '--vscode-button-foreground': '#ffffff',
    '--vscode-button-hoverBackground': '#478f76',
    '--vscode-button-secondaryForeground': '#d5d9d6',
    '--vscode-focusBorder': '#65b89b',
    '--vscode-list-activeSelectionBackground': '#29473c',
    '--vscode-list-activeSelectionForeground': '#effaf5',
    '--vscode-menu-foreground': '#e7eae8',
    '--vscode-dropdown-foreground': '#e7eae8',
    '--vscode-icon-foreground': '#a4aba6',
    '--vscode-scrollbarSlider-background': 'rgba(214, 224, 218, 0.14)',
    '--vscode-scrollbarSlider-hoverBackground': 'rgba(214, 224, 218, 0.24)',
    '--vscode-scrollbarSlider-activeBackground': 'rgba(214, 224, 218, 0.34)',
    '--vscode-inputValidation-errorBackground': '#3a2327',
  },
} as const satisfies Readonly<
  Record<DesktopResolvedTheme, Readonly<Record<string, string>>>
>;

const electronWebviewSharedCompatibilityTokens = {
  '--vscode-editor-background': 'var(--neko-desktop-main)',
  '--vscode-sideBar-background': 'var(--neko-desktop-surface-muted)',
  '--vscode-sideBar-border': 'var(--neko-desktop-border)',
  '--vscode-editorWidget-background': 'var(--neko-desktop-surface-raised)',
  '--vscode-editorWidget-border': 'var(--neko-desktop-border)',
  '--vscode-panel-background': 'var(--neko-desktop-surface)',
  '--vscode-panel-border': 'var(--neko-desktop-border)',
  '--vscode-input-background': 'var(--neko-desktop-surface-raised)',
  '--vscode-input-border': 'var(--neko-desktop-border-strong)',
  '--vscode-button-secondaryBackground': 'var(--neko-desktop-control)',
  '--vscode-button-secondaryHoverBackground': 'var(--neko-desktop-control-hover)',
  '--vscode-list-hoverBackground': 'var(--neko-desktop-control-hover)',
  '--vscode-list-inactiveSelectionBackground': 'var(--neko-desktop-control)',
  '--vscode-menu-background': 'var(--neko-desktop-overlay)',
  '--vscode-dropdown-background': 'var(--neko-desktop-surface-raised)',
  '--vscode-dropdown-border': 'var(--neko-desktop-border)',
  '--vscode-widget-border': 'var(--neko-desktop-border)',
  '--vscode-toolbar-hoverBackground': 'var(--neko-desktop-control-hover)',
  '--vscode-toolbar-activeBackground': 'var(--neko-desktop-control-pressed)',
  '--vscode-font-family':
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
  '--vscode-font-size': '13px',
} as const;

export function applyResolvedDesktopTheme(
  target: Document,
  theme: DesktopResolvedTheme,
): void {
  const root = target.documentElement;
  const vscodeThemeKind = theme === 'dark' ? 'vscode-dark' : 'vscode-light';
  root.dataset.nekoTheme = theme;
  root.dataset.nekoHost = 'desktop';
  root.dataset.vscodeThemeKind = vscodeThemeKind;
  target.body.dataset.vscodeThemeKind = vscodeThemeKind;
  target.body.classList.remove('vscode-light', 'vscode-dark');
  target.body.classList.add(vscodeThemeKind);
  root.style.colorScheme = theme;

  applyTokens(root, nekoDesignTokens[theme]);
  applyTokens(root, desktopNativeThemeTokens[theme]);
  applyTokens(root, electronWebviewSharedCompatibilityTokens);
  applyTokens(root, electronWebviewCompatibilityTokens[theme]);
}

export function startDesktopSystemTheme(
  target: Document,
  providedMediaQuery?: DesktopThemeMediaQuery,
): () => void {
  const mediaQuery =
    providedMediaQuery ?? target.defaultView?.matchMedia(DESKTOP_DARK_THEME_QUERY);
  if (!mediaQuery) {
    throw new Error('Desktop system theme requires matchMedia support.');
  }
  const applySystemTheme = (event: { readonly matches: boolean }): void => {
    applyResolvedDesktopTheme(target, event.matches ? 'dark' : 'light');
  };
  applySystemTheme(mediaQuery);
  mediaQuery.addEventListener('change', applySystemTheme);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    mediaQuery.removeEventListener('change', applySystemTheme);
  };
}

function applyTokens(
  root: HTMLElement,
  tokens: Readonly<Record<string, string>>,
): void {
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
}
