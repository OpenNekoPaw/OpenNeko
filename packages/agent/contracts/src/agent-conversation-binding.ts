import {
  parseAgentBoundDomainBinding,
  type AgentBoundDomainBinding,
} from './agent-interaction-binding';
import { parseAgentEntryTargetBinding, type AgentAuthoringBinding } from './agent-entry-intent';

/**
 * Durable product context owned by an Agent Conversation.
 *
 * Authoring is deliberately separate from the renderer's interaction binding:
 * it records the exact workspace grant and project target used by domain Tools.
 */
export type AgentConversationContext = AgentBoundDomainBinding | AgentAuthoringBinding;

export function parseAgentConversationContext(value: unknown): AgentConversationContext {
  if (isRecord(value) && value['kind'] === 'authoring') {
    const binding = parseAgentEntryTargetBinding(value);
    if (binding.kind !== 'authoring') {
      throw new Error('Agent Conversation authoring context has an invalid binding kind.');
    }
    return binding;
  }
  return parseAgentBoundDomainBinding(value);
}

export function projectAgentConversationSurfaceBinding(
  context: AgentConversationContext,
): AgentBoundDomainBinding {
  if (context.kind !== 'authoring') return context;
  return {
    kind: 'workspace',
    workspaceId: context.workspaceId,
    workspaceGrantId: context.workspaceGrantId,
  };
}

export function isExactAgentAuthoringTarget(
  context: AgentConversationContext,
): context is Extract<
  AgentAuthoringBinding,
  { readonly target: Exclude<AgentAuthoringBinding['target'], null> }
> {
  return context.kind === 'authoring' && context.target !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
