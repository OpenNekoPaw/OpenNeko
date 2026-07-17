import type {
  AgentBackgroundTask,
  AgentWorkItem,
  AgentWorkItemStore,
  AgentWorkItemTaskStatus,
  AgentWorkItemTaskStep,
  AgentWorkItemTaskStepStatus,
  TaskWorkItem,
} from '@neko-agent/types';
import { getAgentWorkItemRuntimeKey } from '@neko-agent/types';
import { formatTaskRunScope, type TaskRunScope } from '@neko/shared';

export function workItemToBackgroundTask(item: AgentWorkItem): AgentBackgroundTask | null {
  if (item.kind === 'subagent') return null;
  return item.task;
}

export function getTaskWorkItemById(
  workItems: readonly AgentWorkItem[] | undefined,
  id: string,
): TaskWorkItem | undefined {
  return workItems?.find((item): item is TaskWorkItem => {
    return isTaskWorkItem(item) && item.id === id;
  });
}

export function getBackgroundTasksForConversation(
  store: AgentWorkItemStore,
  conversationId: string | null,
): AgentBackgroundTask[] {
  if (!conversationId) return [];
  const items = store.get(conversationId);
  if (!items) return [];

  return Array.from(items.values())
    .map(workItemToBackgroundTask)
    .filter((task): task is AgentBackgroundTask => task !== null);
}

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

export function replaceWorkItemsForConversation(
  previous: AgentWorkItemStore,
  conversationId: string,
  items: AgentWorkItem[],
): AgentWorkItemStore {
  const next = new Map(previous);
  next.set(conversationId, new Map(items.map((item) => [getAgentWorkItemRuntimeKey(item), item])));
  return next;
}

export function mergeBackgroundTaskSnapshotForConversation(
  previous: AgentWorkItemStore,
  conversationId: string,
  items: TaskWorkItem[],
): AgentWorkItemStore {
  const next = new Map(previous);
  const conversationItems = new Map(next.get(conversationId) ?? []);
  const incomingKeys = new Set(items.map(getAgentWorkItemRuntimeKey));

  for (const [itemId, item] of conversationItems) {
    if (!incomingKeys.has(itemId) && isUnlinkedToolBackgroundTask(item)) {
      conversationItems.delete(itemId);
    }
  }

  for (const item of items) {
    const key = getAgentWorkItemRuntimeKey(item);
    const existing = conversationItems.get(key);
    conversationItems.set(key, existing ? mergeWorkItem(existing, item) : item);
  }

  next.set(conversationId, conversationItems);
  return next;
}

export function removeWorkItemForConversation(
  previous: AgentWorkItemStore,
  conversationId: string,
  taskScope: TaskRunScope,
): AgentWorkItemStore {
  const itemKey = formatTaskRunScope(taskScope);
  const current = previous.get(conversationId);
  if (!current?.has(itemKey)) return previous;

  const next = new Map(previous);
  const conversationItems = new Map(current);
  conversationItems.delete(itemKey);
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

function isTaskWorkItem(item: AgentWorkItem): item is TaskWorkItem {
  return item.kind === 'media-task' || item.kind === 'tool-background-task';
}

function mergeWorkItem(existing: AgentWorkItem, incoming: AgentWorkItem): AgentWorkItem {
  if (existing.kind !== incoming.kind) return incoming;

  if (existing.kind === 'subagent' && incoming.kind === 'subagent') {
    const steps = mergeWorkItemSteps(existing.steps, incoming.steps, incoming.status);
    return {
      ...existing,
      ...incoming,
      parentMessageId: incoming.parentMessageId ?? existing.parentMessageId,
      parentToolCallId: incoming.parentToolCallId ?? existing.parentToolCallId,
      createdAt: existing.createdAt || incoming.createdAt,
      children: mergeOptionalStringLists(existing.children, incoming.children),
      steps,
      currentStepId: incoming.currentStepId ?? existing.currentStepId,
      subAgent: { ...existing.subAgent, ...incoming.subAgent },
    };
  }

  if (existing.kind !== 'subagent' && incoming.kind !== 'subagent') {
    return {
      ...existing,
      ...incoming,
      parentMessageId: incoming.parentMessageId ?? existing.parentMessageId,
      parentToolCallId: incoming.parentToolCallId ?? existing.parentToolCallId,
      createdAt: existing.createdAt || incoming.createdAt,
      children: mergeOptionalStringLists(existing.children, incoming.children),
      task: {
        ...existing.task,
        ...incoming.task,
        result: incoming.task.result ?? existing.task.result,
        steps: mergeWorkItemSteps(existing.task.steps, incoming.task.steps),
      },
      result: incoming.result ?? existing.result,
      steps: mergeWorkItemSteps(existing.steps, incoming.steps),
      currentStepId: incoming.currentStepId ?? existing.currentStepId,
    };
  }

  return incoming;
}

function isUnlinkedToolBackgroundTask(item: AgentWorkItem): boolean {
  return (
    item.kind === 'tool-background-task' &&
    item.parentMessageId === null &&
    item.parentToolCallId === null
  );
}

function mergeWorkItemSteps(
  existing: AgentWorkItemTaskStep[] | undefined,
  incoming: AgentWorkItemTaskStep[] | undefined,
  incomingStatus?: AgentWorkItemTaskStatus,
): AgentWorkItemTaskStep[] | undefined {
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
  steps: AgentWorkItemTaskStep[],
  status: AgentWorkItemTaskStatus | undefined,
): AgentWorkItemTaskStep[] {
  if (status !== 'completed' && status !== 'failed' && status !== 'cancelled') {
    return steps;
  }

  const terminalStepStatus: AgentWorkItemTaskStepStatus =
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
  return dedupeStrings([...existing, ...incoming]);
}

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
