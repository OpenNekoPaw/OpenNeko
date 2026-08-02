import type { Message } from '@neko-agent/contracts';
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
): Promise<ActiveConversationMessage> {
  if (!conversation) {
    return Promise.resolve({
      type: 'activeConversation',
      conversation: null,
    });
  }

  return projectMessagesForResourceDisplay(conversation.messages, options).then((messages) => ({
    type: 'activeConversation',
    conversation: {
      id: conversation.id,
      title: conversation.title,
      messages,
    },
  }));
}
