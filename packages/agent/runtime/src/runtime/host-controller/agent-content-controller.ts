import type { AgentWebviewToHostMessage } from '@neko/agent-contracts';
import type {
  AgentContentControllerEffectPort,
  AgentHostRouteEffectContext,
} from './agent-host-controller-contract';
import {
  runAgentHostRouteEffect,
  runRequiredConversationRoute,
  type AgentHostControllerRouteOperation,
} from './agent-host-route-operation';

export type AgentContentControllerRouteOperation = AgentHostControllerRouteOperation;

export function tryHandleAgentContentControllerRoute(
  message: AgentWebviewToHostMessage,
  effects: AgentContentControllerEffectPort,
  context: AgentHostRouteEffectContext,
): AgentContentControllerRouteOperation {
  switch (message.type) {
    case 'searchProjectFiles': {
      const input = {
        filter: message.filter,
        ...(message.conversationId !== undefined ? { conversationId: message.conversationId } : {}),
        ...(message.purpose !== undefined ? { purpose: message.purpose } : {}),
      };
      if (message.purpose === 'roleplay' || message.purpose === 'entry') {
        return runAgentHostRouteEffect(() => effects.searchProjectFiles(input, context));
      }
      return runRequiredConversationRoute(
        message,
        'search project files',
        context,
        (conversationId) => effects.searchProjectFiles({ ...input, conversationId }, context),
      );
    }

    case 'openFile':
      return runAgentHostRouteEffect(() =>
        effects.openFile(
          {
            contentLocator: message.contentLocator,
            ...(message.options ? { options: message.options } : {}),
          },
          context,
        ),
      );

    case 'revealDocumentLocator':
      return runAgentHostRouteEffect(() =>
        effects.revealDocumentLocator(
          {
            contentLocator: message.contentLocator,
            locator: message.locator,
          },
          context,
        ),
      );

    case 'revealFile':
      return runAgentHostRouteEffect(() => effects.revealFile(message.contentLocator, context));

    case 'openUrl':
      return runAgentHostRouteEffect(() => effects.openExternalUrl(message.url, context));

    case 'revealContextSource':
      return runAgentHostRouteEffect(() => effects.revealContextSource(message, context));

    case 'downloadSvg':
      return runAgentHostRouteEffect(() =>
        effects.downloadSvg({ svg: message.svg, filename: message.filename }, context),
      );

    default:
      return null;
  }
}
