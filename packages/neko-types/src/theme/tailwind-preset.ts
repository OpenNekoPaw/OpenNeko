/**
 * OpenNeko - Shared Tailwind CSS Preset
 *
 * Maps VSCode CSS variables to Tailwind utility classes.
 * Also injects --neko-* CSS design tokens and shared component base classes
 * via Tailwind plugin, so all webview packages get a unified token system.
 *
 * Usage in tailwind.config.js (or .ts):
 *   import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';
 *   export default { presets: [nekoTailwindPreset], content: [...] };
 *
 * Then use in JSX:
 *   <div className="bg-vscode-bg text-vscode-fg border-vscode-border" />
 *   <div className="neko-toolbar-btn active" />
 */

import plugin from 'tailwindcss/plugin';
import { vscodeCSSTokens, nekoDesignTokens } from './tokens';

/**
 * Tailwind preset with all VSCode theme color mappings and Neko design tokens.
 * Type is intentionally kept loose to avoid requiring tailwindcss as a dependency.
 */
export const nekoTailwindPreset = {
  content: [] as string[],
  theme: {
    extend: {
      colors: { ...vscodeCSSTokens.colors },
      fontFamily: { ...vscodeCSSTokens.fontFamily },
      fontSize: { ...vscodeCSSTokens.fontSize },
      borderRadius: { ...vscodeCSSTokens.borderRadius },
      boxShadow: { ...vscodeCSSTokens.boxShadow },
      backdropBlur: { ...vscodeCSSTokens.backdropBlur },
    },
  },
  plugins: [
    plugin(({ addBase, addComponents }) => {
      // Inject --neko-* CSS custom properties for all three VSCode theme modes
      addBase({
        ':root': nekoDesignTokens.dark as Record<string, string>,
        'body.vscode-light, body[data-vscode-theme-kind="vscode-light"], body[data-vscode-theme-kind="vscode-high-contrast-light"]':
          nekoDesignTokens.light as Record<string, string>,
        'body.vscode-high-contrast, body[data-vscode-theme-kind="vscode-high-contrast"]':
          nekoDesignTokens.highContrast as Record<string, string>,
      });

      // Inject shared component base CSS classes.
      // These are always included regardless of content scanning,
      // which is critical for components living in neko-types/src/components/.
      addComponents({
        // ── Vertical Toolbar ──────────────────────────────────────────────
        '.neko-vtoolbar': {
          display: 'flex',
          'flex-direction': 'column',
          'align-items': 'center',
          'padding-block': '4px',
          gap: '2px',
          background: 'var(--neko-surface)',
          'border-right': '1px solid var(--neko-border)',
          'flex-shrink': '0',
        },
        '.neko-toolbar-btn': {
          position: 'relative',
          width: '100%',
          height: '40px',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          background: 'none',
          border: 'none',
          'border-radius': 'var(--neko-radius-md)',
          cursor: 'pointer',
          color: 'var(--neko-fg-secondary)',
          transition: 'color 120ms ease, background 120ms ease',
          '&:hover:not(:disabled)': {
            background: 'var(--neko-hover)',
            color: 'var(--neko-fg)',
          },
          '&.active': {
            background: 'var(--neko-accent-soft)',
            color: 'var(--neko-accent)',
            'box-shadow': '0 0 0 1.5px var(--neko-accent-soft), 0 1px 4px var(--neko-accent-glow)',
          },
          '&:disabled': {
            opacity: '0.35',
            cursor: 'not-allowed',
          },
          // Active indicator bar on the left edge
          '&.active::before': {
            content: '""',
            position: 'absolute',
            left: '0',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '2px',
            height: '20px',
            'border-radius': '0 2px 2px 0',
            background: 'var(--neko-accent)',
          },
        },
        '.neko-toolbar-sep': {
          width: '20px',
          height: '1px',
          margin: '3px auto',
          background: 'var(--neko-divider)',
          'flex-shrink': '0',
        },
        '.neko-floating-toolbar': {
          display: 'flex',
          'align-items': 'center',
          gap: '6px',
          border: '1px solid var(--neko-toolbar-border)',
          'border-radius': '999px',
          background: 'var(--neko-toolbar-background)',
          'box-shadow': 'var(--neko-toolbar-shadow)',
          'pointer-events': 'auto',
          'scrollbar-width': 'none',
        },
        '.neko-floating-toolbar::-webkit-scrollbar': {
          display: 'none',
        },
        '.neko-floating-toolbar[data-orientation="vertical"]': {
          'flex-direction': 'column',
          padding: '10px 6px',
        },
        '.neko-floating-toolbar[data-orientation="horizontal"]': {
          'flex-direction': 'row',
          padding: '6px 10px',
        },
        '.neko-floating-toolbar[data-density="compact"]': {
          gap: '4px',
        },
        '.neko-floating-toolbar[data-density="compact"][data-orientation="horizontal"]': {
          padding: '4px 8px',
        },
        '.neko-floating-toolbar[data-density="compact"][data-orientation="vertical"]': {
          padding: '8px 4px',
        },
        '.neko-floating-toolbar .neko-toolbar-btn': {
          position: 'relative',
          width: '36px',
          height: '36px',
          flex: '0 0 auto',
          'border-radius': '999px',
          color: 'var(--neko-toolbar-foreground-secondary)',
        },
        '.neko-floating-toolbar[data-density="compact"] .neko-toolbar-btn': {
          width: '30px',
          height: '30px',
        },
        '.neko-toolbar-mode-group': {
          display: 'flex',
          'align-items': 'center',
          gap: '0',
          flex: '0 0 auto',
          padding: '2px',
          'border-radius': '999px',
          background:
            'color-mix(in srgb, var(--neko-toolbar-foreground-secondary) 10%, var(--neko-toolbar-background))',
          'box-shadow':
            'inset 0 0 0 1px color-mix(in srgb, var(--neko-toolbar-foreground-secondary) 18%, transparent)',
        },
        '.neko-floating-toolbar[data-orientation="vertical"] .neko-toolbar-mode-group': {
          'flex-direction': 'column',
        },
        '.neko-floating-toolbar[data-orientation="horizontal"] .neko-toolbar-mode-group': {
          'flex-direction': 'row',
        },
        '.neko-floating-toolbar .neko-toolbar-btn:hover:not(:disabled)': {
          color: 'var(--neko-toolbar-foreground)',
          background: 'var(--neko-toolbar-hover)',
        },
        '.neko-floating-toolbar .neko-toolbar-btn.active, .neko-floating-toolbar .neko-toolbar-btn[aria-pressed="true"]':
          {
            'border-color': 'transparent',
            color: 'var(--neko-toolbar-accent)',
            background: 'transparent',
            'box-shadow': 'none',
          },
        '.neko-floating-toolbar .neko-toolbar-btn.active::before, .neko-floating-toolbar .neko-toolbar-btn[aria-pressed="true"]::before':
          {
            content: 'none',
            display: 'none',
          },
        '.neko-floating-toolbar .neko-toolbar-btn.active::after, .neko-floating-toolbar .neko-toolbar-btn[aria-pressed="true"]::after':
          {
            content: '""',
            position: 'absolute',
            inset: '3px',
            'z-index': '0',
            border: '1px solid color-mix(in srgb, var(--neko-toolbar-accent) 55%, transparent)',
            'border-radius': '999px',
            background:
              'color-mix(in srgb, var(--neko-toolbar-accent) 18%, var(--neko-toolbar-background))',
            'box-shadow': '0 1px 5px var(--neko-toolbar-accent-glow)',
            'pointer-events': 'none',
          },
        '.neko-floating-toolbar[data-density="compact"] .neko-toolbar-btn.active::after, .neko-floating-toolbar[data-density="compact"] .neko-toolbar-btn[aria-pressed="true"]::after':
          {
            inset: '2px',
          },
        '.neko-floating-toolbar .neko-toolbar-btn > svg, .neko-floating-toolbar .neko-toolbar-btn > .codicon':
          {
            position: 'relative',
            'z-index': '1',
          },
        '.neko-floating-toolbar .neko-toolbar-sep': {
          flex: '0 0 auto',
          background: 'var(--neko-toolbar-divider)',
        },
        '.neko-floating-toolbar .neko-toolbar-sep[data-orientation="horizontal"]': {
          width: '26px',
          height: '1px',
          margin: '2px 0',
        },
        '.neko-floating-toolbar .neko-toolbar-sep[data-orientation="vertical"]': {
          width: '1px',
          height: '26px',
          margin: '0 2px',
        },
        '.neko-floating-toolbar[data-density="compact"] .neko-toolbar-sep[data-orientation="vertical"]':
          {
            height: '20px',
            margin: '0 1px',
          },

        // ── Collapsible Section ───────────────────────────────────────────
        '.neko-collapsible': {
          'border-bottom': '1px solid var(--neko-divider)',
          'flex-shrink': '0',
        },
        '.neko-collapsible-header': {
          display: 'flex',
          'align-items': 'center',
          gap: '5px',
          width: '100%',
          padding: '6px 10px 5px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          'user-select': 'none',
          color: 'var(--neko-fg-secondary)',
          'font-size': '11px',
          'font-weight': '600',
          'letter-spacing': '0.05em',
          'text-transform': 'uppercase',
          transition: 'background 100ms ease',
          '&:hover': { background: 'var(--neko-hover)' },
        },
        '.neko-collapsible-chevron': {
          transition: 'transform 150ms ease',
          'flex-shrink': '0',
          '&.expanded': { transform: 'rotate(90deg)' },
        },
        '.neko-collapsible-body': {
          padding: '4px 0 8px',
        },

        // ── Panel Shell ───────────────────────────────────────────────────
        '.neko-panel': {
          display: 'flex',
          'flex-direction': 'column',
          background: 'var(--neko-surface)',
          'flex-shrink': '0',
          overflow: 'hidden',
        },
        '.neko-panel-header': {
          padding: '8px 12px',
          'font-size': '11px',
          'font-weight': '600',
          'letter-spacing': '0.04em',
          'text-transform': 'uppercase',
          color: 'var(--neko-fg-secondary)',
          'border-bottom': '1px solid var(--neko-divider)',
          'flex-shrink': '0',
          'user-select': 'none',
        },
        '.neko-panel-body': {
          flex: '1',
          'overflow-y': 'auto',
        },
        '.neko-panel-section': {
          padding: '8px 12px',
          'border-bottom': '1px solid var(--neko-divider)',
        },
        '.neko-panel-section-title': {
          'font-size': '10px',
          'font-weight': '600',
          'letter-spacing': '0.06em',
          'text-transform': 'uppercase',
          color: 'var(--neko-fg-secondary)',
          'margin-bottom': '8px',
        },

        // ── Context Menu ──────────────────────────────────────────────────
        '.neko-menu': {
          position: 'fixed',
          'z-index': '9999',
          'min-width': '180px',
          padding: '5px',
          background: 'var(--neko-glass-bg)',
          'backdrop-filter': 'var(--neko-glass-blur)',
          '-webkit-backdrop-filter': 'var(--neko-glass-blur)',
          border: '1px solid var(--neko-glass-border)',
          'border-radius': 'var(--neko-radius-lg)',
          'box-shadow': 'var(--neko-glass-shadow)',
          outline: 'none',
        },
        '.neko-menu-item': {
          display: 'flex',
          'align-items': 'center',
          gap: '8px',
          width: '100%',
          height: '28px',
          padding: '0 6px 0 4px',
          background: 'none',
          border: 'none',
          'border-radius': 'var(--neko-radius-md)',
          cursor: 'pointer',
          color: 'var(--neko-fg)',
          'font-size': '13px',
          'text-align': 'left',
          transition: 'background 80ms ease',
          '&:hover:not(:disabled)': {
            background: 'var(--neko-accent)',
            color: '#fff',
          },
          '&:disabled': {
            opacity: '0.4',
            cursor: 'not-allowed',
          },
          '&.danger': {
            color: 'var(--neko-danger)',
            '&:hover:not(:disabled)': {
              background: 'var(--neko-danger)',
              color: '#fff',
            },
          },
        },
        '.neko-menu-item-icon': {
          width: '16px',
          'flex-shrink': '0',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
        },
        '.neko-menu-item-label': { flex: '1' },
        '.neko-menu-item-shortcut': {
          'font-size': '11px',
          color: 'var(--neko-fg-muted)',
          'padding-right': '4px',
        },
        '.neko-menu-item-arrow': {
          'font-size': '11px',
          color: 'var(--neko-fg-muted)',
        },
        '.neko-menu-sep': {
          height: '1px',
          margin: '4px 4px',
          background: 'var(--neko-glass-border)',
        },

        // ── Timeline Ruler ────────────────────────────────────────────────
        '.neko-ruler': {
          position: 'relative',
          overflow: 'hidden',
          background: 'var(--neko-surface)',
          'border-bottom': '1px solid var(--neko-border)',
          'flex-shrink': '0',
          cursor: 'pointer',
          'user-select': 'none',
        },
      });
    }),
  ],
};
