import type { AgentWebviewToHostMessage } from '@neko-agent/contracts';
import type {
  AgentConfigControllerEffectPort,
  AgentHostRouteEffectContext,
} from './agent-host-controller-contract';
import {
  runAgentHostRouteEffect,
  runRequiredConversationRoute,
  type AgentHostControllerRouteOperation,
} from './agent-host-route-operation';

export type AgentConfigControllerRouteOperation = AgentHostControllerRouteOperation;

export function tryHandleAgentConfigControllerRoute(
  message: AgentWebviewToHostMessage,
  effects: AgentConfigControllerEffectPort,
  context: AgentHostRouteEffectContext,
): AgentConfigControllerRouteOperation {
  switch (message.type) {
    case 'getSettings':
      return runRequiredConversationRoute(message, 'get settings', context, (conversationId) =>
        effects.readSettings(conversationId, context),
      );

    case 'getConfig':
      return runAgentHostRouteEffect(() => effects.readConfig(context));

    case 'refreshConfigSnapshot':
      return runAgentHostRouteEffect(() => effects.refreshConfig(context));

    case 'openUserConfigFile':
      return runAgentHostRouteEffect(() => effects.openUserConfig(context));

    case 'openConfigFile':
      return runAgentHostRouteEffect(() => effects.openHostConfig(context));

    case 'getTabState':
      return runAgentHostRouteEffect(() => effects.readTabState(context));

    case 'updateSettings':
      return runRequiredConversationRoute(message, 'update settings', context, (conversationId) =>
        effects.updateSettings(
          {
            conversationId,
            settings: message.settings,
          },
          context,
        ),
      );

    case 'updateTabState':
      return runAgentHostRouteEffect(() => effects.updateTabState(message, context));

    default:
      return null;
  }
}
