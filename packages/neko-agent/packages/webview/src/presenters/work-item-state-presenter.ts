import type {
  AgentWorkItem,
  AgentWorkItemStatus,
  AgentWorkItemStep,
  AgentWorkItemStepStatus,
  AgentWorkItemStore,
} from '@neko-agent/types';
import { getAgentWorkItemRuntimeKey } from '@neko-agent/types';

export function getWorkItemsForConversation(
  store: AgentWorkItemStore,
  conversationId: string | null,
): AgentWorkItem[] {
  if (!conversationId) return [];
  return Array.from(store.get(conversationId)?.values() ?? []);
}

export function upsertWorkItemsForConversation(
  previous: AgentWorkItemStore,
  conversationId: string,
  items: AgentWorkItem[],
): AgentWorkItemStore {
  const next = new Map(previous);
  const conversationItems = new Map(next.get(conversationId) ?? []);

  for (const item of items) {
    const key = getAgentWorkItemRuntimeKey(item);
    const existing = conversationItems.get(key);
    conversationItems.set(key, existing ? mergeWorkItem(existing, item) : item);
  }

  next.set(conversationId, conversationItems);
  return next;
}

export function removeConversationWorkItems(
  previous: AgentWorkItemStore,
  conversationId: string,
): AgentWorkItemStore {
  if (!previous.has(conversationId)) return previous;
  const next = new Map(previous);
  next.delete(conversationId);
  return next;
}

function mergeWorkItem(existing: AgentWorkItem, incoming: AgentWorkItem): AgentWorkItem {
  return {
    ...existing,
    ...incoming,
    parentMessageId: incoming.parentMessageId ?? existing.parentMessageId,
    parentToolCallId: incoming.parentToolCallId ?? existing.parentToolCallId,
    createdAt: existing.createdAt || incoming.createdAt,
    children: mergeOptionalStringLists(existing.children, incoming.children),
    steps: mergeWorkItemSteps(existing.steps, incoming.steps, incoming.status),
    currentStepId: incoming.currentStepId ?? existing.currentStepId,
    subAgent: { ...existing.subAgent, ...incoming.subAgent },
  };
}

function mergeWorkItemSteps(
  existing: AgentWorkItemStep[] | undefined,
  incoming: AgentWorkItemStep[] | undefined,
  incomingStatus?: AgentWorkItemStatus,
): AgentWorkItemStep[] | undefined {
  if (!existing || existing.length === 0) return incoming;
  if (!incoming || incoming.length === 0) {
    return finalizeRunningSteps(existing, incomingStatus);
  }

  const merged = new Map(existing.map((step) => [step.id, step]));
  for (const step of incoming) {
    merged.set(step.id, { ...merged.get(step.id), ...step });
  }
  return finalizeRunningSteps(Array.from(merged.values()), incomingStatus);
}

function finalizeRunningSteps(
  steps: AgentWorkItemStep[],
  status: AgentWorkItemStatus | undefined,
): AgentWorkItemStep[] {
  if (status !== 'completed' && status !== 'failed' && status !== 'cancelled') return steps;

  const terminalStepStatus: AgentWorkItemStepStatus =
    status === 'completed' ? 'completed' : 'failed';
  return steps.map((step) =>
    step.status === 'running' ? { ...step, status: terminalStepStatus } : step,
  );
}

function mergeOptionalStringLists(
  existing: string[] | undefined,
  incoming: string[] | undefined,
): string[] | undefined {
  if (!existing || existing.length === 0) return incoming;
  if (!incoming || incoming.length === 0) return existing;
  return Array.from(new Set([...existing, ...incoming]));
}
