/**
 * Slash Command Handler
 *
 * Handles built-in slash commands for the CLI.
 * Uses shared command definitions from @neko/agent.
 */

import {
  type ToolRegistry,
  type CommandContext,
  type CommandResult,
  type ChatMessage,
  executeSlashCommand,
  isSlashCommand as checkIsSlashCommand,
  parseSlashCommand as parseCommand,
} from '@neko/agent';
import { parseAgentInputTrigger } from '@neko-agent/types';
import type { CLIConfig } from './types';
import type { SkillSemanticResult } from '../presentation/skill-presentation';
import type { SupportedLocale } from '@neko/shared/i18n';

/** Per-category media model overrides for the current session */

/**
 * Slash command result (CLI-specific)
 */
export interface SlashCommandResult {
  /** Whether the command was handled */
  handled: boolean;
  /** Output to display */
  output?: string;
  /** Whether to continue with agent execution */
  continueExecution: boolean;
  /** Error message if any */
  error?: string;
  /** Stable expected-diagnostic identity, independent of the selected UI locale. */
  diagnosticCode?: string;
  /** Explicit Pi Skill invocation semantics projected by the terminal Presenter. */
  skillSemantic?: SkillSemanticResult;
  /** Prompt to continue into agent execution after command handling */
  agentPrompt?: string;
  /** Explicit turn-scoped Pi Skill invocation. */
  skillInvocation?: {
    readonly skillName: string;
    readonly args?: string;
  };
}

export interface SkillInvocationResult {
  readonly handled: boolean;
  readonly semantic: SkillSemanticResult;
  readonly agentPrompt?: string;
  readonly skillInvocation?: {
    readonly skillName: string;
    readonly args?: string;
  };
}

export interface TuiConversationCatalogEntry {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly messageCount: number;
}

export interface TuiConversationCatalogPort {
  list(): readonly TuiConversationCatalogEntry[] | Promise<readonly TuiConversationCatalogEntry[]>;
  get(id: string): TuiConversationCatalogEntry | undefined | Promise<TuiConversationCatalogEntry | undefined>;
}

/**
 * Slash command context (CLI-specific)
 */
export interface SlashCommandContext {
  locale: SupportedLocale;
  config: CLIConfig;
  toolRegistry?: ToolRegistry;
  /** Callback to update config */
  onConfigUpdate?: (updates: Partial<CLIConfig>) => void;
  /** Pi-backed product conversation catalog for /resume. */
  conversationCatalog?: TuiConversationCatalogPort;
  /** Current conversation ID */
  currentConversationId?: string;
  /** Switch the active runtime binding to a Pi conversation. */
  onResumeConversation?: (conversationId: string) => void | Promise<void>;
  /** Get current session history */
  getHistory?: () => ChatMessage[];
}

/**
 * Check if input is a slash command
 */
export function isSlashCommand(input: string): boolean {
  return checkIsSlashCommand(input);
}

export function isSkillInvocation(input: string): boolean {
  return parseDirectSkillInvocation(input) !== null;
}

/**
 * Parse slash command
 */
function parseSlashCommand(input: string): { command: string; args: string[] } {
  return parseCommand(input);
}

/**
 * Convert CLI context to shared CommandContext
 */
export function toCommandContext(context: SlashCommandContext): CommandContext {
  return {
    locale: context.locale,
    toolRegistry: context.toolRegistry
      ? {
          size: context.toolRegistry.size,
          list: () => context.toolRegistry!.list() as unknown[],
          get: (name: string) => context.toolRegistry!.get(name) as unknown | undefined,
          search: (query: string) => {
            const tools = context.toolRegistry!.list();
            const q = query.toLowerCase();
            return tools.filter(
              (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q),
            ) as unknown[];
          },
        }
      : undefined,
    config: {
      provider: context.config.provider,
      model: context.config.model,
      apiKey: context.config.apiKey,
      baseUrl: context.config.baseUrl,
      maxTokens: context.config.maxTokens,
      temperature: context.config.temperature,
      workDir: context.config.workDir,
      outputFormat: context.config.outputFormat,
      verbose: context.config.verbose,
      mcpServers: context.config.mcpServers,
    },
  };
}

/**
 * Convert shared CommandResult to CLI SlashCommandResult
 */
function toSlashCommandResult(result: CommandResult): SlashCommandResult {
  return {
    handled: result.handled,
    continueExecution: result.continueExecution,
  };
}

/**
 * Handle slash command
 */
export async function handleSlashCommand(
  input: string,
  context: SlashCommandContext,
): Promise<SlashCommandResult> {
  const { command, args } = parseSlashCommand(input);
  if (
    command === 'config' ||
    command === 'cfg' ||
    command === 'resume' ||
    command === 'history' ||
    command === 'help' ||
    command === 'h' ||
    command === 'skills' ||
    command === 'commands' ||
    command === 'cmds' ||
    command === 'tools'
  ) {
    return { handled: false, continueExecution: true };
  }

  // Use shared command executor for other commands
  const commandContext = toCommandContext(context);
  const result = await executeSlashCommand(input, commandContext);

  return toSlashCommandResult(result);
}

export async function handleSkillInvocation(
  input: string,
  _context: SlashCommandContext,
): Promise<SkillInvocationResult> {
  const parsed = parseDirectSkillInvocation(input);
  if (!parsed) {
    return { handled: false, semantic: { kind: 'invocation-invalid', input } };
  }

  return {
    handled: true,
    semantic: { kind: 'invoked', skillName: parsed.skillName },
    skillInvocation: {
      skillName: parsed.skillName,
      ...(parsed.args ? { args: parsed.args } : {}),
    },
    ...(parsed.args
      ? {
          agentPrompt: parsed.args,
        }
      : {}),
  };
}

function parseDirectSkillInvocation(
  input: string,
): { readonly skillName: string; readonly args?: string } | null {
  const parsed = parseAgentInputTrigger(input);
  if (!parsed || parsed.trigger !== 'skill') {
    return null;
  }
  return {
    skillName: parsed.name,
    ...(parsed.args ? { args: parsed.args } : {}),
  };
}
