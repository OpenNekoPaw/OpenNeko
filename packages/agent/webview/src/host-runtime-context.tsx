import { createContext, useContext, useMemo, type ReactElement, type ReactNode } from 'react';
import {
  createAgentHostMessages,
  type AgentHostMessageSender,
  type AgentHostRuntimeAdapter,
} from './messages';

interface AgentHostRuntimeContextValue {
  readonly adapter: AgentHostRuntimeAdapter;
  readonly messages: AgentHostMessageSender;
}

const AgentHostRuntimeContext = createContext<AgentHostRuntimeContextValue | null>(null);

export interface AgentHostRuntimeProviderProps {
  readonly adapter: AgentHostRuntimeAdapter;
  readonly children: ReactNode;
}

export function AgentHostRuntimeProvider({
  adapter,
  children,
}: AgentHostRuntimeProviderProps): ReactElement {
  const value = useMemo<AgentHostRuntimeContextValue>(
    () => ({ adapter, messages: createAgentHostMessages(adapter) }),
    [adapter],
  );
  return (
    <AgentHostRuntimeContext.Provider value={value}>{children}</AgentHostRuntimeContext.Provider>
  );
}

export function useAgentHostRuntimeAdapter(): AgentHostRuntimeAdapter {
  const value = useContext(AgentHostRuntimeContext);
  if (!value) {
    throw new Error('Agent host runtime adapter provider is missing.');
  }
  return value.adapter;
}

export function useOptionalAgentHostRuntimeAdapter(): AgentHostRuntimeAdapter | null {
  return useContext(AgentHostRuntimeContext)?.adapter ?? null;
}

export function useAgentHostMessages(): AgentHostMessageSender {
  const value = useContext(AgentHostRuntimeContext);
  if (!value) {
    throw new Error('Agent host runtime adapter provider is missing.');
  }
  return value.messages;
}
