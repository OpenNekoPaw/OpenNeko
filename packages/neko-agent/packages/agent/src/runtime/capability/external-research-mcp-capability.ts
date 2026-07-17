import type { AgentCapabilityProvider, ExternalResearchConfigInput } from '@neko/shared';
import type { MCPToolCallManager } from '../../mcp/mcp-tool';
import { createExternalResearchCapabilityProvider } from './external-research-capability-provider';
import { createMcpExternalResearchProvider } from './mcp-external-research-provider';

export function createExternalResearchCapabilityProviderFromMcpConfig(input: {
  readonly config: ExternalResearchConfigInput | undefined;
  readonly mcpManager: MCPToolCallManager;
}): AgentCapabilityProvider {
  return createExternalResearchCapabilityProvider({
    config: input.config,
    providers: {
      resolve: (providerId) => {
        const mcp = input.config?.mcp;
        if (!mcp) return undefined;
        const resolvedProviderId = providerId ?? `mcp:${mcp.serverId}`;
        return createMcpExternalResearchProvider({
          id: resolvedProviderId,
          config: mcp,
          mcpManager: input.mcpManager,
        });
      },
    },
  });
}
