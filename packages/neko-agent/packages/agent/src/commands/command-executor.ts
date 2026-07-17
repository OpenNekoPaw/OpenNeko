/**
 * Command Executor
 *
 * Unified command execution for both CLI and extension.
 */

import type { BuiltinCommandName, CommandContext, CommandResult, CommandHandler } from './types';
import { resolveCommandName } from './types';
import { isBuiltinCommand } from './builtin-commands';
import {
  handleHelp,
  handleStatus,
  handleClear,
  handleExit,
  handleConfig,
  handleModel,
  handleSettings,
  handlePermissions,
  handleInit,
  handleNew,
  handleResume,
  handleCompact,
  handlePlan,
  handleSkills,
  handleCommands,
  handleTools,
  handleTasks,
  handleMcp,
} from './handlers';

const handleHostOnlyCommand: CommandHandler = async () => ({
  handled: true,
  continueExecution: true,
  semantic: { family: 'core', result: { kind: 'host-only' } },
});

/**
 * Command handler registry
 */
const COMMAND_HANDLERS: Record<BuiltinCommandName, CommandHandler> = {
  // Core
  help: handleHelp,
  status: handleStatus,
  clear: handleClear,
  exit: handleExit,
  // Session
  as: handleHostOnlyCommand,
  'exit-as': handleHostOnlyCommand,
  new: handleNew,
  resume: handleResume,
  // Configuration
  config: handleConfig,
  model: handleModel,
  settings: handleSettings,
  permissions: handlePermissions,
  init: handleInit,
  // Context
  compact: handleCompact,
  // Mode
  plan: handlePlan,
  // Resources
  skills: handleSkills,
  commands: handleCommands,
  tools: handleTools,
  tasks: handleTasks,
  mcp: handleMcp,
};

/**
 * Parse slash command input
 */
export function parseSlashCommand(input: string): { command: string; args: string[] } {
  const trimmed = input.trim();
  const parts = trimmed.split(/\s+/);
  const command = parts[0]?.startsWith('/')
    ? parts[0].slice(1).toLowerCase()
    : (parts[0]?.toLowerCase() ?? '');
  const args = parts.slice(1);
  return { command, args };
}

/**
 * Check if input is a slash command
 */
export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

/**
 * Execute a builtin command
 */
export async function executeBuiltinCommand(
  commandName: string,
  args: string[],
  context: CommandContext,
): Promise<CommandResult> {
  // Resolve aliases
  const resolvedName = resolveCommandName(commandName);

  // Check if it's a builtin command
  if (!isBuiltinCommand(resolvedName)) {
    return {
      handled: false,
      continueExecution: true,
      semantic: {
        family: 'shell',
        result: { kind: 'diagnostic', code: 'unknown-command', command: commandName },
      },
    };
  }

  // Get the handler
  const handler = COMMAND_HANDLERS[resolvedName as BuiltinCommandName];
  if (!handler) {
    throw new Error(`Builtin command /${resolvedName} has no registered handler.`);
  }

  // Execute the handler
  try {
    const result = await handler(args, context);
    return result;
  } catch (error) {
    return {
      handled: true,
      continueExecution: true,
      semantic: {
        family: 'shell',
        result: {
          kind: 'diagnostic',
          code: 'command-failed',
          command: resolvedName,
          detail: error instanceof Error ? error.message : String(error),
        },
      },
    };
  }
}

/**
 * Execute a builtin slash command.
 *
 * @param input Full command input (e.g., "/help" or "/commit fix bug")
 * @param context Command execution context
 */
export async function executeSlashCommand(
  input: string,
  context: CommandContext,
): Promise<CommandResult> {
  const { command, args } = parseSlashCommand(input);
  if (isBuiltinCommand(resolveCommandName(command))) {
    return executeBuiltinCommand(command, args, context);
  }

  // Command not found
  return {
    handled: false,
    continueExecution: true,
    semantic: {
      family: 'shell',
      result: { kind: 'diagnostic', code: 'unknown-command', command },
    },
  };
}

/**
 * Get command handler by name
 */
export function getCommandHandler(commandName: string): CommandHandler | undefined {
  const resolvedName = resolveCommandName(commandName);
  if (isBuiltinCommand(resolvedName)) {
    return COMMAND_HANDLERS[resolvedName as BuiltinCommandName];
  }
  return undefined;
}
