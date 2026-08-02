import { createContext, type ReactNode, useContext } from 'react';
import {
  getAgentMarkdownSessionRegistry,
  type AgentMarkdownSessionRegistry,
} from './agent-markdown-session-registry';

const AgentMarkdownSessionRegistryContext = createContext<AgentMarkdownSessionRegistry | null>(
  null,
);

export function AgentMarkdownSessionRegistryProvider({
  registry,
  children,
}: {
  readonly registry: AgentMarkdownSessionRegistry;
  readonly children: ReactNode;
}) {
  return (
    <AgentMarkdownSessionRegistryContext.Provider value={registry}>
      {children}
    </AgentMarkdownSessionRegistryContext.Provider>
  );
}

export function useAgentMarkdownSessionRegistry(): AgentMarkdownSessionRegistry {
  return useContext(AgentMarkdownSessionRegistryContext) ?? getAgentMarkdownSessionRegistry();
}
