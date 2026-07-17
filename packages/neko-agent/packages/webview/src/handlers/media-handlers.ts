/**
 * Media Task Message Handlers
 *
 * Handles: mediaTaskCreated, mediaTaskProgress
 *
 * On creation: merges the projected work item and
 * appends the assistant TaskCard host message. Direct media turns keep the
 * thinking indicator active until terminal progress or streamComplete arrives.
 * On progress: updates task in the per-conversation work item store and clears
 * direct-turn running state on terminal task status.
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
import type { MediaTaskCreatedMessage, MediaTaskProgressMessage } from './messages';
import { appendMediaTaskMessageToMessages } from '@/presenters/work-item-message-presenter';
import { upsertWorkItemsForConversation } from '@/presenters/work-item-state-presenter';
import { updateConversation } from './message-updater';

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Handle 'mediaTaskCreated' — task just submitted to the provider.
 * Stops the thinking indicator, adds a work item, and appends an assistant
 * message so the TaskCard renders inline.
 */
const handleMediaTaskCreated: MessageHandler<'mediaTaskCreated'> = (
  message: MediaTaskCreatedMessage,
  context,
) => {
  const conversationId = message.conversationId;
  const workItem = message.workItem;

  if (!conversationId || workItem.conversationId !== conversationId) return;

  context.setWorkItemsByConversation((prev) =>
    upsertWorkItemsForConversation(prev, conversationId, [workItem]),
  );

  if (message.parentScope === 'turn') {
    updateConversation(context, conversationId, (messages) => ({
      messages: appendMediaTaskMessageToMessages(messages, workItem.id),
      isThinking: true,
    }));
    return;
  }

  context.updateConversationRenderState(conversationId, (messages, streaming) => ({
    messages: appendMediaTaskMessageToMessages(messages, workItem.id),
    streaming: {
      ...streaming,
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
    },
  }));
};

/**
 * Handle 'mediaTaskProgress' — task status/progress updated.
 * Only updates work items; TaskCard re-renders automatically.
 */
const handleMediaTaskProgress: MessageHandler<'mediaTaskProgress'> = (
  message: MediaTaskProgressMessage,
  context,
) => {
  const conversationId = message.conversationId;
  const workItem = message.workItem;
  if (!conversationId || workItem.conversationId !== conversationId) return;

  context.setWorkItemsByConversation((prev) =>
    upsertWorkItemsForConversation(prev, conversationId, [workItem]),
  );

  if (message.parentScope === 'turn' && isTerminalMediaTaskStatus(workItem.status)) {
    updateConversation(context, conversationId, (messages) => ({
      messages,
      isThinking: false,
      streamingMessageId: null,
      queuedMessageCount: 0,
    }));
  }
};

// ---------------------------------------------------------------------------
// Registrations
// ---------------------------------------------------------------------------

export const mediaHandlers: HandlerRegistration[] = [
  defineHandler('mediaTaskCreated', handleMediaTaskCreated),
  defineHandler('mediaTaskProgress', handleMediaTaskProgress),
];

function isTerminalMediaTaskStatus(
  status: MediaTaskProgressMessage['workItem']['status'],
): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled';
}
