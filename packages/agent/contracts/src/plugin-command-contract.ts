export interface PluginSlashCommandIdInput {
  readonly pluginId: string;
  readonly commandId: string;
}

export function buildPluginSlashCommandId(input: PluginSlashCommandIdInput): string {
  return `${input.pluginId}.slashCommand.${input.commandId}`;
}
