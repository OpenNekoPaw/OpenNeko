import type { MessageBundle } from '@neko/ui/i18n';

export const commandDescriptions = {
  'commandDescriptions.help': 'Show help message with available commands',
  'commandDescriptions.status': 'Show current status (config, model, resources)',
  'commandDescriptions.clear': 'Clear conversation history / screen',
  'commandDescriptions.exit': 'Exit interactive mode / close current session',
  'commandDescriptions.as': 'Start an isolated Character Dialogue session',
  'commandDescriptions.exit-as': 'Exit the active Character Dialogue session',
  'commandDescriptions.new': 'Start a new conversation',
  'commandDescriptions.resume': 'Show recent conversations to resume',
  'commandDescriptions.config': 'Manage configuration',
  'commandDescriptions.model': 'Show model selector / switch model',
  'commandDescriptions.settings': 'Open settings panel',
  'commandDescriptions.permissions': 'Show and manage permissions',
  'commandDescriptions.init': 'Initialize project configuration',
  'commandDescriptions.compact': 'Compress conversation context to save tokens',
  'commandDescriptions.plan': 'Toggle plan mode (design before implement)',
  'commandDescriptions.skills': 'List and manage skills',
  'commandDescriptions.commands': 'List available slash commands',
  'commandDescriptions.tools': 'List and search available tools',
  'commandDescriptions.mcp': 'Show MCP servers configuration',
} as const satisfies MessageBundle;
