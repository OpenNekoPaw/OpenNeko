import React, { createContext, useContext } from 'react';
import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalMessageKey } from './terminal-messages';

const TerminalPresentationReactContext = createContext<
  AgentTerminalPresentationContext<AgentTerminalMessageKey> | undefined
>(undefined);

export function AgentTerminalPresentationProvider(input: {
  readonly value: AgentTerminalPresentationContext<AgentTerminalMessageKey>;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  return (
    <TerminalPresentationReactContext.Provider value={input.value}>
      {input.children}
    </TerminalPresentationReactContext.Provider>
  );
}

export function useAgentTerminalPresentation(): AgentTerminalPresentationContext<AgentTerminalMessageKey> {
  const context = useContext(TerminalPresentationReactContext);
  if (!context) {
    throw new Error('AgentTerminalPresentationContext is required for Ink rendering.');
  }
  return context;
}
