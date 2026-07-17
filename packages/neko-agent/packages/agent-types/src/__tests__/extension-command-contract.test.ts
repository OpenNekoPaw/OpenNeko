import { describe, expect, it } from 'vitest';
import {
  NEKO_AGENT_LLM_GENERATE_COMMAND,
  NEKO_AGENT_REFRESH_EXTERNAL_PROCESSORS_COMMAND,
  NEKO_AGENT_REGISTER_CAPABILITIES_COMMAND,
  NEKO_AGENT_REGISTER_EXTERNAL_PROCESSOR_CONTRIBUTION_COMMAND,
  NEKO_AGENT_REGISTER_SLASH_COMMANDS_COMMAND,
  NEKO_AGENT_UNREGISTER_EXTERNAL_PROCESSOR_PACKAGE_COMMAND,
  NEKO_AI_ASSISTANT_FOCUS_COMMAND,
  NEKO_PUPPET_EXTENSION_ID,
  buildPluginSlashCommandCommand,
} from '../extension-command-contract';

describe('extension command contract', () => {
  it('keeps VSCode bridge command ids in a shared contract', () => {
    expect(NEKO_AI_ASSISTANT_FOCUS_COMMAND).toBe('neko.aiAssistant.focus');
    expect(NEKO_AGENT_REGISTER_CAPABILITIES_COMMAND).toBe('neko.agent.registerCapabilities');
    expect(NEKO_AGENT_REGISTER_SLASH_COMMANDS_COMMAND).toBe('neko.agent.registerSlashCommands');
    expect(NEKO_AGENT_REFRESH_EXTERNAL_PROCESSORS_COMMAND).toBe(
      'neko.agent.refreshExternalProcessors',
    );
    expect(NEKO_AGENT_UNREGISTER_EXTERNAL_PROCESSOR_PACKAGE_COMMAND).toBe(
      'neko.agent.unregisterExternalProcessorPackage',
    );
    expect(NEKO_AGENT_REGISTER_EXTERNAL_PROCESSOR_CONTRIBUTION_COMMAND).toBe(
      'neko.agent.registerExternalProcessorContribution',
    );
    expect(NEKO_AGENT_LLM_GENERATE_COMMAND).toBe('neko.agent.llm.generate');
    expect(NEKO_PUPPET_EXTENSION_ID).toBe('neko.neko-puppet');
  });

  it('builds plugin slash command ids without duplicating format in extension', () => {
    expect(
      buildPluginSlashCommandCommand({
        extensionId: 'neko.neko-canvas',
        commandId: 'batch',
      }),
    ).toBe('neko.neko-canvas.slashCommand.batch');
  });
});
