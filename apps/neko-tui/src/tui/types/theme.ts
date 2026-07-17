import type { MarkdownSemanticRole, SyntaxTokenRole } from '../markdown/contracts';

/**
 * Theme Token Types
 *
 * Type definitions for the semantic color token system.
 * Ink uses chalk-compatible color names for <Text color=""> prop.
 */

/**
 * Ink-compatible color names
 */
export type InkColor =
  | 'black'
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'gray'
  | 'grey'
  | 'redBright'
  | 'greenBright'
  | 'yellowBright'
  | 'blueBright'
  | 'magentaBright'
  | 'cyanBright'
  | 'whiteBright';

/**
 * Semantic color pair (foreground + optional background)
 */
export interface ColorPair {
  readonly fg: InkColor;
  readonly bg?: InkColor;
}

/**
 * Full theme token structure
 */
export interface ThemeTokens {
  // Diff
  readonly diffAdded: InkColor;
  readonly diffRemoved: InkColor;
  readonly diffContext: InkColor;

  // Status
  readonly success: InkColor;
  readonly warning: InkColor;
  readonly error: InkColor;
  readonly info: InkColor;
  readonly muted: InkColor;

  // Todo states
  readonly todoPending: InkColor;
  readonly todoInProgress: InkColor;
  readonly todoCompleted: InkColor;
  readonly todoBlocked: InkColor;

  // Tool call states
  readonly toolPending: InkColor;
  readonly toolSuccess: InkColor;
  readonly toolError: InkColor;

  // TUI-specific
  readonly statusBar: ColorPair;
  readonly input: { readonly prompt: InkColor; readonly placeholder: InkColor };
  readonly approval: {
    readonly border: InkColor;
    readonly approve: InkColor;
    readonly reject: InkColor;
  };
  /** @deprecated Legacy code renderer tokens; removed with the regex highlighter. */
  readonly code: {
    readonly keyword: InkColor;
    readonly string: InkColor;
    readonly number: InkColor;
    readonly comment: InkColor;
    readonly function: InkColor;
  };

  // Markdown presentation roles. Background is intentionally inherited.
  readonly markdown: Readonly<Record<MarkdownSemanticRole, InkColor>>;
  readonly syntax: Readonly<Record<SyntaxTokenRole, InkColor>>;
}
