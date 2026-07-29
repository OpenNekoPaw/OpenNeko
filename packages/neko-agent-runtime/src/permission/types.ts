/**
 * Permission Types - Tool execution permission management
 *
 * Implements Claude Code compatible permission model:
 * - deny: Absolutely forbidden, highest priority
 * - allow: Auto-execute without confirmation
 * - ask: Always require user confirmation
 *
 * Evaluation order: deny → allow → ask → mode-check
 */

import type { ToolCallInfo } from '@neko/shared';

/**
 * Permission execution mode
 */
export type PermissionMode = 'plan' | 'ask' | 'auto';

/**
 * Permission decision result
 */
export type PermissionDecision = 'allow' | 'deny' | 'ask';

/**
 * Permission rules configuration
 *
 * Pattern syntax (Claude Code compatible):
 * - "Read" - Exact tool name match
 * - "Bash(npm:*)" - Bash command prefix match
 * - "Bash(git status)" - Exact bash command match
 * - "Read(src/**)" - Path pattern (gitignore style)
 */
export interface PermissionRules {
  /**
   * Denied tools - Absolutely forbidden, cannot be overridden
   * Evaluated first, highest priority
   */
  deny?: string[];

  /**
   * Allowed tools - Auto-execute without confirmation
   * Evaluated after deny rules
   */
  allow?: string[];

  /**
   * Ask tools - Always require user confirmation
   * Overrides allow rules for specific tools
   */
  ask?: string[];
}

/**
 * Permission configuration
 */
export interface PermissionConfig {
  /** Current execution mode */
  mode: PermissionMode;

  /** Permission rules */
  rules: PermissionRules;

  /** Read-only tools (allowed in plan mode) */
  readOnlyTools?: string[];

  /** Read-only MCP tool prefixes (allowed in plan mode) */
  readOnlyMcpPrefixes?: string[];
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  /** Whether the tool call is allowed */
  decision: PermissionDecision;

  /** Reason for the decision */
  reason: string;

  /** Which rule matched (if any) */
  matchedRule?: string;

  /** The original tool call */
  toolCall: ToolCallInfo;
}

/**
 * Tool confirmation request
 */
export interface ToolConfirmationRequest {
  /** Tool call info */
  toolCall: ToolCallInfo;

  /** Human-readable action description */
  action: string;

  /** Detailed description */
  description: string;

  /** Additional details for UI */
  details: Record<string, unknown>;

  /** Unique confirmation token */
  confirmationToken: string;
}

/**
 * Tool confirmation response
 */
export interface ToolConfirmationResponse {
  /** Confirmation token */
  confirmationToken: string;

  /** Whether approved */
  approved: boolean;

  /** Optional: Add to allow rules permanently */
  allowAlways?: boolean;
}

/**
 * Confirmation callback type
 */
export type ConfirmToolCallback = (
  request: ToolConfirmationRequest,
) => Promise<ToolConfirmationResponse>;

/**
 * Default read-only tools (allowed in plan mode)
 *
 * Plan Mode allows read-only/research tools and authorized Markdown edits:
 * - File reading: Read, Glob, Grep, LS
 * - Web research: WebFetch, WebSearch
 * It does not expose a separate task, TODO, or mode-control protocol.
 */
export const DEFAULT_READ_ONLY_TOOLS = [
  // Claude Code standard read-only tools
  'Read',
  'ReadDocument',
  'ReadImage',
  'Glob',
  'Grep',
  'LS',
  // OpenNeko internal read-only tools
  'ListDirectory',
  'GitStatus',
  'GitDiff',
  'GitLog',
  // OpenNeko meta tools (no side effects)
  'GetContext',
];

/**
 * MCP tool prefixes that are considered read-only
 * These are used for tools like mcp__serena__find_symbol
 */
export const READ_ONLY_MCP_PREFIXES = [
  'find_', // find_symbol, find_files, etc.
  'get_', // get_symbols_overview, get_file_info, etc.
  'list_', // list_files, list_directories, etc.
  'read_', // read_file, read_memory, etc.
  'search_', // search_code, search_files, etc.
  'show_', // show_file, show_diff, etc.
  'describe_', // describe_table, etc.
  'query_', // query_database (read-only queries)
];

/**
 * Default permission config
 */
export const DEFAULT_PERMISSION_CONFIG: PermissionConfig = {
  mode: 'ask',
  rules: {
    allow: ['GetContext', 'ActivateSkill', 'DeactivateSkill'],
  },
  readOnlyTools: DEFAULT_READ_ONLY_TOOLS,
  readOnlyMcpPrefixes: READ_ONLY_MCP_PREFIXES,
};

/**
 * Plan Mode System Reminder
 *
 * This is a lightweight reminder injected before user messages in plan mode.
 * The main constraints are in the plan-mode system prompt.
 * This reminder serves as an additional safeguard.
 */
export const PLAN_MODE_SYSTEM_REMINDER = `<system-reminder>
Plan mode is active. Read and analyze actual authorized content. You may edit ordinary authorized Markdown for creator review, but do not generate media, mutate projects or assets, export, deliver, start background execution, or implicitly activate Skills. Markdown does not trigger execution.
</system-reminder>`;
