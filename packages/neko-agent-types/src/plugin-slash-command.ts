export interface PluginSlashCommandDef {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

export interface RegisteredPluginSlashCommand extends PluginSlashCommandDef {
  extensionId: string;
}

export interface PluginSlashCommandInvocation {
  extensionId: string;
  commandId: string;
  conversationId: string;
  args?: string;
}
