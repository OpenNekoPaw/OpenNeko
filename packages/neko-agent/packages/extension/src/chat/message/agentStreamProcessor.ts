/**
 * Agent Stream Processor
 *
 * Bridges agent stream runtime contracts to VSCode webview and platform media
 * delivery effects. Runtime owns projection state and subscription lifecycle.
 */

import * as vscode from 'vscode';
import type { MediaTask, Platform } from '@neko/platform';
import {
  observeMediaTaskProgress,
  readMediaTaskResultDeliveryPolicy,
  toMediaTaskResultObservationTask,
} from '@neko/platform';
import { createMediaTaskProgressView } from '@neko/platform/media/media-task-view';
import type { MediaTaskProgressDeliveryPlan } from '@neko/platform/media/media-task-progress-plan';
import {
  AgentEventStreamRuntimeProcessor,
  createAgentTurnTimelineAccumulator,
  persistAgentStreamBackgroundTaskResultUrls,
  type BackfillSink,
  type AgentEventStreamRuntimeMessage,
  type AgentStreamBackgroundTaskTerminalEvent,
  type AgentStreamBackgroundTaskObservedProgress,
  type CollectedToolCall,
  type IPerceptionPipeline,
  type AgentTurnTimelineAccumulator,
  type ConversationProjectionStore,
} from '@neko/agent/runtime';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import type { AgentEvent } from '@neko/agent';
import {
  type AgentTaskResultDeliveryPolicy,
  type GeneratedAsset,
  type Task,
  type TaskRunScope,
  type ToolResultBackfillPayload,
} from '@neko/shared';
import { type AgentPhase, type ContentBlock, type Message } from '@neko-agent/types';
import type { ConversationBridge } from '../conversationBridge';
import type { GeneratedAssetIndex } from '@neko/platform/media/generated-asset-index';
import { MediaTaskDeliveryHost } from '../../services/mediaTaskDeliveryHost';
import type { WorkspaceBoardProjectionHost } from '../../services/workspaceBoardProjectionHost';
import type { AgentDashboardWorkItemSource } from '../../services/dashboardWorkItemSource';
import type { AgentLocalResourceAccess } from '../../services/localResourceAccess';
import {
  observeEntityMemoryContributionAutomation,
  type EntityMemoryContributionAutomationPort,
} from './entityMemoryContributionAutomation';
import { projectValueForWebviewResourceDisplay } from './webviewResourceProjection';
import { getLogger } from '../../base';
import {
  createPiAgentStreamSession,
  type PiAgentStreamSession,
} from './piAgentStreamProcessor';

const logger = getLogger('AgentStreamProcessor');

interface MediaUnderstandingModelOverride {
  readonly providerId: string;
  readonly modelId: string;
}

interface MediaUnderstandingModelOverrides {
  readonly image?: MediaUnderstandingModelOverride;
  readonly audio?: MediaUnderstandingModelOverride;
  readonly video?: MediaUnderstandingModelOverride;
}

/**
 * Stream processing result. Authoritative render state is committed to the
 * conversation projection and delivered independently by Tab attachments.
 */
export interface StreamProcessingResult {
  messageId: string;
  accumulatedResponse: string;
  accumulatedThinking: string;
  hasError: boolean;
  errorMessage?: string;
  terminalStatus: 'completed' | 'cancelled' | 'failed';
  collectedToolCalls: readonly CollectedToolCall[];
  contentBlocks: readonly ContentBlock[];
}

/**
 * Callbacks for stream events
 */
export interface StreamCallbacks {
  messageId: string;
  onPhaseChange: (phase: AgentPhase, toolName?: string) => void;
}

/**
 * Dependencies for AgentStreamProcessor
 */
export interface AgentStreamProcessorDeps {
  platform?: Platform;
  conversations?: ConversationBridge;
  /** Asset index for registering generated assets (ADR-4) */
  assetIndex?: GeneratedAssetIndex;
  /**
   * Optional transcoder for converting incompatible media formats.
   * Called when a downloaded file uses a codec not supported by Electron webview
   * (e.g. raw Opus audio, HEVC video).
   * Returns true on success; on failure the original file is kept.
   */
  transcodeFile?: (
    inputPath: string,
    outputPath: string,
    mediaType: 'audio' | 'video',
  ) => Promise<boolean>;
  /** VSCode-only media delivery host adapter. */
  mediaDeliveryHost?: MediaTaskDeliveryHost;
  workspaceBoardProjection?: Pick<WorkspaceBoardProjectionHost, 'projectGeneratedAssets'>;
  /** Optional runtime perception/backfill adapter for completed media tasks. */
  mediaBackfill?: {
    readonly perceptionPipeline?: IPerceptionPipeline;
    readonly backfillSink?: BackfillSink;
  };
  /** Extension-host mirror for Dashboard task aggregation. */
  dashboardWorkItems?: AgentDashboardWorkItemSource;
  /** Unified local resource access for Webview URI projection. */
  localResourceAccess?: AgentLocalResourceAccess;
  /** Unified content access runtime for stable ResourceRef projection. */
  contentAccessRuntime?: AgentContentAccessRuntime;
  /** Resolves the authoritative projection owned by the conversation runtime. */
  getConversationProjection: (conversationId: string) => ConversationProjectionStore;
  /** Reads the current estimated conversation context tokens after stream completion. */
  getContextTokenCount?: (conversationId: string) => number;
  /** Optional host-side automation for reviewable entity memory contribution envelopes. */
  entityMemoryContributionAutomation?: EntityMemoryContributionAutomationPort;
  /** Optional adapter for durable Agent task-result observations. */
  taskResultObservations?: {
    handleTerminalTask(
      task: Task,
      options: {
        readonly source: 'media-task';
        readonly scope?: TaskRunScope;
        readonly parentMessageId?: string;
        readonly parentToolCallId?: string;
        readonly deliveryPolicy?: AgentTaskResultDeliveryPolicy;
      },
    ): Promise<void>;
  };
}

/**
 * Processor for agent event streams
 */
export class AgentStreamProcessor {
  private readonly mediaDeliveryHost: MediaTaskDeliveryHost;
  private readonly streamRuntime = new AgentEventStreamRuntimeProcessor<
    MediaTask,
    MediaTaskProgressDeliveryPlan
  >();
  private readonly activeStreams = new Map<string, AgentTurnTimelineAccumulator>();
  private readonly activePiStreams = new Map<string, PiAgentStreamSession>();

  constructor(private deps: AgentStreamProcessorDeps) {
    this.mediaDeliveryHost =
      deps.mediaDeliveryHost ??
      new MediaTaskDeliveryHost({
        platform: deps.platform,
        assetIndex: deps.assetIndex,
        transcodeFile: deps.transcodeFile,
      });
  }

  createPiStream(
    webview: vscode.Webview,
    conversationId: string,
    messageId: string,
    onPhaseChange: (phase: AgentPhase, toolName?: string) => void,
  ): PiAgentStreamSession {
    this.activePiStreams.get(conversationId)?.dispose();
    let session: PiAgentStreamSession;
    session = createPiAgentStreamSession({
      webview,
      conversationId,
      messageId,
      projection: this.deps.getConversationProjection(conversationId),
      conversations: this.deps.conversations,
      onPhaseChange,
      projectMessage: (message) =>
        projectStreamMessageResourcesForWebview(webview, message, {
          localResourceAccess: this.deps.localResourceAccess,
          contentAccessRuntime: this.deps.contentAccessRuntime,
        }),
      isActive: () => this.activePiStreams.get(conversationId) === session,
    });
    this.activePiStreams.set(conversationId, session);
    return session;
  }

  /**
   * Process an agent event stream and dispatch to webview
   */
  async processStream(
    webview: vscode.Webview,
    conversationId: string,
    events: AsyncIterable<AgentEvent>,
    callbacks: StreamCallbacks,
  ): Promise<StreamProcessingResult> {
    const media = this.deps.platform?.media;
    const conversationProjection = this.deps.getConversationProjection(conversationId);
    if (conversationProjection.conversationId !== conversationId) {
      throw new Error(
        `Agent stream projection owner mismatch: expected ${conversationId}, received ${conversationProjection.conversationId}.`,
      );
    }
    const timelineAccumulator = createAgentTurnTimelineAccumulator({
      conversationId,
      messageId: callbacks.messageId,
    });
    this.activeStreams.set(conversationId, timelineAccumulator);

    const isActiveTurn = (): boolean =>
      this.activeStreams.get(conversationId) === timelineAccumulator;

    const postProjectedMessage = async (message: AgentEventStreamRuntimeMessage) => {
      if (!isActiveTurn()) return;
      if (message.type === 'agentTurnTimelineUpdate') {
        conversationProjection.apply(message);
        this.deps.dashboardWorkItems?.acceptWebviewMessage(message);
        return;
      }
      const projectedMessage = await projectStreamMessageResourcesForWebview(webview, message, {
        localResourceAccess: this.deps.localResourceAccess,
        contentAccessRuntime: this.deps.contentAccessRuntime,
      });
      try {
        await webview.postMessage(projectedMessage);
      } catch (error) {
        logger.warn('Failed to deliver non-projection stream message', {
          conversationId,
          messageType: message.type,
          error,
        });
      }
    };

    const result = await this.streamRuntime.process({
      conversationId,
      messageId: callbacks.messageId,
      timelineAccumulator,
      events: observeEntityMemoryContributionAutomation({
        events,
        automation: this.deps.entityMemoryContributionAutomation,
        logger,
      }),
      postMessage: postProjectedMessage,
      onPhaseChange: callbacks.onPhaseChange,
      onPartialAssistantMessage: (message) => {
        if (isActiveTurn()) this.upsertPartialAssistantMessage(conversationId, message);
      },
      backgroundTasks: {
        ...(media
          ? {
              observeProgress: (input) =>
                observeMediaTaskProgress<
                  AgentStreamBackgroundTaskObservedProgress<MediaTaskProgressDeliveryPlan>
                >({
                  media,
                  taskScope: input.taskScope,
                  conversationId: input.conversationId,
                  unsubscribeOnIgnoredConversation: input.unsubscribeOnIgnoredConversation,
                  createRecoveryTaskView: (task) => input.createRecoveryTaskView(task),
                  createTaskView: (task) => input.createTaskView(task),
                  onIgnoredConversationTask: ({ taskId, conversationId, mediaTask }) => {
                    input.onIgnoredConversationTask?.({
                      lease: input.lease,
                      taskScope: input.taskScope,
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
                    input.onProgressDeliveryError?.({
                      lease: input.lease,
                      taskScope: input.taskScope,
                      taskId,
                      conversationId,
                      sourceTask: mediaTask,
                      error,
                      ...(recoveryTask ? { recoveryTask } : {}),
                    });
                  },
                  onTaskProgress: ({ conversationId, task, mediaTask }) =>
                    input.onTaskProgress({
                      lease: input.lease,
                      conversationId,
                      taskScope: input.taskScope,
                      task,
                      sourceTask: mediaTask,
                    }),
                }),
              waitForCompletion: (input) => waitForMediaTask(media, input.taskScope, input.signal),
            }
          : {}),
        createRecoveryProgress: (task) => createMediaTaskProgressView({ task }),
        createProgressDelivery: async (task, context) => {
          const delivery = await this.mediaDeliveryHost.createProgressViewDelivery(
            webview,
            task,
            context.taskType,
          );
          if (
            this.deps.workspaceBoardProjection &&
            delivery.deliveryPlan.generatedAssets.length > 0
          ) {
            const projectionResults =
              await this.deps.workspaceBoardProjection.projectGeneratedAssets(
                delivery.deliveryPlan.generatedAssets,
              );
            for (const projection of projectionResults) {
              if (projection.status === 'blocked') {
                logger.warn(
                  'Generated output persisted but Workspace Board projection was blocked',
                  {
                    diagnostics: projection.diagnostics,
                  },
                );
              }
            }
          }
          if (
            context.toolCallId &&
            delivery.deliveryPlan.generatedAssets.length > 0 &&
            delivery.deliveryPlan.shouldPersistResultUrls
          ) {
            await this.applyCompletedMediaTaskBackfill({
              toolCallId: context.toolCallId,
              taskId: context.taskId,
              assets: delivery.deliveryPlan.generatedAssets,
              understandingModels: readMediaTaskUnderstandingModels(task),
            });
          }
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
        shouldForgetSubscriptionAfterProgressDelivery: (progress) =>
          Boolean(progress.deliveryPlan?.shouldUnsubscribe),
        shouldForgetSubscriptionAfterProgressError: (event) =>
          Boolean(event.recoveryTask?.deliveryPlan?.shouldUnsubscribe),
        onIgnoredConversationTask: ({ taskId }) => {
          logger.warn('Ignoring background task progress for a different conversation', {
            taskId,
            conversationId,
          });
        },
        onProgressDeliveryError: ({ taskId, error }) => {
          logger.warn('Failed to deliver media task progress', { taskId, error });
        },
        persistResultUrls: ({ conversationId, taskId, urls }) => {
          this.updateToolResultWithUrls(conversationId, taskId, [...urls]);
        },
        onTerminalTask: (event) => this.recordTerminalMediaTaskObservation(event),
      },
    });

    if (this.deps.getContextTokenCount && isActiveTurn()) {
      try {
        const tokenCount = this.deps.getContextTokenCount(conversationId);
        if (Number.isFinite(tokenCount) && tokenCount >= 0) {
          await postProjectedMessage({
            type: 'contextTokenCount',
            conversationId,
            tokenCount,
          });
        }
      } catch (error) {
        logger.warn('Failed to refresh context token count after stream completion', error);
      }
    }

    if (result.terminalStatus === undefined) {
      throw new Error('Agent stream runtime completed without a terminal status.');
    }

    return {
      ...result,
      messageId: callbacks.messageId,
      terminalStatus: result.terminalStatus,
    };
  }

  private upsertPartialAssistantMessage(conversationId: string, message: Message): void {
    this.deps.conversations?.upsertMessageToConversation(conversationId, message);
  }

  /**
   * Update tool result with final URLs for persistence
   */
  updateToolResultWithUrls(conversationId: string, taskId: string, urls: string[]): void {
    if (!this.deps.conversations) return;

    persistAgentStreamBackgroundTaskResultUrls({
      conversationId,
      taskId,
      urls,
      getMessages: (id) => this.deps.conversations?.get(id)?.messages,
      updateMessages: (id, messages) =>
        this.deps.conversations?.updateMessagesForConversation(id, messages),
      onError: (error) => logger.error('Failed to update tool result with URLs:', error),
    });
  }

  private async recordTerminalMediaTaskObservation(
    event: AgentStreamBackgroundTaskTerminalEvent<MediaTask, MediaTaskProgressDeliveryPlan>,
  ): Promise<void> {
    if (!this.deps.taskResultObservations) {
      return;
    }

    const deliveryPolicy = readMediaTaskResultDeliveryPolicy(event.sourceTask.request.metadata);
    const error = readBackgroundTaskError(event.task.error);
    await this.deps.taskResultObservations.handleTerminalTask(
      toMediaTaskResultObservationTask({
        conversationId: event.conversationId,
        taskId: event.taskId,
        progress: event.task.progress,
        mediaTask: event.sourceTask,
        ...(event.deliveryPlan ? { deliveryPlan: event.deliveryPlan } : {}),
        ...(error ? { error } : {}),
      }),
      {
        source: 'media-task',
        scope: event.taskScope,
        parentMessageId: event.parentMessageId,
        ...(event.parentToolCallId ? { parentToolCallId: event.parentToolCallId } : {}),
        ...(deliveryPolicy ? { deliveryPolicy } : {}),
      },
    );
  }

  private async applyCompletedMediaTaskBackfill(input: {
    readonly toolCallId: string;
    readonly taskId: string;
    readonly assets: readonly GeneratedAsset[];
    readonly understandingModels?: MediaUnderstandingModelOverrides;
  }): Promise<void> {
    const sink = this.deps.mediaBackfill?.backfillSink;
    const pipeline = this.deps.mediaBackfill?.perceptionPipeline;
    if (!sink && !pipeline) {
      return;
    }

    const assetRefs = input.assets.flatMap((asset) => {
      const ref = toPerceptualAssetRef(asset);
      return ref ? [ref] : [];
    });
    const payload: ToolResultBackfillPayload = {
      toolCallId: input.toolCallId,
      timestamp: Date.now(),
      dataPatch: {
        status: 'completed',
        taskId: input.taskId,
        resultAssetRefs: assetRefs,
        ...(assetRefs[0] ? { thumbnailAssetRef: assetRefs[0] } : {}),
      },
      attachments: input.assets.flatMap((asset) => {
        const assetRef = toPerceptualAssetRef(asset);
        if (!assetRef) return [];
        return [
          {
            type: toAttachmentType(asset),
            path: assetRef.uri,
            mimeType: asset.mimeType,
            assetRef,
          },
        ];
      }),
    };

    await sink?.applyBackfill(payload);

    if (!pipeline) {
      return;
    }

    for (const asset of input.assets) {
      const assetRef = toPerceptualAssetRef(asset);
      if (!assetRef) {
        continue;
      }
      await pipeline.perceive({
        asset: { assetId: asset.id, ref: assetRef },
        sourceToolCallId: input.toolCallId,
        ...(input.understandingModels ? { understandingModels: input.understandingModels } : {}),
        policy: {
          timing: 'on-completion',
          layers: [0, 2],
          reason: 'completed media task output',
        },
      });
    }
  }

  clearConversation(conversationId: string): void {
    this.streamRuntime.clearConversation(conversationId);
    this.activeStreams.delete(conversationId);
    this.activePiStreams.get(conversationId)?.dispose();
    this.activePiStreams.delete(conversationId);
  }

  dispose(): void {
    this.streamRuntime.dispose();
    this.activeStreams.clear();
    for (const stream of this.activePiStreams.values()) stream.dispose();
    this.activePiStreams.clear();
  }
}

function readBackgroundTaskError(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function projectStreamMessageResourcesForWebview(
  webview: vscode.Webview,
  message: AgentEventStreamRuntimeMessage,
  options: {
    readonly localResourceAccess?: AgentLocalResourceAccess;
    readonly contentAccessRuntime?: AgentContentAccessRuntime;
  },
): Promise<AgentEventStreamRuntimeMessage> {
  const projectValue = (value: unknown) =>
    projectValueForWebviewResourceDisplay(value, {
      webview,
      localResourceAccess: options.localResourceAccess,
      contentAccessRuntime: options.contentAccessRuntime,
      localMediaCaller: 'neko-agent.stream-tool-result',
      documentResourceCaller: 'neko-agent.document-resource',
    });

  if (message.type === 'toolCall' && message.arguments !== undefined) {
    return projectValue(message.arguments).then((projectedArguments) => ({
      ...message,
      arguments: isRecord(projectedArguments) ? projectedArguments : message.arguments,
    }));
  }

  if (message.type === 'toolResult') {
    return Promise.all([
      message.data !== undefined ? projectValue(message.data) : undefined,
      message.attachments ? projectValue(message.attachments) : undefined,
      message.perceptionCards ? projectValue(message.perceptionCards) : undefined,
    ]).then(([data, attachments, perceptionCards]) => ({
      ...message,
      ...(data !== undefined ? { data } : {}),
      ...(attachments ? { attachments: attachments as typeof message.attachments } : {}),
      ...(perceptionCards
        ? { perceptionCards: perceptionCards as typeof message.perceptionCards }
        : {}),
    }));
  }

  if (message.type === 'toolResultBackfill') {
    return Promise.all([
      projectValue(message.dataPatch),
      message.attachments ? projectValue(message.attachments) : undefined,
      message.perceptionCards ? projectValue(message.perceptionCards) : undefined,
    ]).then(([dataPatch, attachments, perceptionCards]) => ({
      ...message,
      dataPatch: isRecord(dataPatch) ? dataPatch : message.dataPatch,
      ...(attachments ? { attachments: attachments as typeof message.attachments } : {}),
      ...(perceptionCards
        ? { perceptionCards: perceptionCards as typeof message.perceptionCards }
        : {}),
    }));
  }

  if (message.type === 'streamComplete' && message.contentBlocks) {
    return projectValue(message.contentBlocks).then((contentBlocks) => ({
      ...message,
      contentBlocks: Array.isArray(contentBlocks) ? contentBlocks : message.contentBlocks,
    }));
  }

  if (message.type === 'agentTurnTimelineUpdate') {
    const projectedOperations = Promise.all(
      message.operations.map(async (operation) => {
        if (!('item' in operation)) {
          return operation;
        }
        const projectedItem = await projectValue(operation.item);
        return {
          ...operation,
          item: isRecord(projectedItem) ? projectedItem : operation.item,
        } as typeof operation;
      }),
    );
    const projectedFinalContentBlocks = message.completion?.finalContentBlocks
      ? projectValue(message.completion.finalContentBlocks)
      : undefined;
    return Promise.all([projectedOperations, projectedFinalContentBlocks]).then(
      ([operations, finalContentBlocks]) => ({
        ...message,
        operations,
        ...(message.completion
          ? {
              completion: {
                ...message.completion,
                ...(Array.isArray(finalContentBlocks)
                  ? {
                      finalContentBlocks:
                        finalContentBlocks as typeof message.completion.finalContentBlocks,
                    }
                  : message.completion.finalContentBlocks
                    ? { finalContentBlocks: message.completion.finalContentBlocks }
                    : {}),
              },
            }
          : {}),
      }),
    );
  }

  return Promise.resolve(message);
}

function waitForMediaTask(
  media: Platform['media'],
  taskScope: TaskRunScope,
  signal: AbortSignal,
): Promise<MediaTask> {
  if (!media) {
    return Promise.reject(new Error('Media service is unavailable.'));
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readMediaTaskUnderstandingModels(
  task: MediaTask,
): MediaUnderstandingModelOverrides | undefined {
  const raw = task.request.metadata?.understandingModels;
  if (!isRecord(raw)) return undefined;

  const image = readUnderstandingModelOverride(raw.image);
  const audio = readUnderstandingModelOverride(raw.audio);
  const video = readUnderstandingModelOverride(raw.video);
  if (!image && !audio && !video) return undefined;

  return {
    ...(image ? { image } : {}),
    ...(audio ? { audio } : {}),
    ...(video ? { video } : {}),
  };
}

function readUnderstandingModelOverride(
  value: unknown,
): MediaUnderstandingModelOverride | undefined {
  if (!isRecord(value)) return undefined;
  const providerId = typeof value.providerId === 'string' ? value.providerId.trim() : '';
  const modelId = typeof value.modelId === 'string' ? value.modelId.trim() : '';
  if (!providerId || !modelId) return undefined;
  return { providerId, modelId };
}

function toPerceptualAssetRef(
  asset: GeneratedAsset,
): import('@neko/shared').PerceptualAssetRef | undefined {
  if (asset.assetRef) {
    return asset.assetRef;
  }
  return undefined;
}

function toPersistableMediaTaskResultUrls(
  assets: readonly GeneratedAsset[],
  fallbackUrls: readonly string[],
): string[] {
  const assetUrls = assets
    .flatMap((asset) => {
      const ref = toPerceptualAssetRef(asset);
      return ref ? [ref.uri] : [];
    })
    .filter((uri): uri is string => typeof uri === 'string' && uri.length > 0);
  if (assetUrls.length > 0) {
    return assetUrls;
  }
  return fallbackUrls.filter((url) => url.startsWith('http://') || url.startsWith('https://'));
}

function toAttachmentType(asset: GeneratedAsset): 'image' | 'video' | 'audio' {
  switch (asset.type) {
    case 'generated-video':
      return 'video';
    case 'generated-audio':
      return 'audio';
    case 'generated-storyboard':
    case 'generated-image':
      return 'image';
  }
}
