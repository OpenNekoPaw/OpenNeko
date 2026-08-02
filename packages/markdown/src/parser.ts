import type { MarkdownPromptSpanInput, MarkdownAnnotation } from './annotations';
import type { MarkdownDiagnostic } from './diagnostics';
import {
  freezeNormalizedMarkdownDocument,
  NormalizedMarkdownDocument,
  validateNormalizedMarkdownDocument,
} from './document';
import {
  createMarkdownRevision,
  createMarkdownSessionId,
  deriveMarkdownAnnotationId,
  deriveMarkdownNodeId,
  type MarkdownRevision,
  type MarkdownSessionId,
} from './identity';
import type {
  MarkdownCodeBlockNode,
  MarkdownDefinitionNode,
  MarkdownHeadingNode,
  MarkdownImageNode,
  MarkdownImageReferenceNode,
  MarkdownLanguageIdentity,
  MarkdownLinkNode,
  MarkdownLinkReferenceNode,
  MarkdownListItemNode,
  MarkdownListNode,
  MarkdownNode,
  MarkdownReferenceKind,
  MarkdownRootNode,
  MarkdownTableAlignment,
  MarkdownTableCellNode,
  MarkdownTableNode,
  MarkdownTableRowNode,
} from './nodes';
import {
  createMarkdownSourceRange,
  MarkdownContractError,
  type MarkdownSourceRange,
} from './source-range';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export const DEFAULT_MARKDOWN_SOURCE_LIMIT_CODE_UNITS = 1_000_000;

export interface MarkdownParsePolicy {
  readonly maxSourceCodeUnits: number;
}

export const DEFAULT_MARKDOWN_PARSE_POLICY: MarkdownParsePolicy = Object.freeze({
  maxSourceCodeUnits: DEFAULT_MARKDOWN_SOURCE_LIMIT_CODE_UNITS,
});

export interface ParseNormalizedMarkdownOptions {
  readonly sessionId?: MarkdownSessionId;
  readonly revision?: MarkdownRevision;
  readonly promptSpans?: readonly MarkdownPromptSpanInput[];
  readonly creativeTableKnownColumns?: readonly string[];
  readonly policy?: MarkdownParsePolicy;
}

export interface MarkdownParseSuccess {
  readonly status: 'ready';
  readonly document: NormalizedMarkdownDocument;
}

export interface MarkdownParseFailure {
  readonly status: 'failed';
  readonly sessionId: MarkdownSessionId;
  readonly revision: MarkdownRevision;
  readonly source: string;
  readonly diagnostics: readonly MarkdownDiagnostic[];
}

export type MarkdownParseResult = MarkdownParseSuccess | MarkdownParseFailure;

interface MdastPositionPoint {
  readonly offset?: number;
}

interface MdastPosition {
  readonly start: MdastPositionPoint;
  readonly end: MdastPositionPoint;
}

interface MdastNode {
  readonly type: string;
  readonly position?: MdastPosition;
  readonly children?: readonly MdastNode[];
  readonly value?: string;
  readonly depth?: number;
  readonly ordered?: boolean;
  readonly start?: number | null;
  readonly spread?: boolean;
  readonly checked?: boolean | null;
  readonly lang?: string | null;
  readonly meta?: string | null;
  readonly url?: string;
  readonly title?: string | null;
  readonly alt?: string;
  readonly identifier?: string;
  readonly label?: string | null;
  readonly referenceType?: string;
  readonly align?: readonly (string | null)[];
}

interface NormalizationContext {
  readonly source: string;
  readonly sourceLength: number;
  readonly sessionId: MarkdownSessionId;
  ordinal: number;
  readonly diagnostics: MarkdownDiagnostic[];
}

const parser = unified().use(remarkParse).use(remarkGfm);
const EXTENSION_RE = /(!?)\[\[([^\]\n]+)\]\]|@([\p{L}\p{N}_.-]{1,80})/gu;

export function parseNormalizedMarkdown(
  source: string,
  options: ParseNormalizedMarkdownOptions = {},
): MarkdownParseResult {
  const sessionId = options.sessionId ?? createMarkdownSessionId();
  const revision = options.revision ?? createMarkdownRevision(1);
  const policy = options.policy ?? DEFAULT_MARKDOWN_PARSE_POLICY;
  validateParsePolicy(policy);

  if (source.length > policy.maxSourceCodeUnits) {
    return {
      status: 'failed',
      sessionId,
      revision,
      source,
      diagnostics: [
        {
          code: 'MD_SOURCE_LIMIT_EXCEEDED',
          severity: 'fatal',
          phase: 'admission',
          parameters: {
            actualCodeUnits: source.length,
            maxCodeUnits: policy.maxSourceCodeUnits,
          },
        },
      ],
    };
  }

  const mdastRoot = parser.parse(source) as MdastNode;
  const context: NormalizationContext = {
    source,
    sourceLength: source.length,
    sessionId,
    ordinal: 0,
    diagnostics: [],
  };
  const root = normalizeRoot(mdastRoot, context);
  const annotations = projectAnnotations(root, options, context);
  const document: NormalizedMarkdownDocument = {
    sessionId,
    revision,
    source,
    root,
    annotations,
    diagnostics: context.diagnostics,
  };
  validateNormalizedMarkdownDocument(document);
  return { status: 'ready', document: freezeNormalizedMarkdownDocument(document) };
}

function validateParsePolicy(policy: MarkdownParsePolicy): void {
  if (!Number.isInteger(policy.maxSourceCodeUnits) || policy.maxSourceCodeUnits < 1) {
    throw new MarkdownContractError(
      `Markdown maxSourceCodeUnits must be a positive integer: ${policy.maxSourceCodeUnits}`,
    );
  }
}

function normalizeRoot(node: MdastNode, context: NormalizationContext): MarkdownRootNode {
  if (node.type !== 'root')
    throw new MarkdownContractError(`Expected MDAST root, received ${node.type}.`);
  const range = positionRange(node, context, true);
  return sourceNode(context, 'root', range, {
    type: 'root',
    children: normalizeChildren(node.children, context, false),
  });
}

function normalizeChildren(
  children: readonly MdastNode[] | undefined,
  context: NormalizationContext,
  inlineContext: boolean,
  extensionsEnabled = true,
): readonly MarkdownNode[] {
  const result: MarkdownNode[] = [];
  let inlineHtmlDepth = 0;
  for (const child of children ?? []) {
    const htmlBoundary =
      inlineContext && child.type === 'html'
        ? classifyInlineHtmlBoundary(child.value ?? '')
        : 'none';
    if (htmlBoundary === 'close') inlineHtmlDepth = Math.max(0, inlineHtmlDepth - 1);
    result.push(
      ...normalizeNode(child, context, inlineContext, extensionsEnabled && inlineHtmlDepth === 0),
    );
    if (htmlBoundary === 'open') inlineHtmlDepth += 1;
  }
  return result;
}

function normalizeNode(
  node: MdastNode,
  context: NormalizationContext,
  inlineContext: boolean,
  extensionsEnabled: boolean,
): readonly MarkdownNode[] {
  const range = positionRange(node, context);
  switch (node.type) {
    case 'paragraph':
      return [
        sourceNode(context, 'paragraph', range, {
          type: 'paragraph',
          children: normalizeChildren(node.children, context, true, extensionsEnabled),
        }),
      ];
    case 'heading': {
      const depth = normalizeHeadingDepth(node.depth);
      const normalized: Omit<MarkdownHeadingNode, 'id' | 'range' | 'provenance'> = {
        type: 'heading',
        depth,
        children: normalizeChildren(node.children, context, true, extensionsEnabled),
      };
      return [sourceNode(context, 'heading', range, normalized)];
    }
    case 'blockquote':
      return [
        sourceNode(context, 'blockquote', range, {
          type: 'blockquote',
          children: normalizeChildren(node.children, context, false),
        }),
      ];
    case 'list': {
      const normalized: Omit<MarkdownListNode, 'id' | 'range' | 'provenance'> = {
        type: 'list',
        kind: node.ordered ? 'ordered' : 'unordered',
        ...(node.ordered && node.start !== null && node.start !== undefined
          ? { start: node.start }
          : {}),
        spread: node.spread ?? false,
        children: normalizeChildren(node.children, context, false),
      };
      return [sourceNode(context, 'list', range, normalized)];
    }
    case 'listItem': {
      const normalized: Omit<MarkdownListItemNode, 'id' | 'range' | 'provenance'> = {
        type: 'listItem',
        ...(node.checked === true || node.checked === false ? { checked: node.checked } : {}),
        spread: node.spread ?? false,
        children: normalizeChildren(node.children, context, false),
      };
      return [sourceNode(context, 'listItem', range, normalized)];
    }
    case 'code':
      return [normalizeCodeBlock(node, range, context)];
    case 'thematicBreak':
      return [sourceNode(context, 'thematicBreak', range, { type: 'thematicBreak' })];
    case 'html':
      context.diagnostics.push({
        code: 'MD_RAW_HTML_PRESERVED',
        severity: 'info',
        phase: 'normalize',
        parameters: { block: !inlineContext },
        range,
      });
      return [
        sourceNode(context, 'html', range, {
          type: 'html',
          value: node.value ?? context.source.slice(range.startOffset, range.endOffset),
          block: !inlineContext,
        }),
      ];
    case 'definition': {
      const normalized: Omit<MarkdownDefinitionNode, 'id' | 'range' | 'provenance'> = {
        type: 'definition',
        identifier: node.identifier ?? '',
        ...(node.label ? { label: node.label } : {}),
        destination: node.url ?? '',
        ...(node.title ? { title: node.title } : {}),
      };
      diagnoseDestination(normalized.destination, range, context);
      return [sourceNode(context, 'definition', range, normalized)];
    }
    case 'text':
      return normalizeText(node, range, context, extensionsEnabled);
    case 'break':
      return [sourceNode(context, 'hardBreak', range, { type: 'hardBreak' })];
    case 'emphasis':
      return [
        sourceNode(context, 'emphasis', range, {
          type: 'emphasis',
          children: normalizeChildren(node.children, context, true, extensionsEnabled),
        }),
      ];
    case 'strong':
      return [
        sourceNode(context, 'strong', range, {
          type: 'strong',
          children: normalizeChildren(node.children, context, true, extensionsEnabled),
        }),
      ];
    case 'delete':
      return [
        sourceNode(context, 'delete', range, {
          type: 'delete',
          children: normalizeChildren(node.children, context, true, extensionsEnabled),
        }),
      ];
    case 'inlineCode':
      return [
        sourceNode(context, 'inlineCode', range, {
          type: 'inlineCode',
          value: node.value ?? '',
        }),
      ];
    case 'link':
      return [normalizeLink(node, range, context, extensionsEnabled)];
    case 'linkReference':
      return [normalizeLinkReference(node, range, context, extensionsEnabled)];
    case 'image':
      return [normalizeImage(node, range, context)];
    case 'imageReference':
      return [normalizeImageReference(node, range, context)];
    case 'table':
      return [normalizeTable(node, range, context)];
    case 'tableRow':
    case 'tableCell':
      throw new MarkdownContractError(`${node.type} must be normalized through its table parent.`);
    default:
      throw new MarkdownContractError(`Unsupported Markdown parser node type: ${node.type}`);
  }
}

type InlineHtmlBoundary = 'open' | 'close' | 'none';

function classifyInlineHtmlBoundary(value: string): InlineHtmlBoundary {
  const trimmed = value.trim();
  if (/^<\//u.test(trimmed)) return 'close';
  if (!/^<[A-Za-z][^>]*>$/u.test(trimmed)) return 'none';
  if (/\/>$/u.test(trimmed)) return 'none';
  const tag = /^<([A-Za-z][A-Za-z0-9-]*)/u.exec(trimmed)?.[1]?.toLocaleLowerCase();
  if (!tag) return 'none';
  return INLINE_HTML_VOID_TAGS.has(tag) ? 'none' : 'open';
}

const INLINE_HTML_VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function normalizeText(
  node: MdastNode,
  range: MarkdownSourceRange,
  context: NormalizationContext,
  extensionsEnabled: boolean,
): readonly MarkdownNode[] {
  const value = node.value ?? '';
  const raw = context.source.slice(range.startOffset, range.endOffset);
  if (raw !== value || !extensionsEnabled) {
    return [sourceNode(context, 'text', range, { type: 'text', value })];
  }

  const nodes: MarkdownNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(EXTENSION_RE)) {
    const matchIndex = match.index;
    if (matchIndex === undefined) continue;
    const mentionLabel = match[3];
    if (mentionLabel && !isEligibleMention(value, matchIndex)) continue;
    appendPlainText(value.slice(cursor, matchIndex), range.startOffset + cursor, nodes, context);
    const matchedToken = match[0];
    const normalizedMentionLabel = mentionLabel ? trimMentionLabel(mentionLabel) : undefined;
    const rawToken = normalizedMentionLabel ? `@${normalizedMentionLabel}` : matchedToken;
    const tokenRange = createMarkdownSourceRange(
      range.startOffset + matchIndex,
      range.startOffset + matchIndex + rawToken.length,
      context.sourceLength,
    );
    if (normalizedMentionLabel) {
      nodes.push(
        sourceNode(context, 'nekoMention', tokenRange, {
          type: 'nekoMention',
          raw: rawToken,
          label: normalizedMentionLabel,
        }),
      );
    } else {
      const target = match[2] ?? '';
      const placement = stripMarkdownPlacementHint(target);
      nodes.push(
        sourceNode(context, 'nekoResourceReference', tokenRange, {
          type: 'nekoResourceReference',
          raw: rawToken,
          target,
          lookupToken: placement.lookupToken,
          ...(placement.placementHint ? { placementHint: placement.placementHint } : {}),
          embed: match[1] === '!',
        }),
      );
    }
    cursor = matchIndex + rawToken.length;
  }
  appendPlainText(value.slice(cursor), range.startOffset + cursor, nodes, context);
  return nodes;
}

function appendPlainText(
  value: string,
  startOffset: number,
  target: MarkdownNode[],
  context: NormalizationContext,
): void {
  let cursor = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '\n') continue;
    if (index > cursor) {
      const range = createMarkdownSourceRange(
        startOffset + cursor,
        startOffset + index,
        context.sourceLength,
      );
      target.push(
        sourceNode(context, 'text', range, { type: 'text', value: value.slice(cursor, index) }),
      );
    }
    const breakRange = createMarkdownSourceRange(
      startOffset + index,
      startOffset + index + 1,
      context.sourceLength,
    );
    target.push(sourceNode(context, 'softBreak', breakRange, { type: 'softBreak' }));
    cursor = index + 1;
  }
  if (cursor < value.length) {
    const range = createMarkdownSourceRange(
      startOffset + cursor,
      startOffset + value.length,
      context.sourceLength,
    );
    target.push(sourceNode(context, 'text', range, { type: 'text', value: value.slice(cursor) }));
  }
}

function normalizeCodeBlock(
  node: MdastNode,
  range: MarkdownSourceRange,
  context: NormalizationContext,
): MarkdownCodeBlockNode {
  const raw = context.source.slice(range.startOffset, range.endOffset);
  const fenced = /^ {0,3}(`{3,}|~{3,})/u.test(raw);
  const language = normalizeLanguage(node.lang ?? undefined);
  return sourceNode(context, 'codeBlock', range, {
    type: 'codeBlock',
    kind: fenced ? 'fenced' : 'indented',
    value: node.value ?? '',
    language,
    ...(node.meta ? { meta: node.meta } : {}),
  });
}

function normalizeLanguage(raw: string | undefined): MarkdownLanguageIdentity {
  const trimmed = raw?.trim();
  if (!trimmed) return {};
  return { raw: trimmed, normalized: trimmed.toLocaleLowerCase().replace(/[^a-z0-9_+#.-]+/gu, '') };
}

function normalizeLink(
  node: MdastNode,
  range: MarkdownSourceRange,
  context: NormalizationContext,
  extensionsEnabled: boolean,
): MarkdownLinkNode {
  const destination = node.url ?? '';
  diagnoseDestination(destination, range, context);
  const source = context.source.slice(range.startOffset, range.endOffset);
  const children = normalizeChildren(node.children, context, true, extensionsEnabled);
  const kind = isAutolinkSource(source, destination) ? 'autolink' : 'inline';
  return sourceNode(context, 'link', range, {
    type: 'link',
    destination,
    ...(node.title ? { title: node.title } : {}),
    kind,
    children,
  });
}

function normalizeLinkReference(
  node: MdastNode,
  range: MarkdownSourceRange,
  context: NormalizationContext,
  extensionsEnabled: boolean,
): MarkdownLinkReferenceNode {
  return sourceNode(context, 'linkReference', range, {
    type: 'linkReference',
    identifier: node.identifier ?? '',
    ...(node.label ? { label: node.label } : {}),
    referenceKind: normalizeReferenceKind(node.referenceType),
    children: normalizeChildren(node.children, context, true, extensionsEnabled),
  });
}

function normalizeImage(
  node: MdastNode,
  range: MarkdownSourceRange,
  context: NormalizationContext,
): MarkdownImageNode {
  const destination = node.url ?? '';
  diagnoseDestination(destination, range, context);
  return sourceNode(context, 'image', range, {
    type: 'image',
    altText: node.alt ?? '',
    destination,
    ...(node.title ? { title: node.title } : {}),
  });
}

function normalizeImageReference(
  node: MdastNode,
  range: MarkdownSourceRange,
  context: NormalizationContext,
): MarkdownImageReferenceNode {
  return sourceNode(context, 'imageReference', range, {
    type: 'imageReference',
    altText: node.alt ?? '',
    identifier: node.identifier ?? '',
    ...(node.label ? { label: node.label } : {}),
    referenceKind: normalizeReferenceKind(node.referenceType),
  });
}

function normalizeTable(
  node: MdastNode,
  range: MarkdownSourceRange,
  context: NormalizationContext,
): MarkdownTableNode {
  const rowNodes = node.children ?? [];
  if (rowNodes.length === 0) {
    throw new MarkdownContractError('Normalized GFM table must contain a header row.');
  }
  const rows = rowNodes.map((row, index) => normalizeTableRow(row, index === 0, context));
  const header = rows[0];
  if (!header) throw new MarkdownContractError('Normalized GFM table header is missing.');
  const bodyRows = rows.slice(1);
  for (const row of bodyRows) {
    if (row.cells.length === header.cells.length) continue;
    context.diagnostics.push({
      code: 'MD_TABLE_ROW_WIDTH_MISMATCH',
      severity: 'warning',
      phase: 'normalize',
      parameters: { expectedCells: header.cells.length, actualCells: row.cells.length },
      range: row.range,
      nodeId: row.id,
    });
  }
  const alignments = (node.align ?? []).map(normalizeAlignment);
  return sourceNode(context, 'table', range, {
    type: 'table',
    alignments,
    header,
    rows: bodyRows,
    children: rows,
  });
}

function normalizeTableRow(
  node: MdastNode,
  header: boolean,
  context: NormalizationContext,
): MarkdownTableRowNode {
  if (node.type !== 'tableRow') {
    throw new MarkdownContractError(`Expected tableRow, received ${node.type}.`);
  }
  const range = positionRange(node, context);
  const cells = (node.children ?? []).map((cell, index) =>
    normalizeTableCell(cell, index, context),
  );
  return sourceNode(context, 'tableRow', range, {
    type: 'tableRow',
    header,
    cells,
    children: cells,
  });
}

function normalizeTableCell(
  node: MdastNode,
  columnIndex: number,
  context: NormalizationContext,
): MarkdownTableCellNode {
  if (node.type !== 'tableCell') {
    throw new MarkdownContractError(`Expected tableCell, received ${node.type}.`);
  }
  const range = positionRange(node, context);
  return sourceNode(context, 'tableCell', range, {
    type: 'tableCell',
    columnIndex,
    children: normalizeChildren(node.children, context, true),
  });
}

function projectAnnotations(
  root: MarkdownRootNode,
  options: ParseNormalizedMarkdownOptions,
  context: NormalizationContext,
): readonly MarkdownAnnotation[] {
  const annotations: MarkdownAnnotation[] = [];
  for (const input of options.promptSpans ?? []) {
    const range = createMarkdownSourceRange(
      input.range.startOffset,
      input.range.endOffset,
      context.sourceLength,
    );
    annotations.push({
      id: deriveMarkdownAnnotationId(
        context.sessionId,
        'promptSpan',
        range.startOffset,
        range.endOffset,
        `${input.kind}:${input.fieldId ?? ''}`,
      ),
      type: 'promptSpan',
      kind: input.kind,
      range,
      provenance: { kind: 'source', range },
      ...(input.fieldId ? { fieldId: input.fieldId } : {}),
      ...(input.label ? { label: input.label } : {}),
      ...(input.tone ? { tone: input.tone } : {}),
      ...(input.tooltip ? { tooltip: input.tooltip } : {}),
    });
  }

  const knownColumns = new Set(
    (options.creativeTableKnownColumns ?? []).map(normalizeMarkdownResourceLookupToken),
  );
  for (const table of collectNodes(root).filter(
    (node): node is MarkdownTableNode => node.type === 'table',
  )) {
    const headers = table.header.cells.map(readPlainText);
    const unknownColumns =
      knownColumns.size === 0
        ? []
        : headers.filter(
            (header) => !knownColumns.has(normalizeMarkdownResourceLookupToken(header)),
          );
    annotations.push({
      id: deriveMarkdownAnnotationId(
        context.sessionId,
        'creativeTable',
        table.range.startOffset,
        table.range.endOffset,
        headers.join('\u0000'),
      ),
      type: 'creativeTable',
      range: table.range,
      targetNodeId: table.id,
      provenance: { kind: 'source', range: table.range },
      headers,
      unknownColumns,
    });
  }
  return annotations;
}

function sourceNode<T extends { readonly type: string }>(
  context: NormalizationContext,
  kind: string,
  range: MarkdownSourceRange,
  fields: T,
): T & {
  readonly id: import('./identity').MarkdownNodeId;
  readonly range: MarkdownSourceRange;
  readonly provenance: { readonly kind: 'source'; readonly range: MarkdownSourceRange };
} {
  const ordinal = context.ordinal;
  context.ordinal += 1;
  return {
    ...fields,
    id: deriveMarkdownNodeId(
      context.sessionId,
      kind,
      range.startOffset,
      range.endOffset,
      context.source.slice(range.startOffset, range.endOffset),
      ordinal,
    ),
    range,
    provenance: { kind: 'source', range },
  };
}

function positionRange(
  node: MdastNode,
  context: NormalizationContext,
  root = false,
): MarkdownSourceRange {
  if (root && !node.position)
    return createMarkdownSourceRange(0, context.sourceLength, context.sourceLength);
  const startOffset = node.position?.start.offset;
  const endOffset = node.position?.end.offset;
  if (startOffset === undefined || endOffset === undefined) {
    throw new MarkdownContractError(`Markdown parser node ${node.type} is missing UTF-16 offsets.`);
  }
  return createMarkdownSourceRange(startOffset, endOffset, context.sourceLength);
}

function normalizeHeadingDepth(depth: number | undefined): 1 | 2 | 3 | 4 | 5 | 6 {
  if (depth === 1 || depth === 2 || depth === 3 || depth === 4 || depth === 5 || depth === 6) {
    return depth;
  }
  throw new MarkdownContractError(`Invalid Markdown heading depth: ${String(depth)}`);
}

function normalizeReferenceKind(value: string | undefined): MarkdownReferenceKind {
  if (value === 'shortcut' || value === 'collapsed' || value === 'full') return value;
  throw new MarkdownContractError(`Invalid Markdown reference kind: ${String(value)}`);
}

function normalizeAlignment(value: string | null): MarkdownTableAlignment {
  if (value === 'left' || value === 'center' || value === 'right') return value;
  if (value === null) return 'unspecified';
  throw new MarkdownContractError(`Invalid Markdown table alignment: ${value}`);
}

function isEligibleMention(value: string, index: number): boolean {
  if (index === 0) return true;
  const previous = value[index - 1] ?? '';
  return !/[\p{L}\p{N}_./-]/u.test(previous);
}

function trimMentionLabel(value: string): string {
  return value.replace(/[.,!?;:，。！？；：]+$/u, '');
}

function isAutolinkSource(source: string, destination: string): boolean {
  const trimmed = source.trim();
  return (trimmed.startsWith('<') && trimmed.endsWith('>')) || trimmed === destination;
}

function diagnoseDestination(
  destination: string,
  range: MarkdownSourceRange,
  context: NormalizationContext,
): void {
  const scheme = /^([a-z][a-z0-9+.-]*):/iu.exec(destination)?.[1]?.toLocaleLowerCase();
  if (!scheme || scheme === 'http' || scheme === 'https' || scheme === 'mailto') return;
  context.diagnostics.push({
    code: 'MD_UNSAFE_DESTINATION',
    severity: 'warning',
    phase: 'normalize',
    parameters: { scheme },
    range,
  });
}

function collectNodes(root: MarkdownNode): readonly MarkdownNode[] {
  const result: MarkdownNode[] = [root];
  if ('children' in root) {
    for (const child of root.children) result.push(...collectNodes(child));
  }
  return result;
}

function readPlainText(node: MarkdownNode): string {
  switch (node.type) {
    case 'text':
    case 'inlineCode':
      return node.value;
    case 'softBreak':
    case 'hardBreak':
      return '\n';
    case 'nekoMention':
    case 'nekoResourceReference':
      return node.raw;
    case 'image':
    case 'imageReference':
      return node.altText;
    default:
      return 'children' in node ? node.children.map(readPlainText).join('') : '';
  }
}

export interface MarkdownPlacementTarget {
  readonly lookupToken: string;
  readonly placementHint?: string;
}

export function stripMarkdownPlacementHint(value: string): MarkdownPlacementTarget {
  const token = stripMarkdownToken(value);
  const fragmentStart = token.indexOf('#');
  if (fragmentStart < 0) return { lookupToken: token };
  const lookupToken = token.slice(0, fragmentStart);
  const placementHint = token.slice(fragmentStart + 1);
  return placementHint.length > 0 ? { lookupToken, placementHint } : { lookupToken };
}

export function normalizeMarkdownResourceLookupToken(value: string): string {
  return stripMarkdownPlacementHint(stripMarkdownToken(value))
    .lookupToken.trim()
    .toLocaleLowerCase()
    .replace(/[/|、，,]+/gu, '_')
    .replace(/[\s-]+/gu, '_')
    .replace(/_+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}

function stripMarkdownToken(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('`') && trimmed.endsWith('`')) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}
