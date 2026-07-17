import type { MediaGenerationService } from './media-generation-service';
import type { MediaTask } from './types';
import type { TaskRunScope } from '@neko/shared';
import { isTerminalMediaTaskStatus } from './media-task-progress-plan';
import { matchesMediaTaskConversation } from './media-task-view';

export type MediaTurnService = Pick<
  MediaGenerationService,
  'generateImage' | 'generateVideo' | 'generateAudio' | 'getTask' | 'onProgress'
>;

export type MediaTurnCategory = 'image' | 'video' | 'audio' | 'music';

export interface MediaTurnModelRef {
  readonly providerId: string;
  readonly modelId: string;
  readonly category: MediaTurnCategory;
}

export interface SubmitMediaTurnInput {
  readonly prompt: string;
  readonly mediaModel: MediaTurnModelRef;
  readonly conversationId?: string;
  readonly metadata?: Record<string, unknown>;
}

export async function submitMediaTurn(
  media: MediaTurnService,
  input: SubmitMediaTurnInput,
): Promise<MediaTask> {
  const metadata = {
    ...(input.metadata ?? {}),
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  };
  const request = {
    prompt: input.prompt,
    providerId: input.mediaModel.providerId,
    modelId: input.mediaModel.modelId,
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };

  switch (input.mediaModel.category) {
    case 'image':
      return media.generateImage(request);
    case 'video':
      return media.generateVideo(request);
    case 'audio':
      return media.generateAudio(request);
    case 'music':
      return media.generateAudio({ ...request, isMusic: true });
  }
}

export interface MediaTurnDeliveryEvent<TTaskView> {
  readonly conversationId: string;
  readonly task: TTaskView;
  readonly mediaTask: MediaTask;
}

export interface MediaTurnIgnoredTaskEvent {
  readonly taskId: string;
  readonly conversationId: string;
  readonly mediaTask: MediaTask;
}

export interface MediaTurnProgressErrorEvent<TTaskView> {
  readonly taskId: string;
  readonly conversationId: string;
  readonly mediaTask: MediaTask;
  readonly error: unknown;
  readonly recoveryTask?: TTaskView;
}

export interface RunMediaTurnInput<TTaskView> extends SubmitMediaTurnInput {
  readonly media: MediaTurnService;
  readonly createTaskView: (task: MediaTask) => TTaskView | Promise<TTaskView>;
  readonly createRecoveryTaskView?: (task: MediaTask) => TTaskView;
  readonly onTaskCreated: (event: MediaTurnDeliveryEvent<TTaskView>) => void | Promise<void>;
  readonly onTaskProgress: (event: MediaTurnDeliveryEvent<TTaskView>) => void | Promise<void>;
  readonly onIgnoredConversationTask?: (event: MediaTurnIgnoredTaskEvent) => void;
  readonly onAlreadyTerminalTask?: (event: MediaTurnIgnoredTaskEvent) => void;
  readonly onProgressDeliveryError?: (event: MediaTurnProgressErrorEvent<TTaskView>) => void;
}

export interface RunMediaTurnResult {
  readonly task: MediaTask;
  readonly unsubscribe: () => void;
}

export interface ObserveMediaTaskProgressInput<TTaskView> {
  readonly media: MediaTurnService;
  readonly taskScope: TaskRunScope;
  readonly conversationId?: string;
  readonly createTaskView: (task: MediaTask) => TTaskView | Promise<TTaskView>;
  readonly createRecoveryTaskView?: (task: MediaTask) => TTaskView;
  readonly onTaskProgress: (event: MediaTurnDeliveryEvent<TTaskView>) => void | Promise<void>;
  readonly onIgnoredConversationTask?: (event: MediaTurnIgnoredTaskEvent) => void;
  readonly onProgressDeliveryError?: (event: MediaTurnProgressErrorEvent<TTaskView>) => void;
  readonly unsubscribeOnIgnoredConversation?: boolean;
}

export async function runMediaTurn<TTaskView>(
  input: RunMediaTurnInput<TTaskView>,
): Promise<RunMediaTurnResult> {
  const { media, createTaskView, createRecoveryTaskView, conversationId } = input;
  const task = await submitMediaTurn(media, input);

  await input.onTaskCreated({
    conversationId: conversationId ?? '',
    task: await createTaskView(task),
    mediaTask: task,
  });

  let terminalDelivered = false;
  let unsubscribe: () => void = () => undefined;
  const deliverProgress = async (updated: MediaTask): Promise<void> => {
    if (conversationId && !matchesMediaTaskConversation(updated, conversationId)) {
      input.onIgnoredConversationTask?.({
        taskId: updated.id,
        conversationId,
        mediaTask: updated,
      });
      return;
    }

    const terminal = isTerminalMediaTaskStatus(updated.status);
    if (terminal) {
      if (terminalDelivered) return;
      terminalDelivered = true;
    }

    await input.onTaskProgress({
      conversationId: conversationId ?? '',
      task: await createTaskView(updated),
      mediaTask: updated,
    });

    if (terminal) {
      unsubscribe();
    }
  };

  unsubscribe = media.onProgress(task.scope, async (updated) => {
    try {
      await deliverProgress(updated);
    } catch (error) {
      const recoveryTask = createRecoveryTaskView?.(updated);
      input.onProgressDeliveryError?.({
        taskId: updated.id,
        conversationId: conversationId ?? '',
        mediaTask: updated,
        error,
        ...(recoveryTask ? { recoveryTask } : {}),
      });
      if (recoveryTask) {
        void input.onTaskProgress({
          conversationId: conversationId ?? '',
          task: recoveryTask,
          mediaTask: updated,
        });
      }
      if (isTerminalMediaTaskStatus(updated.status)) {
        unsubscribe();
      }
    }
  });

  const currentTask = await media.getTask(task.scope);
  if (currentTask && conversationId && !matchesMediaTaskConversation(currentTask, conversationId)) {
    input.onIgnoredConversationTask?.({
      taskId: currentTask.id,
      conversationId,
      mediaTask: currentTask,
    });
    unsubscribe();
    return { task, unsubscribe };
  }

  if (currentTask && isTerminalMediaTaskStatus(currentTask.status)) {
    input.onAlreadyTerminalTask?.({
      taskId: currentTask.id,
      conversationId: conversationId ?? '',
      mediaTask: currentTask,
    });
    await deliverProgress(currentTask);
  }

  return { task, unsubscribe };
}

export function observeMediaTaskProgress<TTaskView>(
  input: ObserveMediaTaskProgressInput<TTaskView>,
): () => void {
  const { media, taskScope, conversationId, createTaskView, createRecoveryTaskView } = input;
  let terminalDelivered = false;
  let unsubscribe: () => void = () => undefined;

  const deliverProgress = async (updated: MediaTask): Promise<void> => {
    if (conversationId && !matchesMediaTaskConversation(updated, conversationId)) {
      input.onIgnoredConversationTask?.({
        taskId: updated.id,
        conversationId,
        mediaTask: updated,
      });
      if (input.unsubscribeOnIgnoredConversation) {
        unsubscribe();
      }
      return;
    }

    const terminal = isTerminalMediaTaskStatus(updated.status);
    if (terminal) {
      if (terminalDelivered) return;
      terminalDelivered = true;
    }

    await input.onTaskProgress({
      conversationId: conversationId ?? '',
      task: await createTaskView(updated),
      mediaTask: updated,
    });

    if (terminal) {
      unsubscribe();
    }
  };

  unsubscribe = media.onProgress(taskScope, async (updated) => {
    try {
      await deliverProgress(updated);
    } catch (error) {
      const recoveryTask = createRecoveryTaskView?.(updated);
      input.onProgressDeliveryError?.({
        taskId: updated.id,
        conversationId: conversationId ?? '',
        mediaTask: updated,
        error,
        ...(recoveryTask ? { recoveryTask } : {}),
      });
      if (recoveryTask) {
        void input.onTaskProgress({
          conversationId: conversationId ?? '',
          task: recoveryTask,
          mediaTask: updated,
        });
      }
      if (isTerminalMediaTaskStatus(updated.status)) {
        unsubscribe();
      }
    }
  });

  return unsubscribe;
}
