import type { InkColor } from '../types/theme';

export type MarkdownSemanticRole =
  | 'body'
  | 'muted'
  | 'heading'
  | 'strong'
  | 'emphasis'
  | 'strikethrough'
  | 'link'
  | 'code'
  | 'code-border'
  | 'quote-border'
  | 'list-marker'
  | 'table-border'
  | 'table-header'
  | 'diagnostic-info'
  | 'diagnostic-warning'
  | 'diagnostic-error'
  | 'fatal';

export type SyntaxTokenRole =
  | 'plain'
  | 'keyword'
  | 'string'
  | 'number'
  | 'comment'
  | 'function'
  | 'type'
  | 'literal'
  | 'operator'
  | 'punctuation'
  | 'property'
  | 'tag'
  | 'attribute'
  | 'regexp'
  | 'meta';

export interface TerminalFontAttributes {
  readonly bold?: boolean;
  readonly dim?: boolean;
  readonly italic?: boolean;
  readonly underline?: boolean;
  readonly strikethrough?: boolean;
}

export interface ResolvedTerminalStyle extends TerminalFontAttributes {
  readonly foreground?: InkColor;
  /** Markdown presentation inherits the terminal background by default. */
  readonly background?: InkColor;
}

export interface TerminalStyleRef {
  readonly markdownRole?: MarkdownSemanticRole;
  readonly syntaxRole?: SyntaxTokenRole;
  readonly attributes?: TerminalFontAttributes;
}

export type TerminalHyperlink =
  | { readonly kind: 'web'; readonly target: string }
  | {
      readonly kind: 'authorized-local-resource';
      readonly target: string;
      readonly authorizationId: string;
    };

export interface TerminalStyledSegment {
  readonly text: string;
  readonly style?: TerminalStyleRef;
  readonly hyperlink?: TerminalHyperlink;
  readonly sourceStartOffset?: number;
  readonly sourceEndOffset?: number;
}

export interface TerminalStyledLine {
  readonly segments: readonly TerminalStyledSegment[];
  readonly displayWidth: number;
}

export interface TerminalMarkdownDiagnostic {
  readonly code:
    | 'TUI_MD_UNSAFE_CONTROL'
    | 'TUI_MD_UNSAFE_HYPERLINK'
    | 'TUI_MD_HYPERLINK_UNAVAILABLE'
    | 'TUI_MD_EXTERNAL_ENHANCEMENT_FAILED'
    | 'TUI_MD_FATAL_RENDERING'
    | 'MD_TABLE_GRID_BUDGET_EXCEEDED'
    | 'MD_HIGHLIGHT_LIMIT_EXCEEDED';
  readonly severity: 'info' | 'warning' | 'error' | 'fatal';
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
}
