import type { AgentWebviewToHostMessage } from '@neko/agent-contracts';
import { tryHandleAgentConfigControllerRoute } from './agent-config-controller';
import { tryHandleAgentContentControllerRoute } from './agent-content-controller';
import { tryHandleAgentConversationControllerRoute } from './agent-conversation-controller';
import type {
  AgentHostControllerEffectPorts,
  AgentHostRouteEffectContext,
} from './agent-host-controller-contract';
import type { AgentHostControllerRouteOperation } from './agent-host-route-operation';
import { tryHandleAgentProjectionControllerRoute } from './agent-projection-controller';
import { tryHandleAgentSkillControllerRoute } from './agent-skill-controller';

export interface AgentHostMessageController {
  readonly identity: AgentHostRouteEffectContext['identity'];
  tryHandle(message: AgentWebviewToHostMessage): AgentHostControllerRouteOperation;
}

export function createAgentHostMessageController(
  effects: AgentHostControllerEffectPorts,
  context: AgentHostRouteEffectContext,
): AgentHostMessageController {
  return {
    identity: context.identity,
    tryHandle: (message) =>
      tryHandleAgentConversationControllerRoute(message, effects.conversation, context) ??
      tryHandleAgentConfigControllerRoute(message, effects.config, context) ??
      tryHandleAgentSkillControllerRoute(message, effects.skill, context) ??
      tryHandleAgentContentControllerRoute(message, effects.content, context) ??
      tryHandleAgentProjectionControllerRoute(message, effects.projection, context),
  };
}
