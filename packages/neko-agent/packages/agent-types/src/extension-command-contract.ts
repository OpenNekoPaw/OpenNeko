export const NEKO_AI_ASSISTANT_FOCUS_COMMAND = 'neko.aiAssistant.focus';
export const NEKO_AGENT_REGISTER_CAPABILITIES_COMMAND = 'neko.agent.registerCapabilities';
export const NEKO_AGENT_REGISTER_SLASH_COMMANDS_COMMAND = 'neko.agent.registerSlashCommands';
export const NEKO_AGENT_REFRESH_EXTERNAL_PROCESSORS_COMMAND =
  'neko.agent.refreshExternalProcessors';
export const NEKO_AGENT_UNREGISTER_EXTERNAL_PROCESSOR_PACKAGE_COMMAND =
  'neko.agent.unregisterExternalProcessorPackage';
export const NEKO_AGENT_REGISTER_EXTERNAL_PROCESSOR_CONTRIBUTION_COMMAND =
  'neko.agent.registerExternalProcessorContribution';
export const NEKO_AGENT_LLM_GENERATE_COMMAND = 'neko.agent.llm.generate';
export const NEKO_PUPPET_EXTENSION_ID = 'neko.neko-puppet';

export interface PluginSlashCommandCommandInput {
  readonly extensionId: string;
  readonly commandId: string;
}

export function buildPluginSlashCommandCommand(input: PluginSlashCommandCommandInput): string {
  return `${input.extensionId}.slashCommand.${input.commandId}`;
}
