/**
 * Skill Message Handlers
 *
 * Handles the exact Agent input catalog projection.
 */

import { defineHandler } from './types';
import type { MessageHandler, HandlerRegistration } from './types';
const handleAgentInputCatalog: MessageHandler<'agentInputCatalog'> = (message, context) => {
  if (!context.setAgentInputCatalogByConversation) {
    throw new Error('Agent input catalog handler has no Conversation catalog store.');
  }
  context.setAgentInputCatalogByConversation((previous) => {
    const next = new Map(previous);
    next.set(message.conversationId, message);
    return next;
  });
};

export const skillHandlers: HandlerRegistration[] = [
  defineHandler('agentInputCatalog', handleAgentInputCatalog),
];
