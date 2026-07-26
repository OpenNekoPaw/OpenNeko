import { formatChildRunScope } from '@neko/shared';
import type {
  AgentWorkItem,
  AgentWorkItemStatus,
  AgentWorkItemStep,
  SubAgentWorkItem,
  SubAgentWorkItemEvent,
} from './work-item';

export function getAgentWorkItemRuntimeKey(item: AgentWorkItem): string {
  return formatChildRunScope(item.scope);
}

export function isSubAgentWorkItem(item: AgentWorkItem): item is SubAgentWorkItem {
  return item.kind === 'subagent';
}

export function projectSubAgentEventToWorkItem(event: SubAgentWorkItemEvent): SubAgentWorkItem {
  const status = toSubAgentWorkItemStatus(event.data?.status ?? event.type);
  const result = event.data?.result;
  const description = event.data?.description;
  const subagentType = event.data?.subagentType;
  const step = projectSubAgentEventStep(event, status);

  return {
    scope: event.scope,
    id: event.subAgentId,
    conversationId: event.conversationId,
    kind: 'subagent',
    parentMessageId: event.data?.parentMessageId ?? null,
    parentToolCallId: event.data?.parentToolCallId ?? null,
    title: description || subagentType || `SubAgent ${event.subAgentId}`,
    summary: description,
    status,
    progress: toSubAgentProgress(event.type, event.data?.progress),
    ...(step ? { steps: [step], currentStepId: step.id } : {}),
    error: event.data?.error ?? result?.error,
    createdAt: new Date(event.timestamp).toISOString(),
    updatedAt: new Date(event.timestamp).toISOString(),
    subAgent: {
      parentAgentId: event.parentAgentId,
      type: subagentType,
      runMode: event.data?.runMode,
      modelTier: event.data?.modelTier,
      response: result?.response,
    },
  };
}

export function toSubAgentWorkItemStatus(status: unknown): AgentWorkItemStatus {
  switch (status) {
    case 'running':
    case 'started':
    case 'progress':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'spawned':
    case 'pending':
    default:
      return 'queued';
  }
}

function projectSubAgentEventStep(
  event: SubAgentWorkItemEvent,
  status: AgentWorkItemStatus,
): AgentWorkItemStep | null {
  const timestamp = event.timestamp;
  const progressText = event.data?.progress;

  if (event.type === 'progress' && progressText) {
    return {
      id: `progress-${timestamp}`,
      name: stripLeadingPercent(progressText),
      status: 'running',
      startTime: timestamp,
      message: progressText,
    };
  }
  if (event.type === 'started') {
    return {
      id: 'subagent-started',
      name: 'Started',
      status: 'running',
      startTime: timestamp,
      message: event.data?.description,
    };
  }
  if (event.type === 'completed') {
    return {
      id: 'subagent-completed',
      name: 'Completed',
      status: 'completed',
      startTime: timestamp,
      endTime: timestamp,
      message: event.data?.result?.response,
    };
  }
  if (event.type === 'failed' || status === 'failed') {
    return {
      id: 'subagent-failed',
      name: 'Failed',
      status: 'failed',
      startTime: timestamp,
      endTime: timestamp,
      message: event.data?.error ?? event.data?.result?.error,
    };
  }
  if (event.type === 'cancelled' || status === 'cancelled') {
    return {
      id: 'subagent-cancelled',
      name: 'Cancelled',
      status: 'failed',
      startTime: timestamp,
      endTime: timestamp,
    };
  }
  return null;
}

function stripLeadingPercent(progress: string): string {
  return progress.replace(/^\s*\d+%\s*/, '').trim() || progress;
}

function toSubAgentProgress(
  eventType: SubAgentWorkItemEvent['type'],
  progressText?: string,
): number {
  if (eventType === 'completed' || eventType === 'failed' || eventType === 'cancelled') return 100;

  const parsed = progressText?.match(/\d+/)?.[0];
  if (parsed) return Math.min(99, Math.max(0, Number(parsed)));
  return eventType === 'started' ? 5 : 0;
}
