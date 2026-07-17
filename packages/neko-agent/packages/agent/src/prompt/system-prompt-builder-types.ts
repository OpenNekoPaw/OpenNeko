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
  locale?: PromptLocale;

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

/**
 * System prompt builder interface
 */
export interface ISystemPromptBuilder {
  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /**
   * Set locale for built-in prompts
   */
  setLocale(locale: PromptLocale | string): void;

  /**
   * Get current locale
   */
  getLocale(): PromptLocale;

  /** Select the prompt using the ordinary Agent execution mode. */
  setExecutionMode(mode: PromptExecutionMode): void;

  /**
   * Get current mode
   */
  getExecutionMode(): PromptExecutionMode;

  // ---------------------------------------------------------------------------
  // AGENTS.md Management
  // ---------------------------------------------------------------------------

  /**
   * Load AGENTS.md from project and/or personal directories
   * @param projectPath Project directory path (for .neko/AGENTS.md)
   * @param personalPath Personal directory path (for ~/.neko/AGENTS.md)
   */
  loadAgentsFile(projectPath?: string, personalPath?: string): Promise<AgentsLoadResult | null>;

  /**
   * Set AGENTS.md content directly (for testing or custom sources)
   */
  setAgentsContent(content: string | null, source?: AgentsSource): void;

  /**
   * Get current AGENTS.md content
   */
  getAgentsContent(): string | null;

  /**
   * Get AGENTS.md source
   */
  getAgentsSource(): AgentsSource;

  // ---------------------------------------------------------------------------
  // Prompt Building
  // ---------------------------------------------------------------------------

  /**
   * Build the base system prompt for the current mode.
   *
   * AGENTS.md is not included here; callers must inject
   * {@link buildAgentsOverlay} through the environment layer.
   */
  build(): string;

  /**
   * Build the base system prompt for a specific mode without mutating the
   * builder's current mode. AGENTS.md remains an environment-layer overlay.
   */
  buildForExecutionMode(mode: PromptExecutionMode): string;

  /**
   * Build prompt with skill injection
   * @param skillPrompt Skill prompt to append
   */
  buildWithSkill(skillPrompt: string): string;

  /**
   * Build prompt with custom suffix
   * @param suffix Custom content to append
   */
  buildWithSuffix(suffix: string): string;

  /**
   * Base layer only — plan prompt in plan mode, else built-in default.
   * AGENTS.md is NOT included; use {@link buildAgentsOverlay} to obtain
   * the overlay separately for L3-environment injection.
   */
  buildBaseOnly(): string;

  /**
   * AGENTS.md overlay content, or null when no AGENTS.md has been loaded.
   * Independent of mode — the overlay applies under both plan and default.
   */
  buildAgentsOverlay(): string | null;
}
