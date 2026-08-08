import type { AgentWebviewToHostMessage } from '@neko/agent-contracts';
import type {
  AgentHostRouteEffectContext,
  AgentSkillControllerEffectPort,
} from './agent-host-controller-contract';
import {
  runRequiredConversationRoute,
  type AgentHostControllerRouteOperation,
} from './agent-host-route-operation';

export type AgentSkillControllerRouteOperation = AgentHostControllerRouteOperation;

export function tryHandleAgentSkillControllerRoute(
  message: AgentWebviewToHostMessage,
  effects: AgentSkillControllerEffectPort,
  context: AgentHostRouteEffectContext,
): AgentSkillControllerRouteOperation {
  switch (message.type) {
    case 'getAgentInputCatalog':
      return runRequiredConversationRoute(
        message,
        'read Agent input catalog',
        context,
        (conversationId) => effects.readInputCatalog(conversationId, context),
      );

    case 'invokeAgentInput':
      return runRequiredConversationRoute(
        message,
        'invoke Agent input',
        context,
        (conversationId) => effects.invokeInput({ conversationId, input: message.input }, context),
      );

    case 'getContextTokenCount':
      return runRequiredConversationRoute(
        message,
        'get context token count',
        context,
        (conversationId) => effects.readContextTokenCount(conversationId, context),
      );

    case 'compressContext':
      return runRequiredConversationRoute(message, 'compress context', context, (conversationId) =>
        effects.compressContext(conversationId, context),
      );

    default:
      return null;
  }
}
