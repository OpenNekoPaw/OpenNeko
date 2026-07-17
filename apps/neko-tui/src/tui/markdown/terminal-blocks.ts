import type {
  MarkdownNodeId,
  MarkdownSourceRange,
  MarkdownTableAlignment,
  NormalizedMarkdownDocument,
} from '@neko/markdown';
import type { TerminalDiagnosticPresentation } from './diagnostic-presentation';
import type { SyntaxTokenRole, TerminalStyledLine, TerminalStyledSegment } from './contracts';

export interface TerminalProjectionProvenance {
  readonly kind: 'source' | 'synthetic';
  readonly nodeId?: MarkdownNodeId;
  readonly sourceRange?: MarkdownSourceRange;
  readonly reason?: 'missing-table-cell' | 'synthetic-table-header' | 'diagnostic';
}

interface TerminalMarkdownBlockBase {
  readonly provenance: TerminalProjectionProvenance;
}

export interface TerminalTextBlock extends TerminalMarkdownBlockBase {
  readonly kind: 'paragraph' | 'heading' | 'raw-html' | 'definition';
  readonly depth?: 1 | 2 | 3 | 4 | 5 | 6;
  readonly segments: readonly TerminalStyledSegment[];
}

export interface TerminalQuoteBlock extends TerminalMarkdownBlockBase {
  readonly kind: 'quote';
  readonly blocks: readonly TerminalMarkdownBlock[];
}

export interface TerminalListItem {
  readonly checked?: boolean;
  readonly blocks: readonly TerminalMarkdownBlock[];
  readonly provenance: TerminalProjectionProvenance;
}

export interface TerminalListBlock extends TerminalMarkdownBlockBase {
  readonly kind: 'list';
  readonly ordered: boolean;
  readonly start: number;
  readonly items: readonly TerminalListItem[];
}

export interface TerminalCodeToken {
  readonly text: string;
  readonly role: SyntaxTokenRole;
  /** Range relative to the normalized code value, not the fenced source. */
  readonly sourceRange: MarkdownSourceRange;
}

export interface TerminalCodeBlock extends TerminalMarkdownBlockBase {
  readonly kind: 'code';
  readonly value: string;
  readonly language?: string;
  readonly tokens?: readonly TerminalCodeToken[];
  readonly sourceRange: MarkdownSourceRange;
}

export interface TerminalThematicBreakBlock extends TerminalMarkdownBlockBase {
  readonly kind: 'thematic-break';
}

export interface TerminalTableCell {
  readonly segments: readonly TerminalStyledSegment[];
  readonly provenance: TerminalProjectionProvenance;
}

export interface TerminalTableBlock extends TerminalMarkdownBlockBase {
  readonly kind: 'table';
  readonly alignments: readonly MarkdownTableAlignment[];
  readonly header: readonly TerminalTableCell[];
  readonly rows: readonly (readonly TerminalTableCell[])[];
}

export interface TerminalDiagnosticBlock extends TerminalMarkdownBlockBase {
  readonly kind: 'diagnostic';
  readonly presentation: TerminalDiagnosticPresentation;
}

export type TerminalMarkdownBlock =
  | TerminalTextBlock
  | TerminalQuoteBlock
  | TerminalListBlock
  | TerminalCodeBlock
  | TerminalThematicBreakBlock
  | TerminalTableBlock
  | TerminalDiagnosticBlock;

export interface TerminalMarkdownProjection {
  readonly sessionId: NormalizedMarkdownDocument['sessionId'];
  readonly revision: NormalizedMarkdownDocument['revision'];
  readonly blocks: readonly TerminalMarkdownBlock[];
  readonly diagnostics: readonly TerminalDiagnosticPresentation[];
}

export interface TerminalLine {
  readonly kind: 'content' | 'blank' | 'diagnostic';
  readonly segments: readonly TerminalStyledSegment[];
  readonly displayWidth: number;
  readonly provenance?: TerminalProjectionProvenance;
  readonly logicalLine?: number;
  readonly fragmentIndex?: number;
  readonly continuation?: boolean;
  /** Code-value-relative source range for visual code fragments. */
  readonly sourceRange?: MarkdownSourceRange;
}

export interface TerminalMarkdownLayoutInput {
  readonly projection: TerminalMarkdownProjection;
  readonly viewportWidth: number;
  readonly supportsUnicode: boolean;
}

export interface TerminalMarkdownLayout {
  readonly sessionId: NormalizedMarkdownDocument['sessionId'];
  readonly revision: NormalizedMarkdownDocument['revision'];
  readonly viewportWidth: number;
  readonly lines: readonly TerminalLine[];
}
