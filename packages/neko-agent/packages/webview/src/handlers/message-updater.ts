/**
 * Message Updater
 *
 * Unified conversation update functions that auto-route between
 * current and non-current conversations, eliminating if/else branching
 * in every handler.
 */

import type { MessageHandlerContext, StreamingState } from './types';
import type { AgentQueuedMessageItem, Message } from '@neko-agent/types';

/**
 * Result of a conversation update that may change streaming state.
 * Only include streamingMessageId/isThinking if you want to change them.
 */
export interface ConversationUpdateResult {
  messages: Message[];
  /** If provided, update streamingMessageId */
  streamingMessageId?: string | null;
  /** If provided, update isThinking */
  isThinking?: boolean;
  /** If provided, update queued user messages behind the active run */
  queuedMessageCount?: number;
  /** If provided, update authoritative queued user message items */
  queuedMessages?: readonly AgentQueuedMessageItem[];
  /** If provided, update queue snapshot version */
  messageQueueVersion?: number;
}

/**
 * Updater function that receives current messages and streaming state,
 * returns updated messages with optional streaming state changes.
 */
export type ConversationUpdater = (
  messages: Message[],
  streamingMessageId: string | null,
  streaming: StreamingState,
) => ConversationUpdateResult;

/**
 * Update a conversation's messages (and optionally streaming state),
 * auto-routing between current and non-current conversations.
 *
 * Commits through the single conversation-scoped render-state mutation port.
 */
export function updateConversation(
  context: MessageHandlerContext,
  conversationId: string | undefined,
  updater: ConversationUpdater,
): void {
  if (!conversationId) return;

  context.updateConversationRenderState(conversationId, (messages, streaming) => {
    const result = updater(messages, streaming.streamingMessageId, streaming);
    return {
      messages: result.messages,
      streaming: {
        streamingMessageId:
          result.streamingMessageId !== undefined
            ? result.streamingMessageId
            : streaming.streamingMessageId,
        isThinking: result.isThinking !== undefined ? result.isThinking : streaming.isThinking,
        queuedMessageCount:
          result.queuedMessageCount !== undefined
            ? result.queuedMessageCount
            : streaming.queuedMessageCount,
        queuedMessages:
          result.queuedMessages !== undefined
            ? result.queuedMessages
            : (streaming.queuedMessages ?? []),
        messageQueueVersion:
          result.messageQueueVersion !== undefined
            ? result.messageQueueVersion
            : streaming.messageQueueVersion,
      },
    };
  });
}
