import type { TaskCreatedMessage, TaskUpdatedMessage } from '@neko-agent/types';
import type { TaskRunLease, TaskRunScope } from '@neko/shared';
import type {
  BackgroundTaskProgressPatch,
  BackgroundTaskView,
} from '../../task/task-view-projector';
import type { AgentEvent } from '../../session/types';
import {
  type AgentStreamBackgroundTaskPersistInput,
  projectAgentStreamBackgroundTaskProgress,
  projectAgentStreamBackgroundTaskStart,
} from './agent-stream-background-task';

export interface AgentStreamBackgroundTaskDeliveryContext {
  readonly lease: TaskRunLease;
  readonly conversationId: string;
  readonly taskScope: TaskRunScope;
  readonly taskId: string;
  readonly toolCallId?: string;
  readonly taskType: BackgroundTaskView['type'];
  readonly baseTask: BackgroundTaskView;
}

export interface AgentStreamBackgroundTaskWaitInput {
  readonly lease: TaskRunLease;
  readonly conversationId: string;
  readonly taskScope: TaskRunScope;
  readonly taskId: string;
  readonly toolCallId?: string;
  readonly taskType: BackgroundTaskView['type'];
  readonly signal: AbortSignal;
}

export interface AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan = unknown> {
  readonly progress: BackgroundTaskProgressPatch;
  readonly deliveryPlan?: TDeliveryPlan;
  readonly persistResultUrls?: readonly string[];
}

export interface AgentStreamBackgroundTaskProgressEvent<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly lease: TaskRunLease;
  readonly conversationId: string;
  readonly taskScope: TaskRunScope;
  readonly task: AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>;
  readonly sourceTask: TSourceTask;
}

export interface AgentStreamBackgroundTaskIgnoredEvent<TSourceTask = unknown> {
  readonly lease: TaskRunLease;
  readonly taskScope: TaskRunScope;
  readonly taskId: string;
  readonly conversationId: string;
  readonly sourceTask: TSourceTask;
}

export interface AgentStreamBackgroundTaskProgressErrorEvent<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly lease: TaskRunLease;
  readonly taskScope: TaskRunScope;
  readonly taskId: string;
  readonly conversationId: string;
  readonly sourceTask: TSourceTask;
  readonly error: unknown;
  readonly recoveryTask?: AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>;
}

export type AgentStreamBackgroundTaskStaleReason = 'lease-mismatch' | 'settled';

export interface AgentStreamBackgroundTaskStaleEvent<TSourceTask = unknown> {
  readonly reason: AgentStreamBackgroundTaskStaleReason;
  readonly expectedLease: TaskRunLease;
  readonly lease: TaskRunLease;
  readonly taskScope: TaskRunScope;
  readonly taskId: string;
  readonly conversationId: string;
  readonly sourceTask: TSourceTask;
}

export interface AgentStreamBackgroundTaskTerminalEvent<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly lease: TaskRunLease;
  readonly conversationId: string;
  readonly taskScope: TaskRunScope;
  readonly taskId: string;
  readonly parentMessageId: string;
  readonly parentToolCallId?: string;
  readonly task: BackgroundTaskView;
  readonly sourceTask: TSourceTask;
  readonly deliveryPlan?: TDeliveryPlan;
}

export interface ObserveAgentStreamBackgroundTaskProgressInput<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly lease: TaskRunLease;
  readonly taskScope: TaskRunScope;
  readonly taskId: string;
  readonly conversationId: string;
  readonly unsubscribeOnIgnoredConversation: boolean;
  readonly createRecoveryTaskView: (
    task: TSourceTask,
  ) => AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>;
  readonly createTaskView: (
    task: TSourceTask,
  ) =>
    | AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>
    | Promise<AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>>;
  readonly onTaskProgress: (
    event: AgentStreamBackgroundTaskProgressEvent<TSourceTask, TDeliveryPlan>,
  ) => void | Promise<void>;
  readonly onIgnoredConversationTask?: (
    event: AgentStreamBackgroundTaskIgnoredEvent<TSourceTask>,
  ) => void;
  readonly onProgressDeliveryError?: (
    event: AgentStreamBackgroundTaskProgressErrorEvent<TSourceTask, TDeliveryPlan>,
  ) => void;
}

export interface StartAgentStreamBackgroundTaskObserverInput<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
> {
  readonly lease?: TaskRunLease;
  readonly conversationId: string;
  readonly messageId: string;
  readonly event: AgentEvent;
  readonly postMessage: (message: TaskCreatedMessage | TaskUpdatedMessage) => void | Promise<void>;
  readonly observeProgress?: (
    input: ObserveAgentStreamBackgroundTaskProgressInput<TSourceTask, TDeliveryPlan>,
  ) => void | (() => void);
  readonly waitForCompletion?: (input: AgentStreamBackgroundTaskWaitInput) => Promise<TSourceTask>;
  readonly createRecoveryProgress: (task: TSourceTask) => BackgroundTaskProgressPatch;
  readonly createProgressDelivery: (
    task: TSourceTask,
    context: AgentStreamBackgroundTaskDeliveryContext,
  ) =>
    | AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>
    | Promise<AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>>;
  readonly persistResultUrls?: (
    input: AgentStreamBackgroundTaskPersistInput<TDeliveryPlan>,
  ) => void;
  readonly onTerminalTask?: (
    event: AgentStreamBackgroundTaskTerminalEvent<TSourceTask, TDeliveryPlan>,
  ) => void | Promise<void>;
  readonly onIgnoredConversationTask?: (
    event: AgentStreamBackgroundTaskIgnoredEvent<TSourceTask>,
  ) => void;
  readonly onProgressDeliveryError?: (
    event: AgentStreamBackgroundTaskProgressErrorEvent<TSourceTask, TDeliveryPlan>,
  ) => void;
  readonly onStaleTaskProgress?: (event: AgentStreamBackgroundTaskStaleEvent<TSourceTask>) => void;
  readonly now?: () => number;
}

export type StartAgentStreamBackgroundTaskObserverResult =
  | {
      readonly started: false;
    }
  | {
      readonly started: true;
      readonly taskScope: TaskRunScope;
      readonly taskId: string;
      readonly task: BackgroundTaskView;
      readonly completion: Promise<AgentStreamBackgroundTaskCompletion>;
      readonly unsubscribe?: () => void;
    };

export type AgentStreamBackgroundTaskCompletion =
  | {
      readonly status: 'completed' | 'failed' | 'cancelled';
    }
  | {
      readonly status: 'ignored';
    }
  | {
      readonly status: 'observer-unavailable';
    }
  | {
      readonly status: 'delivery-error';
      readonly error: unknown;
    };

export function startAgentStreamBackgroundTaskObserver<
  TSourceTask = unknown,
  TDeliveryPlan = unknown,
>(
  input: StartAgentStreamBackgroundTaskObserverInput<TSourceTask, TDeliveryPlan>,
): StartAgentStreamBackgroundTaskObserverResult {
  const start = projectAgentStreamBackgroundTaskStart({
    conversationId: input.conversationId,
    messageId: input.messageId,
    event: input.event,
    now: input.now,
  });
  if (!start) return { started: false };
  const lease = input.lease;
  if (!lease) {
    throw new Error('Background task observer requires a conversation/run lease');
  }
  if (lease.conversationId !== input.conversationId) {
    throw new Error(
      'Background task observer lease conversationId does not match input conversationId',
    );
  }

  void input.postMessage(start.message);

  const observeProgress = input.observeProgress;
  if (!observeProgress) {
    return {
      started: true,
      taskScope: start.task.scope,
      taskId: start.taskId,
      task: start.task,
      completion: Promise.resolve({ status: 'observer-unavailable' }),
    };
  }

  let settled = false;
  let resolveCompletion: (completion: AgentStreamBackgroundTaskCompletion) => void;
  const completion = new Promise<AgentStreamBackgroundTaskCompletion>((resolve) => {
    resolveCompletion = resolve;
  });
  const waitController = new AbortController();
  const complete = (next: AgentStreamBackgroundTaskCompletion) => {
    if (settled) return;
    settled = true;
    waitController.abort();
    resolveCompletion(next);
  };

  const context: AgentStreamBackgroundTaskDeliveryContext = {
    lease,
    conversationId: input.conversationId,
    taskScope: start.task.scope,
    taskId: start.taskId,
    ...(start.toolCallId ? { toolCallId: start.toolCallId } : {}),
    taskType: start.taskType,
    baseTask: start.task,
  };

  const deliverObservedProgress = async (params: {
    readonly lease: TaskRunLease;
    readonly conversationId: string;
    readonly taskScope: TaskRunScope;
    readonly task: AgentStreamBackgroundTaskObservedProgress<TDeliveryPlan>;
    readonly sourceTask: TSourceTask;
  }): Promise<void> => {
    if (params.conversationId !== input.conversationId) {
      input.onIgnoredConversationTask?.({
        lease,
        taskScope: start.task.scope,
        taskId: start.taskId,
        conversationId: input.conversationId,
        sourceTask: params.sourceTask,
      });
      complete({ status: 'ignored' });
      return;
    }
    if (!isSameRunLease(params.lease, lease)) {
      input.onStaleTaskProgress?.({
        reason: 'lease-mismatch',
        expectedLease: lease,
        lease: params.lease,
        taskScope: start.task.scope,
        taskId: start.taskId,
        conversationId: input.conversationId,
        sourceTask: params.sourceTask,
      });
      return;
    }
    if (settled) {
      input.onStaleTaskProgress?.({
        reason: 'settled',
        expectedLease: lease,
        lease: params.lease,
        taskScope: start.task.scope,
        taskId: start.taskId,
        conversationId: input.conversationId,
        sourceTask: params.sourceTask,
      });
      return;
    }

    const projection = projectAgentStreamBackgroundTaskProgress({
      conversationId: input.conversationId,
      baseTask: start.task,
      progress: params.task.progress,
      parentMessageId: input.messageId,
      parentToolCallId: start.toolCallId,
      deliveryPlan: params.task.deliveryPlan,
      persistResultUrls: params.task.persistResultUrls,
    });
    await input.postMessage(projection.message);

    if (projection.persistResultUrls) {
      input.persistResultUrls?.({
        lease,
        conversationId: input.conversationId,
        taskScope: start.task.scope,
        taskId: start.taskId,
        ...(start.toolCallId ? { toolCallId: start.toolCallId } : {}),
        urls: projection.persistResultUrls,
        ...(projection.deliveryPlan !== undefined ? { deliveryPlan: projection.deliveryPlan } : {}),
      });
    }
    const status = projection.task.status;
    if (status === 'completed' || status === 'failed' || status === 'cancelled') {
      await input.onTerminalTask?.({
        lease,
        conversationId: input.conversationId,
        taskScope: start.task.scope,
        taskId: start.taskId,
        parentMessageId: input.messageId,
        ...(start.toolCallId ? { parentToolCallId: start.toolCallId } : {}),
        task: projection.task,
        sourceTask: params.sourceTask,
        ...(projection.deliveryPlan !== undefined ? { deliveryPlan: projection.deliveryPlan } : {}),
      });
      complete({ status });
    }
  };

  const unsubscribe = observeProgress({
    taskScope: start.task.scope,
    taskId: start.taskId,
    lease,
    conversationId: input.conversationId,
    unsubscribeOnIgnoredConversation: true,
    createRecoveryTaskView: (task) => ({
      progress: input.createRecoveryProgress(task),
    }),
    createTaskView: (task) => input.createProgressDelivery(task, context),
    onIgnoredConversationTask: (event) => {
      input.onIgnoredConversationTask?.(event);
      complete({ status: 'ignored' });
    },
    onProgressDeliveryError: (event) => {
      input.onProgressDeliveryError?.(event);
      if (!event.recoveryTask) {
        complete({ status: 'delivery-error', error: event.error });
      }
    },
    onTaskProgress: (event) => deliverObservedProgress(event),
  });

  if (input.waitForCompletion) {
    void input
      .waitForCompletion({
        conversationId: input.conversationId,
        lease,
        taskScope: start.task.scope,
        taskId: start.taskId,
        ...(start.toolCallId ? { toolCallId: start.toolCallId } : {}),
        taskType: start.taskType,
        signal: waitController.signal,
      })
      .then(async (task) => {
        if (settled) return;
        await deliverObservedProgress({
          lease,
          conversationId: input.conversationId,
          taskScope: start.task.scope,
          sourceTask: task,
          task: await input.createProgressDelivery(task, context),
        });
      })
      .catch(async (error: unknown) => {
        if (settled) return;
        const projection = projectAgentStreamBackgroundTaskProgress({
          conversationId: input.conversationId,
          baseTask: start.task,
          progress: {
            id: start.taskId,
            status: 'failed',
            progress: start.task.progress,
            error: formatBackgroundTaskWaitError(error),
            updatedAt: new Date(input.now?.() ?? Date.now()).toISOString(),
          },
          parentMessageId: input.messageId,
          parentToolCallId: start.toolCallId,
        });
        await input.postMessage(projection.message);
        complete({ status: 'delivery-error', error });
      });
  }
  const trackedUnsubscribe =
    typeof unsubscribe === 'function'
      ? () => {
          unsubscribe();
          complete({ status: 'cancelled' });
        }
      : undefined;

  return {
    started: true,
    taskScope: start.task.scope,
    taskId: start.taskId,
    task: start.task,
    completion,
    ...(trackedUnsubscribe ? { unsubscribe: trackedUnsubscribe } : {}),
  };
}

function formatBackgroundTaskWaitError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isSameRunLease(left: TaskRunLease, right: TaskRunLease): boolean {
  return left.conversationId === right.conversationId && left.runId === right.runId;
}
