import type { AgentWebviewToHostMessage } from '@neko/agent-contracts';
import type {
  AgentHostRouteEffectContext,
  AgentSkillControllerEffectPort,
} from './agent-host-controller-contract';
import {
  runAgentHostRouteEffect,
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
    case 'getSkills':
      return runAgentHostRouteEffect(() => effects.listSkills(context));

    case 'invokeSlashCommand':
      return runRequiredConversationRoute(
        message,
        'invoke slash command',
        context,
        (conversationId) =>
          effects.invokeSlashCommand(
            {
              conversationId,
              command: message.command,
              ...(message.args !== undefined ? { args: message.args } : {}),
            },
            context,
          ),
      );

    case 'invokeSkill':
      return runRequiredConversationRoute(message, 'invoke skill', context, (conversationId) =>
        effects.invokeSkill(
          {
            conversationId,
            skillName: message.skillName,
            ...(message.args !== undefined ? { args: message.args } : {}),
          },
          context,
        ),
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
