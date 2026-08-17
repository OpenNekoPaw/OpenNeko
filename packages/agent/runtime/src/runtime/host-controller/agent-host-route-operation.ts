import { resolveRequiredConversationRoute } from '../conversation-route-runtime';
import type {
  AgentConversationCreationAcceptance,
  AgentConversationTurnAcceptance,
  AgentHostRouteEffectContext,
} from './agent-host-controller-contract';

export type AgentHostControllerRouteResult =
  void | AgentConversationCreationAcceptance | AgentConversationTurnAcceptance;
export type AgentHostControllerRouteOperation = Promise<AgentHostControllerRouteResult> | null;

export function runRequiredConversationRoute(
  message: { readonly conversationId?: unknown },
  action: string,
  context: AgentHostRouteEffectContext,
  effect: (
    conversationId: string,
  ) => AgentHostControllerRouteResult | Promise<AgentHostControllerRouteResult>,
): Promise<AgentHostControllerRouteResult> {
  const result = resolveRequiredConversationRoute({ message, action });
  if (result.status === 'missing') {
    return runAgentHostRouteEffect(() => context.post(result.message));
  }
  return runAgentHostRouteEffect(() => effect(result.conversationId));
}

export function runAgentHostRouteEffect(
  effect: () => AgentHostControllerRouteResult | Promise<AgentHostControllerRouteResult>,
): Promise<AgentHostControllerRouteResult> {
  try {
    return Promise.resolve(effect());
  } catch (error) {
    return Promise.reject(error);
  }
}
