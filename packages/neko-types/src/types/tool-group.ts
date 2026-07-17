/**
 * ToolGroup / ToolSet Types - Dynamic tool injection based on user intent
 *
 * ToolSet (formerly ToolGroup) is different from Skill:
 * - Skill: Injects system prompt + optional allowedTools restriction (runtime)
 * - ToolSet: Controls which tools are visible to LLM (before sending)
 *
 * They work together:
 * - ToolSet decides which tools to send to LLM (reduces tokens)
 * - Skill's allowedTools acts as secondary guard (runtime interception)
 *
 * @neko-extension Not in Claude Code spec.
 * Addresses the token cost problem of 50+ tools by allowing LLM to
 * discover and activate tool sets on demand via SearchToolSets/ActivateToolSet.
 */

import type { IToolProvider } from './tool-injection';
import type { LoadingTier } from './loading-tier';

/**
 * ToolGroup source
 */
export type ToolGroupSource = 'builtin' | 'project' | 'personal';

/**
 * ToolSet (ToolGroup) definition - defines a named, activatable collection of tools.
 *
 * LLM can discover and activate ToolSets on demand via SearchToolSets/ActivateToolSet,
 * reducing token cost by keeping inactive tool definitions out of the context.
 */
export interface ToolGroup {
  /** Unique group name */
  name: string;

  /** Description for matching and display */
  description: string;

  /** List of tool names included in this group */
  tools: string[];

  /** Whether this group is always active (injected in the always layer) */
  alwaysActive?: boolean;

  /** Priority for conflict resolution (higher = more important) */
  priority?: number;

  /** Dependencies on other ToolGroups */
  dependencies?: string[];

  /** Source of this group */
  source: ToolGroupSource;

  /** Whether this group is enabled */
  enabled: boolean;

  /**
   * Loading tier. Controls when tool schemas are injected into LLM context.
   * Metadata (name/description/tools[]) is always resident regardless of tier.
   *
   * When omitted, resolved from alwaysActive + priority:
   * - !alwaysActive → 'lazy'
   * - alwaysActive && priority >= 100 → 'resident'
   * - alwaysActive && priority < 100 → 'eager'
   */
  loadingTier?: LoadingTier;

  /** Optional icon for UI */
  icon?: string;
}

// Note: ToolFilterOptions moved to tool.ts to break circular dependency

/**
 * Configured ToolGroup (with UI/settings extensions)
 */
export interface ConfiguredToolGroup extends ToolGroup {
  /** User notes/documentation */
  notes?: string;

  /** Tags for organization */
  tags?: string[];

  /** Last modified timestamp */
  lastModified?: number;
}

/**
 * ToolGroup registry interface
 *
 * Extends IToolProvider to allow ToolGroupRegistry to be used as a tool provider
 * for ToolInjectionManager.
 */
export interface IToolGroupRegistry extends IToolProvider {
  /** Register a ToolGroup */
  register(group: ToolGroup): void;

  /** Unregister a ToolGroup */
  unregister(name: string): void;

  /** Get ToolGroup by name */
  get(name: string): ToolGroup | undefined;

  /** List all ToolGroups */
  list(): ToolGroup[];

  /** List enabled ToolGroups */
  listEnabled(): ToolGroup[];

  /** Get active tools based on active groups */
  getActiveTools(activeGroups: string[]): string[];

  /** Get default active tools */
  getDefaultTools(): string[];

  /** Check if a tool belongs to any group */
  getGroupsForTool(toolName: string): string[];
}

/**
 * ToolSet — alias for ToolGroup.
 *
 * Preferred name going forward. "ToolSet" better communicates that it is a
 * discrete, activatable collection, rather than an arbitrary grouping.
 */
export type ToolSet = ToolGroup;

/** @see IToolGroupRegistry */
export type IToolSetRegistry = IToolGroupRegistry;
