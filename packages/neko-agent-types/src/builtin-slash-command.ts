/**
 * Browser-safe builtin slash command metadata shared by agent, Desktop,
 * and webview.
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
  | 'mcp';

export type BuiltinSlashCommandCategory =
  'core' | 'session' | 'configuration' | 'context' | 'mode' | 'resources';

export interface BuiltinSlashCommandDefinition {
  readonly name: BuiltinSlashCommandName;
  readonly aliases?: readonly string[];
  readonly description: string;
  readonly usage?: string;
  readonly category: BuiltinSlashCommandCategory;
  readonly availableInDesktop: boolean;
}

export const BUILTIN_SLASH_COMMANDS: readonly BuiltinSlashCommandDefinition[] = [
  {
    name: 'help',
    aliases: ['h', '?'],
    description: 'Show help message with available commands',
    category: 'core',
    availableInDesktop: true,
  },
  {
    name: 'status',
    aliases: ['s'],
    description: 'Show current status (config, model, resources)',
    category: 'core',
    availableInDesktop: true,
  },
  {
    name: 'clear',
    aliases: ['cls'],
    description: 'Clear conversation history / screen',
    category: 'core',
    availableInDesktop: true,
  },
  {
    name: 'exit',
    aliases: ['quit', 'q'],
    description: 'Exit interactive mode / close current session',
    category: 'core',
    availableInDesktop: true,
  },
  {
    name: 'as',
    description: 'Start an isolated Character Dialogue session',
    usage: '@character [--consult] [--enrichment=ask|skip|auto|manual]',
    category: 'session',
    availableInDesktop: true,
  },
  {
    name: 'exit-as',
    description: 'Exit the active Character Dialogue session',
    category: 'session',
    availableInDesktop: true,
  },
  {
    name: 'new',
    description: 'Start a new conversation',
    category: 'session',
    availableInDesktop: true,
  },
  {
    name: 'resume',
    description: 'Show recent conversations to resume',
    category: 'session',
    availableInDesktop: true,
  },
  {
    name: 'config',
    aliases: ['cfg'],
    description: 'Manage configuration',
    usage: '[set <key> <value> | providers | models]',
    category: 'configuration',
    availableInDesktop: false,
  },
  {
    name: 'model',
    description: 'Show model selector / switch model',
    category: 'configuration',
    availableInDesktop: true,
  },
  {
    name: 'settings',
    description: 'Open settings panel',
    category: 'configuration',
    availableInDesktop: true,
  },
  {
    name: 'permissions',
    description: 'Show and manage permissions',
    category: 'configuration',
    availableInDesktop: true,
  },
  {
    name: 'init',
    description: 'Initialize project configuration',
    category: 'configuration',
    availableInDesktop: true,
  },
  {
    name: 'compact',
    description: 'Compress conversation context to save tokens',
    category: 'context',
    availableInDesktop: true,
  },
  {
    name: 'plan',
    description: 'Toggle plan mode (design before implement)',
    category: 'mode',
    availableInDesktop: true,
  },
  {
    name: 'skills',
    description: 'List and manage skills',
    usage: '[info <name> | active | clear]',
    category: 'resources',
    availableInDesktop: true,
  },
  {
    name: 'commands',
    aliases: ['cmds'],
    description: 'List available slash commands',
    category: 'resources',
    availableInDesktop: false,
  },
  {
    name: 'tools',
    description: 'List and search available tools',
    usage: '[info <name> | search <query>]',
    category: 'resources',
    availableInDesktop: true,
  },
  {
    name: 'mcp',
    description: 'Show MCP servers configuration',
    category: 'resources',
    availableInDesktop: true,
  },
];

export const BUILTIN_SLASH_COMMAND_ALIASES: Record<string, BuiltinSlashCommandName> =
  BUILTIN_SLASH_COMMANDS.reduce<Record<string, BuiltinSlashCommandName>>((aliases, command) => {
    for (const alias of command.aliases ?? []) {
      aliases[alias] = command.name;
    }
    return aliases;
  }, {});

export function listBuiltinSlashCommands(): readonly BuiltinSlashCommandDefinition[] {
  return BUILTIN_SLASH_COMMANDS.filter((command) => command.availableInDesktop);
}

export function getBuiltinSlashCommand(name: string): BuiltinSlashCommandDefinition | undefined {
  const normalized = name.trim().replace(/^\//, '').toLowerCase();
  return BUILTIN_SLASH_COMMANDS.find(
    (command) => command.name === normalized || command.aliases?.includes(normalized),
  );
}
