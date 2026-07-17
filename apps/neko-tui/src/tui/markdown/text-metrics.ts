import stringWidth from 'string-width';
import { splitGraphemes } from 'unicode-segmenter/grapheme';
import type { TerminalStyledLine, TerminalStyledSegment } from './contracts';

export type TerminalTextAlignment = 'left' | 'center' | 'right';

export interface TerminalTextMetrics {
  segmentGraphemes(text: string): readonly string[];
  displayWidth(text: string, startColumn?: number): number;
  expandTabs(text: string, startColumn?: number): string;
  wrapStyledSegments(
    segments: readonly TerminalStyledSegment[],
    maxWidth: number,
  ): readonly TerminalStyledLine[];
  pad(text: string, width: number, alignment?: TerminalTextAlignment): string;
}

export interface TerminalTextMetricsOptions {
  readonly tabWidth?: number;
}

export class DefaultTerminalTextMetrics implements TerminalTextMetrics {
  private readonly tabWidth: number;

  constructor(options: TerminalTextMetricsOptions = {}) {
    const tabWidth = options.tabWidth ?? 4;
    if (!Number.isInteger(tabWidth) || tabWidth < 1) {
      throw new RangeError(`tabWidth must be a positive integer, received ${tabWidth}.`);
    }
    this.tabWidth = tabWidth;
  }

  segmentGraphemes(text: string): readonly string[] {
    return [...splitGraphemes(text)];
  }

  displayWidth(text: string, startColumn = 0): number {
    assertColumn(startColumn);
    let column = startColumn;
    for (const grapheme of splitGraphemes(text)) {
      if (grapheme === '\t') {
        column += this.tabWidth - (column % this.tabWidth);
      } else if (grapheme === '\n' || grapheme === '\r') {
        column = 0;
      } else {
        column += stringWidth(grapheme);
      }
    }
    return column - (text.includes('\n') || text.includes('\r') ? 0 : startColumn);
  }

  expandTabs(text: string, startColumn = 0): string {
    assertColumn(startColumn);
    let column = startColumn;
    let expanded = '';
    for (const grapheme of splitGraphemes(text)) {
      if (grapheme === '\t') {
        const spaces = this.tabWidth - (column % this.tabWidth);
        expanded += ' '.repeat(spaces);
        column += spaces;
      } else {
        expanded += grapheme;
        if (grapheme === '\n' || grapheme === '\r') {
          column = 0;
        } else {
          column += stringWidth(grapheme);
        }
      }
    }
    return expanded;
  }

  wrapStyledSegments(
    segments: readonly TerminalStyledSegment[],
    maxWidth: number,
  ): readonly TerminalStyledLine[] {
    if (!Number.isInteger(maxWidth) || maxWidth < 1) {
      throw new RangeError(`maxWidth must be a positive integer, received ${maxWidth}.`);
    }

    const lines: TerminalStyledLine[] = [];
    let lineSegments: TerminalStyledSegment[] = [];
    let lineWidth = 0;

    const flush = (force: boolean): void => {
      if (!force && lineSegments.length === 0) return;
      lines.push({ segments: lineSegments, displayWidth: lineWidth });
      lineSegments = [];
      lineWidth = 0;
    };

    for (const segment of segments) {
      const sourceBase = segment.sourceStartOffset;
      let consumedCodeUnits = 0;
      for (const grapheme of splitGraphemes(segment.text)) {
        if (grapheme === '\n') {
          flush(true);
          consumedCodeUnits += grapheme.length;
          continue;
        }

        const visible = grapheme === '\t' ? this.expandTabs(grapheme, lineWidth) : grapheme;
        const width = this.displayWidth(visible, lineWidth);
        if (lineWidth > 0 && lineWidth + width > maxWidth) flush(true);

        // A terminal grapheme can be wider than an extremely narrow viewport. It remains atomic.
        appendSegment(lineSegments, {
          ...segment,
          text: visible,
          sourceStartOffset: sourceBase === undefined ? undefined : sourceBase + consumedCodeUnits,
          sourceEndOffset:
            sourceBase === undefined ? undefined : sourceBase + consumedCodeUnits + grapheme.length,
        });
        lineWidth += width;
        consumedCodeUnits += grapheme.length;

        if (lineWidth >= maxWidth) flush(true);
      }
    }

    flush(lines.length === 0 || lineSegments.length > 0);
    return lines;
  }

  pad(text: string, width: number, alignment: TerminalTextAlignment = 'left'): string {
    if (!Number.isInteger(width) || width < 0) {
      throw new RangeError(`width must be a non-negative integer, received ${width}.`);
    }
    const textWidth = this.displayWidth(text);
    if (textWidth >= width) return text;
    const remaining = width - textWidth;
    if (alignment === 'right') return `${' '.repeat(remaining)}${text}`;
    if (alignment === 'center') {
      const left = Math.floor(remaining / 2);
      return `${' '.repeat(left)}${text}${' '.repeat(remaining - left)}`;
    }
    return `${text}${' '.repeat(remaining)}`;
  }
}

export const terminalTextMetrics: TerminalTextMetrics = new DefaultTerminalTextMetrics();

function assertColumn(column: number): void {
  if (!Number.isInteger(column) || column < 0) {
    throw new RangeError(`startColumn must be a non-negative integer, received ${column}.`);
  }
}

function appendSegment(target: TerminalStyledSegment[], next: TerminalStyledSegment): void {
  const previous = target.at(-1);
  if (
    previous !== undefined &&
    previous.style === next.style &&
    previous.hyperlink === next.hyperlink &&
    previous.sourceEndOffset === next.sourceStartOffset
  ) {
    target[target.length - 1] = {
      ...previous,
      text: previous.text + next.text,
      sourceEndOffset: next.sourceEndOffset,
    };
    return;
  }
  target.push(next);
}
