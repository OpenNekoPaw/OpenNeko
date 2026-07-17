import type {
  MarkdownNode,
  MarkdownNodeId,
  MarkdownSourceRange,
  MarkdownTableCellNode,
  MarkdownTableNode,
  NormalizedMarkdownDocument,
} from '@neko/markdown';
import type { TerminalMarkdownMessages } from '../presentation/terminal-label-presentation';
import type {
  TerminalMarkdownDiagnostic,
  TerminalStyleRef,
  TerminalStyledSegment,
} from './contracts';
import { presentMarkdownDiagnostic } from './diagnostic-presentation';
import {
  defaultTerminalResourceTargetResolver,
  toTerminalHyperlink,
  type TerminalResourceTargetResolver,
} from './resource-target';
import type {
  TerminalCodeToken,
  TerminalMarkdownBlock,
  TerminalMarkdownProjection,
  TerminalProjectionProvenance,
  TerminalTableBlock,
  TerminalTableCell,
} from './terminal-blocks';

export interface TerminalMarkdownProjectorOptions {
  readonly labels: TerminalMarkdownMessages;
  readonly targetResolver?: TerminalResourceTargetResolver;
  readonly codeHighlights?: ReadonlyMap<MarkdownNodeId, readonly TerminalCodeToken[]>;
  readonly presentationDiagnostics?: readonly TerminalMarkdownDiagnostic[];
}

interface ProjectorContext {
  readonly labels: TerminalMarkdownMessages;
  readonly targetResolver: TerminalResourceTargetResolver;
  readonly codeHighlights?: ReadonlyMap<MarkdownNodeId, readonly TerminalCodeToken[]>;
  readonly diagnostics: TerminalMarkdownDiagnostic[];
  readonly authorizedDestinationRanges: Set<string>;
}

export function projectTerminalMarkdown(
  document: NormalizedMarkdownDocument,
  options: TerminalMarkdownProjectorOptions,
): TerminalMarkdownProjection {
  const labels = options.labels;
  const diagnostics: TerminalMarkdownDiagnostic[] = [];
  const context: ProjectorContext = {
    labels,
    targetResolver: options.targetResolver ?? defaultTerminalResourceTargetResolver,
    ...(options.codeHighlights ? { codeHighlights: options.codeHighlights } : {}),
    diagnostics,
    authorizedDestinationRanges: new Set<string>(),
  };
  const blocks = document.root.children.flatMap((node) => projectBlock(node, context));
  return {
    sessionId: document.sessionId,
    revision: document.revision,
    blocks,
    diagnostics: [
      ...document.diagnostics
        .filter(
          (diagnostic) =>
            diagnostic.code !== 'MD_UNSAFE_DESTINATION' ||
            diagnostic.range === undefined ||
            !context.authorizedDestinationRanges.has(rangeKey(diagnostic.range)),
        )
        .map((diagnostic) => presentMarkdownDiagnostic(diagnostic, labels)),
      ...diagnostics.map((diagnostic) => presentMarkdownDiagnostic(diagnostic, labels)),
      ...(options.presentationDiagnostics ?? []).map((diagnostic) =>
        presentMarkdownDiagnostic(diagnostic, labels),
      ),
    ],
  };
}

function projectBlock(
  node: MarkdownNode,
  context: ProjectorContext,
): readonly TerminalMarkdownBlock[] {
  const provenance = sourceProvenance(node.id, node.range);
  switch (node.type) {
    case 'paragraph':
      return [
        { kind: 'paragraph', segments: projectInlineChildren(node.children, context), provenance },
      ];
    case 'heading':
      return [
        {
          kind: 'heading',
          depth: node.depth,
          segments: projectInlineChildren(node.children, context, {
            markdownRole: 'heading',
            attributes: { bold: true },
          }),
          provenance,
        },
      ];
    case 'blockquote':
      return [
        {
          kind: 'quote',
          blocks: node.children.flatMap((child) => projectBlock(child, context)),
          provenance,
        },
      ];
    case 'list': {
      const items = node.children.map((child) => {
        if (child.type !== 'listItem') {
          throw new Error(`Markdown list contained unexpected ${child.type} node.`);
        }
        return {
          ...(child.checked === undefined ? {} : { checked: child.checked }),
          blocks: child.children.flatMap((itemChild) => projectBlock(itemChild, context)),
          provenance: sourceProvenance(child.id, child.range),
        };
      });
      return [
        {
          kind: 'list',
          ordered: node.kind === 'ordered',
          start: node.start ?? 1,
          items,
          provenance,
        },
      ];
    }
    case 'codeBlock':
      return [
        {
          kind: 'code',
          value: node.value,
          ...(context.codeHighlights?.get(node.id)
            ? { tokens: context.codeHighlights.get(node.id) }
            : {}),
          ...(node.language.normalized ? { language: node.language.normalized } : {}),
          sourceRange: node.range,
          provenance,
        },
      ];
    case 'thematicBreak':
      return [{ kind: 'thematic-break', provenance }];
    case 'html':
      return [
        {
          kind: 'raw-html',
          segments: [
            {
              text: node.value,
              style: { markdownRole: 'muted' },
              sourceStartOffset: node.range.startOffset,
              sourceEndOffset: node.range.endOffset,
            },
          ],
          provenance,
        },
      ];
    case 'definition': {
      const text = `[${node.label ?? node.identifier}]: ${node.destination}${node.title ? ` "${node.title}"` : ''}`;
      return [
        { kind: 'definition', segments: [{ text, style: { markdownRole: 'muted' } }], provenance },
      ];
    }
    case 'table':
      return [projectTable(node, context)];
    case 'listItem':
    case 'text':
    case 'softBreak':
    case 'hardBreak':
    case 'emphasis':
    case 'strong':
    case 'delete':
    case 'inlineCode':
    case 'link':
    case 'linkReference':
    case 'image':
    case 'imageReference':
    case 'nekoMention':
    case 'nekoResourceReference':
    case 'tableRow':
    case 'tableCell':
      throw new Error(`Inline-only Markdown node ${node.type} appeared at block level.`);
    case 'root':
      return node.children.flatMap((child) => projectBlock(child, context));
    default:
      return assertNever(node);
  }
}

function projectInlineChildren(
  nodes: readonly MarkdownNode[],
  context: ProjectorContext,
  inherited?: TerminalStyleRef,
): readonly TerminalStyledSegment[] {
  return nodes.flatMap((node) => projectInline(node, context, inherited));
}

function projectInline(
  node: MarkdownNode,
  context: ProjectorContext,
  inherited?: TerminalStyleRef,
): readonly TerminalStyledSegment[] {
  const labels = context.labels;
  const source = {
    sourceStartOffset: node.range.startOffset,
    sourceEndOffset: node.range.endOffset,
  };
  switch (node.type) {
    case 'text':
      return [{ text: node.value, ...(inherited ? { style: inherited } : {}), ...source }];
    case 'softBreak':
      return [{ text: ' ', ...(inherited ? { style: inherited } : {}), ...source }];
    case 'hardBreak':
      return [{ text: '\n', ...(inherited ? { style: inherited } : {}), ...source }];
    case 'emphasis':
      return projectInlineChildren(
        node.children,
        context,
        mergeStyle(inherited, { markdownRole: 'emphasis', attributes: { italic: true } }),
      );
    case 'strong':
      return projectInlineChildren(
        node.children,
        context,
        mergeStyle(inherited, { markdownRole: 'strong', attributes: { bold: true } }),
      );
    case 'delete':
      return projectInlineChildren(
        node.children,
        context,
        mergeStyle(inherited, {
          markdownRole: 'strikethrough',
          attributes: { strikethrough: true },
        }),
      );
    case 'inlineCode':
      return [
        { text: node.value, style: mergeStyle(inherited, { markdownRole: 'code' }), ...source },
      ];
    case 'link': {
      const target = context.targetResolver.resolve({
        destination: node.destination,
        usage: 'link',
      });
      const style = mergeStyle(inherited, {
        markdownRole: 'link',
        attributes: { underline: true },
      });
      const children = projectInlineChildren(node.children, context, style);
      const hyperlink = toTerminalHyperlink(target);
      if (target.kind === 'authorized-local-resource') {
        context.authorizedDestinationRanges.add(rangeKey(node.range));
      }
      if (target.kind === 'unsupported') {
        context.diagnostics.push(unsupportedTargetDiagnostic(node.destination, target.reason));
        const label = children.map((segment) => segment.text).join('');
        const suffix = label === target.displayTarget ? '' : ` (${target.displayTarget})`;
        return [
          ...children,
          ...(suffix
            ? [{ text: suffix, style: { markdownRole: 'diagnostic-warning' } as const, ...source }]
            : []),
        ];
      }
      return children.map((segment) => ({ ...segment, hyperlink }));
    }
    case 'linkReference':
      return [
        ...projectInlineChildren(
          node.children,
          context,
          mergeStyle(inherited, { markdownRole: 'link' }),
        ),
        {
          text: ` [${node.label ?? node.identifier}]`,
          style: { markdownRole: 'muted' },
          ...source,
        },
      ];
    case 'image': {
      const label = `[${labels.image(node.altText || 'image')}]`;
      const target = context.targetResolver.resolve({
        destination: node.destination,
        usage: 'image',
      });
      const hyperlink = toTerminalHyperlink(target);
      if (target.kind === 'authorized-local-resource') {
        context.authorizedDestinationRanges.add(rangeKey(node.range));
      }
      if (target.kind === 'unsupported') {
        context.diagnostics.push(unsupportedTargetDiagnostic(node.destination, target.reason));
      }
      return [
        {
          text: label === target.displayTarget ? label : `${label} (${target.displayTarget})`,
          style: { markdownRole: hyperlink ? 'link' : 'diagnostic-warning' },
          ...(hyperlink ? { hyperlink } : {}),
          ...source,
        },
      ];
    }
    case 'imageReference':
      return [
        {
          text: `[${labels.image(node.altText || 'image')}] [${node.label ?? node.identifier}]`,
          style: { markdownRole: 'muted' },
          ...source,
        },
      ];
    case 'html':
      return [
        { text: node.value, style: mergeStyle(inherited, { markdownRole: 'muted' }), ...source },
      ];
    case 'nekoMention':
      return [
        {
          text: node.raw,
          style: mergeStyle(inherited, { markdownRole: 'link', attributes: { bold: true } }),
          ...source,
        },
      ];
    case 'nekoResourceReference':
      return [
        { text: node.raw, style: mergeStyle(inherited, { markdownRole: 'link' }), ...source },
      ];
    case 'paragraph':
    case 'heading':
    case 'blockquote':
    case 'list':
    case 'listItem':
    case 'codeBlock':
    case 'thematicBreak':
    case 'definition':
    case 'table':
    case 'tableRow':
    case 'tableCell':
    case 'root':
      throw new Error(`Block-only Markdown node ${node.type} appeared inline.`);
    default:
      return assertNever(node);
  }
}

function projectTable(node: MarkdownTableNode, context: ProjectorContext): TerminalTableBlock {
  const columnCount = Math.max(
    node.alignments.length,
    node.header.cells.length,
    ...node.rows.map((row) => row.cells.length),
  );
  const header = rectangularizeRow(node.header.cells, columnCount, context, true);
  const rows = node.rows.map((row) => rectangularizeRow(row.cells, columnCount, context, false));
  return {
    kind: 'table',
    alignments: Array.from(
      { length: columnCount },
      (_, index) => node.alignments[index] ?? 'unspecified',
    ),
    header,
    rows,
    provenance: sourceProvenance(node.id, node.range),
  };
}

function rectangularizeRow(
  cells: readonly MarkdownTableCellNode[],
  count: number,
  context: ProjectorContext,
  header: boolean,
): readonly TerminalTableCell[] {
  const labels = context.labels;
  return Array.from({ length: count }, (_, index) => {
    const cell = cells[index];
    if (cell !== undefined) {
      return {
        segments: projectInlineChildren(cell.children, context),
        provenance: sourceProvenance(cell.id, cell.range),
      };
    }
    return {
      segments: header
        ? [
            {
              text: labels.syntheticColumn(index + 1),
              style: { markdownRole: 'table-header' },
            },
          ]
        : [],
      provenance: {
        kind: 'synthetic',
        reason: header ? 'synthetic-table-header' : 'missing-table-cell',
      },
    };
  });
}

function sourceProvenance(
  nodeId: MarkdownNode['id'],
  range: MarkdownSourceRange,
): TerminalProjectionProvenance;
function sourceProvenance(
  nodeId: MarkdownNode['id'],
  range: MarkdownSourceRange,
): TerminalProjectionProvenance {
  return { kind: 'source', nodeId, sourceRange: range };
}

function mergeStyle(base: TerminalStyleRef | undefined, next: TerminalStyleRef): TerminalStyleRef {
  return {
    ...(base ?? {}),
    ...next,
    attributes: { ...(base?.attributes ?? {}), ...(next.attributes ?? {}) },
  };
}

function rangeKey(range: MarkdownSourceRange): string {
  return `${range.startOffset}:${range.endOffset}`;
}

function unsupportedTargetDiagnostic(
  destination: string,
  reason: 'invalid' | 'unsafe-control' | 'unsupported-scheme' | 'unauthorized-local-resource',
): TerminalMarkdownDiagnostic {
  return {
    code: 'TUI_MD_UNSAFE_HYPERLINK',
    severity: 'warning',
    parameters: { target: destination, reason },
  };
}

function assertNever(value: never): never {
  throw new Error(`Unregistered Markdown node: ${JSON.stringify(value)}`);
}
