/**
 * SubAgent message handlers.
 */

import {
  appendSubAgentMessageToMessages,
  attachWorkItemToMessageByToolCall,
} from '@/presenters/work-item-message-presenter';
import { upsertWorkItemsForConversation } from '@/presenters/work-item-state-presenter';
import { defineHandler } from './types';
import type { HandlerRegistration, MessageHandler, MessageHandlerContext } from './types';
import type { SubAgentEventMessage } from './messages';
import { updateConversation } from './message-updater';

const handleSubAgentEvent: MessageHandler<'subagentEvent'> = (
  message: SubAgentEventMessage,
  context,
) => {
  const event = message.event;
  const conversationId = message.conversationId;
  const workItem = message.workItem;
  if (!conversationId || event.conversationId !== conversationId) return;
  if (workItem.conversationId !== conversationId || workItem.id !== event.subAgentId) return;

  context.setWorkItemsByConversation((prev) =>
    upsertWorkItemsForConversation(prev, conversationId, [workItem]),
  );

  const attachedToParent = attachSubAgentToParentToolCall(message, context);
  if (attachedToParent) return;

  if (event.type !== 'spawned' && event.type !== 'started') return;

  context.updateConversationRenderState(conversationId, (messages, streaming) => ({
    messages: appendSubAgentMessageToMessages(messages, event.subAgentId),
    streaming,
  }));
};

export const subAgentHandlers: HandlerRegistration[] = [
  defineHandler('subagentEvent', handleSubAgentEvent),
];

function attachSubAgentToParentToolCall(
  message: SubAgentEventMessage,
  context: MessageHandlerContext,
): boolean {
  const parentToolCallId = message.event.data?.parentToolCallId;
  if (!parentToolCallId) return false;

  let attached = false;
  updateConversation(context, message.event.conversationId, (messages) => {
    const result = attachWorkItemToMessageByToolCall(messages, {
      toolCallId: parentToolCallId,
      workItemId: message.event.subAgentId,
    });
    attached = result.attached;
    return { messages: result.messages };
  });
  return attached;
}
