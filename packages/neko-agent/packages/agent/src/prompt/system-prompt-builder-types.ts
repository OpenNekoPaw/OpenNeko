/**
 * System Prompt Builder Types
 */

export type PromptExecutionMode = 'auto' | 'ask' | 'plan';

/**
 * Locale for built-in prompts
 */
export type PromptLocale = 'en' | 'zh';

/**
 * AGENTS.md source
 */
export type AgentsSource = 'project' | 'personal' | null;

/**
 * System prompt builder configuration
 */
export interface SystemPromptBuilderConfig {
  /** Locale for built-in prompts */
  locale?: PromptLocale | string;

  /** Initial Agent execution mode. */
  executionMode?: PromptExecutionMode;

  /** Custom default prompt (overrides built-in) */
  customDefaultPrompt?: string;

  /** Custom plan mode prompt (overrides built-in) */
  customPlanPrompt?: string;
}

/**
 * AGENTS.md load result
 */
export interface AgentsLoadResult {
  /** Content of AGENTS.md */
  content: string;

  /** Source of the file */
  source: 'project' | 'personal';

  /** File path */
  path: string;
}
