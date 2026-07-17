/**
 * UserPreferences — user-editable approval governance (ADR §9.3).
 *
 * Canonical form is a markdown file (`.neko/preferences.md` at project
 * level, `~/.neko/preferences.md` at global level). A parser converts
 * that file into this structured shape; the `preferencesStrategyPack`
 * consumes it.
 *
 * Two layers merge project-over-global, same semantics as tsconfig /
 * eslintrc inheritance: the project file's fields override the global
 * file's fields; list fields concatenate (project entries take
 * precedence on id collision).
 *
 * Design invariant (§9.4): preferences can only **strengthen** approval
 * — turn auto-accept into escalate, turn short-path into user-review.
 * They cannot downgrade L0 critical gates (destructive + non-idempotent
 * stays forcibly approved regardless of what the user writes).
 */

// =============================================================================
// Subject matching
// =============================================================================

/**
 * A rule targeting a specific approval subject. Parsed from one bullet
 * line in the markdown:
 *
 *   - tool:GenerateImage        → { prefix: 'tool', value: 'GenerateImage' }
 *   - domain:cut                → { prefix: 'domain', value: 'cut' }
 *   - channel:creator-review    → { prefix: 'channel', value: 'creator-review' }
 *
 * Prefix-less bullets are treated as label matches against
 * `ApprovalSubject.label` (case-insensitive substring). That's a
 * looser label match; prefer explicit prefixes.
 */
export interface PreferenceSubjectRule {
  /**
   * Matcher kind:
   *   - 'tool'     → matches `ApprovalSubject.kind === 'tool:<value>'`
   *   - 'domain'   → matches request context.domain
   *   - 'channel'  → matches ApprovalRequest.channel
   *   - 'label'    → matches `ApprovalSubject.label` (substring)
   *   - 'any'      → matches every request (wildcard bullet `- *`)
   */
  kind: 'tool' | 'domain' | 'channel' | 'label' | 'any';
  /** Matcher payload. Empty string for `any`. */
  value: string;
  /** Original source line for diagnostics / UI. */
  source: string;
}

// =============================================================================
// Thresholds
// =============================================================================

/**
 * Cost thresholds that force escalation when any bound is exceeded.
 * All fields optional; omitted threshold = no cap at that axis.
 */
export interface PreferenceCostThresholds {
  /** Tokens per single approval subject. */
  maxTokens?: number;
  /** USD cost per single approval subject. */
  maxUsd?: number;
  /** Duration in milliseconds per single approval subject. */
  maxDurationMs?: number;
}

// =============================================================================
// Top-level preferences
// =============================================================================

export interface UserPreferences {
  /** Layer this block was parsed from. */
  scope: 'project' | 'global';
  /** Schema version — bump on breaking changes. */
  version: number;
  /** Subjects the user always wants to approve manually (escalate). */
  alwaysApprove: readonly PreferenceSubjectRule[];
  /**
   * Subjects the user wants to bypass approval for when otherwise
   * would prompt. Clamped by the "no downgrade" invariant — only
   * affects subjects the engine would have escalated on, never the
   * L0-critical auto-rejects.
   */
  autoApprove: readonly PreferenceSubjectRule[];
  /** Any-exceeds escalation thresholds. */
  costThresholds: PreferenceCostThresholds;
  /** Default mode: overrides the built-in AutoMode default. */
  defaultMode?: 'auto' | 'plan';
  /** Skills the user wants auto-activated when relevant. */
  defaultSkills: readonly string[];
  /**
   * Free-form body sections the parser couldn't structure. Preserved
   * so UIs can display them verbatim. Key = `## Heading`, value =
   * full markdown chunk under that heading (including nested lists).
   */
  freeFormSections: Readonly<Record<string, string>>;
  /** Resolved source path (absolute). Empty when the layer was absent. */
  sourcePath: string;
}

/**
 * Merged view of project-over-global preferences. Produced by
 * `mergePreferences(project, global)` in the loader.
 */
export interface MergedPreferences {
  /** The final effective ruleset after inheritance. */
  effective: UserPreferences;
  /** Raw per-layer results so UIs can explain "this came from project". */
  project: UserPreferences | null;
  /** Same as above for the global layer. */
  global: UserPreferences | null;
}
