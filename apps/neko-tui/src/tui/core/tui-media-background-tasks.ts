import { type AgentEventStreamRuntimeBackgroundTasks } from '@neko/agent/runtime';
import {
  createMediaTaskProgressView,
  observeMediaTaskProgress,
  readMediaTaskResultDeliveryPolicy,
  toMediaTaskResultObservationTask,
  type MediaTask,
  type Platform,
} from '@neko/platform';
import type { MediaTaskProgressDeliveryPlan } from '@neko/platform/media/media-task-progress-plan';
import type { Task, TaskRunScope } from '@neko/shared';
import type { NodeMediaTaskDeliveryHost } from '../host/node-media-task-delivery-host';

export interface TuiTaskResultObservationPort {
  handleTerminalTask(
    task: Task,
    options: {
      readonly source: 'media-task';
      readonly scope?: TaskRunScope;
      readonly parentMessageId?: string;
      readonly parentToolCallId?: string;
      readonly deliveryPolicy?: ReturnType<typeof readMediaTaskResultDeliveryPolicy>;
    },
  ): Promise<void>;
}

export type TuiMediaBackgroundDiagnostic = Readonly<{
  readonly code: 'progress-delivery-failed';
  readonly taskId: string;
  readonly error?: unknown;
}>;

export interface CreateTuiMediaBackgroundTasksInput {
  readonly platform?: Platform;
  readonly deliveryHost: NodeMediaTaskDeliveryHost;
  readonly taskResultObservations: TuiTaskResultObservationPort;
  readonly persistResultUrls?: AgentEventStreamRuntimeBackgroundTasks<
    MediaTask,
    MediaTaskProgressDeliveryPlan
  >['persistResultUrls'];
  readonly onTaskProgress?: () => void;
  readonly onDiagnostic?: (diagnostic: TuiMediaBackgroundDiagnostic) => void;
}

export function createTuiMediaBackgroundTasks(
  input: CreateTuiMediaBackgroundTasksInput,
): AgentEventStreamRuntimeBackgroundTasks<MediaTask, MediaTaskProgressDeliveryPlan> | undefined {
  const media = input.platform?.media;
  if (!media) {
    return undefined;
  }

  return {
    observeProgress: (observerInput) =>
      observeMediaTaskProgress({
        media,
        taskScope: observerInput.taskScope,
        conversationId: observerInput.conversationId,
        unsubscribeOnIgnoredConversation: observerInput.unsubscribeOnIgnoredConversation,
        createRecoveryTaskView: (task) => observerInput.createRecoveryTaskView(task),
        createTaskView: (task) => observerInput.createTaskView(task),
        onIgnoredConversationTask: ({ taskId, conversationId, mediaTask }) => {
          observerInput.onIgnoredConversationTask?.({
            lease: observerInput.lease,
            taskScope: observerInput.taskScope,
            taskId,
            conversationId,
            sourceTask: mediaTask,
          });
        },
        onProgressDeliveryError: ({ taskId, conversationId, mediaTask, error, recoveryTask }) => {
          observerInput.onProgressDeliveryError?.({
            lease: observerInput.lease,
            taskScope: observerInput.taskScope,
            taskId,
            conversationId,
            sourceTask: mediaTask,
            error,
            ...(recoveryTask ? { recoveryTask } : {}),
          });
        },
        onTaskProgress: ({ conversationId, task, mediaTask }) => {
          input.onTaskProgress?.();
          observerInput.onTaskProgress({
            lease: observerInput.lease,
            conversationId,
            taskScope: observerInput.taskScope,
            task,
            sourceTask: mediaTask,
          });
        },
      }),
    waitForCompletion: (waitInput) =>
      waitForMediaTask(media, waitInput.taskScope, waitInput.signal),
    createRecoveryProgress: (task) => createMediaTaskProgressView({ task }),
    createProgressDelivery: async (task, context) => {
      const delivery = await input.deliveryHost.createProgressViewDelivery(task, context.taskType);
      return {
        progress: delivery.view,
        deliveryPlan: delivery.deliveryPlan,
        ...(delivery.deliveryPlan.shouldPersistResultUrls
          ? {
              persistResultUrls: toPersistableMediaTaskResultUrls(
                delivery.deliveryPlan.generatedAssets,
                delivery.deliveryPlan.resultUrls,
              ),
            }
          : {}),
      };
    },
    persistResultUrls: input.persistResultUrls,
    shouldForgetSubscriptionAfterProgressDelivery: (progress) =>
      Boolean(progress.deliveryPlan?.shouldUnsubscribe),
    shouldForgetSubscriptionAfterProgressError: (event) =>
      Boolean(event.recoveryTask?.deliveryPlan?.shouldUnsubscribe),
    onProgressDeliveryError: ({ taskId, error }) => {
      input.onDiagnostic?.({ code: 'progress-delivery-failed', taskId, error });
    },
    onTerminalTask: async (event) => {
      const deliveryPolicy = readMediaTaskResultDeliveryPolicy(event.sourceTask.request.metadata);
      await input.taskResultObservations.handleTerminalTask(
        toMediaTaskResultObservationTask({
          conversationId: event.conversationId,
          taskId: event.taskId,
          progress: event.task.progress,
          mediaTask: event.sourceTask,
          ...(event.deliveryPlan ? { deliveryPlan: event.deliveryPlan } : {}),
          ...(typeof event.task.error === 'string' ? { error: event.task.error } : {}),
        }),
        {
          source: 'media-task',
          scope: event.taskScope,
          parentMessageId: event.parentMessageId,
          ...(event.parentToolCallId ? { parentToolCallId: event.parentToolCallId } : {}),
          ...(deliveryPolicy ? { deliveryPolicy } : {}),
        },
      );
    },
  };
}

function waitForMediaTask(
  media: NonNullable<Platform['media']>,
  taskScope: TaskRunScope,
  signal: AbortSignal,
): Promise<MediaTask> {
  if (signal.aborted) {
    return Promise.reject(new DOMException('Media task wait was cancelled.', 'AbortError'));
  }

  return new Promise<MediaTask>((resolve, reject) => {
    const abort = () => reject(new DOMException('Media task wait was cancelled.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    media.waitForTask(taskScope).then(
      (task) => {
        signal.removeEventListener('abort', abort);
        resolve(task);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function toPersistableMediaTaskResultUrls(
  assets: readonly { readonly assetRef?: { readonly uri?: string } }[],
  fallbackUrls: readonly string[],
): readonly string[] {
  const urls = assets
    .map((asset) => asset.assetRef?.uri)
    .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
  return urls.length > 0 ? urls : fallbackUrls;
}
