/**
 * Ink Semantic Color Tokens
 *
 * Extends the CLI theme.ts semantic naming for Ink's <Text color=""> prop.
 * All color decisions centralized here — components never hardcode colors.
 *
 * Aligned with:
 * - OpenNeko TUI semantic naming
 * - opencode TUI theme conventions
 * - VSCode vscode-* CSS token semantics
 */

import type { ThemeTokens } from '../types/theme';

export const tokens: ThemeTokens = {
  // Diff — unified diff coloring
  diffAdded: 'green',
  diffRemoved: 'red',
  diffContext: 'gray',

  // Status — general purpose status indicators
  success: 'green',
  warning: 'yellow',
  error: 'red',
  info: 'cyan',
  muted: 'gray',

  // Todo states — aligned with CLI TODO_ICONS semantics
  todoPending: 'gray',
  todoInProgress: 'yellow',
  todoCompleted: 'green',
  todoBlocked: 'red',

  // Tool call states — aligned with CLI TOOL_ICONS semantics
  toolPending: 'cyan',
  toolSuccess: 'green',
  toolError: 'red',

  // TUI-specific tokens
  statusBar: { fg: 'white', bg: 'gray' },
  input: { prompt: 'cyan', placeholder: 'gray' },
  approval: { border: 'yellow', approve: 'green', reject: 'red' },
  code: {
    keyword: 'magenta',
    string: 'green',
    number: 'yellow',
    comment: 'gray',
    function: 'cyan',
  },
  markdown: {
    body: 'white',
    muted: 'gray',
    heading: 'cyanBright',
    strong: 'whiteBright',
    emphasis: 'white',
    strikethrough: 'gray',
    link: 'blueBright',
    code: 'green',
    'code-border': 'gray',
    'quote-border': 'cyan',
    'list-marker': 'yellow',
    'table-border': 'gray',
    'table-header': 'cyanBright',
    'diagnostic-info': 'cyan',
    'diagnostic-warning': 'yellow',
    'diagnostic-error': 'red',
    fatal: 'redBright',
  },
  syntax: {
    plain: 'white',
    keyword: 'magenta',
    string: 'green',
    number: 'yellow',
    comment: 'gray',
    function: 'cyan',
    type: 'cyanBright',
    literal: 'yellowBright',
    operator: 'white',
    punctuation: 'gray',
    property: 'blueBright',
    tag: 'magentaBright',
    attribute: 'yellow',
    regexp: 'redBright',
    meta: 'gray',
  },
} as const;

/**
 * Todo status icons — aligned with CLI and opencode TUI
 */
export const INK_TODO_ICONS = {
  pending: '[ ]',
  in_progress: '[•]',
  completed: '[✓]',
  blocked: '[!]',
} as const;

/**
 * Tool call status icons
 */
export const INK_TOOL_ICONS = {
  pending: '◐',
  running: '◐',
  success: '✓',
  error: '✗',
} as const;

/**
 * Braille spinner frames — aligned with opencode TUI
 */
export const INK_BRAILLE_SPINNER = {
  frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const,
  interval: 80,
} as const;
