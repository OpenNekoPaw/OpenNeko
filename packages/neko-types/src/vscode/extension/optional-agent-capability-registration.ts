import * as vscode from 'vscode';
import type { AgentCapabilityProvider } from '../../types/agent-capability';
import { NEKO_EXTENSION_IDS } from '../../types/extension-api';

export const REGISTER_AGENT_CAPABILITIES_COMMAND = 'neko.agent.registerCapabilities';

export async function registerOptionalAgentCapabilityProvider(
  provider: AgentCapabilityProvider,
): Promise<boolean> {
  if (!vscode.extensions.getExtension(NEKO_EXTENSION_IDS.NEKO_AGENT)) {
    return false;
  }

  await vscode.commands.executeCommand(REGISTER_AGENT_CAPABILITIES_COMMAND, provider);
  return true;
}
