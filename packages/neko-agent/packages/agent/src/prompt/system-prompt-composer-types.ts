/**
 * System Prompt Composer Types
 *
 * Defines the layered prompt composition model.
 * Each section belongs to a layer with its own token budget.
 */

// =============================================================================
// Layer Definition
// =============================================================================

/**
 * Prompt section layer, ordered by composition priority.
 *
 * Layers (ADR §11.6 six control planes → Prompt plane sublayers):
 * - base: protocol skeleton (tool-call conventions, output format, project context)
 * - schema: machine contracts contributed by current capabilities
 * - skill: explicitly active domain/reference guidance
 * - environment: user-authored overlay (AGENTS.md) + project memory
 * - ephemeral: per-turn injections (memory recall, version log, future self-eval)
 */
export type PromptLayer = 'base' | 'schema' | 'skill' | 'environment' | 'ephemeral';

/** Layer ordering for composition */
export const PROMPT_LAYER_ORDER: readonly PromptLayer[] = [
  'base',
  'schema',
  'skill',
  'environment',
  'ephemeral',
] as const;

// =============================================================================
// Section
// =============================================================================

/** A named section of the system prompt */
export interface PromptSection {
  /** Unique identifier (e.g., 'base', 'skill:commit-helper') */
  id: string;
  /** Which layer this section belongs to */
  layer: PromptLayer;
  /** The prompt text content */
  content: string;
  /** Stable owner/source identifier used by secret-free composition evidence */
  source: string;
  /** Optional stable content/package version; never derived from prompt content */
  version?: string;
  /** Higher priority = placed earlier within same layer (default: 50) */
  priority: number;
  /** Estimated token count (auto-calculated) */
  tokenEstimate: number;
  /** Timestamp when section was added */
  addedAt: number;
  /** Cache control hint for LLM API prompt caching (Anthropic: 'ephemeral') */
  cacheControl?: 'ephemeral';
}

// =============================================================================
// Budget
// =============================================================================

/** Per-layer token budget configuration */
export interface PromptLayerBudget {
  base: number;
  schema: number;
  skill: number;
  environment: number;
  ephemeral: number;
}

/** Default budget values */
export const DEFAULT_PROMPT_LAYER_BUDGET: PromptLayerBudget = {
  base: 8000,
  schema: 1500,
  skill: 4000,
  environment: 2000,
  ephemeral: 1000,
};

// =============================================================================
// Composer Options
// =============================================================================

/** Options for SystemPromptComposer */
export interface SystemPromptComposerOptions {
  /** Per-layer token budgets (uses defaults if not specified) */
  budget?: Partial<PromptLayerBudget>;
  /** Section separator string (default: '\n\n---\n\n') */
  separator?: string;
}

// =============================================================================
// Composer Interface
// =============================================================================

/** Input for setSection (without auto-calculated fields) */
export interface PromptSectionInput {
  id: string;
  layer: PromptLayer;
  content: string;
  /** Stable owner/source identifier. Defaults to the prompt layer. */
  source?: string;
  /** Optional stable content/package version. */
  version?: string;
  priority?: number;
  /** Cache control hint for LLM API prompt caching */
  cacheControl?: 'ephemeral';
}

// =============================================================================
// Structured Composition Result
// =============================================================================

/** A section in the composed prompt with optional cache control */
export interface ComposedPromptSection {
  /** Section text content */
  content: string;
  /** Cache control marker (when set, LLM API may cache this section) */
  cacheControl?: 'ephemeral';
}

/**
 * Structured composition result with cache boundary information.
 * Used by LLM adapters to apply provider-specific prompt caching.
 */
export interface ComposedPromptResult {
  /** Full composed text (backward compatible with compose()) */
  text: string;
  /** Sections with cache control markers for provider-specific caching */
  sections: ComposedPromptSection[];
}

// =============================================================================
// Prompt Dump (observability)
// =============================================================================

/** Debug info for a single prompt section */
export interface PromptDumpInfo {
  id: string;
  layer: PromptLayer;
  tokenEstimate: number;
  priority: number;
  cacheControl?: 'ephemeral';
}

/** Secret-free evidence for one fragment that participated in composition. */
export interface PromptCompositionFragmentProjection {
  readonly id: string;
  readonly source: string;
  readonly order: number;
  readonly version?: string;
  readonly hash: string;
}

/** Layer usage info */
export interface LayerUsage {
  used: number;
  budget: number;
}

/** System prompt composer interface */
export interface ISystemPromptComposer {
  /** Set the base prompt content */
  setBase(content: string): void;

  /** Add or replace a named section */
  setSection(input: PromptSectionInput): void;

  /** Remove a section by ID. Returns true if section existed. */
  removeSection(id: string): boolean;

  /**
   * Remove all sections whose id starts with the given prefix.
   * Returns the number of sections removed.
   *
   * Enables per-module ownership cleanup (e.g. clear all `skill:*` sections
   * when switching persona) without exposing the internal id Map to callers.
   * An empty prefix is a no-op returning 0 (defensive against accidental wipes).
   */
  removeSectionsByPrefix(prefix: string): number;

  /** Check if a section exists */
  hasSection(id: string): boolean;

  /** Get a section by ID */
  getSection(id: string): PromptSection | undefined;

  /** Compose the final system prompt string */
  compose(): string;

  /**
   * Compose structured output with cache boundary information.
   * Used by LLM adapters to apply provider-specific prompt caching.
   * Layers are grouped into cacheable sections based on stability:
   * - base layer → cacheable (stable across turns)
   * - skill + environment layers → cacheable (stable within session)
   * - ephemeral layer → not cached (changes every turn)
   */
  composeStructured(): ComposedPromptResult;

  /** Get total estimated token usage across all sections */
  getTotalTokens(): number;

  /** Get usage breakdown by layer */
  getLayerUsage(): Record<PromptLayer, LayerUsage>;

  /**
   * Dump section metadata for observability/debugging.
   * Returns id, layer, tokenEstimate, priority, cacheControl per section.
   */
  dumpSections(): PromptDumpInfo[];

  /** Project the actual composed fragment order without exposing prompt bodies. */
  projectComposition(): readonly PromptCompositionFragmentProjection[];

  /** Clear all non-base sections */
  reset(): void;
}
