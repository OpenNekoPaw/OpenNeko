/**
 * Builtin Commands Definition
 *
 * Defines all builtin slash commands available in the system.
 * These commands are shared between cli and extension.
 */

import { BUILTIN_SLASH_COMMANDS } from '@neko-agent/types';
import type { BuiltinCommand } from './types';

/**
 * All builtin commands
 */
export const BUILTIN_COMMANDS: BuiltinCommand[] = BUILTIN_SLASH_COMMANDS.map((command) => ({
  name: command.name,
  description: command.description,
  category: command.category,
  availableInCli: command.availableInCli,
  availableInExtension: command.availableInExtension,
  ...(command.aliases ? { aliases: [...command.aliases] } : {}),
  ...(command.usage ? { usage: command.usage } : {}),
}));

/**
 * Get builtin commands for CLI
 */
export function getCliCommands(): BuiltinCommand[] {
  return BUILTIN_COMMANDS.filter((cmd) => cmd.availableInCli);
}

/**
 * Get builtin commands for extension
 */
export function getExtensionCommands(): BuiltinCommand[] {
  return BUILTIN_COMMANDS.filter((cmd) => cmd.availableInExtension);
}

/**
 * Get command by name (including aliases)
 */
export function getBuiltinCommand(name: string): BuiltinCommand | undefined {
  const normalized = name.toLowerCase();
  return BUILTIN_COMMANDS.find(
    (cmd) => cmd.name === normalized || cmd.aliases?.includes(normalized),
  );
}

/**
 * Check if a command name is a builtin command
 */
export function isBuiltinCommand(name: string): boolean {
  return getBuiltinCommand(name) !== undefined;
}

/**
 * Get all command names including aliases
 */
export function getAllCommandNames(): string[] {
  const names: string[] = [];
  for (const cmd of BUILTIN_COMMANDS) {
    names.push(cmd.name);
    if (cmd.aliases) {
      names.push(...cmd.aliases);
    }
  }
  return names;
}
