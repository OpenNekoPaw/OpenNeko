import type {
  AgentState,
  ConversationStreamingState,
  ConversationSummary,
  OpenTab,
} from '@neko-agent/types';

export type HistoryConversationExecutionStatus = 'running' | 'completed';
export type HistoryConversationProtectedReason = 'open' | 'running';

export interface HistoryConversationItem extends ConversationSummary {
  readonly isOpen: boolean;
  readonly isActive: boolean;
  readonly executionStatus?: HistoryConversationExecutionStatus;
  readonly canDelete: boolean;
  readonly protectedReason?: HistoryConversationProtectedReason;
}

export interface ProjectHistoryConversationItemsInput {
  readonly conversations: readonly ConversationSummary[];
  readonly openTabs: readonly OpenTab[];
  readonly activeConversationId: string | null;
  readonly activeStreaming: ConversationStreamingState;
  readonly streamingByConversation: ReadonlyMap<string, ConversationStreamingState>;
  readonly agentStateByConversation: ReadonlyMap<string, AgentState>;
}

export interface ProjectHistoryCleanupInput {
  readonly historyItems: readonly HistoryConversationItem[];
}

export interface ProjectHistoryCleanupResult {
  readonly deletableConversationIds: readonly string[];
  readonly protectedConversationCount: number;
}

export function projectHistoryConversationItems(
  input: ProjectHistoryConversationItemsInput,
): HistoryConversationItem[] {
  const openConversationIds = new Set(input.openTabs.map((tab) => tab.conversationId));

  return input.conversations.map((conversation) => {
    const isActive = conversation.id === input.activeConversationId;
    const isOpen = openConversationIds.has(conversation.id) || isActive;
    const streaming = isActive
      ? input.activeStreaming
      : input.streamingByConversation.get(conversation.id);
    const agentState = input.agentStateByConversation.get(conversation.id);
    const executionStatus = resolveHistoryExecutionStatus({
      messageCount: conversation.messageCount,
      streaming,
      agentState,
    });
    const protectedReason = executionStatus === 'running' ? 'running' : isOpen ? 'open' : undefined;

    return {
      ...conversation,
      isOpen,
      isActive,
      ...(executionStatus ? { executionStatus } : {}),
      canDelete: !protectedReason,
      ...(protectedReason ? { protectedReason } : {}),
    };
  });
}

export function projectHistoryCleanup(
  input: ProjectHistoryCleanupInput,
): ProjectHistoryCleanupResult {
  const deletableConversationIds = input.historyItems
    .filter((item) => item.canDelete)
    .map((item) => item.id);

  return {
    deletableConversationIds,
    protectedConversationCount: input.historyItems.length - deletableConversationIds.length,
  };
}

function resolveHistoryExecutionStatus(input: {
  readonly messageCount: number;
  readonly streaming?: ConversationStreamingState;
  readonly agentState?: AgentState;
}): HistoryConversationExecutionStatus | undefined {
  if (input.streaming?.isThinking || input.streaming?.streamingMessageId) return 'running';
  if (input.agentState && input.agentState.phase !== 'idle') return 'running';
  return input.messageCount > 0 ? 'completed' : undefined;
}
