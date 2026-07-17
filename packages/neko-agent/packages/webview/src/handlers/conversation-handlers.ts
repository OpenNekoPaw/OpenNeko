/**
 * Conversation Message Handlers
 *
 * Handles: conversationList, activeConversation, historyCleared, error
 */

import { defineHandler } from './types';
import type {
  MessageHandler,
  HandlerRegistration,
  MessageHandlerContext,
  StreamingState,
} from './types';
import type {
  ErrorMessage,
  GlobalErrorMessage,
  AgentSessionDiagnosticMessage,
  HistoryClearedMessage,
  ConversationListMessage,
  ActiveConversationMessage,
  ConversationSnapshotMessage,
} from './messages';
import type { Message } from '@neko-agent/types';
import {
  projectActiveConversation,
  projectConversationError,
  projectHistoryClearedConversation,
} from '../presenters/conversation-ui-presenter';
import { upsertWorkItemsForConversation } from '@/presenters/work-item-state-presenter';
import { findActiveTab, isCharacterRoleTab } from '@/presenters/character-role-session-presenter';
import { shouldActivateForegroundConversation } from './foreground-activation';
import { projectQueuedMessagesCleared } from '@/presenters/message-queue-presenter';
import { updateConversation } from './message-updater';
import {
  commitConversationSnapshotProjection,
  ingestConversationRenderSnapshot,
} from '@/render-lifecycle/conversation-render-state-adapter';

/**
 * Handle 'error' message - Error occurred
 */
const handleError: MessageHandler<'error'> = (message: ErrorMessage, context) => {
  if (!message.conversationId) return;
  context.updateConversationRenderState(message.conversationId, (messages) => ({
    ...projectConversationError({
      messages: projectQueuedMessagesCleared(messages),
      errorMessage: message.message,
    }),
  }));
};

/**
 * Handle 'globalError' message - non-conversation-scoped error occurred
 */
const handleGlobalError: MessageHandler<'globalError'> = (message: GlobalErrorMessage, context) => {
  context.setGlobalError(message.message || 'An error occurred');
};

const handleSessionDiagnostic: MessageHandler<'sessionDiagnostic'> = (
  message: AgentSessionDiagnosticMessage,
  context,
) => {
  if (message.conversationId) {
    context.reportConversationDiagnostic(message);
    return;
  }
  context.setGlobalError(`${message.code}: ${message.message}`);
};

/**
 * Handle 'historyCleared' message - Conversation cleared
 */
const handleHistoryCleared: MessageHandler<'historyCleared'> = (
  message: HistoryClearedMessage,
  context,
) => {
  const conversationId = message.conversationId;
  if (!conversationId) return;

  context.markdownSessionRegistry?.disposeConversation(conversationId);
  const projection = projectHistoryClearedConversation();
  updateConversation(context, conversationId, () => ({
    messages: projection.messages,
    streamingMessageId: projection.streaming.streamingMessageId,
    isThinking: projection.streaming.isThinking,
    queuedMessageCount: projection.streaming.queuedMessageCount,
    queuedMessages: projection.streaming.queuedMessages,
  }));
};

/**
 * Handle 'conversationList' message - List of conversations
 */
const handleConversationList: MessageHandler<'conversationList'> = (
  message: ConversationListMessage,
  context,
) => {
  context.setConversations(message.conversations || []);
};

/**
 * Handle 'activeConversation' message - Active conversation changed
 */
const handleActiveConversation: MessageHandler<'activeConversation'> = (
  message: ActiveConversationMessage,
  context,
) => {
  const conversationId = message.conversation?.id;
  const projection = projectActiveConversation({
    conversation: message.conversation,
    openTabs: context.openTabs,
  });
  const pendingForegroundActivation =
    context.pendingForegroundConversationActivationRef?.current ?? null;
  const shouldActivateForeground = shouldActivateForegroundConversation(
    pendingForegroundActivation,
    conversationId,
    message.activation,
  );
  const activeTab = findActiveTab(context.openTabs, context.activeTabId);
  const isActiveCharacterRoleTab = isCharacterRoleTab(activeTab);
  const shouldCacheOnly = pendingForegroundActivation !== null && !shouldActivateForeground;
  const isStaleOrdinaryTabConversation =
    conversationId !== undefined &&
    activeTab !== undefined &&
    !isActiveCharacterRoleTab &&
    activeTab.conversationId !== conversationId &&
    !shouldActivateForeground;

  if (conversationId) cacheProjectedConversation(context, conversationId, projection);

  if (
    shouldCacheOnly ||
    isStaleOrdinaryTabConversation ||
    (context.isTablessConversationViewRef.current &&
      !isActiveCharacterRoleTab &&
      !shouldActivateForeground)
  ) {
    return;
  }

  if (isActiveCharacterRoleTab && !shouldActivateForeground) {
    context.setOpenTabs(projection.openTabs);
    return;
  }

  context.isTablessConversationViewRef.current = false;
  context.setOpenTabs(projection.openTabs);
  context.setActiveTabId(projection.activeTabId);
  context.setActiveTab(projection.activeTab);

  // This is host activation metadata only. Tab UI ownership comes exclusively from
  // the immutable TabRenderRuntime binding and its conversation projection cache.
  context.setActiveConversationId(projection.activeConversationId);
  context.activeConversationIdRef.current = projection.activeConversationId;

  if (conversationId && shouldActivateForeground) {
    if (message.activation && context.tabStateRevisionRef) {
      context.tabStateRevisionRef.current = Math.max(
        context.tabStateRevisionRef.current,
        message.activation.tabStateRevision,
      );
    }
    context.completeForegroundConversationActivation?.(conversationId);
  }
};

const handleConversationSnapshot: MessageHandler<'conversationSnapshot'> = (
  message: ConversationSnapshotMessage,
  context,
) => {
  const projection = projectActiveConversation({
    conversation: message.conversation,
    openTabs: context.openTabs,
  });
  cacheProjectedConversation(context, message.conversation.id, projection);
};

function cacheProjectedConversation(
  context: MessageHandlerContext,
  conversationId: string,
  projection: ReturnType<typeof projectActiveConversation>,
): void {
  cacheConversationProjection(context, conversationId, projection.messages, projection.streaming);
  context.forceUpdate();
  if (projection.workItems.length > 0) {
    context.setWorkItemsByConversation((previous) =>
      upsertWorkItemsForConversation(previous, conversationId, projection.workItems),
    );
  }
}

function cacheConversationProjection(
  context: MessageHandlerContext,
  conversationId: string,
  messages: readonly Message[],
  streaming: StreamingState,
): void {
  const coordinator = context.conversationRenderCoordinator;
  if (!coordinator) {
    throw new Error('Conversation caching requires the canonical render coordinator.');
  }
  const snapshot = ingestConversationRenderSnapshot({
    coordinator,
    conversationId,
    messages,
    streaming,
  });
  commitConversationSnapshotProjection({
    snapshot,
    conversationMessagesRef: context.conversationMessagesRef,
    conversationStreamingRef: context.conversationStreamingRef,
  });
}

export const conversationHandlers: HandlerRegistration[] = [
  defineHandler('error', handleError),
  defineHandler('globalError', handleGlobalError),
  defineHandler('sessionDiagnostic', handleSessionDiagnostic),
  defineHandler('historyCleared', handleHistoryCleared),
  defineHandler('conversationList', handleConversationList),
  defineHandler('activeConversation', handleActiveConversation),
  defineHandler('conversationSnapshot', handleConversationSnapshot),
];
