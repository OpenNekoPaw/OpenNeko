import type { MarkdownTableAlignment } from '@neko/markdown';
import type { TerminalMarkdownMessages } from '../presentation/terminal-label-presentation';
import type { TerminalStyledSegment } from './contracts';
import type { TerminalTextMetrics } from './text-metrics';
import type { TerminalLine, TerminalTableBlock, TerminalTableCell } from './terminal-blocks';
import type { MarkdownResourcePolicy } from './resource-policy';

export type TerminalTableMode = 'aligned-grid' | 'vertical-records' | 'stacked-records';
export type TerminalTableColumnProfileKind = 'compact' | 'narrative' | 'token-heavy';

export interface TerminalTableColumnProfile {
  readonly kind: TerminalTableColumnProfileKind;
  readonly naturalWidth: number;
  readonly preferredFloor: number;
  readonly hardFloor: number;
  readonly longestUnbreakableWidth: number;
}

export interface TerminalTableLayoutResult {
  readonly mode: TerminalTableMode;
  readonly profiles: readonly TerminalTableColumnProfile[];
  readonly lines: readonly TerminalLine[];
  readonly gridBudgetExceeded: boolean;
}

export function layoutTerminalTable(
  table: TerminalTableBlock,
  viewportWidth: number,
  metrics: TerminalTextMetrics,
  policy: MarkdownResourcePolicy,
  labels: TerminalMarkdownMessages,
  supportsUnicode: boolean,
): TerminalTableLayoutResult {
  const profiles = profileTableColumns(table, metrics);
  const cellCount = (table.rows.length + 1) * table.header.length;
  const gridBudgetExceeded = cellCount > policy.tableGridMaxCells;
  const borders = supportsUnicode
    ? {
        v: '│',
        h: '─',
        cross: '┼',
        tl: '┌',
        tr: '┐',
        bl: '└',
        br: '┘',
        lt: '├',
        rt: '┤',
        tt: '┬',
        bt: '┴',
      }
    : {
        v: '|',
        h: '-',
        cross: '+',
        tl: '+',
        tr: '+',
        bl: '+',
        br: '+',
        lt: '+',
        rt: '+',
        tt: '+',
        bt: '+',
      };

  const widths = gridBudgetExceeded ? undefined : allocateGridWidths(profiles, viewportWidth);
  if (widths !== undefined) {
    return {
      mode: 'aligned-grid',
      profiles,
      gridBudgetExceeded: false,
      lines: layoutGrid(table, widths, metrics, borders),
    };
  }
  if (viewportWidth >= 24) {
    return {
      mode: 'vertical-records',
      profiles,
      gridBudgetExceeded,
      lines: layoutVerticalRecords(table, viewportWidth, metrics, borders, labels),
    };
  }
  return {
    mode: 'stacked-records',
    profiles,
    gridBudgetExceeded,
    lines: layoutStackedRecords(table, viewportWidth, metrics, labels),
  };
}

function profileTableColumns(
  table: TerminalTableBlock,
  metrics: TerminalTextMetrics,
): readonly TerminalTableColumnProfile[] {
  return table.header.map((_, columnIndex) => {
    const values = [table.header, ...table.rows].map((row) => cellText(row[columnIndex]));
    const naturalWidth = Math.max(1, ...values.map((value) => metrics.displayWidth(value)));
    const longestUnbreakableWidth = Math.max(
      1,
      ...values.flatMap((value) => value.split(/\s+/u)).map((value) => metrics.displayWidth(value)),
    );
    const hasNarrative = values.some((value) => value.length > 24 && /\s/u.test(value));
    const hasLongToken = longestUnbreakableWidth > 18;
    const kind: TerminalTableColumnProfileKind = hasLongToken
      ? 'token-heavy'
      : hasNarrative
        ? 'narrative'
        : 'compact';
    const hardFloor = Math.min(
      naturalWidth,
      kind === 'narrative' ? 6 : kind === 'token-heavy' ? 4 : 3,
    );
    const preferredFloor = Math.min(
      naturalWidth,
      kind === 'narrative' ? 16 : kind === 'token-heavy' ? 12 : 8,
    );
    return { kind, naturalWidth, preferredFloor, hardFloor, longestUnbreakableWidth };
  });
}

function allocateGridWidths(
  profiles: readonly TerminalTableColumnProfile[],
  viewportWidth: number,
): readonly number[] | undefined {
  if (profiles.length === 0) return [];
  const borderWidth = profiles.length + 1;
  const paddingWidth = profiles.length * 2;
  const available = viewportWidth - borderWidth - paddingWidth;
  const preferredTotal = profiles.reduce((sum, profile) => sum + profile.preferredFloor, 0);
  if (preferredTotal > available) return undefined;
  const widths = profiles.map((profile) => profile.hardFloor);

  let remaining = available - widths.reduce((sum, width) => sum + width, 0);
  distribute(
    widths,
    profiles.map((profile) => profile.preferredFloor),
    () => remaining--,
    () => remaining > 0,
  );
  distribute(
    widths,
    profiles.map((profile) => profile.naturalWidth),
    () => remaining--,
    () => remaining > 0,
  );
  return widths;
}

function distribute(
  widths: number[],
  targets: readonly number[],
  consume: () => void,
  hasRemaining: () => boolean,
): void {
  while (hasRemaining()) {
    let changed = false;
    for (let index = 0; index < widths.length && hasRemaining(); index += 1) {
      const current = widths[index];
      const target = targets[index];
      if (current === undefined || target === undefined || current >= target) continue;
      widths[index] = current + 1;
      consume();
      changed = true;
    }
    if (!changed) return;
  }
}

function layoutGrid(
  table: TerminalTableBlock,
  widths: readonly number[],
  metrics: TerminalTextMetrics,
  borders: BorderChars,
): readonly TerminalLine[] {
  const lines: TerminalLine[] = [];
  lines.push(borderLine(widths, borders.tl, borders.tt, borders.tr, borders.h, metrics));
  const rows = [table.header, ...table.rows];
  rows.forEach((row, rowIndex) => {
    const wrapped = row.map((cell, column) =>
      metrics.wrapStyledSegments(cell.segments, widths[column] ?? 1),
    );
    const height = Math.max(1, ...wrapped.map((cellLines) => cellLines.length));
    for (let lineIndex = 0; lineIndex < height; lineIndex += 1) {
      const segments: TerminalStyledSegment[] = [borderSegment(borders.v)];
      row.forEach((_, column) => {
        const width = widths[column] ?? 1;
        const cellLine = wrapped[column]?.[lineIndex];
        const alignment = table.alignments[column] ?? 'unspecified';
        segments.push({ text: ' ' });
        segments.push(
          ...alignSegments(cellLine?.segments ?? [], cellLine?.displayWidth ?? 0, width, alignment),
        );
        segments.push({ text: ' ' }, borderSegment(borders.v));
      });
      lines.push({
        kind: 'content',
        segments,
        displayWidth: metrics.displayWidth(segmentText(segments)),
        provenance: table.provenance,
      });
    }
    if (rowIndex < rows.length - 1) {
      lines.push(borderLine(widths, borders.lt, borders.cross, borders.rt, borders.h, metrics));
    }
  });
  lines.push(borderLine(widths, borders.bl, borders.bt, borders.br, borders.h, metrics));
  return lines;
}

function layoutVerticalRecords(
  table: TerminalTableBlock,
  viewportWidth: number,
  metrics: TerminalTextMetrics,
  borders: BorderChars,
  labels: TerminalMarkdownMessages,
): readonly TerminalLine[] {
  const lines: TerminalLine[] = [];
  table.rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) lines.push(ruleLine(viewportWidth, borders.h, metrics));
    row.forEach((cell, column) => {
      const header = cellText(table.header[column]) || labels.syntheticColumn(column + 1);
      const prefix = `${header}: `;
      const prefixWidth = metrics.displayWidth(prefix);
      const width = Math.max(1, viewportWidth - prefixWidth);
      const wrapped = metrics.wrapStyledSegments(cell.segments, width);
      wrapped.forEach((line, lineIndex) => {
        const segments: TerminalStyledSegment[] = [
          {
            text: lineIndex === 0 ? prefix : ' '.repeat(prefixWidth),
            style: { markdownRole: 'table-header', attributes: { bold: true } },
          },
          ...line.segments,
        ];
        lines.push({
          kind: 'content',
          segments,
          displayWidth: prefixWidth + line.displayWidth,
          provenance: cell.provenance,
        });
      });
    });
  });
  return lines;
}

function layoutStackedRecords(
  table: TerminalTableBlock,
  viewportWidth: number,
  metrics: TerminalTextMetrics,
  labels: TerminalMarkdownMessages,
): readonly TerminalLine[] {
  const lines: TerminalLine[] = [];
  table.rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) lines.push({ kind: 'blank', segments: [], displayWidth: 0 });
    row.forEach((cell, column) => {
      const header = cellText(table.header[column]) || labels.syntheticColumn(column + 1);
      const headerLines = metrics.wrapStyledSegments(
        [{ text: header, style: { markdownRole: 'table-header', attributes: { bold: true } } }],
        viewportWidth,
      );
      lines.push(
        ...headerLines.map((line) => ({
          kind: 'content' as const,
          segments: line.segments,
          displayWidth: line.displayWidth,
          provenance: cell.provenance,
        })),
      );
      const valueLines = metrics.wrapStyledSegments(
        cell.segments.length > 0
          ? cell.segments
          : [{ text: '—', style: { markdownRole: 'muted' } }],
        Math.max(1, viewportWidth - 2),
      );
      lines.push(
        ...valueLines.map((line) => ({
          kind: 'content' as const,
          segments: [{ text: '  ' }, ...line.segments],
          displayWidth: line.displayWidth + 2,
          provenance: cell.provenance,
        })),
      );
    });
  });
  return lines;
}

function alignSegments(
  segments: readonly TerminalStyledSegment[],
  currentWidth: number,
  width: number,
  alignment: MarkdownTableAlignment,
): readonly TerminalStyledSegment[] {
  const remaining = Math.max(0, width - currentWidth);
  const left =
    alignment === 'right' ? remaining : alignment === 'center' ? Math.floor(remaining / 2) : 0;
  const right = remaining - left;
  return [
    ...(left > 0 ? [{ text: ' '.repeat(left) }] : []),
    ...segments,
    ...(right > 0 ? [{ text: ' '.repeat(right) }] : []),
  ];
}

interface BorderChars {
  readonly v: string;
  readonly h: string;
  readonly cross: string;
  readonly tl: string;
  readonly tr: string;
  readonly bl: string;
  readonly br: string;
  readonly lt: string;
  readonly rt: string;
  readonly tt: string;
  readonly bt: string;
}
function borderSegment(text: string): TerminalStyledSegment {
  return { text, style: { markdownRole: 'table-border' } };
}
function borderLine(
  widths: readonly number[],
  left: string,
  joint: string,
  right: string,
  horizontal: string,
  metrics: TerminalTextMetrics,
): TerminalLine {
  const text = `${left}${widths.map((width) => horizontal.repeat(width + 2)).join(joint)}${right}`;
  return {
    kind: 'content',
    segments: [borderSegment(text)],
    displayWidth: metrics.displayWidth(text),
  };
}
function ruleLine(width: number, horizontal: string, metrics: TerminalTextMetrics): TerminalLine {
  const text = horizontal.repeat(Math.max(1, width));
  return {
    kind: 'content',
    segments: [borderSegment(text)],
    displayWidth: metrics.displayWidth(text),
  };
}
function cellText(cell: TerminalTableCell | undefined): string {
  return cell ? segmentText(cell.segments) : '';
}
function segmentText(segments: readonly TerminalStyledSegment[]): string {
  return segments.map((segment) => segment.text).join('');
}
