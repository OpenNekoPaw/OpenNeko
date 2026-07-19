/**
 * Webview bridge for direct media turns.
 *
 * Platform owns media routing/execution. This bridge only connects that runtime
 * to VSCode Webview messages and the VSCode-only delivery host.
 */

import * as vscode from 'vscode';
import type { MediaTaskView, Platform } from '@neko/platform';
import {
  createMediaTaskView,
  isTerminalMediaTaskStatus,
  readMediaTaskResultDeliveryPolicy,
  runMediaTurn,
  toMediaTaskResultObservationTask,
} from '@neko/platform';
import type { MediaTaskProgressDeliveryPlan } from '@neko/platform/media/media-task-progress-plan';
import type { MediaModelCategory, ModelRef } from '@neko-agent/types';
import { runAgentMediaTurn } from '@neko/agent/runtime';
import type { AgentFileReference } from '@neko-agent/types';
import {
  createGeneratedAssetsWorkspaceDeliveryBatch,
  type ThreeReferenceMediaControls,
  type AgentTaskResultDeliveryPolicy,
  type GeneratedAsset,
  type Task,
} from '@neko/shared';
import { getLogger } from '../base';
import { MediaTaskDeliveryHost } from './mediaTaskDeliveryHost';
import type { AgentWorkItemProjectionSource } from './workItemProjectionSource';
import type { AgentLocalResourceAccess } from './localResourceAccess';
import type { ConversationBridge } from '../chat/conversationBridge';
import type { WorkspaceBoardProjectionHost } from './workspaceBoardProjectionHost';

const logger = getLogger('MediaTurnBridge');

export interface MediaTurnBridgeDeps {
  platform?: Platform;
  mediaDeliveryHost: MediaTaskDeliveryHost;
  workItemProjections?: AgentWorkItemProjectionSource;
  localResourceAccess?: AgentLocalResourceAccess;
  conversations?: ConversationBridge;
  workspaceBoardProjection?: Pick<WorkspaceBoardProjectionHost, 'deliverBatch'>;
  taskResultObservations?: {
    handleTerminalTask(
      task: Task,
      options: {
        readonly source: 'media-task';
        readonly deliveryPolicy?: AgentTaskResultDeliveryPolicy;
      },
    ): Promise<void>;
  };
  generateMessageId?: () => string;
  now?: () => number;
}

export interface ExecuteMediaTurnForWebviewInput {
  webview: vscode.Webview;
  conversationId: string;
  prompt: string;
  mediaModel: ModelRef<MediaModelCategory>;
  threeReferenceControls?: ThreeReferenceMediaControls;
  selectedFileReferences?: readonly AgentFileReference[];
}

interface MediaTurnTaskDelivery {
  readonly view: MediaTaskView;
  readonly deliveryPlan?: MediaTaskProgressDeliveryPlan;
}

export class MediaTurnBridge {
  constructor(private readonly deps: MediaTurnBridgeDeps) {}

  async execute(input: ExecuteMediaTurnForWebviewInput): Promise<void> {
    const media = this.deps.platform?.media;
    await runAgentMediaTurn({
      conversationId: input.conversationId,
      prompt: input.prompt,
      mediaModel: input.mediaModel,
      now: this.deps.now,
      postMessage: (message) => {
        this.deps.workItemProjections?.acceptWebviewMessage(message);
        void input.webview.postMessage(message);
      },
      persistErrorMessage: (message) => {
        this.deps.conversations?.addMessageToConversation(input.conversationId, message);
      },
      buildErrorMessageInput: (message) => ({
        id: this.deps.generateMessageId?.() ?? `media-error-${Date.now()}`,
        timestamp: this.deps.now?.() ?? Date.now(),
        message,
      }),
      ...(media
        ? {
            executeMediaTurn: (runtimeInput) =>
              runMediaTurn({
                media,
                prompt: runtimeInput.prompt,
                mediaModel: runtimeInput.mediaModel,
                conversationId: runtimeInput.conversationId,
                ...(input.threeReferenceControls
                  ? { threeReferenceControls: input.threeReferenceControls }
                  : {}),
                createTaskView: (task) => this.createTaskDelivery(input.webview, task),
                createRecoveryTaskView: (task): MediaTurnTaskDelivery => ({
                  view: createMediaTaskView(task),
                }),
                onTaskCreated: ({ conversationId, task, mediaTask }) =>
                  runtimeInput.onTaskCreated({
                    conversationId,
                    task: task.view,
                    sourceTask: mediaTask,
                  }),
                onTaskProgress: async ({ conversationId, task, mediaTask }) => {
                  runtimeInput.onTaskProgress({
                    conversationId,
                    task: task.view,
                    sourceTask: mediaTask,
                  });
                  if (isTerminalMediaTaskStatus(mediaTask.status)) {
                    await this.recordTerminalMediaTaskObservation({
                      conversationId,
                      task: task.view,
                      ...(task.deliveryPlan ? { deliveryPlan: task.deliveryPlan } : {}),
                      mediaTask,
                    });
                  }
                },
                onIgnoredConversationTask: ({ taskId, conversationId, mediaTask }) => {
                  runtimeInput.onIgnoredConversationTask?.({
                    taskId,
                    conversationId,
                    sourceTask: mediaTask,
                  });
                },
                onAlreadyTerminalTask: ({ taskId, conversationId, mediaTask }) => {
                  runtimeInput.onAlreadyTerminalTask?.({
                    taskId,
                    conversationId,
                    sourceTask: mediaTask,
                  });
                },
                onProgressDeliveryError: ({
                  taskId,
                  conversationId,
                  mediaTask,
                  error,
                  recoveryTask,
                }) => {
                  runtimeInput.onProgressDeliveryError?.({
                    taskId,
                    conversationId,
                    sourceTask: mediaTask,
                    error,
                    ...(recoveryTask ? { recoveryTask: recoveryTask.view } : {}),
                  });
                },
              }),
          }
        : {}),
      onIgnoredConversationTask: ({ taskId }) => {
        logger.warn('Ignoring media task progress for a different conversation', {
          taskId,
          conversationId: input.conversationId,
        });
      },
      onAlreadyTerminalTask: ({ taskId, sourceTask }) => {
        logger.debug(`Media task ${taskId} already in terminal state`, {
          sourceTask,
        });
      },
      onProgressDeliveryError: ({ taskId, error }) => {
        logger.warn('Failed to deliver media task progress', { taskId, error });
      },
      onExecutionError: (error) => {
        logger.error('Media generation error:', error);
      },
    });
  }

  private async recordTerminalMediaTaskObservation(input: {
    readonly conversationId: string;
    readonly task: MediaTaskView;
    readonly deliveryPlan?: MediaTaskProgressDeliveryPlan;
    readonly mediaTask: Parameters<MediaTaskDeliveryHost['createTaskView']>[1];
  }): Promise<void> {
    if (!this.deps.taskResultObservations) {
      return;
    }
    const deliveryPolicy = readMediaTaskResultDeliveryPolicy(input.mediaTask.request.metadata);
    await this.deps.taskResultObservations.handleTerminalTask(
      toMediaTaskResultObservationTask({
        conversationId: input.conversationId,
        taskId: input.task.id,
        progress: input.task.progress,
        mediaTask: input.mediaTask,
        ...(input.deliveryPlan ? { deliveryPlan: input.deliveryPlan } : {}),
        ...(input.task.result?.assets ? { assets: input.task.result.assets } : {}),
        ...(input.task.result?.urls ? { resultUrls: input.task.result.urls } : {}),
        ...(input.task.error?.message ? { error: input.task.error.message } : {}),
      }),
      {
        source: 'media-task',
        ...(deliveryPolicy ? { deliveryPolicy } : {}),
      },
    );
  }

  private async createTaskDelivery(
    webview: vscode.Webview,
    task: Parameters<MediaTaskDeliveryHost['createTaskView']>[1],
  ): Promise<MediaTurnTaskDelivery> {
    if (
      isTerminalMediaTaskStatus(task.status) &&
      typeof this.deps.mediaDeliveryHost.createTaskViewDelivery === 'function'
    ) {
      const delivery = await this.deps.mediaDeliveryHost.createTaskViewDelivery(webview, task);
      await this.deliverWorkspaceBatch(delivery.deliveryPlan.generatedAssets);
      return {
        view: delivery.view,
        deliveryPlan: delivery.deliveryPlan,
      };
    }

    return {
      view: await this.deps.mediaDeliveryHost.createTaskView(webview, task),
    };
  }

  private async deliverWorkspaceBatch(assets: readonly GeneratedAsset[]): Promise<void> {
    if (!this.deps.workspaceBoardProjection || assets.length === 0) return;
    const results = await this.deps.workspaceBoardProjection.deliverBatch(
      createGeneratedAssetsWorkspaceDeliveryBatch(assets, 'vscode'),
    );
    for (const result of results) {
      if (result.status === 'blocked') {
        logger.warn('Generated output persisted but Workspace Board projection was blocked', {
          diagnosticCodes: result.diagnostics.map((diagnostic) => diagnostic.code),
        });
      }
    }
  }
}
