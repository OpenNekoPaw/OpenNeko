import type { CSSProperties } from 'react';

export const MENU_SURFACE_STYLE = {
  minWidth: 200,
  padding: 5,
  border:
    '1px solid var(--neko-menu-border, var(--neko-menu-border, var(--neko-contrastBorder, var(--glass-border, var(--neko-glass-border, var(--neko-border, rgba(255, 255, 255, 0.16)))))))',
  borderRadius: 'var(--radius-lg, var(--neko-radius-md, 10px))',
  background:
    'var(--neko-menu-background, var(--neko-menu-background, var(--neko-editorWidget-background, var(--glass-bg, var(--neko-glass-bg, rgba(32, 32, 36, 0.88))))))',
  backdropFilter: 'var(--glass-blur, var(--neko-glass-blur, blur(22px) saturate(180%)))',
  WebkitBackdropFilter: 'var(--glass-blur, var(--neko-glass-blur, blur(22px) saturate(180%)))',
  boxShadow:
    'var(--glass-shadow, var(--neko-glass-shadow, 0 16px 52px rgba(0, 0, 0, 0.42), 0 2px 8px rgba(0, 0, 0, 0.24)))',
  color:
    'var(--neko-menu-foreground, var(--neko-menu-foreground, var(--neko-foreground, var(--toolbar-fg, var(--neko-fg, inherit)))))',
  outline: 'none',
} satisfies CSSProperties;

export const MENU_ACTION_INTERACTIVE_STYLE = {
  background:
    'var(--neko-menu-selectionBackground, var(--neko-menu-selectionBackground, var(--button-bg, var(--neko-accent, #0a84ff))))',
  color:
    'var(--neko-menu-selectionForeground, var(--neko-menu-selectionForeground, var(--button-fg, #ffffff)))',
  outline: 'none',
} satisfies CSSProperties;

export const MENU_ACTION_DANGER_STYLE = {
  color: 'var(--neko-errorForeground, var(--neko-danger, #ff453a))',
} satisfies CSSProperties;

export const MENU_ACTION_DANGER_INTERACTIVE_STYLE = {
  background: 'var(--neko-danger, var(--neko-errorForeground, #ff453a))',
  color: '#ffffff',
} satisfies CSSProperties;

export const MENU_ACTION_DISABLED_STYLE = {
  cursor: 'not-allowed',
  opacity: 0.38,
  pointerEvents: 'none',
} satisfies CSSProperties;

export const MENU_SHORTCUT_STYLE = {
  flexShrink: 0,
  color: 'currentColor',
  opacity: 0.64,
} satisfies CSSProperties;

export const MENU_SEPARATOR_STYLE = {
  height: 1,
  margin: '4px 5px',
  background:
    'var(--neko-menu-separatorBackground, var(--neko-menu-separatorBackground, var(--panel-divider, var(--neko-divider, var(--neko-border, rgba(255, 255, 255, 0.12))))))',
} satisfies CSSProperties;
