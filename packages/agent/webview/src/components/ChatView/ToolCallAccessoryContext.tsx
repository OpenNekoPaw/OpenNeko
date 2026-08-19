import { createContext, useContext, type ReactNode } from 'react';
import type { ToolCall } from '@neko/agent-contracts';

export interface AgentToolCallAccessoryInput {
  readonly conversationId: string | null;
  readonly toolCall: ToolCall;
}

export type AgentToolCallAccessoryRenderer = (input: AgentToolCallAccessoryInput) => ReactNode;

const ToolCallAccessoryContext = createContext<AgentToolCallAccessoryRenderer | undefined>(
  undefined,
);

export function ToolCallAccessoryProvider({
  children,
  renderer,
}: {
  readonly children: ReactNode;
  readonly renderer?: AgentToolCallAccessoryRenderer;
}): JSX.Element {
  return (
    <ToolCallAccessoryContext.Provider value={renderer}>
      {children}
    </ToolCallAccessoryContext.Provider>
  );
}

export function useToolCallAccessoryRenderer(): AgentToolCallAccessoryRenderer | undefined {
  return useContext(ToolCallAccessoryContext);
}
