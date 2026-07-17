import type { MarkdownSourceRange } from '@neko/markdown';
import type { TerminalMarkdownMessages } from '../presentation/terminal-label-presentation';
import type { TerminalMarkdownDiagnostic, TerminalStyledSegment } from './contracts';
import { presentMarkdownDiagnostic } from './diagnostic-presentation';
import { DEFAULT_MARKDOWN_RESOURCE_POLICY, type MarkdownResourcePolicy } from './resource-policy';
import { layoutTerminalTable } from './table-layout';
import { terminalTextMetrics, type TerminalTextMetrics } from './text-metrics';
import type {
  TerminalCodeBlock,
  TerminalLine,
  TerminalMarkdownBlock,
  TerminalMarkdownLayout,
  TerminalMarkdownLayoutInput,
} from './terminal-blocks';

export interface LayoutTerminalMarkdownOptions {
  readonly metrics?: TerminalTextMetrics;
  readonly policy?: MarkdownResourcePolicy;
  readonly labels: TerminalMarkdownMessages;
}

export function layoutTerminalMarkdown(
  input: TerminalMarkdownLayoutInput,
  options: LayoutTerminalMarkdownOptions,
): TerminalMarkdownLayout {
  if (!Number.isInteger(input.viewportWidth) || input.viewportWidth < 1) {
    throw new RangeError(`viewportWidth must be positive, received ${input.viewportWidth}.`);
  }
  const metrics = options.metrics ?? terminalTextMetrics;
  const context: LayoutContext = {
    width: input.viewportWidth,
    supportsUnicode: input.supportsUnicode,
    metrics,
    policy: options.policy ?? DEFAULT_MARKDOWN_RESOURCE_POLICY,
    labels: options.labels,
  };
  const lines = layoutBlocks(input.projection.blocks, context);
  for (const diagnostic of input.projection.diagnostics) {
    const wrapped = metrics.wrapStyledSegments(diagnostic.segments, input.viewportWidth);
    lines.push(
      ...wrapped.map((line) => ({
        kind: 'diagnostic' as const,
        segments: line.segments,
        displayWidth: line.displayWidth,
      })),
    );
  }
  return {
    sessionId: input.projection.sessionId,
    revision: input.projection.revision,
    viewportWidth: input.viewportWidth,
    lines,
  };
}

interface LayoutContext {
  readonly width: number;
  readonly supportsUnicode: boolean;
  readonly metrics: TerminalTextMetrics;
  readonly policy: MarkdownResourcePolicy;
  readonly labels: TerminalMarkdownMessages;
}

function layoutBlocks(
  blocks: readonly TerminalMarkdownBlock[],
  context: LayoutContext,
): TerminalLine[] {
  const lines: TerminalLine[] = [];
  blocks.forEach((block, index) => {
    if (index > 0 && lines.at(-1)?.kind !== 'blank') lines.push(blankLine());
    lines.push(...layoutBlock(block, context));
  });
  return lines;
}

function layoutBlock(
  block: TerminalMarkdownBlock,
  context: LayoutContext,
): readonly TerminalLine[] {
  switch (block.kind) {
    case 'paragraph':
    case 'raw-html':
    case 'definition':
      return wrap(block.segments, context, block.provenance);
    case 'heading': {
      const marker = `${'#'.repeat(block.depth ?? 1)} `;
      return wrapWithFirstPrefix(
        block.segments,
        marker,
        ' '.repeat(marker.length),
        context,
        block.provenance,
      );
    }
    case 'quote': {
      const prefix = context.supportsUnicode ? '│ ' : '| ';
      const inner = layoutBlocks(block.blocks, {
        ...context,
        width: Math.max(1, context.width - 2),
      });
      return inner.map((line) =>
        prefixLine(line, prefix, context.metrics, block.provenance, 'quote-border'),
      );
    }
    case 'list': {
      const result: TerminalLine[] = [];
      block.items.forEach((item, itemIndex) => {
        const task = item.checked === undefined ? '' : item.checked ? '[x] ' : '[ ] ';
        const marker = block.ordered
          ? `${block.start + itemIndex}. ${task}`
          : `${context.supportsUnicode ? '•' : '*'} ${task}`;
        const continuation = ' '.repeat(context.metrics.displayWidth(marker));
        const inner = layoutBlocks(item.blocks, {
          ...context,
          width: Math.max(1, context.width - continuation.length),
        });
        inner.forEach((line, lineIndex) =>
          result.push(
            prefixLine(
              line,
              lineIndex === 0 ? marker : continuation,
              context.metrics,
              item.provenance,
              'list-marker',
            ),
          ),
        );
      });
      return result;
    }
    case 'code':
      return layoutCode(block, context);
    case 'thematic-break': {
      const text = (context.supportsUnicode ? '─' : '-').repeat(context.width);
      return [
        {
          kind: 'content',
          segments: [{ text, style: { markdownRole: 'muted' } }],
          displayWidth: context.width,
          provenance: block.provenance,
        },
      ];
    }
    case 'table': {
      const result = layoutTerminalTable(
        block,
        context.width,
        context.metrics,
        context.policy,
        context.labels,
        context.supportsUnicode,
      );
      if (!result.gridBudgetExceeded) return result.lines;
      const diagnostic: TerminalMarkdownDiagnostic = {
        code: 'MD_TABLE_GRID_BUDGET_EXCEEDED',
        severity: 'info',
        parameters: { cells: (block.rows.length + 1) * block.header.length },
      };
      const presentation = presentMarkdownDiagnostic(diagnostic, context.labels);
      const diagnosticLines = context.metrics
        .wrapStyledSegments(presentation.segments, context.width)
        .map((line) => ({
          kind: 'diagnostic' as const,
          segments: line.segments,
          displayWidth: line.displayWidth,
          provenance: block.provenance,
        }));
      return [...result.lines, ...diagnosticLines];
    }
    case 'diagnostic':
      return context.metrics
        .wrapStyledSegments(block.presentation.segments, context.width)
        .map((line) => ({
          kind: 'diagnostic',
          segments: line.segments,
          displayWidth: line.displayWidth,
          provenance: block.provenance,
        }));
    default:
      return assertNever(block);
  }
}

function layoutCode(block: TerminalCodeBlock, context: LayoutContext): readonly TerminalLine[] {
  // Decoration collapses before content at narrow widths.
  const border = context.width >= 6;
  const prefix = border ? (context.supportsUnicode ? '│ ' : '| ') : '';
  const contentWidth = Math.max(1, context.width - context.metrics.displayWidth(prefix));
  const logicalLines = splitCodeLogicalLines(block);
  return logicalLines.flatMap((segments, logicalIndex) => {
    const wrapped = wrapCodeAtNaturalBoundaries(segments, contentWidth, context.metrics);
    return wrapped.map((line, fragmentIndex) => {
      const outputSegments: TerminalStyledSegment[] = prefix
        ? [{ text: prefix, style: { markdownRole: 'code-border' } }, ...line.segments]
        : [...line.segments];
      return {
        kind: 'content' as const,
        segments: outputSegments,
        displayWidth: context.metrics.displayWidth(prefix) + line.displayWidth,
        provenance: block.provenance,
        logicalLine: logicalIndex + 1,
        fragmentIndex,
        continuation: fragmentIndex > 0,
        ...(line.sourceRange ? { sourceRange: line.sourceRange } : {}),
      };
    });
  });
}

interface CodeVisualLine {
  readonly segments: readonly TerminalStyledSegment[];
  readonly displayWidth: number;
  readonly sourceRange?: MarkdownSourceRange;
}

function splitCodeLogicalLines(
  block: TerminalCodeBlock,
): readonly (readonly TerminalStyledSegment[])[] {
  const input: readonly TerminalStyledSegment[] = block.tokens
    ? block.tokens.map((token) => ({
        text: token.text,
        style: { markdownRole: 'code', syntaxRole: token.role },
        sourceStartOffset: token.sourceRange.startOffset,
        sourceEndOffset: token.sourceRange.endOffset,
      }))
    : [
        {
          text: block.value,
          style: { markdownRole: 'code' },
          sourceStartOffset: 0,
          sourceEndOffset: block.value.length,
        },
      ];
  const lines: TerminalStyledSegment[][] = [[]];
  for (const segment of input) {
    let offset = segment.sourceStartOffset ?? 0;
    const parts = segment.text.split('\n');
    parts.forEach((part, index) => {
      if (part.length > 0) {
        lines.at(-1)?.push({
          ...segment,
          text: part,
          sourceStartOffset: offset,
          sourceEndOffset: offset + part.length,
        });
      }
      offset += part.length;
      if (index < parts.length - 1) {
        offset += 1;
        lines.push([]);
      }
    });
  }
  return lines;
}

function wrapCodeAtNaturalBoundaries(
  segments: readonly TerminalStyledSegment[],
  maxWidth: number,
  metrics: TerminalTextMetrics,
): readonly CodeVisualLine[] {
  const units: Array<{
    readonly segment: TerminalStyledSegment;
    readonly grapheme: string;
    readonly breakAfter: boolean;
  }> = [];
  for (const segment of segments) {
    let consumed = 0;
    for (const grapheme of metrics.segmentGraphemes(segment.text)) {
      const sourceStartOffset =
        segment.sourceStartOffset === undefined ? undefined : segment.sourceStartOffset + consumed;
      units.push({
        segment: {
          ...segment,
          text: grapheme,
          ...(sourceStartOffset === undefined
            ? {}
            : { sourceStartOffset, sourceEndOffset: sourceStartOffset + grapheme.length }),
        },
        grapheme,
        breakAfter: /[\s/.,;:!?()[\]{}<>+\-=]/u.test(grapheme),
      });
      consumed += grapheme.length;
    }
  }
  if (units.length === 0) return [{ segments: [], displayWidth: 0 }];

  const output: CodeVisualLine[] = [];
  let start = 0;
  while (start < units.length) {
    let end = start;
    let width = 0;
    let naturalEnd: number | undefined;
    while (end < units.length) {
      const next = units[end];
      if (next === undefined) break;
      const nextWidth = codeGraphemeWidth(next.grapheme, width, metrics);
      if (end > start && width + nextWidth > maxWidth) break;
      width += nextWidth;
      end += 1;
      if (next.breakAfter) naturalEnd = end;
      if (width >= maxWidth) break;
    }
    if (end < units.length && naturalEnd !== undefined && naturalEnd > start) end = naturalEnd;
    if (end === start) end = start + 1;
    const selected = units.slice(start, end);
    const selectedSegments: TerminalStyledSegment[] = [];
    let selectedWidth = 0;
    for (const unit of selected) {
      const visible =
        unit.grapheme === '\t' ? metrics.expandTabs(unit.grapheme, selectedWidth) : unit.grapheme;
      appendCodeSegment(selectedSegments, { ...unit.segment, text: visible });
      selectedWidth += metrics.displayWidth(visible, selectedWidth);
    }
    const sourceStarts = selectedSegments.flatMap((segment) =>
      segment.sourceStartOffset === undefined ? [] : [segment.sourceStartOffset],
    );
    const sourceEnds = selectedSegments.flatMap((segment) =>
      segment.sourceEndOffset === undefined ? [] : [segment.sourceEndOffset],
    );
    output.push({
      segments: selectedSegments,
      displayWidth: selectedWidth,
      ...(sourceStarts.length > 0 && sourceEnds.length > 0
        ? {
            sourceRange: {
              startOffset: Math.min(...sourceStarts),
              endOffset: Math.max(...sourceEnds),
            },
          }
        : {}),
    });
    start = end;
  }
  return output;
}

function codeGraphemeWidth(
  grapheme: string,
  currentColumn: number,
  metrics: TerminalTextMetrics,
): number {
  const visible = grapheme === '\t' ? metrics.expandTabs(grapheme, currentColumn) : grapheme;
  return metrics.displayWidth(visible, currentColumn);
}

function appendCodeSegment(target: TerminalStyledSegment[], segment: TerminalStyledSegment): void {
  const previous = target.at(-1);
  if (
    previous !== undefined &&
    previous.style === segment.style &&
    previous.hyperlink === segment.hyperlink &&
    previous.sourceEndOffset === segment.sourceStartOffset
  ) {
    target[target.length - 1] = {
      ...previous,
      text: previous.text + segment.text,
      sourceEndOffset: segment.sourceEndOffset,
    };
    return;
  }
  target.push(segment);
}

function wrap(
  segments: readonly TerminalStyledSegment[],
  context: LayoutContext,
  provenance: TerminalLine['provenance'],
): readonly TerminalLine[] {
  return context.metrics.wrapStyledSegments(segments, context.width).map((line) => ({
    kind: 'content',
    segments: line.segments,
    displayWidth: line.displayWidth,
    provenance,
  }));
}
function wrapWithFirstPrefix(
  segments: readonly TerminalStyledSegment[],
  first: string,
  continuation: string,
  context: LayoutContext,
  provenance: TerminalLine['provenance'],
): readonly TerminalLine[] {
  const width = Math.max(1, context.width - context.metrics.displayWidth(first));
  return context.metrics.wrapStyledSegments(segments, width).map((line, index) => {
    const prefix = index === 0 ? first : continuation;
    const output: readonly TerminalStyledSegment[] = [
      { text: prefix, style: { markdownRole: 'heading' } },
      ...line.segments,
    ];
    return {
      kind: 'content',
      segments: output,
      displayWidth: context.metrics.displayWidth(prefix) + line.displayWidth,
      provenance,
    };
  });
}
function prefixLine(
  line: TerminalLine,
  prefix: string,
  metrics: TerminalTextMetrics,
  provenance: TerminalLine['provenance'],
  role: 'quote-border' | 'list-marker',
): TerminalLine {
  return {
    ...line,
    segments: [{ text: prefix, style: { markdownRole: role } }, ...line.segments],
    displayWidth: metrics.displayWidth(prefix) + line.displayWidth,
    provenance,
  };
}
function blankLine(): TerminalLine {
  return { kind: 'blank', segments: [], displayWidth: 0 };
}
function assertNever(value: never): never {
  throw new Error(`Unknown terminal block: ${JSON.stringify(value)}`);
}
