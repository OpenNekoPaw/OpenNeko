import {
  buildMediaTaskProgressMessage,
  buildTaskRemovedMessage,
  buildTasksUpdatedMessage,
  buildTaskUpdatedMessage,
  projectBackgroundTaskToWorkItem,
  projectBackgroundTasksToWorkItems,
  projectMediaTaskToWorkItem,
  type AgentMediaTaskView,
  type MediaTaskProgressMessage,
  type TaskRemovedMessage,
  type TasksUpdatedMessage,
  type TaskUpdatedMessage,
} from '@neko-agent/types';
import type { Task, TaskInput, TaskRunScope, TaskStatus } from '@neko/shared';
import {
  buildCancelTaskActionPlan,
  buildClearCompletedTaskPlan,
  buildRemoveTaskActionPlan,
  buildRetryTaskActionPlan,
  buildTaskResultOpenPlan,
  buildViewTaskResultActionPlan,
  type TaskActionNoopPlan,
  type TaskActionRejectPlan,
  type TaskMediaCandidate,
  type TaskResultOpenPlan,
} from './task-action-plan';
import {
  buildBackgroundTaskFailureUpdateView,
  filterTasksForConversation,
  toBackgroundTaskView,
} from './task-view-projector';
import type { AgentTaskLeaseControl, AgentTaskLeaseDiagnostic } from './task-storage-policy';

export type TaskRuntimeMessage =
  TasksUpdatedMessage | TaskUpdatedMessage | TaskRemovedMessage | MediaTaskProgressMessage;

export type TaskRuntimeAction = 'cancel' | 'retry' | 'remove' | 'view-result';

export interface TaskRuntimeTaskManager {
  list(status?: TaskStatus): Promise<Task[]>;
  get(scope: TaskRunScope): Promise<Task | null | undefined>;
  cancel(scope: TaskRunScope): Promise<unknown>;
  submit(
    input: TaskInput,
    owner: Pick<TaskRunScope, 'conversationId' | 'runId' | 'parentRunId'>,
  ): Promise<TaskRunScope>;
  delete(scope: TaskRunScope): Promise<unknown>;
}

export interface TaskRuntimeMediaGateway {
  getCandidate(scope: TaskRunScope): Promise<TaskMediaCandidate | null | undefined>;
  cancelTask(scope: TaskRunScope): Promise<AgentMediaTaskView | null | undefined>;
  deleteTask(scope: TaskRunScope): Promise<unknown>;
}

export interface TaskRuntimeHostPrivateLeaseGuard {
  getDiagnostic(input: {
    readonly scope: TaskRunScope;
    readonly control: AgentTaskLeaseControl;
  }): AgentTaskLeaseDiagnostic | undefined | Promise<AgentTaskLeaseDiagnostic | undefined>;
}

export interface TaskRuntimeDeps {
  taskManager?: TaskRuntimeTaskManager;
  media?: TaskRuntimeMediaGateway;
  hostPrivateLeaseGuard?: TaskRuntimeHostPrivateLeaseGuard;
}

export interface TaskRuntimeEffects {
  postMessage(message: TaskRuntimeMessage): void | Promise<void>;
  now?(): number;
  openTaskResult?(plan: TaskResultOpenPlan): void | Promise<void>;
  onRejectedAction?(input: { action: TaskRuntimeAction; plan: TaskActionRejectPlan }): void;
  onNoopAction?(input: { action: TaskRuntimeAction; plan: TaskActionNoopPlan }): void;
  onTaskRetried?(input: { taskId: string; newTaskId: string; conversationId: string }): void;
  onRetryFailed?(input: { taskId: string; conversationId: string; error: unknown }): void;
  onMediaDeleteFailed?(input: { taskId: string; conversationId: string; error: unknown }): void;
  onHostPrivateLeaseDiagnostic?(diagnostic: AgentTaskLeaseDiagnostic): void | Promise<void>;
}

export interface TaskRuntimeInput {
  scope: TaskRunScope;
  taskId: string;
  conversationId: string;
  resultRef?: string;
}

export interface ConversationTasksRuntimeInput {
  conversationId: string;
}

export interface TaskRuntimeResult {
  kind: string;
  conversationId: string;
  taskId?: string;
  taskIds?: string[];
}

const CLEARABLE_TASK_STATUSES: TaskStatus[] = ['completed', 'failed', 'cancelled'];

export async function runSendTasksRuntime(
  input: ConversationTasksRuntimeInput,
  deps: TaskRuntimeDeps,
  effects: TaskRuntimeEffects,
): Promise<TaskRuntimeResult> {
  if (!deps.taskManager) {
    await effects.postMessage(
      buildTasksUpdatedMessage({ conversationId: input.conversationId, workItems: [] }),
    );
    return { kind: 'tasks-sent', conversationId: input.conversationId, taskIds: [] };
  }

  const tasks = await deps.taskManager.list();
  const taskViews = filterTasksForConversation(tasks, input.conversationId).map((task) =>
    toBackgroundTaskView(task),
  );
  const workItems = projectBackgroundTasksToWorkItems({
    conversationId: input.conversationId,
    tasks: taskViews,
  });
  await effects.postMessage(
    buildTasksUpdatedMessage({ conversationId: input.conversationId, workItems }),
  );

  return {
    kind: 'tasks-sent',
    conversationId: input.conversationId,
    taskIds: taskViews.map((task) => task.id),
  };
}

export async function runCancelTaskRuntime(
  input: TaskRuntimeInput,
  deps: TaskRuntimeDeps,
  effects: TaskRuntimeEffects,
): Promise<TaskRuntimeResult> {
  assertTaskRuntimeInputScope(input);
  if (!deps.taskManager && !deps.media) {
    return { kind: 'noop', conversationId: input.conversationId, taskId: input.taskId };
  }
  if (await rejectHostPrivateLease(input, 'cancel', deps, effects)) {
    return {
      kind: 'host-private-lease',
      conversationId: input.conversationId,
      taskId: input.taskId,
    };
  }

  const task = await deps.taskManager?.get(input.scope);
  const media = await deps.media?.getCandidate(input.scope);
  const plan = buildCancelTaskActionPlan({ ...input, task, media });

  if (plan.kind === 'reject') {
    effects.onRejectedAction?.({ action: 'cancel', plan });
    return { kind: 'rejected', conversationId: input.conversationId, taskId: input.taskId };
  }

  if (plan.kind === 'cancel-task-manager') {
    await deps.taskManager?.cancel(input.scope);
    await runSendTasksRuntime({ conversationId: input.conversationId }, deps, effects);
    return {
      kind: 'cancelled-task-manager',
      conversationId: input.conversationId,
      taskId: input.taskId,
    };
  }

  const updated = await deps.media?.cancelTask(input.scope);
  if (updated) {
    await effects.postMessage(
      buildMediaTaskProgressMessage({
        conversationId: input.conversationId,
        workItem: projectMediaTaskToWorkItem({
          conversationId: input.conversationId,
          task: updated,
        }),
      }),
    );
  }

  return { kind: 'cancelled-media', conversationId: input.conversationId, taskId: input.taskId };
}

export async function runRetryTaskRuntime(
  input: TaskRuntimeInput,
  deps: TaskRuntimeDeps,
  effects: TaskRuntimeEffects,
): Promise<TaskRuntimeResult> {
  assertTaskRuntimeInputScope(input);
  if (!deps.taskManager) {
    return { kind: 'noop', conversationId: input.conversationId, taskId: input.taskId };
  }
  if (await rejectHostPrivateLease(input, 'recover', deps, effects)) {
    return {
      kind: 'host-private-lease',
      conversationId: input.conversationId,
      taskId: input.taskId,
    };
  }

  const task = await deps.taskManager.get(input.scope);
  const plan = buildRetryTaskActionPlan({ ...input, task });
  if (plan.kind === 'reject') {
    effects.onRejectedAction?.({ action: 'retry', plan });
    return { kind: 'rejected', conversationId: input.conversationId, taskId: input.taskId };
  }

  try {
    const newScope = await deps.taskManager.submit(plan.input, {
      conversationId: input.scope.conversationId,
      runId: input.scope.runId,
      parentRunId: input.scope.parentRunId,
    });
    const newTaskId = newScope.childRunId;
    effects.onTaskRetried?.({
      taskId: input.taskId,
      newTaskId,
      conversationId: input.conversationId,
    });
    await runSendTasksRuntime({ conversationId: input.conversationId }, deps, effects);
    return { kind: 'retried', conversationId: input.conversationId, taskId: input.taskId };
  } catch (error) {
    effects.onRetryFailed?.({ taskId: input.taskId, conversationId: input.conversationId, error });
    if (task) {
      await effects.postMessage(
        buildTaskUpdatedMessage({
          conversationId: input.conversationId,
          workItem: projectBackgroundTaskToWorkItem({
            conversationId: input.conversationId,
            task: buildBackgroundTaskFailureUpdateView(task, error, { now: effects.now }),
          }),
        }),
      );
    }
    return { kind: 'retry-failed', conversationId: input.conversationId, taskId: input.taskId };
  }
}

export async function runRemoveTaskRuntime(
  input: TaskRuntimeInput,
  deps: TaskRuntimeDeps,
  effects: TaskRuntimeEffects,
): Promise<TaskRuntimeResult> {
  assertTaskRuntimeInputScope(input);
  const task = await deps.taskManager?.get(input.scope);
  const media = await deps.media?.getCandidate(input.scope);
  const plan = buildRemoveTaskActionPlan({ ...input, task, media });

  if (plan.kind === 'reject') {
    effects.onRejectedAction?.({ action: 'remove', plan });
    return { kind: 'rejected', conversationId: input.conversationId, taskId: input.taskId };
  }

  if (plan.deleteMedia) {
    await deps.media?.deleteTask(input.scope);
  }
  if (plan.deleteTaskManager) {
    await deps.taskManager?.delete(input.scope);
  }

  await effects.postMessage(
    buildTaskRemovedMessage({ taskScope: input.scope, taskId: input.taskId }),
  );
  return { kind: 'removed', conversationId: input.conversationId, taskId: input.taskId };
}

export async function runViewTaskResultRuntime(
  input: TaskRuntimeInput,
  deps: TaskRuntimeDeps,
  effects: TaskRuntimeEffects,
): Promise<TaskRuntimeResult> {
  assertTaskRuntimeInputScope(input);
  if (await rejectHostPrivateLease(input, 'attach', deps, effects)) {
    return {
      kind: 'host-private-lease',
      conversationId: input.conversationId,
      taskId: input.taskId,
    };
  }

  const task = await deps.taskManager?.get(input.scope);
  const media = await deps.media?.getCandidate(input.scope);
  const plan = buildViewTaskResultActionPlan({ ...input, task, media });

  if (plan.kind === 'reject') {
    effects.onRejectedAction?.({ action: 'view-result', plan });
    return { kind: 'rejected', conversationId: input.conversationId, taskId: input.taskId };
  }

  if (plan.kind === 'noop') {
    effects.onNoopAction?.({ action: 'view-result', plan });
    return { kind: 'noop', conversationId: input.conversationId, taskId: input.taskId };
  }

  await effects.openTaskResult?.(buildTaskResultOpenPlan(plan.url));
  return { kind: 'opened-result', conversationId: input.conversationId, taskId: input.taskId };
}

function assertTaskRuntimeInputScope(input: TaskRuntimeInput): void {
  if (
    input.scope.childKind !== 'task' ||
    input.scope.childRunId !== input.taskId ||
    input.scope.conversationId !== input.conversationId
  ) {
    throw new Error(
      `Task runtime scope mismatch: ${input.scope.conversationId}/${input.scope.childRunId} cannot authorize ${input.conversationId}/${input.taskId}`,
    );
  }
}

async function rejectHostPrivateLease(
  input: TaskRuntimeInput,
  control: AgentTaskLeaseControl,
  deps: TaskRuntimeDeps,
  effects: TaskRuntimeEffects,
): Promise<boolean> {
  const diagnostic = await deps.hostPrivateLeaseGuard?.getDiagnostic({
    scope: input.scope,
    control,
  });
  if (!diagnostic) {
    return false;
  }
  await effects.onHostPrivateLeaseDiagnostic?.(diagnostic);
  return true;
}

export async function runClearCompletedTasksRuntime(
  input: ConversationTasksRuntimeInput,
  deps: TaskRuntimeDeps,
  effects: TaskRuntimeEffects,
): Promise<TaskRuntimeResult> {
  if (!deps.taskManager) {
    return runSendTasksRuntime(input, deps, effects);
  }

  const taskManager = deps.taskManager;
  const tasks = (
    await Promise.all(CLEARABLE_TASK_STATUSES.map((status) => taskManager.list(status)))
  ).flat();
  const plan = buildClearCompletedTaskPlan({ conversationId: input.conversationId, tasks });

  for (const taskId of plan.taskIds) {
    const task = tasks.find((candidate) => candidate.id === taskId);
    if (!task) {
      throw new Error(`Clear-completed plan referenced unknown task: ${taskId}`);
    }
    await taskManager.delete(task.scope);
    try {
      await deps.media?.deleteTask(task.scope);
    } catch (error) {
      effects.onMediaDeleteFailed?.({ taskId, conversationId: input.conversationId, error });
    }
    await effects.postMessage(buildTaskRemovedMessage({ taskScope: task.scope, taskId }));
  }

  await runSendTasksRuntime(input, deps, effects);
  return {
    kind: 'cleared-completed',
    conversationId: input.conversationId,
    taskIds: plan.taskIds,
  };
}
