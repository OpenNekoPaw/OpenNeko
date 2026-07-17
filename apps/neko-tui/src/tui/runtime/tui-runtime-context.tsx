import React, { createContext, useContext, useSyncExternalStore } from 'react';
import { useStore } from 'zustand';
import type { AgentSlice } from '../stores/agent-store';
import type { ConfigSlice } from '../stores/config-store';
import type { ConversationSlice } from '../stores/conversation-store';
import type { UISlice } from '../stores/ui-store';
import type {
  AgentTuiApplicationRuntime,
  TuiConversationRuntime,
  TuiConversationStores,
} from './tui-application-runtime';

export type { TuiConversationStores } from './tui-application-runtime';

const TuiApplicationRuntimeContext = createContext<AgentTuiApplicationRuntime | null>(null);
const TuiConversationRuntimeContext = createContext<TuiConversationRuntime | null>(null);

export interface TuiApplicationRuntimeProviderProps {
  readonly runtime: AgentTuiApplicationRuntime;
  readonly children: React.ReactNode;
}

export function TuiApplicationRuntimeProvider({
  runtime,
  children,
}: TuiApplicationRuntimeProviderProps): React.JSX.Element {
  const snapshot = useSyncExternalStore(
    (listener) => runtime.subscribe(listener),
    () => runtime.getSnapshot(),
    () => runtime.getSnapshot(),
  );
  if (!snapshot.activeRuntimeId) {
    throw new Error('TUI application runtime requires an active conversation.');
  }
  const conversationRuntime = runtime.requireRuntime(snapshot.activeRuntimeId);
  return (
    <TuiApplicationRuntimeContext.Provider value={runtime}>
      <TuiConversationRuntimeProvider runtime={conversationRuntime}>
        <React.Fragment key={conversationRuntime.runtimeId}>{children}</React.Fragment>
      </TuiConversationRuntimeProvider>
    </TuiApplicationRuntimeContext.Provider>
  );
}

export interface TuiConversationRuntimeProviderProps {
  readonly runtime: TuiConversationRuntime;
  readonly children: React.ReactNode;
}

function TuiConversationRuntimeProvider({
  runtime,
  children,
}: TuiConversationRuntimeProviderProps): React.JSX.Element {
  return (
    <TuiConversationRuntimeContext.Provider value={runtime}>
      {children}
    </TuiConversationRuntimeContext.Provider>
  );
}

export function useTuiConversationRuntime(): TuiConversationRuntime {
  const runtime = useContext(TuiConversationRuntimeContext);
  if (!runtime) {
    throw new Error('TUI components require a TuiConversationRuntimeProvider.');
  }
  if (runtime.lifecycle !== 'ready') {
    throw new Error(`TUI conversation runtime is not ready: ${runtime.lifecycle}.`);
  }
  return runtime;
}

export function useTuiApplicationRuntime(): AgentTuiApplicationRuntime {
  const runtime = useContext(TuiApplicationRuntimeContext);
  if (!runtime) {
    throw new Error('TUI components require a TuiApplicationRuntimeProvider.');
  }
  return runtime;
}

export function useTuiConversationStores(): TuiConversationStores {
  return useTuiConversationRuntime().stores;
}

export function useTuiAgentStore<T>(selector: (state: AgentSlice) => T): T {
  return useStore(useTuiConversationRuntime().stores.agent, selector);
}

export function useTuiConfigStore<T>(selector: (state: ConfigSlice) => T): T {
  return useStore(useTuiConversationRuntime().stores.config, selector);
}

export function useTuiConversationStore<T>(selector: (state: ConversationSlice) => T): T {
  return useStore(useTuiConversationRuntime().stores.conversation, selector);
}

export function useTuiUIStore<T>(selector: (state: UISlice) => T): T {
  return useStore(useTuiConversationRuntime().stores.ui, selector);
}
