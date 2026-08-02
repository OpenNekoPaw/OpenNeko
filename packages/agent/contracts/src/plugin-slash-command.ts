export interface PluginSlashCommandDef {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

export interface RegisteredPluginSlashCommand extends PluginSlashCommandDef {
  pluginId: string;
}

export interface PluginSlashCommandInvocation {
  pluginId: string;
  commandId: string;
  conversationId: string;
  args?: string;
}
