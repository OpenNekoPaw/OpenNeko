/**
 * Hook Types - settings-based hooks for agent automation
 *
 * Hooks allow users to define automated actions that run at specific points
 * during agent execution. They can be used for:
 * - Pre/post message processing
 * - Tool call interception
 * - Custom workflows triggered by events
 *
 * Configuration locations (Claude Code compatible):
 * - User hooks: ~/.neko/settings.json
 * - Workspace hooks: .neko/settings.json
 * - Local workspace: .neko/settings.local.json
 *
 */

// =============================================================================
// Hook Event Types
// =============================================================================

/**
 * Hook trigger events (aligned with Claude Code)
 */
export type HookEvent =
  | 'PreToolUse' // Before tool execution (can block)
  | 'PostToolUse' // After tool success
  | 'PostToolUseFailure' // After tool failure
  | 'UserPromptSubmit' // User submits prompt (can block)
  | 'PermissionRequest' // Permission dialog appears (can block)
  | 'Stop' // Claude finishes response (can block)
  | 'SubagentStart' // Subagent spawned
  | 'SubagentStop' // Subagent completed
  | 'SessionStart' // Session starts or resumes
  | 'SessionEnd' // Session terminates
  | 'PreCompact' // Before context compaction
  | 'Notification'; // Notification sent

// =============================================================================
// JSON Configuration Format (Claude Code Compatible)
// =============================================================================

/**
 * Hook action in settings.json
 */
export interface SettingsHookAction {
  /** Action type - currently only 'command' is supported */
  type: 'command';
  /** Shell command to execute */
  command: string;
}

/**
 * Hook configuration entry in settings.json
 */
export interface SettingsHookConfig {
  /** Tool name, regex pattern, or "*" for all tools */
  matcher: string;
  /** List of hook actions to execute */
  hooks: SettingsHookAction[];
}

/**
 * Hooks section in settings.json
 * Maps event types to hook configurations
 */
export type SettingsHooks = Partial<Record<HookEvent, SettingsHookConfig[]>>;

/**
 * Complete settings.json structure (hooks section)
 */
export interface NekoSettings {
  /** Hook configurations by event type */
  hooks?: SettingsHooks;
}

/**
 * Hook input passed via stdin (JSON)
 */
export interface HookInput {
  /** Tool name (for tool-related events) */
  tool_name?: string;
  /** Tool input parameters */
  tool_input?: Record<string, unknown>;
  /** Tool execution success (for PostToolUse) */
  success?: boolean;
  /** Tool output (for PostToolUse) */
  output?: string;
  /** Error message (for PostToolUseFailure) */
  error?: string;
  /** User message (for UserPromptSubmit) */
  message?: string;
  /** Session ID */
  session_id?: string;
  /** Timestamp */
  timestamp?: string;
}

/**
 * Hook output returned via stdout (JSON)
 */
export interface HookOutput {
  /** Decision for blocking hooks */
  decision?: 'approve' | 'block' | 'allow' | 'deny';
  /** Reason for the decision (shown to Claude) */
  reason?: string;
  /** Whether to continue (for Stop hook) */
  continue?: boolean;
  /** Modified tool input (for PreToolUse) */
  updatedInput?: Record<string, unknown>;
}

/**
 * Settings file locations (Claude Code compatible)
 */
export const SETTINGS_FILES = {
  /** Project-level settings: neko/settings.json (git-tracked) */
  project: 'neko/settings.json',
  /** Personal settings: ~/.neko/settings.json */
  personal: '~/.neko/settings.json',
  /** Local project settings (not committed): .neko/settings.local.json */
  local: '.neko/settings.local.json',
} as const;

/**
 * Match hook matcher against tool name (Claude Code compatible)
 * Supports: exact match, regex pattern, "*" for all
 */
export function matchHookMatcher(matcher: string, toolName: string): boolean {
  // Match all tools
  if (matcher === '*') return true;

  // Exact match
  if (matcher === toolName) return true;

  // Regex pattern (e.g., "Edit|Write", "Bash.*")
  try {
    const regex = new RegExp(`^(${matcher})$`);
    return regex.test(toolName);
  } catch {
    // Invalid regex, fall back to exact match
    return matcher === toolName;
  }
}
