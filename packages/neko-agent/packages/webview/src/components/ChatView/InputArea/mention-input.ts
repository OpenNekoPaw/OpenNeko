import { parseFileReference } from './FileReferenceMenu';

export interface TrailingMentionProjection {
  displayFilter: string;
  requestFilter: string;
  range: {
    start: number;
    end: number;
  };
}

export function projectTrailingMention(input: string): TrailingMentionProjection | null {
  const range = findTrailingMentionRange(input);
  if (!range) return null;

  const displayFilter = input.slice(range.start + 1, range.end);
  const parsed = parseFileReference(displayFilter);
  return {
    displayFilter,
    requestFilter: parsed?.file ?? displayFilter,
    range,
  };
}

export function findTrailingMentionRange(input: string): { start: number; end: number } | null {
  let index = input.length - 1;
  while (index >= 0 && !/\s/.test(input[index] ?? '')) {
    index -= 1;
  }

  const start = index + 1;
  if (input[start] !== '@') return null;
  return { start, end: input.length };
}
