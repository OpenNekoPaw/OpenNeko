/**
 * MessageActionsContext - Provides message action callbacks via React Context
 *
 * Eliminates prop drilling of 9 callback functions through
 * ChatView → MessageList → MessageItem/ContentBlockItem.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AgentWorkItem } from '../AgentWorkItem';
import type { PluginsAvailable } from './SendToMenu';
import type { AmbientCanvasNodeProjection } from '../../presenters/plugin-transfer-presenter';
import type { AgentContextPayload } from '@neko/agent-contracts';

export interface MessageActionsContextValue {
  activeConversationId?: string | null;
  // Unified Agent and subagent activity projections.
  workItems?: AgentWorkItem[];
  pluginsAvailable?: PluginsAvailable;
  contextChips?: readonly AgentContextPayload[];
  ambientNodes?: readonly AmbientCanvasNodeProjection[];
  // Diff actions
  onAcceptDiff?: (filePath: string) => void;
  onRejectDiff?: (filePath: string) => void;
}

const MessageActionsContext = createContext<MessageActionsContextValue>({});

export function MessageActionsProvider({
  children,
  ...actions
}: MessageActionsContextValue & { children: ReactNode }) {
  const value = useMemo<MessageActionsContextValue>(
    () => ({
      activeConversationId: actions.activeConversationId,
      workItems: actions.workItems,
      pluginsAvailable: actions.pluginsAvailable,
      contextChips: actions.contextChips,
      ambientNodes: actions.ambientNodes,
      onAcceptDiff: actions.onAcceptDiff,
      onRejectDiff: actions.onRejectDiff,
    }),
    [
      actions.activeConversationId,
      actions.workItems,
      actions.pluginsAvailable,
      actions.contextChips,
      actions.ambientNodes,
      actions.onAcceptDiff,
      actions.onRejectDiff,
    ],
  );

  return <MessageActionsContext.Provider value={value}>{children}</MessageActionsContext.Provider>;
}

export function useMessageActions(): MessageActionsContextValue {
  return useContext(MessageActionsContext);
}
