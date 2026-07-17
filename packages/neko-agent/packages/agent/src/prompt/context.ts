/**
 * Prompt Context — frozen read-only snapshot passed to each prompt module on render.
 *
 * PromptContext decouples prompt modules from AgentSession internals: modules receive
 * only the fields they declare in `PromptModuleManifest.requires`, and expensive inputs
 * (memory recall, artifact issues) are accessed via lazy async functions so modules that
 * do not need them pay no cost.
 *
 * Design notes:
 * - Always frozen (`Object.freeze`) before handing to a module; mutation is a bug.
 * - Lazy accessors are optional; orchestrator decides whether to wire them based on
 *   session capabilities.
 * - This type is the contract surface between session state and the prompt layer —
 *   do not add runtime methods, only data + pure lazy fetchers.
 */
import type { ToolName } from '@neko/shared';

/**
 * An issue reported by an artifact watcher that the agent should see on the next turn.
 */
export interface ArtifactIssue {
  readonly path: string;
  readonly kind: string;
  readonly reason: string;
}

/**
 * Frozen read-only context used by every PromptModule.
 *
 * Fields are grouped into three kinds:
 * - Identity: stable per-session values (locale, projectPath)
 * - Activation: current skill/tool state (may change as user switches focus)
 * - Lazy accessors: optional async fetchers for expensive per-turn data
 */
export interface PromptContext {
  // --- Identity ---
  readonly locale: 'en' | 'zh';
  readonly projectPath: string;
  readonly mediaLibrary?: string;

  // --- Activation ---
  readonly activeSkillName: string | null;
  readonly activeTools: readonly ToolName[];

  // --- Lazy accessors (optional; modules that do not need these pay no cost) ---
  readonly memoryRecall?: () => Promise<string>;
  readonly artifactIssues?: () => Promise<readonly ArtifactIssue[]>;
}

/**
 * Freeze the context so downstream modules cannot mutate it.
 * Returns the same shape typed as PromptContext.
 */
export function freezePromptContext(input: PromptContext): PromptContext {
  return Object.freeze({ ...input });
}

/**
 * A factory that produces a frozen PromptContext snapshot on demand.
 * Called at every orchestrator render point so that modules always see the
 * latest session state (active skill, tools, locale, etc.).
 */
export type PromptContextProvider = () => PromptContext;

/**
 * Accessors the provider pulls from on each call. Passed in as a struct so
 * the initializer can wire callbacks during session construction without
 * needing a concrete AgentSession reference — each accessor can capture a
 * mutable ref that gets filled in later.
 */
export interface PromptContextSources {
  getActiveSkillName: () => string | null;
  getActiveTools: () => readonly ToolName[];
  getLocale: () => 'en' | 'zh';
  getProjectPath: () => string;
  getMediaLibrary?: () => string | undefined;
  getMemoryRecall?: () => () => Promise<string>;
  getArtifactIssues?: () => () => Promise<readonly ArtifactIssue[]>;
}

/**
 * Build a PromptContextProvider that calls each source accessor on demand and
 * returns a frozen PromptContext. Optional accessors are only added to the
 * context when their source is provided, so downstream modules' `requires`
 * checks can still filter by field presence.
 */
export function createPromptContextProvider(sources: PromptContextSources): PromptContextProvider {
  return () => {
    const base: PromptContext = {
      locale: sources.getLocale(),
      projectPath: sources.getProjectPath(),
      activeSkillName: sources.getActiveSkillName(),
      activeTools: sources.getActiveTools(),
    };
    const media = sources.getMediaLibrary?.();
    const memoryRecall = sources.getMemoryRecall?.();
    const artifactIssues = sources.getArtifactIssues?.();
    return freezePromptContext({
      ...base,
      ...(media !== undefined && { mediaLibrary: media }),
      ...(memoryRecall && { memoryRecall }),
      ...(artifactIssues && { artifactIssues }),
    });
  };
}
