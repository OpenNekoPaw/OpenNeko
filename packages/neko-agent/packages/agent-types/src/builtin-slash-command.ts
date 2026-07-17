/**
 * Browser-safe builtin slash command metadata shared by agent, extension,
 * cli-tui, and webview.
 *
 * This file intentionally contains only static command catalog data and small
 * lookup helpers so UI/runtime packages can share one command inventory
 * without importing heavier execution modules.
 */

export type BuiltinSlashCommandName =
  | 'help'
  | 'status'
  | 'clear'
  | 'exit'
  | 'as'
  | 'exit-as'
  | 'new'
  | 'resume'
  | 'config'
  | 'model'
  | 'settings'
  | 'permissions'
  | 'init'
  | 'compact'
  | 'plan'
  | 'skills'
  | 'commands'
  | 'tools'
  | 'tasks'
  | 'mcp';

export type BuiltinSlashCommandCategory =
  'core' | 'session' | 'configuration' | 'context' | 'mode' | 'resources';

export type BuiltinSlashCommandSurface = 'cli' | 'extension';

export interface BuiltinSlashCommandDefinition {
  readonly name: BuiltinSlashCommandName;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly usage?: string;
  readonly category: BuiltinSlashCommandCategory;
  readonly availableInCli: boolean;
  readonly availableInExtension: boolean;
}

export const BUILTIN_SLASH_COMMANDS: readonly BuiltinSlashCommandDefinition[] = [
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show help message with available commands',
    category: 'core',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'status',
    aliases: ['s'],
    description: 'Show current status (config, model, resources)',
    category: 'core',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear conversation history / screen',
    category: 'core',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    description: 'Exit interactive mode / close current session',
    category: 'core',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'as',
    description: 'Start an isolated Character Dialogue session',
    usage: '@character [--consult] [--enrichment=ask|skip|auto|manual]',
    category: 'session',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'exit-as',
    description: 'Exit the active Character Dialogue session',
    category: 'session',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'new',
    description: 'Start a new conversation',
    category: 'session',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'resume',
    description: 'Show recent conversations to resume',
    category: 'session',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'config',
    aliases: ['cfg'],
    description: 'Manage configuration',
    usage: '[set <key> <value> | providers | models]',
    category: 'configuration',
    availableInCli: true,
    availableInExtension: false,
  },
  {
    name: 'model',
    description: 'Show model selector / switch model',
    category: 'configuration',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'settings',
    description: 'Open settings panel',
    category: 'configuration',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'permissions',
    description: 'Show and manage permissions',
    category: 'configuration',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'init',
    description: 'Initialize project configuration',
    category: 'configuration',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'compact',
    description: 'Compress conversation context to save tokens',
    category: 'context',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'plan',
    description: 'Toggle plan mode (design before implement)',
    category: 'mode',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'skills',
    description: 'List and manage skills',
    usage: '[info <name> | active | clear]',
    category: 'resources',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'commands',
    aliases: ['cmds'],
    description: 'List available slash commands',
    category: 'resources',
    availableInCli: true,
    availableInExtension: false,
  },
  {
    name: 'tools',
    description: 'List and search available tools',
    usage: '[info <name> | search <query>]',
    category: 'resources',
    availableInCli: true,
    availableInExtension: true,
  },
  {
    name: 'tasks',
    aliases: ['todos'],
    description: 'Show background tasks',
    category: 'resources',
    availableInCli: false,
    availableInExtension: true,
  },
  {
    name: 'mcp',
    description: 'Show MCP servers configuration',
    category: 'resources',
    availableInCli: false,
    availableInExtension: true,
  },
];

export const BUILTIN_SLASH_COMMAND_ALIASES: Record<string, BuiltinSlashCommandName> =
  BUILTIN_SLASH_COMMANDS.reduce<Record<string, BuiltinSlashCommandName>>((aliases, command) => {
    for (const alias of command.aliases ?? []) {
      aliases[alias] = command.name;
    }
    return aliases;
  }, {});

export function listBuiltinSlashCommands(
  surface?: BuiltinSlashCommandSurface,
): readonly BuiltinSlashCommandDefinition[] {
  if (!surface) {
    return BUILTIN_SLASH_COMMANDS;
  }

  return BUILTIN_SLASH_COMMANDS.filter((command) =>
    surface === 'cli' ? command.availableInCli : command.availableInExtension,
  );
}

export function getBuiltinSlashCommand(name: string): BuiltinSlashCommandDefinition | undefined {
  const normalized = name.trim().replace(/^\//, '').toLowerCase();
  return BUILTIN_SLASH_COMMANDS.find(
    (command) => command.name === normalized || command.aliases?.includes(normalized),
  );
}
