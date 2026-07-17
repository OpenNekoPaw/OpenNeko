import type { MarkdownNodeId } from './identity';
import type { MarkdownSourceProvenance, MarkdownSourceRange } from './source-range';

export type MarkdownTableAlignment = 'left' | 'center' | 'right' | 'unspecified';
export type MarkdownListKind = 'ordered' | 'unordered';
export type MarkdownReferenceKind = 'shortcut' | 'collapsed' | 'full';
export type MarkdownCodeKind = 'fenced' | 'indented';

export interface MarkdownLanguageIdentity {
  readonly raw?: string;
  readonly normalized?: string;
}

interface MarkdownSourceNodeBase {
  readonly id: MarkdownNodeId;
  readonly provenance: MarkdownSourceProvenance;
  readonly range: MarkdownSourceRange;
}

interface MarkdownParentNodeBase extends MarkdownSourceNodeBase {
  readonly children: readonly MarkdownNode[];
}

export interface MarkdownRootNode extends MarkdownParentNodeBase {
  readonly type: 'root';
}

export interface MarkdownParagraphNode extends MarkdownParentNodeBase {
  readonly type: 'paragraph';
}

export interface MarkdownHeadingNode extends MarkdownParentNodeBase {
  readonly type: 'heading';
  readonly depth: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface MarkdownBlockquoteNode extends MarkdownParentNodeBase {
  readonly type: 'blockquote';
}

export interface MarkdownListNode extends MarkdownParentNodeBase {
  readonly type: 'list';
  readonly kind: MarkdownListKind;
  readonly start?: number;
  readonly spread: boolean;
}

export interface MarkdownListItemNode extends MarkdownParentNodeBase {
  readonly type: 'listItem';
  readonly checked?: boolean;
  readonly spread: boolean;
}

export interface MarkdownCodeBlockNode extends MarkdownSourceNodeBase {
  readonly type: 'codeBlock';
  readonly kind: MarkdownCodeKind;
  readonly value: string;
  readonly language: MarkdownLanguageIdentity;
  readonly meta?: string;
}

export interface MarkdownThematicBreakNode extends MarkdownSourceNodeBase {
  readonly type: 'thematicBreak';
}

export interface MarkdownHtmlNode extends MarkdownSourceNodeBase {
  readonly type: 'html';
  readonly value: string;
  readonly block: boolean;
}

export interface MarkdownDefinitionNode extends MarkdownSourceNodeBase {
  readonly type: 'definition';
  readonly identifier: string;
  readonly label?: string;
  readonly destination: string;
  readonly title?: string;
}

export interface MarkdownTextNode extends MarkdownSourceNodeBase {
  readonly type: 'text';
  readonly value: string;
}

export interface MarkdownSoftBreakNode extends MarkdownSourceNodeBase {
  readonly type: 'softBreak';
}

export interface MarkdownHardBreakNode extends MarkdownSourceNodeBase {
  readonly type: 'hardBreak';
}

export interface MarkdownEmphasisNode extends MarkdownParentNodeBase {
  readonly type: 'emphasis';
}

export interface MarkdownStrongNode extends MarkdownParentNodeBase {
  readonly type: 'strong';
}

export interface MarkdownDeleteNode extends MarkdownParentNodeBase {
  readonly type: 'delete';
}

export interface MarkdownInlineCodeNode extends MarkdownSourceNodeBase {
  readonly type: 'inlineCode';
  readonly value: string;
}

export interface MarkdownLinkNode extends MarkdownParentNodeBase {
  readonly type: 'link';
  readonly destination: string;
  readonly title?: string;
  readonly kind: 'inline' | 'autolink';
}

export interface MarkdownLinkReferenceNode extends MarkdownParentNodeBase {
  readonly type: 'linkReference';
  readonly identifier: string;
  readonly label?: string;
  readonly referenceKind: MarkdownReferenceKind;
}

export interface MarkdownImageNode extends MarkdownSourceNodeBase {
  readonly type: 'image';
  readonly altText: string;
  readonly destination: string;
  readonly title?: string;
}

export interface MarkdownImageReferenceNode extends MarkdownSourceNodeBase {
  readonly type: 'imageReference';
  readonly altText: string;
  readonly identifier: string;
  readonly label?: string;
  readonly referenceKind: MarkdownReferenceKind;
}

export interface MarkdownTableNode extends MarkdownParentNodeBase {
  readonly type: 'table';
  readonly alignments: readonly MarkdownTableAlignment[];
  readonly header: MarkdownTableRowNode;
  readonly rows: readonly MarkdownTableRowNode[];
}

export interface MarkdownTableRowNode extends MarkdownParentNodeBase {
  readonly type: 'tableRow';
  readonly header: boolean;
  readonly cells: readonly MarkdownTableCellNode[];
}

export interface MarkdownTableCellNode extends MarkdownParentNodeBase {
  readonly type: 'tableCell';
  readonly columnIndex: number;
}

export type MarkdownStandardNode =
  | MarkdownRootNode
  | MarkdownParagraphNode
  | MarkdownHeadingNode
  | MarkdownBlockquoteNode
  | MarkdownListNode
  | MarkdownListItemNode
  | MarkdownCodeBlockNode
  | MarkdownThematicBreakNode
  | MarkdownHtmlNode
  | MarkdownDefinitionNode
  | MarkdownTextNode
  | MarkdownSoftBreakNode
  | MarkdownHardBreakNode
  | MarkdownEmphasisNode
  | MarkdownStrongNode
  | MarkdownDeleteNode
  | MarkdownInlineCodeNode
  | MarkdownLinkNode
  | MarkdownLinkReferenceNode
  | MarkdownImageNode
  | MarkdownImageReferenceNode
  | MarkdownTableNode
  | MarkdownTableRowNode
  | MarkdownTableCellNode;

export interface MarkdownMentionNode extends MarkdownSourceNodeBase {
  readonly type: 'nekoMention';
  readonly raw: string;
  readonly label: string;
}

export interface MarkdownResourceReferenceNode extends MarkdownSourceNodeBase {
  readonly type: 'nekoResourceReference';
  readonly raw: string;
  readonly target: string;
  readonly lookupToken: string;
  readonly placementHint?: string;
  readonly embed: boolean;
}

export type MarkdownExtensionNode = MarkdownMentionNode | MarkdownResourceReferenceNode;
export type MarkdownNode = MarkdownStandardNode | MarkdownExtensionNode;

export function isMarkdownParentNode(node: MarkdownNode): node is MarkdownNode & {
  readonly children: readonly MarkdownNode[];
} {
  return 'children' in node;
}
