import type { SupportedLocale } from '@neko/shared/i18n';
import type { AgentCommandSemanticResult } from './terminal-semantics';

/**
 * Builtin Command Types
 *
 * Defines interfaces for builtin slash commands that are shared
 * between TUI and extension.
 */

import type { BuiltinSlashCommandCategory, BuiltinSlashCommandName } from '@neko-agent/types';
import { BUILTIN_SLASH_COMMAND_ALIASES } from '@neko-agent/types';

/**
 * Builtin command names
 */
export type BuiltinCommandName = BuiltinSlashCommandName;

/**
 * Command aliases mapping
 */
export const COMMAND_ALIASES: Record<string, BuiltinCommandName> = BUILTIN_SLASH_COMMAND_ALIASES;

/**
 * Resolve command name from input (handles aliases)
 */
export function resolveCommandName(input: string): BuiltinCommandName | string {
  const normalized = input.toLowerCase();
  return COMMAND_ALIASES[normalized] ?? normalized;
}

/**
 * Builtin command definition
 */
export interface BuiltinCommand {
  /** Command name (without /) */
  name: BuiltinCommandName;
  /** Command aliases */
  aliases?: string[];
  /** Description for help text */
  description: string;
  /** Usage hint (e.g., "[key] [value]") */
  usage?: string;
  /** Category for grouping in help */
  category: CommandCategory;
  /** Whether this command is available in the terminal TUI/headless surface */
  availableInCli: boolean;
  /** Whether this command is available in extension */
  availableInExtension: boolean;
}

/**
 * Command categories for help grouping
 */
export type CommandCategory = BuiltinSlashCommandCategory;

/**
 * Command execution context - provides access to services and state
 */
export interface CommandContext {
  /** UI/runtime locale for command-facing text */
  locale?: SupportedLocale;
  /** Turn-scoped Pi Skill catalog supplied by the owning Host. */
  skills?: readonly {
    readonly name: string;
    readonly description?: string;
    readonly enabled: boolean;
  }[];
  /** Tool registry for tool management */
  toolRegistry?: {
    size: number;
    list(): unknown[];
    get(name: string): unknown | undefined;
    search(query: string): unknown[];
  };
  /** Configuration */
  config?: {
    provider?: string;
    model?: string;
    apiKey?: string;
    baseUrl?: string;
    maxTokens?: number;
    temperature?: number;
    workDir?: string;
    outputFormat?: string;
    verbose?: boolean;
    mcpServers?: unknown[];
    executionMode?: string;
  };
  /** Conversation management (extension only) */
  conversations?: {
    list(): Array<{ id: string; title: string }>;
    getActiveId(): string | null;
    getActiveMessageCount?(): number;
    create(): Promise<string>;
    clearCurrent(): void;
  };
  /** Update the ordinary Agent execution mode for the active conversation. */
  updateExecutionMode?(mode: 'auto' | 'ask' | 'plan'): void;
  /** Context compression (extension only) */
  contextManager?: {
    getTokenCount(conversationId: string): number;
    compress(conversationId: string): Promise<void>;
  };
}

/**
 * Command execution result.
 *
 * Shared handlers return actions, data, and typed semantics only. Human-readable
 * text is owned by the surface Presenter and must never be returned here.
 */
export interface CommandResult {
  /** Whether the command was handled */
  handled: boolean;
  /** Whether to continue execution (false = exit for CLI) */
  continueExecution: boolean;
  /** Action for UI to perform (extension only) */
  action?: CommandAction;
  /** Additional data for the action */
  data?: Record<string, unknown>;
  /** Optional semantic outcome for a surface Presenter. */
  semantic?: AgentCommandSemanticResult;
}

/**
 * UI actions that can be triggered by commands
 */
export type CommandAction =
  | 'exit'
  | 'showHelp'
  | 'showStatus'
  | 'showSettings'
  | 'showModelSelector'
  | 'showMCPServers'
  | 'showPermissions'
  | 'showTasks'
  | 'updateExecutionMode'
  | 'initProject'
  | 'resumeConversation'
  | 'newConversation'
  | 'clearHistory'
  | 'compressContext';

// =============================================================================
// Type-Safe Command Action Data
// =============================================================================

/**
 * Conversation info for resume command
 */
export interface ConversationInfo {
  id: string;
  title: string;
  messageCount: number;
  lastMessageAt?: number;
}

/**
 * Status data returned by status command
 */
export interface StatusData {
  provider?: string;
  model?: string;
  conversationCount?: number;
  messageCount?: number;
  tokenCount?: number;
  executionMode?: string;
  mcpServerCount?: number;
  toolCount?: number;
  skillCount?: number;
}

/**
 * Type-safe mapping of command actions to their data types
 *
 * Action payload contract shared by handlers and host adapters.
 */
export interface CommandActionDataMap {
  exit: undefined;
  showHelp: undefined;
  showStatus: StatusData;
  showSettings: undefined;
  showModelSelector: undefined;
  showMCPServers: undefined;
  showPermissions: undefined;
  showTasks: undefined;
  updateExecutionMode: { executionMode: 'auto' | 'ask' | 'plan' };
  initProject: undefined;
  resumeConversation: { conversations: ConversationInfo[] };
  newConversation: { conversationId?: string };
  clearHistory: undefined;
  compressContext: { beforeTokens?: number; afterTokens?: number };
}

/**
 * Command handler function signature
 */
export type CommandHandler = (
  args: string[],
  context: CommandContext,
) => CommandResult | Promise<CommandResult>;

/**
 * Command handler registration
 */
export interface CommandHandlerRegistration {
  command: BuiltinCommandName;
  handler: CommandHandler;
}
