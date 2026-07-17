/**
 * MessageActionsContext - Provides message action callbacks via React Context
 *
 * Eliminates prop drilling of 9 callback functions through
 * ChatView → MessageList → MessageItem/ContentBlockItem.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AgentWorkItem } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { AmbientCanvasNodeProjection } from '@/presenters/plugin-transfer-presenter';
import type { AgentContextPayload, TaskRunScope } from '@neko/shared';

export interface MessageActionsContextValue {
  activeConversationId?: string | null;
  // Unified work items (media tasks, tool background tasks, subagents)
  workItems?: AgentWorkItem[];
  pluginsAvailable?: PluginsAvailable;
  contextChips?: readonly AgentContextPayload[];
  ambientNodes?: readonly AmbientCanvasNodeProjection[];
  // Task actions
  onCancelTask?: (taskScope: TaskRunScope) => void;
  onRetryTask?: (taskScope: TaskRunScope) => void;
  onViewTaskResult?: (taskScope: TaskRunScope, resultRef?: string) => void;
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
      onCancelTask: actions.onCancelTask,
      onRetryTask: actions.onRetryTask,
      onViewTaskResult: actions.onViewTaskResult,
      onAcceptDiff: actions.onAcceptDiff,
      onRejectDiff: actions.onRejectDiff,
    }),
    [
      actions.activeConversationId,
      actions.workItems,
      actions.pluginsAvailable,
      actions.contextChips,
      actions.ambientNodes,
      actions.onCancelTask,
      actions.onRetryTask,
      actions.onViewTaskResult,
      actions.onAcceptDiff,
      actions.onRejectDiff,
    ],
  );

  return <MessageActionsContext.Provider value={value}>{children}</MessageActionsContext.Provider>;
}

export function useMessageActions(): MessageActionsContextValue {
  return useContext(MessageActionsContext);
}
