/**
 * Theme Design Tokens
 *
 * Single source of truth for Neko CSS variable mappings.
 * Used by:
 * 1. Tailwind preset (all webview tailwind.config.js)
 * 2. Runtime CSS variable access
 * 3. Documentation
 *
 * Token names match the Tailwind utility class names:
 *   bg-neko-bg, text-neko-fg, border-neko-border, etc.
 *
 * Layer 0: Zero dependencies.
 */

export const nekoCSSTokens = {
  colors: {
    // Editor
    'neko-bg': 'var(--neko-editor-background)',
    'neko-fg': 'var(--neko-editor-foreground)',

    // Panel
    'neko-panel-bg': 'var(--neko-panel-background)',
    'neko-panel-border': 'var(--neko-panel-border)',
    'neko-panel-title': 'var(--neko-panelTitle-activeForeground)',

    // Sidebar
    'neko-sidebar-bg': 'var(--neko-sideBar-background)',
    'neko-sidebar-fg': 'var(--neko-sideBar-foreground)',
    'neko-sidebar-border': 'var(--neko-sideBar-border)',

    // List
    'neko-list-hover': 'var(--neko-list-hoverBackground)',
    'neko-list-active': 'var(--neko-list-activeSelectionBackground)',
    'neko-list-active-fg': 'var(--neko-list-activeSelectionForeground)',
    'neko-list-inactive': 'var(--neko-list-inactiveSelectionBackground)',

    // Input
    'neko-input-bg': 'var(--neko-input-background)',
    'neko-input-fg': 'var(--neko-input-foreground)',
    'neko-input-border': 'var(--neko-input-border)',
    'neko-input-placeholder': 'var(--neko-input-placeholderForeground)',

    // Button
    'neko-button': 'var(--neko-button-background)',
    'neko-button-fg': 'var(--neko-button-foreground)',
    'neko-button-hover': 'var(--neko-button-hoverBackground)',
    'neko-button-secondary': 'var(--neko-button-secondaryBackground)',
    'neko-button-secondary-fg': 'var(--neko-button-secondaryForeground)',
    'neko-button-secondary-hover': 'var(--neko-button-secondaryHoverBackground)',

    // Focus / Accent
    'neko-accent': 'var(--neko-focusBorder)',
    'neko-focus': 'var(--neko-focusBorder)',

    // Badge
    'neko-badge-bg': 'var(--neko-badge-background)',
    'neko-badge-fg': 'var(--neko-badge-foreground)',

    // Icon
    'neko-icon': 'var(--neko-icon-foreground)',

    // Status
    'neko-error': 'var(--neko-errorForeground)',
    'neko-warning': 'var(--neko-editorWarning-foreground)',
    'neko-info': 'var(--neko-editorInfo-foreground)',

    // Toolbar
    'neko-toolbar-bg': 'var(--neko-toolbar-hoverBackground)',
    'neko-toolbar-active': 'var(--neko-toolbar-activeBackground)',

    // Dropdown
    'neko-dropdown-bg': 'var(--neko-dropdown-background)',
    'neko-dropdown-fg': 'var(--neko-dropdown-foreground)',
    'neko-dropdown-border': 'var(--neko-dropdown-border)',

    // Widget
    'neko-widget-bg': 'var(--neko-editorWidget-background)',
    'neko-widget-border': 'var(--neko-editorWidget-border)',

    // Description text
    'neko-description': 'var(--neko-descriptionForeground)',

    // Scrollbar
    'neko-scrollbar': 'var(--neko-scrollbarSlider-background)',
    'neko-scrollbar-hover': 'var(--neko-scrollbarSlider-hoverBackground)',
    'neko-scrollbar-active': 'var(--neko-scrollbarSlider-activeBackground)',

    // Diff editor
    'neko-diff-inserted': 'var(--neko-diffEditor-insertedLineBackground)',
    'neko-diff-removed': 'var(--neko-diffEditor-removedLineBackground)',
    'neko-diff-inserted-fg': 'var(--neko-gitDecoration-addedResourceForeground)',
    'neko-diff-removed-fg': 'var(--neko-gitDecoration-deletedResourceForeground)',
    'neko-diff-modified-fg': 'var(--neko-gitDecoration-modifiedResourceForeground)',

    // Charts (status color encoding)
    'neko-chart-green': 'var(--neko-charts-green)',
    'neko-chart-red': 'var(--neko-charts-red)',
    'neko-chart-blue': 'var(--neko-charts-blue)',
    'neko-chart-yellow': 'var(--neko-charts-yellow)',
    'neko-chart-purple': 'var(--neko-charts-purple)',

    // Compatibility token alias
    'neko-border': 'var(--neko-panel-border)',

    // macOS surface colors (theme-aware via CSS variables)
    'neko-glass': 'var(--neko-glass, rgba(255, 255, 255, 0.08))',
    'neko-glass-hover': 'var(--neko-glass-hover, rgba(255, 255, 255, 0.12))',
    'neko-glass-active': 'var(--neko-glass-active, rgba(255, 255, 255, 0.16))',
    'neko-surface': 'var(--neko-surface, rgba(255, 255, 255, 0.05))',
    'neko-surface-hover': 'var(--neko-surface-hover, rgba(255, 255, 255, 0.08))',

    // Preview player colors (theme-aware via CSS variables)
    'neko-preview-primary': 'var(--neko-preview-primary, #0A84FF)',
    'neko-preview-primary-hover': 'var(--neko-preview-primary-hover, #409CFF)',
    'neko-preview-primary-active': 'var(--neko-preview-primary-active, #0070E0)',
    'neko-preview-text-primary': 'var(--neko-preview-text-primary, rgba(255, 255, 255, 0.9))',
    'neko-preview-text-secondary': 'var(--neko-preview-text-secondary, rgba(255, 255, 255, 0.6))',
    'neko-preview-text-tertiary': 'var(--neko-preview-text-tertiary, rgba(255, 255, 255, 0.4))',
    'neko-preview-accent': 'var(--neko-preview-accent, #0e639c)',
    'neko-preview-accent-hover': 'var(--neko-preview-accent-hover, #1177bb)',
    'neko-preview-surface': 'var(--neko-preview-surface, rgba(255, 255, 255, 0.05))',
    'neko-preview-bg': 'var(--neko-preview-bg, #1a1a1a)',
  },

  fontFamily: {
    neko: 'var(--neko-font-family)',
    'neko-editor': 'var(--neko-editor-font-family)',
  },

  fontSize: {
    neko: 'var(--neko-font-size)',
    'neko-editor': 'var(--neko-editor-font-size)',
  },

  // macOS Design Tokens
  borderRadius: {
    'neko-sm': '6px',
    'neko-md': '8px',
    'neko-lg': '10px',
    'neko-xl': '12px',
  },

  boxShadow: {
    'neko-sm': '0 1px 3px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)',
    'neko-md': '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0.06)',
    'neko-lg': '0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
    'neko-xl': '0 20px 25px rgba(0, 0, 0, 0.15), 0 10px 10px rgba(0, 0, 0, 0.04)',
  },

  backdropBlur: {
    'neko-glass': 'blur(20px)',
    'neko-glass-sm': 'blur(10px)',
  },
} as const;

// =============================================================================
// Neko Design Token System
// CSS custom properties injected via Tailwind addBase plugin.
// UI primitives reference these --neko-* variables.
// Covers dark (default), light, and high-contrast Neko themes.
// =============================================================================

export const nekoDesignTokens = {
  dark: {
    // Surface layers
    '--neko-surface': 'var(--neko-sideBar-background, #242426)',
    '--neko-elevated': 'var(--neko-editorWidget-background, #2c2c2e)',
    // Glass material (frosted glass panels / menus)
    '--neko-glass-bg': 'rgba(30, 30, 32, 0.88)',
    '--neko-glass-border': 'rgba(255, 255, 255, 0.09)',
    '--neko-glass-blur': 'blur(20px) saturate(180%)',
    '--neko-glass-shadow':
      '0 20px 60px rgba(0,0,0,0.55), 0 6px 20px rgba(0,0,0,0.40), 0 1px 4px rgba(0,0,0,0.25)',
    // Text
    '--neko-fg': 'var(--neko-editor-foreground, #e8e8ed)',
    '--neko-fg-secondary': 'var(--neko-descriptionForeground, #8e8e93)',
    '--neko-fg-muted': 'rgba(232, 232, 237, 0.38)',
    // Interactive
    '--neko-accent': 'var(--neko-focusBorder, #0a84ff)',
    '--neko-accent-soft': 'color-mix(in srgb, var(--neko-accent) 16%, transparent)',
    '--neko-accent-glow': 'color-mix(in srgb, var(--neko-accent) 35%, transparent)',
    '--neko-hover': 'rgba(255, 255, 255, 0.06)',
    '--neko-danger': '#ff453a',
    '--neko-danger-hover': '#ff6961',
    // Border
    '--neko-border': 'rgba(255, 255, 255, 0.08)',
    '--neko-divider': 'rgba(255, 255, 255, 0.06)',
    // Shadow scale
    '--neko-shadow-sm': '0 2px 6px rgba(0,0,0,0.38), 0 1px 2px rgba(0,0,0,0.28)',
    '--neko-shadow-md': '0 4px 14px rgba(0,0,0,0.44), 0 2px 6px rgba(0,0,0,0.32)',
    '--neko-shadow-lg': '0 12px 32px rgba(0,0,0,0.52), 0 4px 12px rgba(0,0,0,0.36)',
    '--neko-shadow-xl': '0 24px 64px rgba(0,0,0,0.60), 0 8px 24px rgba(0,0,0,0.44)',
    // Floating toolbar
    '--neko-toolbar-background':
      'color-mix(in srgb, var(--neko-surface) 94%, var(--neko-elevated) 6%)',
    '--neko-toolbar-border': 'var(--neko-glass-border)',
    '--neko-toolbar-foreground': 'var(--neko-fg)',
    '--neko-toolbar-foreground-secondary': 'var(--neko-fg-secondary)',
    '--neko-toolbar-hover': 'var(--neko-hover)',
    '--neko-toolbar-accent': 'var(--neko-accent)',
    '--neko-toolbar-accent-glow': 'var(--neko-accent-glow)',
    '--neko-toolbar-divider': 'var(--neko-divider)',
    '--neko-toolbar-shadow': 'var(--neko-shadow-md)',
    // Radius scale
    '--neko-radius-sm': '6px',
    '--neko-radius-md': '8px',
    '--neko-radius-lg': '12px',
    '--neko-radius-xl': '16px',
  },
  light: {
    '--neko-surface': 'var(--neko-sideBar-background, #ebebed)',
    '--neko-elevated': 'var(--neko-editorWidget-background, #ffffff)',
    '--neko-glass-bg': 'rgba(242, 242, 247, 0.92)',
    '--neko-glass-border': 'rgba(0, 0, 0, 0.08)',
    '--neko-glass-blur': 'blur(20px) saturate(180%)',
    '--neko-glass-shadow': '0 20px 60px rgba(0,0,0,0.20), 0 6px 20px rgba(0,0,0,0.12)',
    '--neko-fg': 'var(--neko-editor-foreground, #1c1c1e)',
    '--neko-fg-secondary': 'var(--neko-descriptionForeground, #636366)',
    '--neko-fg-muted': 'rgba(28, 28, 30, 0.38)',
    '--neko-accent': 'var(--neko-focusBorder, #007aff)',
    '--neko-accent-soft': 'color-mix(in srgb, var(--neko-accent) 14%, transparent)',
    '--neko-accent-glow': 'color-mix(in srgb, var(--neko-accent) 28%, transparent)',
    '--neko-hover': 'rgba(0, 0, 0, 0.04)',
    '--neko-danger': '#ff3b30',
    '--neko-danger-hover': '#ff6961',
    '--neko-border': 'rgba(0, 0, 0, 0.08)',
    '--neko-divider': 'rgba(0, 0, 0, 0.05)',
    '--neko-shadow-sm': '0 2px 6px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)',
    '--neko-shadow-md': '0 4px 14px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.10)',
    '--neko-shadow-lg': '0 12px 32px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.12)',
    '--neko-shadow-xl': '0 24px 64px rgba(0,0,0,0.22), 0 8px 24px rgba(0,0,0,0.14)',
    '--neko-toolbar-background':
      'color-mix(in srgb, var(--neko-surface) 94%, var(--neko-elevated) 6%)',
    '--neko-toolbar-border': 'var(--neko-glass-border)',
    '--neko-toolbar-foreground': 'var(--neko-fg)',
    '--neko-toolbar-foreground-secondary': 'var(--neko-fg-secondary)',
    '--neko-toolbar-hover': 'var(--neko-hover)',
    '--neko-toolbar-accent': 'var(--neko-accent)',
    '--neko-toolbar-accent-glow': 'var(--neko-accent-glow)',
    '--neko-toolbar-divider': 'var(--neko-divider)',
    '--neko-toolbar-shadow': 'var(--neko-shadow-md)',
    '--neko-radius-sm': '6px',
    '--neko-radius-md': '8px',
    '--neko-radius-lg': '12px',
    '--neko-radius-xl': '16px',
  },
  highContrast: {
    '--neko-surface': 'var(--neko-sideBar-background)',
    '--neko-elevated': 'var(--neko-editorWidget-background)',
    '--neko-glass-bg': 'var(--neko-editor-background)',
    '--neko-glass-border': 'var(--neko-contrastBorder)',
    '--neko-glass-blur': 'none',
    '--neko-glass-shadow': 'none',
    '--neko-fg': 'var(--neko-editor-foreground)',
    '--neko-fg-secondary': 'var(--neko-editor-foreground)',
    '--neko-fg-muted': 'var(--neko-editor-foreground)',
    '--neko-accent': 'var(--neko-focusBorder)',
    '--neko-accent-soft': 'var(--neko-list-activeSelectionBackground)',
    '--neko-accent-glow': 'transparent',
    '--neko-hover': 'var(--neko-list-hoverBackground)',
    '--neko-danger': 'var(--neko-errorForeground)',
    '--neko-danger-hover': 'var(--neko-errorForeground)',
    '--neko-border': 'var(--neko-contrastBorder)',
    '--neko-divider': 'var(--neko-contrastBorder)',
    '--neko-shadow-sm': 'none',
    '--neko-shadow-md': 'none',
    '--neko-shadow-lg': 'none',
    '--neko-shadow-xl': 'none',
    '--neko-toolbar-background': 'var(--neko-surface)',
    '--neko-toolbar-border': 'var(--neko-glass-border)',
    '--neko-toolbar-foreground': 'var(--neko-fg)',
    '--neko-toolbar-foreground-secondary': 'var(--neko-fg-secondary)',
    '--neko-toolbar-hover': 'var(--neko-hover)',
    '--neko-toolbar-accent': 'var(--neko-accent)',
    '--neko-toolbar-accent-glow': 'transparent',
    '--neko-toolbar-divider': 'var(--neko-divider)',
    '--neko-toolbar-shadow': 'none',
    '--neko-radius-sm': '0px',
    '--neko-radius-md': '0px',
    '--neko-radius-lg': '0px',
    '--neko-radius-xl': '0px',
  },
} as const;
