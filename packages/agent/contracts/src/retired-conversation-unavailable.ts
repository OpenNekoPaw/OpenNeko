import {
  parseAgentHomeConversationSummary,
  type AgentConversationOwnerRef,
  type AgentHomeConversationSummary,
} from './agent-home';

export interface RetiredConversationMetadata {
  readonly conversationId: string;
  readonly owner: AgentConversationOwnerRef;
  readonly title: string;
  readonly updatedAt: string;
}

export const RETIRED_CONVERSATION_RUNTIME_UNAVAILABLE = 'conversation-runtime-unavailable';

export function projectRetiredConversationUnavailable(
  metadata: RetiredConversationMetadata,
): AgentHomeConversationSummary {
  return parseAgentHomeConversationSummary({
    navigation: Object.freeze({
      conversationId: metadata.conversationId,
      owner: metadata.owner,
    }),
    title: metadata.title,
    updatedAt: metadata.updatedAt,
    attention: 'none',
    lastActivity: Object.freeze({
      kind: 'conversation-updated',
      occurredAt: metadata.updatedAt,
    }),
    unavailable: Object.freeze({
      fieldNames: Object.freeze(['runtime']),
      message: `${RETIRED_CONVERSATION_RUNTIME_UNAVAILABLE}: retired transcript authority is unavailable.`,
    }),
  });
}
