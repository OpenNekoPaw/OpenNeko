import type {
  ActiveConversationProjection,
  ActiveConversationProjectionInput,
  ConversationErrorProjectionInput,
  ConversationMessagesProjection,
  ConversationStreamingState,
  OpenTab,
} from '@neko-agent/types';
import { projectConversationWorkItemsFromMessages } from './work-item-message-presenter';

const DEFAULT_ERROR_MESSAGE = 'An error occurred';
const DEFAULT_CONVERSATION_TITLE = 'New Chat';

export function projectConversationError(
  input: ConversationErrorProjectionInput,
): ConversationMessagesProjection {
  const now = input.now?.() ?? Date.now();
  return {
    messages: [
      ...input.messages,
      {
        id: input.generateId?.() ?? String(now),
        role: 'assistant',
        content: input.errorMessage || DEFAULT_ERROR_MESSAGE,
        timestamp: now,
        isError: true,
      },
    ],
    streaming: idleStreamingState(),
  };
}

export function projectHistoryClearedConversation(): ConversationMessagesProjection {
  return {
    messages: [],
    streaming: idleStreamingState(),
  };
}

export function projectActiveConversation(
  input: ActiveConversationProjectionInput,
): ActiveConversationProjection {
  const conversation = input.conversation;
  if (!conversation) {
    return {
      activeConversationId: null,
      messages: [],
      streaming: idleStreamingState(),
      openTabs: [...input.openTabs],
      activeTabId: null,
      activeTab: 'chat',
      workItems: [],
    };
  }

  const messages = conversation.messages ?? [];
  const projection = projectConversationWorkItemsFromMessages({
    conversationId: conversation.id,
    messages,
    now: input.now,
  });

  const tabProjection = projectConversationTab({
    conversationId: conversation.id,
    title: conversation.title || DEFAULT_CONVERSATION_TITLE,
    openTabs: input.openTabs,
    now: input.now,
    generateTabId: input.generateTabId,
  });

  return {
    activeConversationId: conversation.id,
    messages: projection.messages,
    streaming: projectPersistedStreamingState(projection.messages),
    openTabs: tabProjection.openTabs,
    activeTabId: tabProjection.activeTabId,
    activeTab: 'chat',
    workItems: projection.workItems,
  };
}

function projectConversationTab(input: {
  conversationId: string;
  title: string;
  openTabs: readonly OpenTab[];
  now?: () => number;
  generateTabId?: () => string;
}): { openTabs: OpenTab[]; activeTabId: string } {
  const existingTab = input.openTabs.find((tab) => tab.conversationId === input.conversationId);
  if (existingTab) {
    return {
      openTabs: input.openTabs.map((tab) =>
        tab.id === existingTab.id && shouldReplaceTabTitle(tab.title)
          ? { ...tab, title: input.title }
          : tab,
      ),
      activeTabId: existingTab.id,
    };
  }

  const newTab: OpenTab = {
    id: input.generateTabId?.() ?? `tab-${input.now?.() ?? Date.now()}`,
    title: input.title,
    conversationId: input.conversationId,
  };
  return {
    openTabs: [...input.openTabs, newTab],
    activeTabId: newTab.id,
  };
}

function idleStreamingState(): ConversationStreamingState {
  return {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
  };
}

function projectPersistedStreamingState(
  messages: readonly { readonly id: string; readonly isStreaming?: boolean }[],
): ConversationStreamingState {
  const streamingMessage = [...messages]
    .reverse()
    .find((message) => message.isStreaming && message.id);
  if (!streamingMessage) {
    return idleStreamingState();
  }
  return {
    streamingMessageId: streamingMessage.id,
    isThinking: true,
    queuedMessageCount: 0,
    queuedMessages: [],
  };
}

function shouldReplaceTabTitle(title: string): boolean {
  return title.trim().length === 0 || title === DEFAULT_CONVERSATION_TITLE;
}
