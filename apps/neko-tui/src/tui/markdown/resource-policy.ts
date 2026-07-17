export interface MarkdownResourcePolicy {
  readonly streamingCoalesceDelayMs: number;
  readonly tableGridMaxCells: number;
  readonly highlightMaxBytes: number;
  readonly highlightMaxLines: number;
  readonly parseAssociatedCacheEntries: number;
  readonly resolutionCacheEntries: number;
  readonly resolutionCacheNodes: number;
  readonly projectionCacheEntries: number;
  readonly layoutCacheEntries: number;
  readonly highlightCacheBytes: number;
}

/**
 * Package-local deterministic budgets. They are implementation guardrails, not user settings.
 * Streaming presentation is capped at 20 frames per second so token bursts cannot monopolize
 * the Ink event loop. Remaining defaults are intentionally above ordinary assistant output while
 * bounding quadratic table search, grammar work, and retained presentation state.
 */
export const DEFAULT_MARKDOWN_RESOURCE_POLICY: MarkdownResourcePolicy = Object.freeze({
  streamingCoalesceDelayMs: 50,
  tableGridMaxCells: 1_024,
  highlightMaxBytes: 256 * 1_024,
  highlightMaxLines: 4_096,
  parseAssociatedCacheEntries: 32,
  resolutionCacheEntries: 64,
  resolutionCacheNodes: 4_096,
  projectionCacheEntries: 64,
  layoutCacheEntries: 128,
  highlightCacheBytes: 2 * 1_024 * 1_024,
});
