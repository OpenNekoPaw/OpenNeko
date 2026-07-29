export type DesktopResolvedTheme = 'light' | 'dark';

export const DESKTOP_BACKGROUND_COLORS = {
  light: '#ecefeb',
  dark: '#171918',
} as const satisfies Readonly<Record<DesktopResolvedTheme, string>>;

export function resolveDesktopBackgroundColor(
  shouldUseDarkColors: boolean,
): string {
  return shouldUseDarkColors
    ? DESKTOP_BACKGROUND_COLORS.dark
    : DESKTOP_BACKGROUND_COLORS.light;
}
