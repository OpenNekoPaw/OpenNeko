import type { Message } from '@neko-agent/types';
import {
  projectMessagesForResourceDisplay,
  type MessageResourceProjectionOptions,
} from '../input/message-resource-projector';

export interface ConversationViewSource {
  id: string;
  title: string;
  messages: readonly Message[];
  updatedAt: number;
}

export interface ConversationListItemView {
  id: string;
  title: string;
  messageCount: number;
  updatedAt: number;
}

export interface ConversationListMessage {
  type: 'conversationList';
  conversations: ConversationListItemView[];
}

export interface ActiveConversationView {
  id: string;
  title: string;
  messages: Message[];
}

export interface ActiveConversationMessage {
  type: 'activeConversation';
  conversation: ActiveConversationView | null;
}

export function buildConversationListMessage(
  conversations: readonly ConversationViewSource[],
): ConversationListMessage {
  return {
    type: 'conversationList',
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      title: conversation.title,
      messageCount: conversation.messages.length,
      updatedAt: conversation.updatedAt,
    })),
  };
}

export function buildActiveConversationMessage(
  conversation: ConversationViewSource | null | undefined,
  options: MessageResourceProjectionOptions = {},
): ActiveConversationMessage {
  if (!conversation) {
    return {
      type: 'activeConversation',
      conversation: null,
    };
  }

  return {
    type: 'activeConversation',
    conversation: {
      id: conversation.id,
      title: conversation.title,
      messages: projectMessagesForResourceDisplay(conversation.messages, options),
    },
  };
}
