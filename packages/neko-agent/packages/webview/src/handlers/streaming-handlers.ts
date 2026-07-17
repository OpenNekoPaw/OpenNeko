/**
 * Streaming Message Handlers
 *
 * Handles: thinking, response, streamText, streamComplete, streamThinking,
 *          thinkingComplete, messageCancelled, messageQueued, agentPhase, agentStateSnapshot
 *
 * Uses updateConversation for unified current/non-current routing.
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type {
  AssistantTextReplacementMessage,
  ThinkingMessage,
  StreamTextMessage,
  StreamCompleteMessage,
  StreamThinkingMessage,
  MessageCancelledMessage,
  MessageQueuedMessage,
  MessageQueueErrorMessage,
  MessageQueueSnapshotMessage,
  QueuedMessageEditRequestedMessage,
  AgentPhaseMessage,
  AgentStateSnapshotMessage,
} from './messages';
import type { AgentStateStoreProjection } from '@neko-agent/types';
import { updateConversation } from './message-updater';
import type { MessageHandlerContext } from './types';
import {
  projectAssistantTextReplacementIntoMessages,
  projectMessageCancelledIntoMessages,
  projectStreamingCompleteIntoMessages,
  projectStreamingTextIntoMessages,
  projectStreamingThinkingIntoMessages,
} from '../presenters/message-presenter';
import {
  hasQueuedUserMessages,
  projectAuthoritativeQueuedMessagesIntoTranscript,
  projectReleasedQueuedMessageIntoTranscript,
  projectQueuedMessagesCleared,
  projectQueuedMessagesForPendingCount,
} from '../presenters/message-queue-presenter';
import {
  projectAgentPhaseToStateStore,
  projectAgentStateSnapshot,
} from '../presenters/agent-state-presenter';

/**
 * Handle 'thinking' message - AI is processing (indicator only, no content)
 */
const handleThinking: MessageHandler<'thinking'> = (message: ThinkingMessage, context) => {
  updateConversation(context, message.conversationId, (msgs) => ({
    messages: msgs,
    isThinking: true,
  }));
};

/**
 * Handle 'streamText' message - Streaming text chunk
 */
const handleStreamText: MessageHandler<'streamText'> = (message: StreamTextMessage, context) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const projection = projectStreamingTextIntoMessages({
      messages: msgs,
      streamingMessageId: streamingId,
      messageId: message.messageId,
      content: message.content,
    });

    return {
      messages: projection.messages,
      streamingMessageId: projection.streamingMessageId,
      isThinking: projection.isThinking,
    };
  });
};

const handleAssistantTextReplacement: MessageHandler<'assistantTextReplacement'> = (
  message: AssistantTextReplacementMessage,
  context,
) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const projection = projectAssistantTextReplacementIntoMessages({
      messages: msgs,
      streamingMessageId: streamingId,
      messageId: message.messageId,
    });

    return {
      messages: projection.messages,
      streamingMessageId: projection.targetMessageId ?? streamingId,
      isThinking: projection.isThinking,
    };
  });
};

/**
 * Handle 'streamComplete' message - Streaming finished
 */
const handleStreamComplete: MessageHandler<'streamComplete'> = (
  message: StreamCompleteMessage,
  context,
) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const previousQueuedMessageCount = getPreviousQueuedMessageCount(
      context,
      message.conversationId,
    );
    const projection = projectStreamingCompleteIntoMessages({
      messages: msgs,
      streamingMessageId: streamingId,
      messageId: message.messageId,
      contentBlocks: message.contentBlocks,
    });
    const hasOptimisticQueuedMessages = hasQueuedUserMessages(projection.messages);
    const nextQueuedMessageCount = hasOptimisticQueuedMessages
      ? Math.max(previousQueuedMessageCount, 1)
      : 0;

    return {
      messages: hasOptimisticQueuedMessages
        ? projection.messages
        : projectQueuedMessagesCleared(projection.messages),
      streamingMessageId: projection.streamingMessageId,
      isThinking: hasOptimisticQueuedMessages ? true : projection.isThinking,
      queuedMessageCount: nextQueuedMessageCount,
    };
  });
};

/**
 * Handle 'streamThinking' message - Stream AI thinking content
 */
const handleStreamThinking: MessageHandler<'streamThinking'> = (
  message: StreamThinkingMessage,
  context,
) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const projection = projectStreamingThinkingIntoMessages({
      messages: msgs,
      streamingMessageId: streamingId,
      messageId: message.messageId,
      content: message.content,
    });

    return {
      messages: projection.messages,
      streamingMessageId: projection.streamingMessageId,
      isThinking: projection.isThinking,
    };
  });
};

/**
 * Handle 'messageQueued' message - Message was queued while agent is running
 */
const handleMessageQueued: MessageHandler<'messageQueued'> = (
  message: MessageQueuedMessage,
  context,
) => {
  if (message.snapshot) {
    applyMessageQueueSnapshot(message.snapshot, context, {
      releasedItem: message.releasedItem,
    });
    return;
  }

  updateConversation(context, message.conversationId, (msgs) => {
    const previousQueuedMessageCount = Math.max(
      getPreviousQueuedMessageCount(context, message.conversationId),
      hasQueuedUserMessages(msgs) ? 1 : 0,
    );
    const nextQueuedMessageCount = Math.max(0, message.pendingCount ?? 0);
    const isQueueAcknowledgement = message.content !== undefined;

    return {
      messages: isQueueAcknowledgement
        ? msgs
        : projectQueuedMessagesForPendingCount({
            messages: msgs,
            previousQueuedMessageCount,
            nextQueuedMessageCount,
          }),
      queuedMessageCount: nextQueuedMessageCount,
    };
  });
};

const handleMessageQueueSnapshot: MessageHandler<'messageQueueSnapshot'> = (
  message: MessageQueueSnapshotMessage,
  context,
) => {
  applyMessageQueueSnapshot(message.snapshot, context);
};

const handleMessageQueueError: MessageHandler<'messageQueueError'> = (
  message: MessageQueueErrorMessage,
  context,
) => {
  if (message.snapshot) {
    applyMessageQueueSnapshot(message.snapshot, context);
  }
  context.setGlobalError(message.message);
};

const handleQueuedMessageEditRequested: MessageHandler<'queuedMessageEditRequested'> = (
  message: QueuedMessageEditRequestedMessage,
  context,
) => {
  applyMessageQueueSnapshot(message.snapshot, context);
  context.setGlobalError(null);
  context.requestQueuedMessageEdit?.({
    tabId: message.tabId,
    conversationId: message.conversationId,
    item: message.item,
  });
};

/**
 * Handle 'messageCancelled' message - User cancelled message generation
 */
const handleMessageCancelled: MessageHandler<'messageCancelled'> = (
  message: MessageCancelledMessage,
  context,
) => {
  updateConversation(context, message.conversationId, (msgs, streamingId) => {
    const projection = projectMessageCancelledIntoMessages({
      messages: msgs,
      streamingMessageId: streamingId,
    });

    return {
      messages: projectQueuedMessagesCleared(projection.messages),
      streamingMessageId: projection.streamingMessageId,
      isThinking: projection.isThinking,
      queuedMessageCount: 0,
    };
  });
};

/**
 * Handle 'agentPhase' message - Agent execution phase change
 */
const handleAgentPhase: MessageHandler<'agentPhase'> = (message: AgentPhaseMessage, context) => {
  applyAgentStateProjection(
    context,
    projectAgentPhaseToStateStore({
      states: context.conversationAgentStateRef.current,
      activeConversationId: context.activeConversationIdRef.current,
      conversationId: message.conversationId,
      phase: message.phase,
      toolName: message.toolName,
      timestamp: message.timestamp,
    }),
  );
};

function getPreviousQueuedMessageCount(
  context: MessageHandlerContext,
  conversationId: string | undefined,
): number {
  if (!conversationId) {
    return 0;
  }

  const cachedCount =
    context.conversationStreamingRef.current.get(conversationId)?.queuedMessageCount ?? 0;
  if (!context.isCurrentConversation(conversationId)) {
    return cachedCount;
  }

  return Math.max(cachedCount, context.queuedMessageCount ?? 0);
}

function applyMessageQueueSnapshot(
  snapshot: MessageQueueSnapshotMessage['snapshot'],
  context: MessageHandlerContext,
  options: {
    readonly releasedItem?: MessageQueuedMessage['releasedItem'];
  } = {},
): void {
  if (isStaleMessageQueueSnapshot(snapshot, context)) {
    return;
  }

  updateConversation(context, snapshot.conversationId, (msgs, streamingId) => ({
    messages: options.releasedItem
      ? projectReleasedQueuedMessageIntoTranscript({
          messages: msgs,
          item: options.releasedItem,
        })
      : projectAuthoritativeQueuedMessagesIntoTranscript({
          messages: msgs,
          items: snapshot.items,
        }),
    streamingMessageId: streamingId,
    isThinking:
      snapshot.items.length > 0 || options.releasedItem
        ? true
        : (context.conversationStreamingRef.current.get(snapshot.conversationId)?.isThinking ??
          context.isThinking),
    queuedMessageCount: snapshot.pendingCount,
    queuedMessages: snapshot.items,
    messageQueueVersion: snapshot.version,
  }));
}

function isStaleMessageQueueSnapshot(
  snapshot: MessageQueueSnapshotMessage['snapshot'],
  context: MessageHandlerContext,
): boolean {
  const currentVersion = context.isCurrentConversation(snapshot.conversationId)
    ? (context.conversationStreamingRef.current.get(snapshot.conversationId)?.messageQueueVersion ??
      undefined)
    : context.conversationStreamingRef.current.get(snapshot.conversationId)?.messageQueueVersion;
  return currentVersion !== undefined && snapshot.version < currentVersion;
}

/**
 * Handle 'agentStateSnapshot' message - restore agent states after webview reload
 */
const handleAgentStateSnapshot: MessageHandler<'agentStateSnapshot'> = (
  message: AgentStateSnapshotMessage,
  context,
) => {
  const agentStates = Array.isArray(message.agentStates) ? message.agentStates : [];
  applyAgentStateProjection(
    context,
    projectAgentStateSnapshot({
      agentStates,
      activeConversationId: context.activeConversationIdRef.current,
    }),
  );
};

function applyAgentStateProjection(
  context: MessageHandlerContext,
  projection: AgentStateStoreProjection,
): void {
  context.conversationAgentStateRef.current = projection.states;
  context.setAgentState(projection.activeAgentState);
  context.forceAgentStateUpdate();
}

/**
 * All streaming handler registrations
 */
export const streamingHandlers: HandlerRegistration[] = [
  defineHandler('thinking', handleThinking),
  defineHandler('streamText', handleStreamText),
  defineHandler('assistantTextReplacement', handleAssistantTextReplacement),
  defineHandler('streamComplete', handleStreamComplete),
  defineHandler('streamThinking', handleStreamThinking),
  defineHandler('messageCancelled', handleMessageCancelled),
  defineHandler('messageQueued', handleMessageQueued),
  defineHandler('messageQueueSnapshot', handleMessageQueueSnapshot),
  defineHandler('messageQueueError', handleMessageQueueError),
  defineHandler('queuedMessageEditRequested', handleQueuedMessageEditRequested),
  defineHandler('agentPhase', handleAgentPhase),
  defineHandler('agentStateSnapshot', handleAgentStateSnapshot),
];
