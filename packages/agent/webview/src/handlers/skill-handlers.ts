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

const handleAgentComposerInputCatalog: MessageHandler<'agentComposerInputCatalog'> = (
  message,
  context,
) => {
  if (!context.setAgentComposerInputCatalog) {
    throw new Error('Agent Composer input catalog handler has no catalog store.');
  }
  context.setAgentComposerInputCatalog(message);
};

export const skillHandlers: HandlerRegistration[] = [
  defineHandler('agentComposerInputCatalog', handleAgentComposerInputCatalog),
  defineHandler('agentInputCatalog', handleAgentInputCatalog),
];
