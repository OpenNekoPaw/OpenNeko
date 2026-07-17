import { isPublicGeneratedAssetResultUri, type Task, type TaskStatus } from '@neko/shared';
import {
  getTaskConversationId,
  getTaskResultUrl,
  matchesTaskConversation,
} from './task-view-projector';

export type TaskActionRejectReason =
  'task-unavailable' | 'wrong-conversation' | 'invalid-status' | 'no-result';

export interface TaskActionRejectPlan {
  readonly kind: 'reject';
  readonly reason: TaskActionRejectReason;
  readonly taskId: string;
  readonly conversationId: string;
  readonly taskConversationId?: string;
}

export interface TaskActionNoopPlan {
  readonly kind: 'noop';
  readonly reason: 'no-result';
  readonly taskId: string;
  readonly conversationId: string;
}

export interface TaskMediaCandidate {
  readonly id: string;
  readonly conversationId?: string;
  readonly resultUrl?: string;
}

export type CancelTaskActionPlan =
  | {
      readonly kind: 'cancel-task-manager';
      readonly taskId: string;
      readonly conversationId: string;
    }
  | {
      readonly kind: 'cancel-media';
      readonly taskId: string;
      readonly conversationId: string;
    }
  | TaskActionRejectPlan;

export interface RetryTaskActionPlan {
  readonly kind: 'retry-task-manager';
  readonly taskId: string;
  readonly conversationId: string;
  readonly input: Task['input'];
}

export type RetryTaskPlan = RetryTaskActionPlan | TaskActionRejectPlan;

export interface RemoveTaskActionPlan {
  readonly kind: 'remove';
  readonly taskId: string;
  readonly conversationId: string;
  readonly deleteTaskManager: boolean;
  readonly deleteMedia: boolean;
}

export type RemoveTaskPlan = RemoveTaskActionPlan | TaskActionRejectPlan;

export interface ViewTaskResultActionPlan {
  readonly kind: 'open-url';
  readonly taskId: string;
  readonly conversationId: string;
  readonly url: string;
}

export type ViewTaskResultPlan =
  ViewTaskResultActionPlan | TaskActionRejectPlan | TaskActionNoopPlan;

export type TaskResultOpenPlan =
  | {
      readonly kind: 'open-file';
      readonly filePath: string;
    }
  | {
      readonly kind: 'open-external';
      readonly url: string;
    };

export interface ClearCompletedTaskPlan {
  readonly conversationId: string;
  readonly taskIds: string[];
}

export function buildCancelTaskActionPlan(input: {
  readonly taskId: string;
  readonly conversationId: string;
  readonly task?: Task | null;
  readonly media?: TaskMediaCandidate | null;
}): CancelTaskActionPlan {
  const taskOwnership = getTaskOwnership(input.task, input.conversationId);
  if (taskOwnership === 'match') {
    return {
      kind: 'cancel-task-manager',
      taskId: input.taskId,
      conversationId: input.conversationId,
    };
  }
  if (taskOwnership === 'wrong-conversation') {
    return rejectTaskAction(
      input,
      'wrong-conversation',
      getTaskConversationId(input.task ?? undefined),
    );
  }

  const mediaOwnership = getMediaOwnership(input.media, input.conversationId);
  if (mediaOwnership === 'match') {
    return {
      kind: 'cancel-media',
      taskId: input.taskId,
      conversationId: input.conversationId,
    };
  }
  if (mediaOwnership === 'wrong-conversation') {
    return rejectTaskAction(input, 'wrong-conversation', input.media?.conversationId);
  }

  return rejectTaskAction(input, 'task-unavailable');
}

export function buildRetryTaskActionPlan(input: {
  readonly taskId: string;
  readonly conversationId: string;
  readonly task?: Task | null;
}): RetryTaskPlan {
  const task = input.task ?? undefined;
  const ownership = getTaskOwnership(task, input.conversationId);
  if (ownership === 'wrong-conversation') {
    return rejectTaskAction(input, 'wrong-conversation', getTaskConversationId(task));
  }
  if (ownership === 'missing') {
    return rejectTaskAction(input, 'task-unavailable');
  }
  if (!task) {
    return rejectTaskAction(input, 'task-unavailable');
  }
  if (!isRetryableStatus(task.status)) {
    return rejectTaskAction(input, 'invalid-status', getTaskConversationId(task));
  }

  return {
    kind: 'retry-task-manager',
    taskId: input.taskId,
    conversationId: input.conversationId,
    input: task.input,
  };
}

export function buildRemoveTaskActionPlan(input: {
  readonly taskId: string;
  readonly conversationId: string;
  readonly task?: Task | null;
  readonly media?: TaskMediaCandidate | null;
}): RemoveTaskPlan {
  const taskOwnership = getTaskOwnership(input.task, input.conversationId);
  if (taskOwnership === 'wrong-conversation') {
    return rejectTaskAction(
      input,
      'wrong-conversation',
      getTaskConversationId(input.task ?? undefined),
    );
  }

  const mediaOwnership = getMediaOwnership(input.media, input.conversationId);
  if (mediaOwnership === 'wrong-conversation') {
    return rejectTaskAction(input, 'wrong-conversation', input.media?.conversationId);
  }

  const hasTask = taskOwnership === 'match';
  const hasMedia = mediaOwnership === 'match';
  if (!hasTask && !hasMedia) {
    return rejectTaskAction(input, 'task-unavailable');
  }

  return {
    kind: 'remove',
    taskId: input.taskId,
    conversationId: input.conversationId,
    deleteTaskManager: hasTask,
    deleteMedia: hasTask || hasMedia,
  };
}

export function buildViewTaskResultActionPlan(input: {
  readonly taskId: string;
  readonly conversationId: string;
  readonly task?: Task | null;
  readonly media?: TaskMediaCandidate | null;
  readonly resultRef?: string;
}): ViewTaskResultPlan {
  const taskOwnership = getTaskOwnership(input.task, input.conversationId);
  if (taskOwnership === 'wrong-conversation') {
    return rejectTaskAction(
      input,
      'wrong-conversation',
      getTaskConversationId(input.task ?? undefined),
    );
  }

  const mediaOwnership = getMediaOwnership(input.media, input.conversationId);
  if (mediaOwnership === 'wrong-conversation') {
    return rejectTaskAction(input, 'wrong-conversation', input.media?.conversationId);
  }

  if (taskOwnership === 'match') {
    const url = getTaskResultUrl(input.task ?? undefined);
    if (url && isVSCodeTaskResultUrl(url)) {
      return {
        kind: 'open-url',
        taskId: input.taskId,
        conversationId: input.conversationId,
        url,
      };
    }
  }

  if (mediaOwnership === 'match' && isVSCodeTaskResultUrl(input.media?.resultUrl)) {
    return {
      kind: 'open-url',
      taskId: input.taskId,
      conversationId: input.conversationId,
      url: input.media.resultUrl,
    };
  }

  if (isDisplayedGeneratedTaskResultRef(input.resultRef)) {
    return {
      kind: 'open-url',
      taskId: input.taskId,
      conversationId: input.conversationId,
      url: input.resultRef,
    };
  }

  return {
    kind: 'noop',
    reason: 'no-result',
    taskId: input.taskId,
    conversationId: input.conversationId,
  };
}

export function buildClearCompletedTaskPlan(input: {
  readonly conversationId: string;
  readonly tasks: readonly Task[];
}): ClearCompletedTaskPlan {
  return {
    conversationId: input.conversationId,
    taskIds: input.tasks
      .filter((task) => matchesTaskConversation(task, input.conversationId))
      .map((task) => task.id),
  };
}

export function buildTaskResultOpenPlan(url: string): TaskResultOpenPlan {
  if (url.startsWith('file://')) {
    return {
      kind: 'open-file',
      filePath: decodeURIComponent(url.replace(/^file:\/\//, '')),
    };
  }

  if (isAbsoluteLocalPath(url)) {
    return {
      kind: 'open-file',
      filePath: url,
    };
  }

  return {
    kind: 'open-external',
    url,
  };
}

type Ownership = 'match' | 'wrong-conversation' | 'missing';

function getTaskOwnership(task: Task | null | undefined, conversationId: string): Ownership {
  if (!task) return 'missing';
  return matchesTaskConversation(task, conversationId) ? 'match' : 'wrong-conversation';
}

function getMediaOwnership(
  media: TaskMediaCandidate | null | undefined,
  conversationId: string,
): Ownership {
  if (!media) return 'missing';
  return media.conversationId === conversationId ? 'match' : 'wrong-conversation';
}

function isRetryableStatus(status: TaskStatus): boolean {
  return status === 'failed' || status === 'cancelled';
}

function isAbsoluteLocalPath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function isPublicTaskResultUrl(value: string | undefined): value is string {
  return (
    typeof value === 'string' &&
    isPublicGeneratedAssetResultUri(value) &&
    !isWebviewRenderUri(value)
  );
}

function isVSCodeTaskResultUrl(value: string | undefined): value is string {
  if (!isPublicTaskResultUrl(value)) return false;
  return (
    value.startsWith('generated-assets/') ||
    value.startsWith('file://') ||
    isAbsoluteLocalPath(value) ||
    isWorkspaceRelativePath(value)
  );
}

function isWebviewRenderUri(value: string): boolean {
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  return Boolean(scheme?.includes('webview')) || /^webview-/i.test(value);
}

function isWorkspaceRelativePath(value: string): boolean {
  return !/^[a-z][a-z0-9+.-]*:/i.test(value) && value.length > 0;
}

function isDisplayedGeneratedTaskResultRef(value: string | undefined): value is string {
  if (!isPublicTaskResultUrl(value)) return false;
  return value.startsWith('generated-assets/') || value.startsWith('neko/generated/');
}

function rejectTaskAction(
  input: {
    readonly taskId: string;
    readonly conversationId: string;
  },
  reason: TaskActionRejectReason,
  taskConversationId?: string,
): TaskActionRejectPlan {
  return {
    kind: 'reject',
    reason,
    taskId: input.taskId,
    conversationId: input.conversationId,
    ...(taskConversationId ? { taskConversationId } : {}),
  };
}
