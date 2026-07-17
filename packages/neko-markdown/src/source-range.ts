export interface MarkdownSourceRange {
  readonly startOffset: number;
  readonly endOffset: number;
}

export interface MarkdownSourceProvenance {
  readonly kind: 'source';
  readonly range: MarkdownSourceRange;
}

export interface MarkdownSyntheticProvenance {
  readonly kind: 'synthetic';
  readonly operation: string;
  readonly originNodeId?: import('./identity').MarkdownNodeId;
  readonly originAnnotationId?: import('./identity').MarkdownAnnotationId;
  readonly originRange?: MarkdownSourceRange;
}

export type MarkdownProvenance = MarkdownSourceProvenance | MarkdownSyntheticProvenance;

export class MarkdownContractError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'MarkdownContractError';
  }
}

export function createMarkdownSourceRange(
  startOffset: number,
  endOffset: number,
  sourceLength: number,
): MarkdownSourceRange {
  const range = { startOffset, endOffset };
  assertMarkdownSourceRange(range, sourceLength);
  return range;
}

export function assertMarkdownSourceRange(
  range: MarkdownSourceRange,
  sourceLength: number,
  label = 'Markdown source range',
): void {
  if (!Number.isInteger(sourceLength) || sourceLength < 0) {
    throw new MarkdownContractError(`Invalid Markdown source length: ${sourceLength}`);
  }
  if (!Number.isInteger(range.startOffset) || !Number.isInteger(range.endOffset)) {
    throw new MarkdownContractError(`${label} offsets must be integers.`);
  }
  if (
    range.startOffset < 0 ||
    range.endOffset < range.startOffset ||
    range.endOffset > sourceLength
  ) {
    throw new MarkdownContractError(
      `${label} [${range.startOffset}, ${range.endOffset}) is outside source length ${sourceLength}.`,
    );
  }
}

export function assertMarkdownRangeContained(
  parent: MarkdownSourceRange,
  child: MarkdownSourceRange,
  label = 'Markdown child range',
): void {
  if (child.startOffset < parent.startOffset || child.endOffset > parent.endOffset) {
    throw new MarkdownContractError(
      `${label} [${child.startOffset}, ${child.endOffset}) is not contained by ` +
        `[${parent.startOffset}, ${parent.endOffset}).`,
    );
  }
}

export function rangesOverlap(left: MarkdownSourceRange, right: MarkdownSourceRange): boolean {
  return left.startOffset < right.endOffset && right.startOffset < left.endOffset;
}
