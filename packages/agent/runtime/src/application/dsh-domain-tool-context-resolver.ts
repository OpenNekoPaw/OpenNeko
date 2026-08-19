import type { AgentBoundDomainBinding } from '@neko/agent-contracts';

import type { AgentConversationContextAuthorityPort } from './agent-conversation-lifecycle-repository';
import type { ConversationDshSessionBindingStore } from './conversation-dsh-session-binding';

export interface DshDomainToolContext {
  readonly conversationId: string;
  readonly dshSessionId: string;
  readonly binding: AgentBoundDomainBinding;
}

export type DshDomainToolContextErrorCode =
  | 'DSH_DOMAIN_TOOL_SESSION_INVALID'
  | 'DSH_DOMAIN_TOOL_CONVERSATION_MISSING'
  | 'DSH_DOMAIN_TOOL_CONTEXT_MISSING';

export class DshDomainToolContextError extends Error {
  constructor(
    readonly code: DshDomainToolContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DshDomainToolContextError';
  }
}

export interface DshDomainToolContextResolver {
  resolve(dshSessionId: string): Promise<DshDomainToolContext>;
}

export function createDshDomainToolContextResolver(options: {
  readonly bindings: Pick<ConversationDshSessionBindingStore, 'getByDshSessionId'>;
  readonly contexts: Pick<AgentConversationContextAuthorityPort, 'readContext'>;
}): DshDomainToolContextResolver {
  return Object.freeze({
    async resolve(dshSessionId: string) {
      if (dshSessionId.trim().length === 0) {
        throw new DshDomainToolContextError(
          'DSH_DOMAIN_TOOL_SESSION_INVALID',
          'DSH domain Tool Session identity is required.',
        );
      }
      const relation = await options.bindings.getByDshSessionId(dshSessionId);
      if (relation === undefined) {
        throw new DshDomainToolContextError(
          'DSH_DOMAIN_TOOL_CONVERSATION_MISSING',
          `DSH Session '${dshSessionId}' has no Conversation binding.`,
        );
      }
      if (relation.dshSessionId !== dshSessionId) {
        throw new DshDomainToolContextError(
          'DSH_DOMAIN_TOOL_SESSION_INVALID',
          `DSH Session '${dshSessionId}' resolved to another Session binding.`,
        );
      }
      const binding = await options.contexts.readContext(relation.conversationId);
      if (binding === undefined) {
        throw new DshDomainToolContextError(
          'DSH_DOMAIN_TOOL_CONTEXT_MISSING',
          `Conversation '${relation.conversationId}' has no domain context.`,
        );
      }
      return Object.freeze({
        conversationId: relation.conversationId,
        dshSessionId,
        binding,
      });
    },
  });
}
