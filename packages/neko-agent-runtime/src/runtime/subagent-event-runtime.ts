import {
  buildSubAgentEventMessage,
  formatChildRunScope,
  projectSubAgentEventToWorkItem,
  validateChildRunScope,
  type SubAgentEventMessage,
  type SubAgentWorkItemEvent,
} from '@neko-agent/types';

export interface ProjectSubAgentEventForConversationInput {
  readonly conversationId: string;
  readonly event: SubAgentWorkItemEvent;
}

export interface SubAgentEventRuntime {
  projectForConversation(
    input: ProjectSubAgentEventForConversationInput,
  ): SubAgentEventMessage | null;
}

export function createSubAgentEventRuntime(): SubAgentEventRuntime {
  return new DefaultSubAgentEventRuntime();
}

class DefaultSubAgentEventRuntime implements SubAgentEventRuntime {
  projectForConversation(
    input: ProjectSubAgentEventForConversationInput,
  ): SubAgentEventMessage | null {
    const scopeResult = validateChildRunScope(input.event.scope);
    if (!scopeResult.ok || scopeResult.scope.childKind !== 'subagent') {
      throw new Error(
        scopeResult.ok
          ? `SubAgent event requires childKind subagent: ${formatChildRunScope(scopeResult.scope)}`
          : scopeResult.diagnostic.message,
      );
    }
    const scope = scopeResult.scope;
    if (
      input.event.conversationId !== scope.conversationId ||
      input.event.parentAgentId !== scope.parentRunId ||
      input.event.subAgentId !== scope.childRunId
    ) {
      throw new Error(`SubAgent event owner mismatch: ${formatChildRunScope(scope)}`);
    }
    if (scope.conversationId !== input.conversationId) return null;

    const event = input.event satisfies SubAgentWorkItemEvent;
    return buildSubAgentEventMessage({
      event,
      workItem: projectSubAgentEventToWorkItem(event),
    });
  }
}
