import { createContext, useContext, type ReactElement, type ReactNode } from 'react';
import type { AgentHostRuntimeAdapter } from './messages';
import { getAgentHostRuntimeAdapter } from './messages';

const AgentHostRuntimeContext = createContext<AgentHostRuntimeAdapter | null>(null);

export interface AgentHostRuntimeProviderProps {
  readonly adapter?: AgentHostRuntimeAdapter;
  readonly children: ReactNode;
}

export function AgentHostRuntimeProvider({
  adapter,
  children,
}: AgentHostRuntimeProviderProps): ReactElement {
  return (
    <AgentHostRuntimeContext.Provider value={adapter ?? getAgentHostRuntimeAdapter()}>
      {children}
    </AgentHostRuntimeContext.Provider>
  );
}

export function useAgentHostRuntimeAdapter(): AgentHostRuntimeAdapter {
  const adapter = useContext(AgentHostRuntimeContext);
  if (!adapter) {
    throw new Error('Agent host runtime adapter provider is missing.');
  }
  return adapter;
}
