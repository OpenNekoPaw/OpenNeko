import {
  formatChildRunScope,
  formatTaskRunScope,
  isPublicGeneratedAssetResultUri,
  stripRenderableGeneratedAssetPath,
} from '@neko/shared';
import type {
  AgentBackgroundTask,
  AgentMediaTaskResult,
  AgentMediaTaskView,
  AgentTodoProjectionItem,
  AgentWorkItem,
  AgentWorkItemBase,
  AgentWorkItemTaskStatus,
  AgentWorkItemTaskStep,
  AgentWorkItemTaskType,
  SubAgentWorkItem,
  SubAgentWorkItemEvent,
  TaskWorkItem,
} from './work-item';

const DEFAULT_TODO_PROJECTION_LIMIT = 6;

export interface ProjectAgentWorkItemsToTodoInput {
  readonly conversationId: string;
  readonly items: readonly AgentWorkItem[];
  readonly maxItems?: number;
}

export interface ProjectBackgroundTaskWorkItemInput {
  conversationId: string;
  task: AgentBackgroundTask;
  kind?: TaskWorkItem['kind'];
  parentMessageId?: string | null;
  parentToolCallId?: string | null;
}

export interface ProjectBackgroundTasksWorkItemsInput {
  conversationId: string;
  tasks: readonly AgentBackgroundTask[];
  kind?: TaskWorkItem['kind'];
}

export interface ProjectMediaTaskWorkItemInput {
  conversationId: string;
  task: AgentMediaTaskView;
  parentMessageId?: string | null;
  parentToolCallId?: string | null;
}

export function backgroundTaskToWorkItem(
  task: AgentBackgroundTask,
  conversationId: string,
  kind: TaskWorkItem['kind'],
  links: Partial<Pick<AgentWorkItemBase, 'parentMessageId' | 'parentToolCallId'>> = {},
): TaskWorkItem {
  const result = sanitizeAgentMediaTaskResult(task.result);
  const { result: _discardedResult, ...taskWithoutResult } = task;
  return {
    id: task.id,
    conversationId,
    kind,
    parentMessageId: links.parentMessageId ?? null,
    parentToolCallId: links.parentToolCallId ?? null,
    title: task.name,
    summary: task.prompt,
    status: task.status,
    progress: task.progress,
    steps: task.steps,
    currentStepId: task.currentStepId,
    ...(result ? { result } : {}),
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    task: result ? { ...taskWithoutResult, result } : taskWithoutResult,
  };
}

export function getAgentWorkItemRuntimeKey(item: AgentWorkItem): string {
  return isTaskWorkItem(item)
    ? formatTaskRunScope(item.task.scope)
    : formatChildRunScope(item.scope);
}

export function isTaskWorkItem(item: AgentWorkItem): item is TaskWorkItem {
  return item.kind === 'media-task' || item.kind === 'tool-background-task';
}

export function isSubAgentWorkItem(item: AgentWorkItem): item is SubAgentWorkItem {
  return item.kind === 'subagent';
}

export function projectMediaTaskToBackgroundTask(task: AgentMediaTaskView): AgentBackgroundTask {
  const outputs = task.outputs ?? [];
  const firstOutput = outputs[0];

  const outputResult: AgentBackgroundTask['result'] =
    firstOutput !== undefined
      ? {
          urls: outputs.map((output) => output.url).filter(Boolean),
          thumbnailUrl: firstOutput.thumbnailUrl,
          width: firstOutput.width,
          height: firstOutput.height,
          duration: firstOutput.duration,
        }
      : undefined;
  const result = sanitizeAgentMediaTaskResult(task.result ?? outputResult);

  const promptText = task.request.prompt;
  const name = promptText.length > 50 ? `${promptText.slice(0, 47)}...` : promptText;

  return {
    scope: task.scope,
    id: task.id,
    type: toAgentWorkItemTaskType(task.type),
    name,
    prompt: promptText,
    providerId: task.providerId,
    providerName: task.modelId,
    status: toAgentWorkItemTaskStatus(task.status),
    progress: task.progress,
    createdAt: toDateString(task.createdAt),
    updatedAt: toDateString(task.updatedAt),
    ...(result ? { result } : {}),
    error: task.error?.message,
    retryable: task.error?.retryable,
  };
}

export function projectBackgroundTaskToWorkItem(
  input: ProjectBackgroundTaskWorkItemInput,
): TaskWorkItem {
  return backgroundTaskToWorkItem(
    input.task,
    input.conversationId,
    input.kind ?? 'tool-background-task',
    {
      parentMessageId: input.parentMessageId,
      parentToolCallId: input.parentToolCallId,
    },
  );
}

export function projectBackgroundTasksToWorkItems(
  input: ProjectBackgroundTasksWorkItemsInput,
): TaskWorkItem[] {
  return input.tasks.map((task) =>
    projectBackgroundTaskToWorkItem({
      conversationId: input.conversationId,
      task,
      kind: input.kind,
    }),
  );
}

export function projectMediaTaskToWorkItem(input: ProjectMediaTaskWorkItemInput): TaskWorkItem {
  return projectBackgroundTaskToWorkItem({
    conversationId: input.conversationId,
    task: projectMediaTaskToBackgroundTask(input.task),
    kind: 'media-task',
    parentMessageId: input.parentMessageId,
    parentToolCallId: input.parentToolCallId,
  });
}

/**
 * Projects one summary row per owning work item for near-term display.
 *
 * Work-item steps and domain graphs are intentionally not copied. Rebuilding
 * or dropping this projection cannot alter Task, file, project, or result
 * state, and a projected `completed` status is never delivery evidence.
 */
export function projectAgentWorkItemsToTodo(
  input: ProjectAgentWorkItemsToTodoInput,
): AgentTodoProjectionItem[] {
  const limit = input.maxItems ?? DEFAULT_TODO_PROJECTION_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(`TODO projection limit must be a positive safe integer, received ${limit}`);
  }

  const candidates = input.items
    .filter((item) => item.conversationId === input.conversationId)
    .map((item) => ({ item, status: toTodoProjectionStatus(item.status) }))
    .sort(compareTodoProjectionCandidates)
    .slice(0, limit);
  let hasInProgress = false;

  return candidates.map(({ item, status }) => {
    const projectedStatus = status === 'in_progress' && hasInProgress ? 'pending' : status;
    if (status === 'in_progress' && !hasInProgress) {
      hasInProgress = true;
    }
    return {
      id: `work-item:${item.kind}:${item.id}`,
      content: item.title,
      status: projectedStatus,
      sourceWorkItemId: item.id,
      sourceKind: item.kind,
    };
  });
}

export function projectSubAgentEventToWorkItem(event: SubAgentWorkItemEvent): SubAgentWorkItem {
  const status = toSubAgentWorkItemStatus(event.data?.status ?? event.type);
  const progress = toSubAgentProgress(event.type, event.data?.progress);
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
    progress,
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

export function toSubAgentWorkItemStatus(status: unknown): AgentWorkItemTaskStatus {
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

function toTodoProjectionStatus(
  status: AgentWorkItemTaskStatus,
): AgentTodoProjectionItem['status'] {
  switch (status) {
    case 'processing':
      return 'in_progress';
    case 'completed':
      return 'completed';
    case 'failed':
    case 'cancelled':
      return 'blocked';
    case 'queued':
      return 'pending';
  }
}

function compareTodoProjectionCandidates(
  left: { readonly item: AgentWorkItem; readonly status: AgentTodoProjectionItem['status'] },
  right: { readonly item: AgentWorkItem; readonly status: AgentTodoProjectionItem['status'] },
): number {
  const statusOrder: Record<AgentTodoProjectionItem['status'], number> = {
    in_progress: 0,
    blocked: 1,
    pending: 2,
    completed: 3,
  };
  const statusDelta = statusOrder[left.status] - statusOrder[right.status];
  if (statusDelta !== 0) return statusDelta;

  const updatedDelta = Date.parse(right.item.updatedAt) - Date.parse(left.item.updatedAt);
  if (Number.isFinite(updatedDelta) && updatedDelta !== 0) return updatedDelta;
  return left.item.id.localeCompare(right.item.id);
}

function projectSubAgentEventStep(
  event: SubAgentWorkItemEvent,
  status: AgentWorkItemTaskStatus,
): AgentWorkItemTaskStep | null {
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

function toAgentWorkItemTaskType(mediaType: string): AgentWorkItemTaskType {
  if (mediaType === 'audio') return 'audio';
  if (mediaType === 'video') return 'video';
  return 'image';
}

function toAgentWorkItemTaskStatus(status: string): AgentWorkItemTaskStatus {
  switch (status) {
    case 'pending':
      return 'queued';
    case 'processing':
    case 'running':
      return 'processing';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'queued';
  }
}

function toSubAgentProgress(eventType: string, progressText: string | undefined): number {
  if (eventType === 'completed') return 100;
  if (eventType === 'failed' || eventType === 'cancelled') return 100;

  const parsed = progressText?.match(/\d+/)?.[0];
  if (parsed) return Math.min(99, Math.max(0, Number(parsed)));
  return eventType === 'started' ? 5 : 0;
}

function toDateString(value: string | Date): string {
  if (typeof value === 'string') return value;
  return value.toISOString();
}

function sanitizeAgentMediaTaskResult(
  result: AgentBackgroundTask['result'] | undefined,
): AgentMediaTaskResult | undefined {
  if (!result) return undefined;

  const urls = result.urls.filter(
    (url) => typeof url === 'string' && isPublicGeneratedAssetResultUri(url),
  );
  const thumbnailUrl =
    result.thumbnailUrl && isPublicGeneratedAssetResultUri(result.thumbnailUrl)
      ? result.thumbnailUrl
      : undefined;
  const assets = result.assets?.map(stripRenderableGeneratedAssetPath) ?? [];
  if (urls.length === 0 && !thumbnailUrl && assets.length === 0) {
    return undefined;
  }

  return {
    urls,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(result.width !== undefined ? { width: result.width } : {}),
    ...(result.height !== undefined ? { height: result.height } : {}),
    ...(result.duration !== undefined ? { duration: result.duration } : {}),
    ...(assets.length > 0 ? { assets } : {}),
  };
}
