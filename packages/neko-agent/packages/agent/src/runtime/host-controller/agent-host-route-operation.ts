import { resolveRequiredConversationRoute } from '../conversation-route-runtime';
import type { AgentHostRouteEffectContext } from './agent-host-controller-contract';

export type AgentHostControllerRouteOperation = Promise<void> | null;

export function runRequiredConversationRoute(
  message: { readonly conversationId?: unknown },
  action: string,
  context: AgentHostRouteEffectContext,
  effect: (conversationId: string) => void | Promise<void>,
): Promise<void> {
  const result = resolveRequiredConversationRoute({ message, action });
  if (result.status === 'missing') {
    return runAgentHostRouteEffect(() => context.post(result.message));
  }
  return runAgentHostRouteEffect(() => effect(result.conversationId));
}

export function runAgentHostRouteEffect(effect: () => void | Promise<void>): Promise<void> {
  try {
    return Promise.resolve(effect());
  } catch (error) {
    return Promise.reject(error);
  }
}
