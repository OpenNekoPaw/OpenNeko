/**
 * Theme Design Tokens
 *
 * Single source of truth for VSCode CSS variable mappings.
 * Used by:
 * 1. Tailwind preset (all webview tailwind.config.js)
 * 2. Runtime CSS variable access
 * 3. Documentation
 *
 * Token names match the Tailwind utility class names:
 *   bg-vscode-bg, text-vscode-fg, border-vscode-border, etc.
 *
 * Layer 0: Zero dependencies.
 */

export const vscodeCSSTokens = {
  colors: {
    // Editor
    'vscode-bg': 'var(--vscode-editor-background)',
    'vscode-fg': 'var(--vscode-editor-foreground)',

    // Panel
    'vscode-panel-bg': 'var(--vscode-panel-background)',
    'vscode-panel-border': 'var(--vscode-panel-border)',
    'vscode-panel-title': 'var(--vscode-panelTitle-activeForeground)',

    // Sidebar
    'vscode-sidebar-bg': 'var(--vscode-sideBar-background)',
    'vscode-sidebar-fg': 'var(--vscode-sideBar-foreground)',
    'vscode-sidebar-border': 'var(--vscode-sideBar-border)',

    // List
    'vscode-list-hover': 'var(--vscode-list-hoverBackground)',
    'vscode-list-active': 'var(--vscode-list-activeSelectionBackground)',
    'vscode-list-active-fg': 'var(--vscode-list-activeSelectionForeground)',
    'vscode-list-inactive': 'var(--vscode-list-inactiveSelectionBackground)',

    // Input
    'vscode-input-bg': 'var(--vscode-input-background)',
    'vscode-input-fg': 'var(--vscode-input-foreground)',
    'vscode-input-border': 'var(--vscode-input-border)',
    'vscode-input-placeholder': 'var(--vscode-input-placeholderForeground)',

    // Button
    'vscode-button': 'var(--vscode-button-background)',
    'vscode-button-fg': 'var(--vscode-button-foreground)',
    'vscode-button-hover': 'var(--vscode-button-hoverBackground)',
    'vscode-button-secondary': 'var(--vscode-button-secondaryBackground)',
    'vscode-button-secondary-fg': 'var(--vscode-button-secondaryForeground)',
    'vscode-button-secondary-hover': 'var(--vscode-button-secondaryHoverBackground)',

    // Focus / Accent
    'vscode-accent': 'var(--vscode-focusBorder)',
    'vscode-focus': 'var(--vscode-focusBorder)',

    // Badge
    'vscode-badge-bg': 'var(--vscode-badge-background)',
    'vscode-badge-fg': 'var(--vscode-badge-foreground)',

    // Icon
    'vscode-icon': 'var(--vscode-icon-foreground)',

    // Status
    'vscode-error': 'var(--vscode-errorForeground)',
    'vscode-warning': 'var(--vscode-editorWarning-foreground)',
    'vscode-info': 'var(--vscode-editorInfo-foreground)',

    // Toolbar
    'vscode-toolbar-bg': 'var(--vscode-toolbar-hoverBackground)',
    'vscode-toolbar-active': 'var(--vscode-toolbar-activeBackground)',

    // Dropdown
    'vscode-dropdown-bg': 'var(--vscode-dropdown-background)',
    'vscode-dropdown-fg': 'var(--vscode-dropdown-foreground)',
    'vscode-dropdown-border': 'var(--vscode-dropdown-border)',

    // Widget
    'vscode-widget-bg': 'var(--vscode-editorWidget-background)',
    'vscode-widget-border': 'var(--vscode-editorWidget-border)',

    // Description text
    'vscode-description': 'var(--vscode-descriptionForeground)',

    // Scrollbar
    'vscode-scrollbar': 'var(--vscode-scrollbarSlider-background)',
    'vscode-scrollbar-hover': 'var(--vscode-scrollbarSlider-hoverBackground)',
    'vscode-scrollbar-active': 'var(--vscode-scrollbarSlider-activeBackground)',

    // Diff editor
    'vscode-diff-inserted': 'var(--vscode-diffEditor-insertedLineBackground)',
    'vscode-diff-removed': 'var(--vscode-diffEditor-removedLineBackground)',
    'vscode-diff-inserted-fg': 'var(--vscode-gitDecoration-addedResourceForeground)',
    'vscode-diff-removed-fg': 'var(--vscode-gitDecoration-deletedResourceForeground)',
    'vscode-diff-modified-fg': 'var(--vscode-gitDecoration-modifiedResourceForeground)',

    // Charts (status color encoding, aligned with opencode TUI semantic tokens)
    'vscode-chart-green': 'var(--vscode-charts-green)',
    'vscode-chart-red': 'var(--vscode-charts-red)',
    'vscode-chart-blue': 'var(--vscode-charts-blue)',
    'vscode-chart-yellow': 'var(--vscode-charts-yellow)',
    'vscode-chart-purple': 'var(--vscode-charts-purple)',

    // Compatibility token alias
    'vscode-border': 'var(--vscode-panel-border)',

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
    vscode: 'var(--vscode-font-family)',
    'vscode-editor': 'var(--vscode-editor-font-family)',
  },

  fontSize: {
    vscode: 'var(--vscode-font-size)',
    'vscode-editor': 'var(--vscode-editor-font-size)',
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
// All @neko/shared/components reference these --neko-* variables.
// Covers dark (default), light, and high-contrast VSCode themes.
// =============================================================================

export const nekoDesignTokens = {
  dark: {
    // Surface layers
    '--neko-surface': 'var(--vscode-sideBar-background, #242426)',
    '--neko-elevated': 'var(--vscode-editorWidget-background, #2c2c2e)',
    // Glass material (frosted glass panels / menus)
    '--neko-glass-bg': 'rgba(30, 30, 32, 0.88)',
    '--neko-glass-border': 'rgba(255, 255, 255, 0.09)',
    '--neko-glass-blur': 'blur(20px) saturate(180%)',
    '--neko-glass-shadow':
      '0 20px 60px rgba(0,0,0,0.55), 0 6px 20px rgba(0,0,0,0.40), 0 1px 4px rgba(0,0,0,0.25)',
    // Text
    '--neko-fg': 'var(--vscode-editor-foreground, #e8e8ed)',
    '--neko-fg-secondary': 'var(--vscode-descriptionForeground, #8e8e93)',
    '--neko-fg-muted': 'rgba(232, 232, 237, 0.38)',
    // Interactive
    '--neko-accent': 'var(--vscode-focusBorder, #0a84ff)',
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
    '--neko-surface': 'var(--vscode-sideBar-background, #ebebed)',
    '--neko-elevated': 'var(--vscode-editorWidget-background, #ffffff)',
    '--neko-glass-bg': 'rgba(242, 242, 247, 0.92)',
    '--neko-glass-border': 'rgba(0, 0, 0, 0.08)',
    '--neko-glass-blur': 'blur(20px) saturate(180%)',
    '--neko-glass-shadow': '0 20px 60px rgba(0,0,0,0.20), 0 6px 20px rgba(0,0,0,0.12)',
    '--neko-fg': 'var(--vscode-editor-foreground, #1c1c1e)',
    '--neko-fg-secondary': 'var(--vscode-descriptionForeground, #636366)',
    '--neko-fg-muted': 'rgba(28, 28, 30, 0.38)',
    '--neko-accent': 'var(--vscode-focusBorder, #007aff)',
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
    '--neko-surface': 'var(--vscode-sideBar-background)',
    '--neko-elevated': 'var(--vscode-editorWidget-background)',
    '--neko-glass-bg': 'var(--vscode-editor-background)',
    '--neko-glass-border': 'var(--vscode-contrastBorder)',
    '--neko-glass-blur': 'none',
    '--neko-glass-shadow': 'none',
    '--neko-fg': 'var(--vscode-editor-foreground)',
    '--neko-fg-secondary': 'var(--vscode-editor-foreground)',
    '--neko-fg-muted': 'var(--vscode-editor-foreground)',
    '--neko-accent': 'var(--vscode-focusBorder)',
    '--neko-accent-soft': 'var(--vscode-list-activeSelectionBackground)',
    '--neko-accent-glow': 'transparent',
    '--neko-hover': 'var(--vscode-list-hoverBackground)',
    '--neko-danger': 'var(--vscode-errorForeground)',
    '--neko-danger-hover': 'var(--vscode-errorForeground)',
    '--neko-border': 'var(--vscode-contrastBorder)',
    '--neko-divider': 'var(--vscode-contrastBorder)',
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
