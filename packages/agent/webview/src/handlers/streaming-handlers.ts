/**
 * Streaming Message Handlers
 *
 * Handles queue and Agent state messages. Active turn content is projection-only.
 *
 * Uses updateConversation for unified current/non-current routing.
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type {
  MessageQueuedMessage,
  MessageQueueErrorMessage,
  MessageQueueSnapshotMessage,
  QueuedMessageEditRequestedMessage,
  AgentPhaseMessage,
  AgentStateSnapshotMessage,
} from './messages';
import type { AgentStateStoreProjection } from '@neko/agent-contracts';
import { updateConversation } from './message-updater';
import type { MessageHandlerContext } from './types';
import {
  hasQueuedUserMessages,
  projectAuthoritativeQueuedMessagesIntoTranscript,
  projectReleasedQueuedMessageIntoTranscript,
  projectQueuedMessagesForPendingCount,
} from '../presenters/message-queue-presenter';
import {
  projectAgentPhaseToStateStore,
  projectAgentStateSnapshot,
} from '../presenters/agent-state-presenter';

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
 * Handle 'agentPhase' message - Agent execution phase change
 */
const handleAgentPhase: MessageHandler<'agentPhase'> = (message: AgentPhaseMessage, context) => {
  if (message.phase === 'idle') {
    updateConversation(
      context,
      message.conversationId,
      (messages, _streamingMessageId, streaming) => ({
        messages,
        streamingMessageId: null,
        isThinking: (streaming.queuedMessageCount ?? 0) > 0,
      }),
    );
  }
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
    context.conversationRenderCoordinator.read(conversationId)?.streaming.queuedMessageCount ?? 0;
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
        : (context.conversationRenderCoordinator.read(snapshot.conversationId)?.streaming
            .isThinking ?? false),
    queuedMessageCount: snapshot.pendingCount,
    queuedMessages: snapshot.items,
    messageQueueVersion: snapshot.version,
  }));
}

function isStaleMessageQueueSnapshot(
  snapshot: MessageQueueSnapshotMessage['snapshot'],
  context: MessageHandlerContext,
): boolean {
  const currentVersion = context.conversationRenderCoordinator.read(snapshot.conversationId)
    ?.streaming.messageQueueVersion;
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
  defineHandler('messageQueued', handleMessageQueued),
  defineHandler('messageQueueSnapshot', handleMessageQueueSnapshot),
  defineHandler('messageQueueError', handleMessageQueueError),
  defineHandler('queuedMessageEditRequested', handleQueuedMessageEditRequested),
  defineHandler('agentPhase', handleAgentPhase),
  defineHandler('agentStateSnapshot', handleAgentStateSnapshot),
];
