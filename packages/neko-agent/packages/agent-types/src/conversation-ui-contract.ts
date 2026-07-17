import type { Message } from './message';
import type { OpenTab, TabType } from './ui';
import type { AgentWorkItem } from './work-item';
import type { AgentQueuedMessageItem } from './webview-protocol';

export interface ConversationStreamingState {
  streamingMessageId: string | null;
  isThinking: boolean;
  queuedMessageCount?: number;
  queuedMessages?: readonly AgentQueuedMessageItem[];
  messageQueueVersion?: number;
}

export interface ActiveConversationPayload {
  id: string;
  title?: string;
  messages?: readonly Message[];
}

export interface ConversationErrorProjectionInput {
  messages: readonly Message[];
  errorMessage?: string;
  now?: () => number;
  generateId?: () => string;
}

export interface ConversationMessagesProjection {
  messages: Message[];
  streaming: ConversationStreamingState;
}

export interface ActiveConversationProjectionInput {
  conversation?: ActiveConversationPayload;
  openTabs: readonly OpenTab[];
  now?: () => number;
  generateTabId?: () => string;
}

export interface ActiveConversationProjection {
  activeConversationId: string | null;
  messages: Message[];
  streaming: ConversationStreamingState;
  openTabs: OpenTab[];
  activeTabId: string | null;
  activeTab: TabType;
  workItems: AgentWorkItem[];
}
