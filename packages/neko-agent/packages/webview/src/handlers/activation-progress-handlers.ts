import { mergeActivationProgressEvents } from '@/presenters/activation-progress-presenter';
import { defineHandler } from './types';
import type { HandlerRegistration, MessageHandler } from './types';
import type { AgentCapabilityActivationProgressMessage } from './messages';

const handleAgentCapabilityActivationProgress: MessageHandler<
  'agentCapabilityActivationProgress'
> = (message: AgentCapabilityActivationProgressMessage, context) => {
  context.setActivationProgressByConversation((current) => {
    const previous = current.get(message.conversationId) ?? [];
    const nextTimelines = mergeActivationProgressEvents({
      current: previous,
      conversationId: message.conversationId,
      events: message.events,
    });
    const next = new Map(current);
    next.set(message.conversationId, nextTimelines);
    return next;
  });
};

export const activationProgressHandlers: HandlerRegistration[] = [
  defineHandler('agentCapabilityActivationProgress', handleAgentCapabilityActivationProgress),
];
