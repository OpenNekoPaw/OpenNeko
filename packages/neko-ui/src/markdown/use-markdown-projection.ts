import { useMemo } from 'react';
import type { MarkdownProjectionInput, MarkdownProjectionResult } from './types';
import { projectMarkdownForUi } from './projection';

export function useMarkdownProjection(input: MarkdownProjectionInput): MarkdownProjectionResult {
  return useMemo(
    () => projectMarkdownForUi(input),
    [
      input.value,
      input.profile,
      input.projectionOptions,
      input.semanticSpans,
      input.diagnostics,
    ],
  );
}
