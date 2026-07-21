import * as vscode from 'vscode';
import type { AgentCapabilityProvider } from '../../types/agent-capability';
import { NEKO_EXTENSION_IDS } from '../../types/extension-api';
import { resolveNekoExtension, waitForNekoExtensionActivation } from './embedded-feature-registry';

export const REGISTER_AGENT_CAPABILITIES_COMMAND = 'neko.agent.registerCapabilities';

export async function registerOptionalAgentCapabilityProvider(
  provider: AgentCapabilityProvider,
): Promise<boolean> {
  const extension = resolveNekoExtension(NEKO_EXTENSION_IDS.NEKO_AGENT, (id) =>
    vscode.extensions.getExtension(id),
  );
  if (!extension) {
    return false;
  }

  await waitForNekoExtensionActivation(NEKO_EXTENSION_IDS.NEKO_AGENT);
  await vscode.commands.executeCommand(REGISTER_AGENT_CAPABILITIES_COMMAND, provider);
  return true;
}
